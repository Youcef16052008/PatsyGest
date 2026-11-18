"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { sellCart, type SaleState } from "@/lib/actions-caisse";
import type { Etablissement } from "@/lib/etablissement";
import { isPaymentMode, isValidCartQty, PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/pos-cart";
import {
  createQueuedCartSale,
  enqueueSale,
  getQueue,
  queuedSaleLines,
  queuedSaleSummary,
  removeSale,
  setQueue,
  subscribeQueue,
  type QueuedSale,
  type QueuedSaleLine,
} from "@/lib/sale-queue";
import SaleTicket, { type SaleTicketLine } from "./sale-ticket";
import FormulaireGuide, { champGuide } from "./guide-form";
import SaleComposer from "./sale-composer";
import { Notice } from "./workspace-ui";
import { quantite, siteCaisse, type CatalogProduct, type SiteStock, type WorkspaceSite } from "@/lib/workspace-data";

const noQueue: QueuedSale[] = [];
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
  stock = null,
  expiredStock = null,
  etablissement,
  guide = false,
  guideTermine = false,
}: {
  articles: CatalogProduct[];
  sites: WorkspaceSite[];
  stock?: SiteStock | null;
  expiredStock?: SiteStock | null;
  etablissement?: Etablissement | null;
  guide?: boolean;
  guideTermine?: boolean;
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

  const queued = useSyncExternalStore(subscribeQueue, getQueue, () => noQueue);
  const commitQueue = (q: QueuedSale[]) => setQueue(q);

  /** Synchronise un ticket panier : 'ok' | 'dup' (déjà enregistré) | 'network' | 'business'. */
  async function trySync(
    sale: QueuedSale,
  ): Promise<{ status: "ok" | "dup" | "network" | "business"; state: SaleState }> {
    const lines = queuedSaleLines(sale);
    const fd = new FormData();
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
    if (lock.current || (guide && (guideTermine || getQueue().length > 0))) return;
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
    commitQueue(enqueueSale(getQueue(), sale));
    setMsg({ kind: "info", text: "Ticket mis en file — synchronisation…" });
    startTransition(async () => {
      const { status, state } = await trySync(sale);
      if (status === "ok" || status === "dup") {
        commitQueue(removeSale(getQueue(), sale.ticket));
        const ticket = ticketVente(state, sale);
        if (ticket) setLastSale(ticket);
        setMsg({
          kind: "ok",
          text:
            status === "dup"
              ? "Ticket déjà enregistré — aucun doublon créé."
              : (state.manquant ?? 0) > 0
                ? `Ticket enregistré (${lignes.length} produit${lignes.length > 1 ? "s" : ""}, ${PAYMENT_MODE_LABELS[modePaiement]}). Stock éligible manquant : ${quantite(state.manquant ?? 0)}.`
                : `Ticket enregistré (${lignes.length} produit${lignes.length > 1 ? "s" : ""}, ${PAYMENT_MODE_LABELS[modePaiement]}).`,
        });
        formulaire.reset();
      } else if (status === "network") {
        setMsg({
          kind: "info",
          text: "Ticket conservé dans la file locale avec sa référence unique. Reprenez la synchronisation dès le retour du réseau (aucun doublon possible).",
        });
        formulaire.reset();
      } else {
        commitQueue(removeSale(getQueue(), sale.ticket));
        setMsg({ kind: "err", text: state.erreur ?? "Vente refusée." });
      }
      lock.current = false;
    });
  }

  function syncAll() {
    if (lock.current || queued.length === 0) return;
    lock.current = true;
    setMsg({ kind: "info", text: `Synchronisation de ${queued.length} ticket(s)…` });
    startTransition(async () => {
      let q = getQueue();
      let ok = 0;
      let dup = 0;
      const errs: string[] = [];
      let stopped = false;
      let firstOk: VenteAffichee | null = null;
      for (const sale of [...q]) {
        const { status, state } = await trySync(sale);
        if (status === "network") {
          stopped = true;
          break;
        }
        if (status === "ok" || status === "dup") {
          q = removeSale(q, sale.ticket);
          if (status === "ok") ok++;
          else dup++;
          firstOk ??= ticketVente(state, sale);
        } else {
          q = removeSale(q, sale.ticket);
          errs.push(`${queuedSaleSummary(sale)} : ${state.erreur ?? "refusé"}`);
        }
      }
      commitQueue(q);
      if (firstOk) setLastSale(firstOk);
      const parts: string[] = [];
      if (ok > 0) parts.push(`${ok} synchronisé(s)`);
      if (dup > 0) parts.push(`${dup} déjà enregistré(s) sans doublon`);
      if (errs.length > 0) parts.push(`${errs.length} refusé(s) : ${errs.join(" ; ")}`);
      if (stopped) parts.push("réseau indisponible — le reste demeure en file");
      setMsg({
        kind: errs.length > 0 ? "err" : stopped ? "info" : "ok",
        text: parts.join(" · ") || "File vide.",
      });
      lock.current = false;
    });
  }

  if (guideTermine && !lastSale && !msg && queued.length === 0) return null;

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
            indisponible={!articles.length || !sites.length || queued.length > 0}
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
            busy={pending}
            status={
              !online ? (
                <span className="pg-badge" data-tone="warning">Hors ligne</span>
              ) : queued.length > 0 ? (
                <span className="pg-badge" data-tone="warning">{queued.length} en attente</span>
              ) : undefined
            }
          />
        ))}
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
              <p className="pg-help">Chaque ticket porte une référence unique : la reprise ne crée jamais de doublon.</p>
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
                  <strong>{queuedSaleSummary(s)}</strong> · {s.siteLabel}
                  {s.modePaiement && ` · ${PAYMENT_MODE_LABELS[s.modePaiement]}`}
                </span>
                <span className="pg-muted">
                  {new Date(s.queuedAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
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
