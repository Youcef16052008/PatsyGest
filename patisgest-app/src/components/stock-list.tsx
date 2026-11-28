"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { correspond, dateLisible, indexLots, ordreLots, quantite, stockArticle, type StockArticle, type StockLot, type WorkspaceSite } from "@/lib/workspace-data";
import { EmptyState, Notice } from "./workspace-ui";
import { stockAlertRank, stockOverview } from "@/lib/stock-overview";
import { Icon } from "./workspace-icons";

const filters = [
  { id: "tous", label: "Tout" }, { id: "alerte", label: "À racheter" },
  { id: "produit", label: "Gâteaux" }, { id: "matiere", label: "Ingrédients" },
] as const;
const nomType = (value: string) => value === "produit" ? "Gâteau / produit fini" : value === "matiere" ? "Ingrédient" : "Autre article";
const LIMIT = 8;

export default function StockList({ articles, lots, sites, today, filtre }: {
  articles: StockArticle[] | null; lots: StockLot[] | null; sites: WorkspaceSite[] | null; today: string; filtre?: string;
}) {
  const id = useId();
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState(filtre === "alerte" ? "alerte" : "tous");
  const [site, setSite] = useState("");
  const [limit, setLimit] = useState(LIMIT);
  const indexed = useMemo(() => indexLots(lots ?? [], site), [lots, site]);
  const rows = useMemo(() => (articles ?? []).map(article => {
    const items = indexed.get(article.id) ?? [];
    return { article, items, stock: lots ? stockArticle(article, items, today) : null };
  }), [articles, indexed, lots, today]);
  const summary = articles && lots ? stockOverview(rows.map(({ stock }) => ({ signals: stock?.signals ?? [] }))) : null;
  const alertes = summary?.alertes ?? null;
  const nomsSites = new Map(sites?.map(s => [s.id, s.label]));
  const visible = rows.filter(({ article, items, stock }) => (selection === "tous" || selection === article.niveau || (selection === "alerte" && (stock?.signals.length ?? 0) > 0)) &&
    correspond(`${article.nom} ${article.code} ${items.map((l) => l.numero).join(" ")}`, recherche))
    .sort((a, b) => selection === "alerte" ? stockAlertRank(a.stock?.signals ?? []) - stockAlertRank(b.stock?.signals ?? []) : 0);
  return <section className="pg-stock pg-card pg-card-pad" aria-labelledby={id}>
    <div className="pg-card-head"><div><h2 id={id}>Ce qui reste</h2><p>Touchez une ligne pour voir les lots, les dates et les quantités.</p></div>
      {!!sites?.length && <label className="pg-field pg-site-filter">Site
        <select className="pg-input" value={site} onChange={(event) => { setSite(event.target.value); setLimit(LIMIT); }}>
          <option value="">Tous les sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select></label>}
    </div>
    {articles === null ? <Notice kind="error">Impossible de charger les articles. Rechargez la page.</Notice> : <>
      {lots === null && <Notice kind="warning">Les quantités et les lots sont temporairement indisponibles.</Notice>}
      {sites === null && <Notice kind="warning">Les noms des sites ne sont pas disponibles.</Notice>}
      {summary && articles.length > 0 && <div className="pg-stock-overview">
        <span className="pg-stock-overview-icon"><Icon name={summary.alertes ? "alert" : "check"} size={20}/></span>
        <div><strong>{summary.alertes ? `${summary.alertes} article${summary.alertes > 1 ? "s" : ""} à racheter` : "Tout est en stock"}</strong>
          <p>{summary.alertes ? [summary.quantites ? `${summary.quantites} quantité${summary.quantites > 1 ? "s" : ""} trop basse${summary.quantites > 1 ? "s" : ""}` : "", summary.dates ? `${summary.dates} date${summary.dates > 1 ? "s" : ""} à regarder` : "", summary.bloques ? `${summary.bloques} lot bloqué` : ""].filter(Boolean).join(" · ") : "Rien à racheter pour le site sélectionné."}</p></div>
        {summary.alertes > 0 && selection !== "alerte" && <button type="button" className="pg-button pg-button-secondary" onClick={() => { setSelection("alerte"); setRecherche(""); setLimit(LIMIT); }}>Voir quoi racheter <Icon name="arrow" size={16}/></button>}
      </div>}
      <div className="pg-stock-toolbar">
        <div className="pg-filter-row" role="group" aria-label="Filtrer les articles">{filters.map(f =>
          <button type="button" key={f.id} className="pg-filter" aria-pressed={selection === f.id} disabled={f.id === "alerte" && lots === null}
            onClick={() => { setSelection(f.id); setLimit(LIMIT); }}>{f.label}{f.id === "alerte" && alertes !== null && <span className="pg-filter-count">{alertes}</span>}</button>)}</div>
        <div className="pg-search"><Icon name="search" size={17}/><input type="search" value={recherche} aria-label="Rechercher un article ou un lot" placeholder="Nom ou lot…"
          className="pg-input" onChange={event => { setRecherche(event.target.value); setLimit(LIMIT); }}/></div>
      </div>
      <p className="pg-list-count" role="status">{visible.length} {visible.length === 1 ? "article" : "articles"}{visible.length > limit && ` · ${limit} affichés`}</p>
      {visible.length === 0 ? <EmptyState title={articles.length ? "Rien sous ce nom" : "Rien en stock pour l’instant"} text={articles.length ? "Essayez un autre nom, ou « Tout »." : "Touchez « Nouvel article » en haut pour commencer."}/> :
        <ul className="pg-stock-list">{visible.slice(0, limit).map(({ article: a, items, stock }) => <li key={a.id}>
          <details className="pg-stock-item"><summary>
            <span className="pg-emblem" data-type={a.niveau}><Icon name={a.niveau === "produit" ? "cake" : "grain"} size={20}/></span>
            <span className="pg-stock-name">{a.nom}</span>
            <span className="pg-stock-qty"><strong>{stock ? quantite(stock.quantity, a.unite) : "—"}</strong><small>{stock ? "en stock" : "indisponible"}</small></span>
            <span className="pg-stock-signal">{stock?.signals.slice(0, 2).map(s => <span key={s.label} className="pg-badge" data-tone={s.tone}>{s.label}</span>)}</span>
            <Icon name="down" size={17}/>
          </summary>
          <div className="pg-stock-details">
            <dl className="pg-stock-meta"><div><dt>Type</dt><dd>{nomType(a.niveau)}</dd></div><div><dt>Code</dt><dd>{a.code}</dd></div><div><dt>Alerter sous</dt><dd>{quantite(a.seuil, a.unite)}</dd></div></dl>
            {lots === null ? <p className="pg-muted">Les lots ne sont pas disponibles.</p> : items.length === 0 ? <p className="pg-muted">Aucun lot en stock pour ce filtre.</p> : <>
              <h3>Les lots</h3>
              <ul className="pg-lot-list">{items.slice().sort(ordreLots).map(lot => <li key={lot.id}>
                <span><b>{lot.numero}</b><small>{nomsSites.get(lot.siteId) ?? "Site non renseigné"}{lot.congele ? " · Congelé" : ""}</small></span>
                <b>{quantite(lot.qte, a.unite)}</b><span>{lot.dlc ? `DLC ${dateLisible(lot.dlc)}` : "Sans DLC"}</span>
                {lot.bloque && <span className="pg-badge" data-tone="danger">Bloqué</span>}
              </li>)}</ul>
            </>}
          </div></details>
        </li>)}</ul>}
      {visible.length > limit && <button type="button" className="pg-button pg-button-secondary mt-3" onClick={() => setLimit(limit + LIMIT)}>Afficher plus d’articles</button>}
      <div className="pg-stock-foot"><Link href="/tracabilite" className="pg-text-link">Voir l’historique des lots <Icon name="arrow" size={16}/></Link></div>
    </>}
  </section>;
}
