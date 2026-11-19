"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { sellProduct, type SaleState } from "@/lib/actions-caisse";
import type { Etablissement } from "@/lib/etablissement";
import { enqueueSale, getQueue, removeSale, setQueue, subscribeQueue, type QueuedSale } from "@/lib/sale-queue";
import { ageCatalogue, enregistrerCatalogue, getCatalogueServeurSnapshot, getCatalogueSnapshot, subscribeCatalogue, type CatalogueHorsLigne } from "@/lib/catalogue-cache";
import SaleTicket from "./sale-ticket";
import FormulaireGuide, { champGuide } from "./guide-form";
import SaleComposer from "./sale-composer";
import { Notice } from "./workspace-ui";
import { quantite, siteCaisse, type CatalogProduct, type SiteStock, type WorkspaceSite } from "@/lib/workspace-data";

const noQueue: QueuedSale[] = [];
const label = "block text-xs font-semibold text-slate-600";

type Msg = { kind: "err" | "ok" | "info"; text: string };

type VenteAffichee = SaleState & { articleLabel: string; siteLabel: string; qte: number; at: string; etablissement: Etablissement | null };

/**
 * Vente de caisse avec file hors-ligne : la vente est d'abord écrite dans la
 * file locale (localStorage), puis synchronisée immédiatement — si le réseau
 * tombe, elle reste en file et l'État synchro la renvoie (idempotent par
 * ticket : un doublon de sync ne double jamais la vente).
 */
