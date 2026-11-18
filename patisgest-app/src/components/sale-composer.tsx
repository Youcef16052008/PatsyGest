"use client";

import Image from "next/image";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { correspond, dinars, quantite, siteCaisse, type CatalogProduct, type SiteStock, type WorkspaceSite } from "@/lib/workspace-data";
import { EmptyState } from "./workspace-ui";
import { Icon } from "./workspace-icons";

const MAX_QTE = 100_000_000;
const PAGE_SIZE = 12;

export default function SaleComposer({ articles, sites, stock, onSubmit, busy = false, demo = false, status }: {
  articles: CatalogProduct[]; sites: WorkspaceSite[]; stock: SiteStock | null; busy?: boolean; demo?: boolean; status?: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const id = useId();
  const [articleId, setArticleId] = useState("");
  const [chosenSite, chooseSite] = useState(() => siteCaisse(sites));
  const [qte, setQte] = useState("1");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const ticket = useRef<HTMLElement>(null);
  const product = articles.find(a => a.id === articleId);
  const site = sites.find(s => s.id === chosenSite) ?? sites.find(s => s.id === siteCaisse(sites));
  const quantity = Number(qte);
  const qteValide = Number.isFinite(quantity) && quantity >= 0.0001 && quantity <= MAX_QTE;
  const currentStock = (p: CatalogProduct) => stock && site ? stock[site.id]?.[p.id] ?? 0 : null;
  const disponible = product ? currentStock(product) : null;
  const prixUnitaire = (p: CatalogProduct) => p.prixHT != null && p.tva != null && Number.isFinite(p.prixHT) && Number.isFinite(p.tva) ? p.prixHT * (1 + p.tva / 100) : null;
  const unitTtc = product ? prixUnitaire(product) : null;
  const noms = new Map<string, number>();
  for (const a of articles) noms.set(a.label, (noms.get(a.label) ?? 0) + 1);
  const rows = articles.filter(p => correspond(`${p.label} ${p.code ?? ""}`, search));
  const canSell = Boolean(product && site && qteValide) && !busy;
  function choisir(id: string) {
    if (articleId !== id) setQte("1");
    setArticleId(id);
    // Une cliente sur téléphone ne doit pas chercher la quantité sous une
    // longue liste. Sur écran large, le ticket est déjà à côté du catalogue.
    if (window.matchMedia("(max-width: 760px)").matches) ticket.current?.focus();
  }
  return <div className="pg-pos">
    <section className="pg-card pg-card-pad pg-catalog" aria-labelledby={`${id}-catalog`}>
      <div className="pg-card-head"><div><h2 id={`${id}-catalog`}>Produits à vendre</h2><p>Sélectionnez un produit, puis sa quantité.</p></div>{status}</div>
      <div className="pg-pos-toolbar">
        <div className="pg-search"><Icon name="search" size={18}/><input type="search" className="pg-input" placeholder="Rechercher un produit…" aria-label="Rechercher un produit"
          value={search} onChange={e => {setSearch(e.target.value); setLimit(PAGE_SIZE);}}/></div>
        {sites.length > 1 ? <label className="pg-field pg-pos-site"><span>Site de vente</span><select value={site?.id ?? ""} className="pg-input" onChange={e => chooseSite(e.target.value)} disabled={busy}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label> : site && <span className="pg-pos-only-site"><Icon name="store" size={17}/> {site.label}</span>}
      </div>
      {!!articles.length && <p className="pg-list-count" role="status">{rows.length} {rows.length === 1 ? "produit" : "produits"}</p>}
      {rows.length ? <div className="pg-product-grid" role="group" aria-label="Produits">
        {rows.slice(0, limit).map((a, index) => {
          const dispo = currentStock(a), price = prixUnitaire(a);
          return <button type="button" key={a.id} className="pg-product" aria-pressed={product?.id === a.id} disabled={busy} onClick={() => choisir(a.id)}>
            <span className="pg-product-body">
              <span className="pg-product-icon pg-emblem"><Icon name="cake" size={20}/></span>
              <span className="pg-product-copy"><strong>{a.label}</strong>
                <span className="pg-product-stock" data-empty={dispo === 0}>{dispo === null ? "Stock indisponible" : `${quantite(dispo, a.unit)} en stock`}</span>
                {price !== null && <small>{dinars(price)} TTC</small>}
                {(noms.get(a.label) ?? 0) > 1 && a.code && <small>{a.code}</small>}
              </span><span className="pg-product-select"><Icon name={product?.id === a.id ? "check" : "plus"} size={18}/></span>
            </span>
            {a.photo && <Image className="pg-product-photo" src={a.photo} alt="" width={480} height={336} loading={index < 2 ? "eager" : "lazy"} unoptimized/>}
          </button>;
        })}</div> : <EmptyState icon="cake" title={articles.length ? "Aucun produit trouvé" : "Aucun produit à vendre"}
          text={articles.length ? "Essayez un autre nom ou effacez la recherche." : "Créez un produit fini dans Stocks pour l’afficher ici."}/>}
      {rows.length > limit && <button type="button" className="pg-button pg-button-secondary mt-3" onClick={() => setLimit(limit + PAGE_SIZE)}>Afficher plus de produits</button>}
    </section>
    <section ref={ticket} tabIndex={-1} className="pg-card pg-card-pad pg-sale-draft" aria-labelledby={`${id}-draft`}>
      <div className="pg-sale-draft-head"><span className="pg-emblem"><Icon name="receipt" size={22}/></span><div><p className="pg-kicker">{demo ? "Simulation" : "Ticket"}</p><h2 id={`${id}-draft`}>Vente en cours</h2></div></div>
      {!sites.length ? <p className="pg-muted">Aucun site de vente configuré.</p> : !product ? <EmptyState title="Choisissez un produit" text="Le nom, la quantité et le total apparaîtront ici." icon="receipt"/> :
        <form onSubmit={onSubmit} onReset={() => setQte("1")} className="pg-sale-draft-form">
          <input type="hidden" name="articleId" value={product.id}/><input type="hidden" name="siteId" value={site?.id ?? ""}/>
          <div className="pg-sale-product-title"><h3>{product.label}</h3><p>{disponible === null ? "Stock indisponible" : `${quantite(disponible, product.unit)} en stock`}</p></div>
          <div className="pg-quantity-row"><label htmlFor={`${id}-qte`}>Quantité {product.unit && <small>({product.unit})</small>}</label>
            <div className="pg-stepper">
              <button type="button" disabled={!qteValide || quantity <= 1 || busy} className="pg-icon-button" aria-label="Diminuer la quantité" onClick={() => setQte(String(Math.max(1, Math.round((quantity - 1) * 10000) / 10000)))}><Icon name="minus" size={18}/></button>
              <input type="number" min="0.0001" max={MAX_QTE} step="any" inputMode="decimal" name="qte" id={`${id}-qte`} className="pg-input" value={qte} onChange={e => setQte(e.target.value)} required readOnly={busy}/>
              <button type="button" disabled={busy || quantity >= MAX_QTE} className="pg-icon-button" aria-label="Augmenter la quantité" onClick={() => setQte(String(Math.min(MAX_QTE, Math.round(((qteValide ? quantity : 0) + 1) * 10000) / 10000)))}><Icon name="plus" size={18}/></button>
            </div>
          </div>
          {disponible !== null && qteValide && quantity > disponible && <p className="pg-quantity-warning" role="status"><Icon name="alert" size={16}/> Quantité supérieure au stock enregistré sur ce site.</p>}
          <div className="pg-sale-totals"><span>Total TTC<small>{site?.label}</small></span><strong>{unitTtc !== null && qteValide ? dinars(unitTtc * quantity) : "—"}</strong></div>
          <button className="pg-button pg-sale-submit" type="submit" disabled={!canSell}>{busy ? "Enregistrement…" : demo ? "Simuler la vente" : "Encaisser"}<Icon name="arrow" size={17}/></button>
          <p className="pg-sale-note">{demo ? "Aucun paiement réel." : "Enregistrez une vente déjà encaissée."} Un produit par ticket.</p>
        </form>}
    </section>
  </div>;
}
