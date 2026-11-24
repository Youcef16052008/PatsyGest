"use client";

import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { sellCart, type SaleState } from "@/lib/actions-caisse";
import type { Etablissement } from "@/lib/etablissement";
import { isPaymentMode, isValidCartQty, PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/pos-cart";
import {
  createQueuedCartSale,
  enqueueSale,
  createSaleQueueStore,
  emptyQueueSnapshot,
  queuedSaleLines,
  queuedSaleSummary,
  removeSale,
  type QueueIdentity,
  type QueuedSale,
  type QueuedSaleLine,
} from "@/lib/sale-queue";
import SaleTicket, { type SaleTicketLine } from "./sale-ticket";
import FormulaireGuide, { champGuide } from "./guide-form";
import SaleComposer from "./sale-composer";
import { Notice } from "./workspace-ui";
import { useEffect } from "react";
import { enregistrerCatalogue, enregistrerIdentite, type CatalogueHorsLigne } from "@/lib/catalogue-cache";
import { quantite, siteCaisse, type CatalogProduct, type SiteStock, type WorkspaceSite } from "@/lib/workspace-data";

const label = "block text-xs font-semibold text-slate-600";

type Msg = { kind: "err" | "ok" | "info"; text: string };

type VenteAffichee = SaleState & {
  articleLabel: string;
  siteLabel: string;
  qte: number;
  lines: SaleTicketLine[];
  modePaiement: PaymentMode;
  at: string;
  etablissement: Etablissement | null;
};

/**
 * Caisse multiproduit avec file hors-ligne : le panier entier est écrit dans
 * la file locale avec un UUID stable de ticket, puis synchronisé via `sellCart`
 * (idempotence stricte : rejouer après coupure ou rechargement ne crée jamais
 * de double vente ni de double sortie de stock).
 */
export default function SaleForm({
  articles,
  sites,
  queueIdentity,
  stock = null,
  expiredStock = null,
  etablissement,
  guide = false,
  guideTermine = false,
  catalogueHorsLigne,
}: {
  articles: CatalogProduct[];
  sites: WorkspaceSite[];
  queueIdentity: QueueIdentity;
  stock?: SiteStock | null;
  expiredStock?: SiteStock | null;
  etablissement?: Etablissement | null;
  guide?: boolean;
  guideTermine?: boolean;
  /** NF-02/D5 : de quoi alimenter l'ouverture hors-ligne, étiqueté par compte. */
  catalogueHorsLigne?: {
    clientId: string;
    produits: CatalogProduct[];
    sites: WorkspaceSite[];
    identite: CatalogueHorsLigne["identite"];
  };
}) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [lastSale, setLastSale] = useState<VenteAffichee | null>(null);
  const [pending, startTransition] = useTransition();
  const lock = useRef(false);

  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );

  // NF-02/D5 — réserve l'identité et le catalogue pour /hors-ligne. Placé ici
  // et non dans un écran séparé : c'est au moment où la caisse est réellement
  // utilisée que les prix affichés sont les bons. Une réserve alimentée depuis
  // un autre écran figerait un catalogue que personne n'a validé.
  useEffect(() => {
    if (!catalogueHorsLigne) return;
    enregistrerIdentite({
      clientId: catalogueHorsLigne.clientId,
      authUserId: queueIdentity.authUserId,
    });
    enregistrerCatalogue({
      clientId: catalogueHorsLigne.clientId,
      clientNom: etablissement?.nom ?? "",
      articles: catalogueHorsLigne.produits.map((p) => ({
        id: p.id,
        label: p.label,
        code: p.code,
        unit: p.unit,
        prixHT: p.prixHT,
        tva: p.tva,
      })),
      sites: catalogueHorsLigne.sites.map((s) => ({ id: s.id, label: s.label, type: s.type })),
      identite: catalogueHorsLigne.identite,
    });
  }, [catalogueHorsLigne, queueIdentity.authUserId, etablissement?.nom]);

  const { clientId, authUserId } = queueIdentity;
  const store = useMemo(() => createSaleQueueStore({ clientId, authUserId }), [clientId, authUserId]);
  const queueState = useSyncExternalStore(store.subscribe, store.getSnapshot, () => emptyQueueSnapshot);
  const queued = queueState.sales;

  /** Synchronise un ticket panier : 'ok' | 'dup' (déjà enregistré) | 'network' | 'business'. */
  async function trySync(
    sale: QueuedSale,
  ): Promise<{ status: "ok" | "dup" | "network" | "business"; state: SaleState }> {
    const lines = queuedSaleLines(sale);
    const fd = new FormData();
    fd.set("expectedClientId", queueIdentity.clientId);
    fd.set("expectedAuthUserId", queueIdentity.authUserId);
    fd.set("siteId", sale.siteId);
    fd.set("ticket", sale.ticket);
    fd.set("modePaiement", sale.modePaiement ?? "especes");
    fd.set(
      "lignesJson",
      JSON.stringify(lines.map((l) => ({ articleId: l.articleId, qte: l.qte }))),
    );
    let state: SaleState;
    try {
      state = await sellCart({}, fd);
    } catch {
      return { status: "network", state: {} };
    }
    if (state.duplicate) return { status: "dup", state };
    if (state.succes) return { status: "ok", state };
    if (state.reessayer) return { status: "network", state };
    return { status: "business", state };
  }

  function ticketVente(state: SaleState, sale: QueuedSale): VenteAffichee | null {
    if (!state.ticket) return null;
    const qLines = queuedSaleLines(sale);
    const lines: SaleTicketLine[] =
      state.lignesTicket && state.lignesTicket.length > 0
        ? state.lignesTicket.map((l) => ({
            label:
              articles.find((a) => a.id === l.articleId)?.label ??
              qLines.find((q) => q.articleId === l.articleId)?.articleLabel ??
              l.nom,
            qty: l.qty,
            unit: articles.find((a) => a.id === l.articleId)?.unit,
            totalTTC: l.totalTTC,
          }))
        : qLines.map((q) => ({ label: q.articleLabel, qty: q.qte, unit: q.unit }));
    return {
      ...state,
      articleLabel: sale.articleLabel,
      siteLabel: sale.siteLabel,
      qte: sale.qte,
      lines,
      modePaiement: state.modePaiement ?? sale.modePaiement ?? "especes",
      at: state.enregistreeA ?? new Date().toISOString(),
      etablissement: etablissement ?? null,
    };
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current || queueState.error || (guide && (guideTermine || queued.length > 0))) return;
    const formulaire = e.currentTarget;
    const fd = new FormData(formulaire);
    const siteId = String(fd.get("siteId") ?? "");
    const siteLabel = sites.find((s) => s.id === siteId)?.label;
    const modeRaw = String(fd.get("modePaiement") ?? "especes");
    const modePaiement: PaymentMode = isPaymentMode(modeRaw) ? modeRaw : "especes";
    if (!siteLabel) {
      setMsg({ kind: "err", text: "Choisissez un site de vente valide." });
      return;
    }

    let lignes: QueuedSaleLine[] = [];
    const rawJson = String(fd.get("lignesJson") ?? "").trim();
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson) as { articleId?: string; qte?: number }[];
        if (!Array.isArray(parsed) || parsed.length < 1) throw new Error("Panier vide.");
        lignes = parsed.map((item) => {
          const art = articles.find((a) => a.id === item.articleId);
          const qte = Number(item.qte);
          if (!art || !isValidCartQty(qte)) {
            throw new Error("Vérifiez les quantités du panier.");
          }
          return { articleId: art.id, articleLabel: art.label, unit: art.unit, qte };
        });
      } catch (err) {
        setMsg({ kind: "err", text: err instanceof Error ? err.message : "Panier invalide." });
        return;
      }
    } else {
      // Parcours guidé d'accueil (1er encaissement).
      const articleId = String(fd.get("articleId") ?? "");
      const qte = Number(fd.get("qte"));
      const art = articles.find((a) => a.id === articleId);
      if (!art || !isValidCartQty(qte)) {
        setMsg({ kind: "err", text: "Choisissez un produit, un site et une quantité valide." });
        return;
      }
      lignes = [{ articleId: art.id, articleLabel: art.label, unit: art.unit, qte }];
    }

    const sale = createQueuedCartSale({
      ticket: crypto.randomUUID(),
      siteId,
      siteLabel,
      lignes,
      modePaiement,
    });

    lock.current = true;
    startTransition(async () => {
      let stored = false;
      try {
        await store.transact(async (queue) => {
          const current = queue.read();
          if (guide && current.length > 0) throw new Error("Synchronisez d'abord les tickets en attente.");
          queue.write(enqueueSale(current, sale));
          stored = true;
          setMsg({ kind: "info", text: "Ticket conservé localement — synchronisation…" });
          const { status, state } = await trySync(sale);
          if (status === "ok" || status === "dup") {
            // Chaque retrait est persistant immédiatement, sous le même verrou.
            queue.write(removeSale(queue.read(), sale.ticket));
            const ticket = ticketVente(state, sale);
            if (ticket) setLastSale(ticket);
            setMsg({ kind: "ok", text: status === "dup" ? "Ticket déjà enregistré." :
              (state.manquant ?? 0) > 0
                ? `Ticket enregistré (${lignes.length} produit(s), ${PAYMENT_MODE_LABELS[modePaiement]}). Stock manquant : ${quantite(state.manquant ?? 0)}.`
                : `Ticket enregistré (${lignes.length} produit(s), ${PAYMENT_MODE_LABELS[modePaiement]}).` });
          } else if (status === "network") {
            setMsg({ kind: "info", text: "Résultat inconnu : ticket conservé localement. Vérifiez puis synchronisez avec le même compte au retour du réseau." });
          } else {
            setMsg({ kind: "err", text: `${state.erreur ?? "Vente refusée."} Ticket conservé en attente de vérification.` });
          }
        });
      } catch (err) {
        setMsg({ kind: "err", text: stored
          ? "Mise à jour locale impossible après l'envoi. Le résultat peut être enregistré : vérifiez l'historique et la file avant de réessayer."
          : `Vente non envoyée : ${err instanceof Error ? err.message : "stockage local indisponible."}` });
      } finally {
        // Dès qu'un ticket est durable, ne pas conserver le panier prérempli :
        // une nouvelle soumission générerait un autre UUID pour la même vente.
        if (stored) formulaire.reset();
        lock.current = false;
      }
    });
  }

  function syncAll() {
    if (lock.current || queued.length === 0 || queueState.error) return;
    lock.current = true;
    setMsg({ kind: "info", text: `Synchronisation de ${queued.length} ticket(s)…` });
    startTransition(async () => {
      try {
        await store.transact(async (queue) => {
          let ok = 0, dup = 0;
          const errs: string[] = [];
          let stopped = false;
          let firstOk: VenteAffichee | null = null;
          for (const sale of queue.read()) {
            const { status, state } = await trySync(sale);
            if (status === "network") { stopped = true; break; }
            if (status === "ok" || status === "dup") {
              queue.write(removeSale(queue.read(), sale.ticket));
              if (status === "ok") ok++; else dup++;
              firstOk ??= ticketVente(state, sale);
            } else {
              // Un refus ne prouve pas qu'un ancien envoi ambigu n'a pas abouti.
              errs.push(`${queuedSaleSummary(sale)} : ${state.erreur ?? "refusé"}`);
            }
          }
          if (firstOk) setLastSale(firstOk);
          const parts: string[] = [];
          if (ok) parts.push(`${ok} synchronisé(s)`);
          if (dup) parts.push(`${dup} déjà enregistré(s)`);
          if (errs.length) parts.push(`${errs.length} refusé(s), conservés : ${errs.join(" ; ")}`);
          if (stopped) parts.push("résultat inconnu — le reste demeure en file");
          setMsg({ kind: errs.length ? "err" : stopped ? "info" : "ok", text: parts.join(" · ") || "File vide." });
        });
      } catch {
        setMsg({ kind: "err", text: "Synchronisation interrompue ou stockage indisponible. Vérifiez l'historique et la file avant de reprendre." });
      } finally { lock.current = false; }
    });
  }

  function retirerTicket(ticket: string) {
    if (lock.current || !window.confirm("Vérifiez d'abord l'historique de caisse. Le résultat peut déjà être enregistré. Retirer ce ticket de la file locale ?")) return;
    lock.current = true;
    startTransition(async () => {
      try {
        await store.transact(async (queue) => { queue.write(removeSale(queue.read(), ticket)); });
        setMsg({ kind: "info", text: "Ticket retiré de la file locale uniquement. Vérifiez l'historique de caisse." });
      } catch { setMsg({ kind: "err", text: "Retrait impossible : la file n'a pas été modifiée." }); }
      finally { lock.current = false; }
    });
  }

  if (guideTermine && !lastSale && !msg && queued.length === 0 && !queueState.error && !queueState.legacy) return null;

  const produit = (
    <label className={label}>
      Produit
      <select name="articleId" required className={champGuide} disabled={articles.length === 0}>
        <option value="">Choisir un produit</option>
        {articles.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </label>
  );
  const site = (
    <label className={label}>
      Site
      <select name="siteId" required className={champGuide} defaultValue={siteCaisse(sites)}>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
  const quantiteGuide = (
    <label className={`${label} max-w-xs`}>
      Quantité
      <input
        name="qte"
        type="number"
        min={0.0001}
        max={100_000_000}
        step="any"
        required
        defaultValue={1}
        className={champGuide}
      />
    </label>
  );

  return (
    <div className="pg-stack">
      {!guideTermine &&
        (guide ? (
          <FormulaireGuide
            onSubmit={onSubmit}
            pending={pending}
            valider="Encaisser"
            indisponible={!articles.length || !sites.length || queued.length > 0 || !!queueState.error}
            groupes={[
              {
                nom: "Produit et site",
                titre: "Que vendez-vous ?",
                contenu: <div className="grid gap-3 sm:grid-cols-2">{produit}{site}</div>,
              },
              {
                nom: "Quantité",
                titre: "Quelle quantité vendez-vous ?",
                aide: "Enregistrez uniquement une vente réellement encaissée.",
                contenu: quantiteGuide,
              },
            ]}
          />
        ) : (
          <SaleComposer
            articles={articles}
            sites={sites}
            stock={stock}
            expiredStock={expiredStock}
            onSubmit={onSubmit}
            busy={pending || !!queueState.error}
            status={
              !online ? (
                <span className="pg-badge" data-tone="warning">Hors ligne</span>
              ) : queued.length > 0 ? (
                <span className="pg-badge" data-tone="warning">{queued.length} en attente</span>
              ) : undefined
            }
          />
        ))}
      {!online && <Notice kind="warning">La vente n’est pas confirmée tant que le serveur ne l’a pas acceptée. Le prix appliqué peut changer avant synchronisation ; vérifiez le ticket final.</Notice>}
      {queueState.error && <Notice kind="error">{queueState.error}</Notice>}
      {queueState.legacy && <Notice kind="warning">Une ancienne file non attribuée à un compte existe sur cet appareil. Elle n’est ni effacée ni synchronisée automatiquement. Faites vérifier son contenu avant toute reprise.</Notice>}
      {msg && (
        <Notice kind={msg.kind === "err" ? "error" : msg.kind === "ok" ? "success" : "info"}>
          {msg.text}
        </Notice>
      )}

      {queued.length > 0 && (
        <div className="pg-card pg-card-pad">
          <div className="pg-card-head">
            <div>
              <h3>Tickets hors-ligne à synchroniser · {queued.length}</h3>
              <p className="pg-help">Les tickets refusés restent en attente. Vérifiez l’historique avant de retirer un ticket ; le stockage du navigateur n’est pas une sauvegarde.</p>
            </div>
            <button
              type="button"
              onClick={syncAll}
              disabled={pending}
              className="pg-button"
            >
              Synchroniser maintenant
            </button>
          </div>
          <ul className="pg-simple-list">
            {queued.map((s) => (
              <li key={s.ticket} className="pg-list-between">
                <span>
                  <strong>{queuedSaleSummary(s)}</strong> · {s.siteLabel} · réf. {s.ticket}
                  {s.modePaiement && ` · ${PAYMENT_MODE_LABELS[s.modePaiement]}`}
                </span>
                <span className="pg-muted">
                  {new Date(s.queuedAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" "}<button type="button" className="pg-button pg-button-secondary" disabled={pending} onClick={() => retirerTicket(s.ticket)}>Retirer après vérification</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastSale && (
        <SaleTicket
          data={{
            numero: lastSale.numero,
            articleLabel: lastSale.articleLabel,
            siteLabel: lastSale.siteLabel,
            qte: lastSale.qte,
            lines: lastSale.lines,
            modePaiement: lastSale.modePaiement,
            totalHT: lastSale.totalHT ?? 0,
            totalTTC: lastSale.totalTTC ?? 0,
            lots: lastSale.lots ?? [],
            at: lastSale.at,
            etablissement: lastSale.etablissement,
          }}
        />
      )}
    </div>
  );
}