export default function SaleForm({ articles, sites, stock = null, etablissement, guide = false, guideTermine = false }: {
  articles: CatalogProduct[]; sites: WorkspaceSite[]; stock?: SiteStock | null; etablissement?: Etablissement | null;
  guide?: boolean; guideTermine?: boolean;
}) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [lastSale, setLastSale] = useState<VenteAffichee | null>(null);
  const [pending, startTransition] = useTransition();
  const lock = useRef(false);

  /**
   * Catalogue de secours (NF-02). Si le serveur n'a rien pu fournir, on relit
   * le dernier catalogue connu du navigateur pour que la caisse reste
   * utilisable. Le stock n'est volontairement pas restauré (voir
   * lib/catalogue-cache.ts).
   *
   * Lecture par store externe (`useSyncExternalStore`) et non par effet :
   * un setState synchrone dans un effet provoquerait un rendu en cascade,
   * et le lint du projet l'interdit (react-hooks/set-state-in-effect).
   */
  const catalogue = useSyncExternalStore(subscribeCatalogue, getCatalogueSnapshot, getCatalogueServeurSnapshot);
  const aDesDonneesServeur = articles.length > 0 && sites.length > 0;

  // Mémorisation du catalogue reçu du serveur : écriture dans un système
  // externe (localStorage), pas dans l'état React — donc légitime en effet.
  useEffect(() => {
    if (!aDesDonneesServeur) return;
    enregistrerCatalogue({
      clientNom: etablissement?.nom ?? "",
      articles: articles.map((a) => ({ id: a.id, label: a.label, code: a.code, unit: a.unit, prixHT: a.prixHT, tva: a.tva })),
      sites: sites.map((s) => ({ id: s.id, label: s.label, type: s.type })),
      identite: etablissement ?? { nom: "", adresse: null, telephone: null, nif: null, nis: null, rc: null },
    });
  }, [aDesDonneesServeur, articles, sites, etablissement]);

  const secours = aDesDonneesServeur ? null : catalogue;
  const horsLigneSecours = secours !== null;
  const articlesCaisse: CatalogProduct[] = horsLigneSecours
    ? secours.articles.map((a) => ({ id: a.id, label: a.label, code: a.code, unit: a.unit, prixHT: a.prixHT, tva: a.tva }))
    : articles;
  const sitesCaisse: WorkspaceSite[] = horsLigneSecours
    ? secours.sites.map((s) => ({ id: s.id, label: s.label, type: s.type }))
    : sites;
  const identiteTicket = etablissement ?? (horsLigneSecours ? secours.identite : null);

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

  const commitQueue = (q: QueuedSale[]) => {
    setQueue(q);
  };

  /** Synchronise une vente : 'ok' | 'dup' (déjà faite) | 'network' | 'business'. */
  async function trySync(sale: QueuedSale): Promise<{ status: "ok" | "dup" | "network" | "business"; state: SaleState }> {
    const fd = new FormData();
    fd.set("articleId", sale.articleId);
    fd.set("siteId", sale.siteId);
    fd.set("qte", String(sale.qte));
    fd.set("ticket", sale.ticket);
    let state: SaleState;
    try {
      state = await sellProduct({}, fd);
    } catch {
      // Une réponse perdue ne doit pas effacer une vente de la file.
      return { status: "network", state: {} };
    }
    if (state.duplicate) return { status: "dup", state };
    if (state.succes) return { status: "ok", state };
    if (state.reessayer) return { status: "network", state };
    return { status: "business", state };
  }

  function ticketVente(state: SaleState, { articleLabel, siteLabel, qte }: QueuedSale): VenteAffichee | null {
    return state.ticket ? {
      ...state, articleLabel, siteLabel, qte, at: state.enregistreeA ?? new Date().toISOString(),
      etablissement: identiteTicket ?? null,
    } : null;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Tant que la première vente est en attente, réutiliser son ticket.
    if (lock.current || (guide && (guideTermine || getQueue().length > 0))) return;
    const formulaire = e.currentTarget;
    const fd = new FormData(formulaire);
    const articleId = String(fd.get("articleId") ?? "");
    const siteId = String(fd.get("siteId") ?? "");
    const qte = Number(fd.get("qte"));
    const articleLabel = articlesCaisse.find((a) => a.id === articleId)?.label;
    const siteLabel = sitesCaisse.find((s) => s.id === siteId)?.label;
    if (!articleLabel || !siteLabel || !Number.isFinite(qte) || qte < 0.0001 || qte > 100_000_000) {
      setMsg({ kind: "err", text: "Choisissez un produit, un site et une quantité valide." });
      return;
    }
    const sale: QueuedSale = {
      ticket: crypto.randomUUID(),
      articleId, articleLabel, siteId, siteLabel, qte,
      queuedAt: new Date().toISOString(),
    };
    lock.current = true;
    commitQueue(enqueueSale(getQueue(), sale));
    setMsg({ kind: "info", text: "Vente en file — synchronisation…" });
    startTransition(async () => {
      const { status, state } = await trySync(sale);
      if (status === "ok" || status === "dup") {
        commitQueue(removeSale(getQueue(), sale.ticket));
        const ticket = ticketVente(state, sale);
        if (ticket) setLastSale(ticket);
        setMsg({ kind: "ok", text: status === "dup" ? "Vente déjà enregistrée. Aucun doublon créé." : (state.manquant ?? 0) > 0
          ? `Vente enregistrée. Stock manquant : ${quantite(state.manquant ?? 0)}. Vérifiez l’inventaire.` : "Vente enregistrée." });
        formulaire.reset();
      } else if (status === "network") {
        setMsg({ kind: "info", text: "Vente conservée dans la file locale. Reprenez la synchronisation dès que la connexion est rétablie." });
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
    setMsg({ kind: "info", text: `Synchronisation de ${queued.length} vente(s)…` });
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
          errs.push(`${sale.articleLabel} × ${sale.qte} : ${state.erreur ?? "refusée"}`);
        }
      }
      commitQueue(q);
      if (firstOk) setLastSale(firstOk);
      const parts: string[] = [];
      if (ok > 0) parts.push(`${ok} synchronisée(s)`);
      if (dup > 0) parts.push(`${dup} déjà enregistrée(s)`);
      if (errs.length > 0) parts.push(`${errs.length} refusée(s) : ${errs.join(" ; ")}`);
      if (stopped) parts.push("réseau indisponible — le reste reste en file");
      setMsg({ kind: errs.length > 0 ? "err" : stopped ? "info" : "ok", text: parts.join(" · ") || "File vide." });
      lock.current = false;
    });
  }

  /**
   * Synchronisation automatique (NF-02 / D5) : dès que le réseau revient, la
   * file part toute seule. L'ancien comportement demandait au caissier de
   * cliquer « Synchroniser maintenant » — il oubliait, et la file grossissait.
   *
   * `syncAllRef` évite de recréer un intervalle à chaque rendu ; `lock`
   * empêche deux synchronisations concurrentes (la même vente ne part jamais
   * deux fois, mais autant ne pas la rejouer).
   */
  const syncAllRef = useRef<() => void>(() => {});
  useEffect(() => {
    syncAllRef.current = syncAll;
  });

  useEffect(() => {
    const tenter = () => {
      if (guide) return; // le guide d'accueil gère sa propre progression
      if (navigator.onLine === false) return;
      if (getQueue().length === 0 || lock.current) return;
      syncAllRef.current();
    };
    const surRetour = () => tenter();
    window.addEventListener("online", surRetour);
    // Filet de sécurité : certains navigateurs de tablette ne tirent pas
    // l'événement `online` de façon fiable après une mise en veille.
    const minuterie = window.setInterval(tenter, 30_000);
    tenter();
    return () => {
      window.removeEventListener("online", surRetour);
      window.clearInterval(minuterie);
    };
  }, [guide]);

  if (guideTermine && !lastSale && !msg && queued.length === 0) return null;

  const produit = <label className={label}>Produit
    <select name="articleId" required className={champGuide} disabled={articlesCaisse.length === 0}>
      <option value="">Choisir un produit</option>
      {articlesCaisse.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
    </select>
  </label>;
  const site = <label className={label}>Site
    <select name="siteId" required className={champGuide} defaultValue={siteCaisse(sitesCaisse)}>
      {sitesCaisse.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  </label>;
  const quantiteGuide = <label className={`${label} max-w-xs`}>Quantité
    <input name="qte" type="number" min={0.0001} max={100_000_000} step="any" required defaultValue={1} className={champGuide} />
  </label>;

  return (
    <div className="pg-stack">
      {!guideTermine && (guide ? (
        <FormulaireGuide onSubmit={onSubmit} pending={pending} valider="Encaisser" indisponible={!articlesCaisse.length || !sitesCaisse.length || queued.length > 0}
          groupes={[
            { nom: "Produit et site", titre: "Que vendez-vous ?", contenu: <div className="grid gap-3 sm:grid-cols-2">{produit}{site}</div> },
            { nom: "Quantité", titre: "Quelle quantité vendez-vous ?", aide: "Enregistrez uniquement une vente réellement encaissée.", contenu: quantiteGuide },
          ]} />
      ) : (
        <SaleComposer articles={articlesCaisse} sites={sitesCaisse} stock={horsLigneSecours ? null : stock} onSubmit={onSubmit} busy={pending}
          status={!online ? <span className="pg-badge" data-tone="warning">Hors ligne</span> : queued.length > 0 ? <span className="pg-badge" data-tone="warning">{queued.length} en attente</span> : undefined} />
      ))}
      {(horsLigneSecours || !online) && (
        <Notice kind="info">
          <strong>Mode hors-ligne — les ventes sont enregistrées localement.</strong>{" "}
          {horsLigneSecours
            ? `Catalogue du ${new Date(secours.enregistreLe).toLocaleDateString("fr-FR")} (${Math.floor(ageCatalogue(secours))} j). `
            : ""}
          Elles partiront seules au retour du réseau ; aucun doublon ne sera créé.
        </Notice>
      )}
      {msg && <Notice kind={msg.kind === "err" ? "error" : msg.kind === "ok" ? "success" : "info"}>{msg.text}</Notice>}

      {queued.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-amber-800">Ventes à synchroniser · {queued.length}</h3>
            <button type="button" onClick={syncAll} disabled={pending}
              className="ml-auto rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              Synchroniser maintenant
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {queued.map((s) => (
              <li key={s.ticket} className="flex flex-wrap gap-2 text-xs text-amber-900">
                <span className="font-bold">{s.articleLabel}</span>
                <span>× {s.qte}</span>
                <span className="opacity-70">{s.siteLabel}</span>
                <span className="ml-auto opacity-70">{new Date(s.queuedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastSale && (
        <SaleTicket data={{
          numero: lastSale.numero,
          articleLabel: lastSale.articleLabel,
          siteLabel: lastSale.siteLabel,
          qte: lastSale.qte,
          totalHT: lastSale.totalHT ?? 0,
          totalTTC: lastSale.totalTTC ?? 0,
          lots: lastSale.lots ?? [],
          at: lastSale.at,
          etablissement: lastSale.etablissement,
        }} />
      )}
    </div>
  );
}
