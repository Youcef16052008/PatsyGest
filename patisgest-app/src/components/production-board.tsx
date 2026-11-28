"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { colonneProduction, dateLisible, ETAPES_PRODUCTION, quantite, type ProductionItem } from "@/lib/workspace-data";
import { Icon } from "./workspace-icons";
import { Notice } from "./workspace-ui";

export default function ProductionBoard({ orders, preview = false, renderAction }: {
  orders: ProductionItem[] | null; preview?: boolean; renderAction?: (order: ProductionItem) => ReactNode;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<"board" | "list" | null>(null);
  const presentation = chosen ?? (preview ? "board" : "list");
  const [limit, setLimit] = useState(preview ? 2 : 12);
  const ordered = (orders ?? []).slice().sort((a,b) => a.statut === "termine" && b.statut === "termine" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
  const groups = ETAPES_PRODUCTION.map(step => ({ ...step, orders: ordered.filter(o => colonneProduction(o.statut) === step.id) }))
    .filter(g => g.id !== "autre" || g.orders.length > 0);

  return <section className="pg-production" aria-labelledby={id}>
    <div className="pg-card-head"><div><h2 id={id}>{preview ? "Les fournées" : "Suivi des fournées"}</h2>
      <p>{preview ? "Les fabrications à faire et les dernières terminées." : "Retrouvez ce qui est à préparer, en cours ou terminé."}</p></div>
      {preview ? <Link href="/production" className="pg-button pg-button-secondary">Ouvrir la production <Icon name="arrow" size={16}/></Link> :
        <div className="pg-segment" role="group" aria-label="Présentation des fournées">
          <button type="button" aria-pressed={presentation === "board"} onClick={() => setChosen("board")}><Icon name="layers" size={16}/> Colonnes</button>
          <button type="button" aria-pressed={presentation === "list"} onClick={() => setChosen("list")}><Icon name="list" size={16}/> Liste</button>
        </div>}
    </div>
    {orders === null ? <Notice kind="warning">Les fabrications ne sont pas disponibles pour le moment.</Notice> : <>
      <div className="pg-lanes" data-presentation={presentation}>{groups.map(g => <section className="pg-lane" key={g.id} data-stage={g.tone} aria-label={g.label}>
        <div className="pg-lane-head"><h3><i/>{g.label}</h3><span>{g.orders.length}</span></div>
        {!g.orders.length && <p className="pg-lane-empty">Aucune fournée.</p>}
        {g.orders.slice(0, limit).map(o => <article className="pg-order" key={o.id}>
          <div className="pg-order-top"><h4>{o.title}{o.version != null ? ` · v${o.version}` : ""}</h4>{o.date && <span><Icon name="calendar" size={14}/>{dateLisible(o.date)}</span>}</div>
          <p className="pg-order-quantity"><strong>{quantite(o.planned)}</strong> prévue{o.planned !== 1 ? "s" : ""}{o.done > 0 && ` · ${quantite(o.done)} réalisées`}</p>
          <div className="pg-order-foot"><span>{o.site || "Fabrication"}</span>{!preview && <span>{o.numero}</span>}{o.devis && <span>Devis {o.devis}</span>}{g.id === "autre" && <span>{o.statut === "annule" ? "Annulée" : "Autre état"}</span>}</div>
          {renderAction?.(o)}
        </article>)}
        {preview && g.orders.length > limit && <p className="pg-lane-empty">+ {g.orders.length - limit} dans Production</p>}
      </section>)}</div>
      {!preview && groups.some(g => g.orders.length > limit) && <button type="button" className="pg-button pg-button-secondary mt-3" onClick={() => setLimit(limit + 12)}>Afficher plus de fournées</button>}
    </>}
  </section>;
}
