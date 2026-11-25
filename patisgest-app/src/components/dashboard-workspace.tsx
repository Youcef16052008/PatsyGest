import Link from "next/link";
import type { ReactNode } from "react";
import { colonneProduction, dateLisible, dinars, indexLots, quantite, stockArticle,
  type ProductionItem, type StockArticle, type StockLot, type VentesJour } from "@/lib/workspace-data";
import { canAccessModule } from "@/lib/permissions";
import { WORKSPACE_LINKS } from "@/lib/workspace-nav";
import { Icon, type IconName } from "./workspace-icons";
import { EmptyState, Notice, PageIntro } from "./workspace-ui";
import SalesChart from "./sales-chart";
import ProductionBoard from "./production-board";

function Metric({ label, value, hint, href, icon, extra = "" }: { label: string; value: ReactNode; hint: string; href: string; icon: IconName; extra?: string }) {
  return <Link href={href} className={`pg-card pg-metric ${extra}`}><div><span>{label}</span><span className="pg-emblem"><Icon name={icon} size={18}/></span></div><strong>{value ?? "—"}</strong><small>{hint}</small></Link>;
}

export default function DashboardWorkspace({ nom, shop, today, series, articles, lots, orders, guide, caisse, canReadRecipes, seller = false }: {
  nom: string; shop: string; today: string; series: VentesJour[] | null; articles: StockArticle[] | null; lots: StockLot[] | null; orders: ProductionItem[] | null;
  guide?: ReactNode; caisse: ReactNode; canReadRecipes: boolean; seller?: boolean;
}) {
  const ventes = series?.at(-1);
  const enCours = orders?.filter(o => colonneProduction(o.statut) === "encours").length;
  const prochains = orders?.filter(o => o.statut === "planifie").sort((a,b) => a.date.localeCompare(b.date));
  const lotsParArticle = indexLots(lots ?? []);
  const alertes = articles && lots ? articles.map(a => ({ a, ...stockArticle(a, lotsParArticle.get(a.id) ?? [], today) })).filter(s => s.signals.length)
    .sort((a,b) => Number(b.signals[0].tone === "danger") - Number(a.signals[0].tone === "danger") || a.a.nom.localeCompare(b.a.nom,"fr")) : null;
  const liens = WORKSPACE_LINKS.filter(l =>
    (l.primary && l.href !== "/tableau-de-bord" || l.href === "/cake-design") &&
    (canReadRecipes || l.href !== "/recettes") &&
    (!seller || canAccessModule("vendeur", l.href.slice(1)))
  );
  const premier = seller ? { lien: "/caisse", nom: "Ouvrir la caisse", info: "Choisissez un produit pour enregistrer une vente.", icon: "receipt" as const }
    : alertes?.length ? { lien: "/stocks?filtre=alerte", nom: "Vérifier les stocks", info: `${alertes.length} ${alertes.length === 1 ? "article à surveiller" : "articles à surveiller"}.`, icon: "box" as const }
    : { lien: "/production", nom: "Consulter les fournées", info: prochains?.length ? `${prochains.length} à lancer.` : "Retrouvez le planning de fabrication.", icon: "layers" as const };
  return <div className="pg-dashboard">
    <header className="pg-dashboard-lead">
      <div className="pg-dash-copy">
        <p className="pg-kicker pg-dash-identity">{shop}</p>
        <h1><span className="pg-dash-greeting">Bonjour {nom}<span aria-hidden="true">.</span></span><span className="pg-dash-pilot-title">Vue d’ensemble</span><span className="pg-dash-prod-title">Vos fournées</span></h1>
        <p className="pg-page-description pg-dash-description">{seller ? "Vos ventes et les quantités de votre boutique, au même endroit." : "Vos stocks, fournées et ventes au même endroit. Retrouvez les priorités du jour."}</p>
        <div className="pg-dash-hero-actions">
          <Link className="pg-button" href={seller ? "/caisse" : "/production"}>{seller ? "Ouvrir la caisse" : "Voir la production"}<Icon name="arrow" size={17}/></Link>
          <Link className="pg-button pg-button-secondary" href={seller ? "/stocks" : "/caisse"}><Icon name={seller ? "box" : "receipt"} size={17}/>{seller ? "Voir les stocks" : "Ouvrir la caisse"}</Link>
        </div>
      </div>
      <span className="pg-dash-date"><Icon name="calendar" size={16}/> {dateLisible(today, "full")}</span>
      <div className="pg-dash-photo" aria-hidden="true"><span><Icon name="logo" size={18}/> L’ART DE FAIRE</span></div>
    </header>
    <div className="pg-home-cash">
      <PageIntro title="Le comptoir" label="Boutique" description="Choisissez un produit et sa quantité, puis enregistrez la vente."
        actions={<Link className="pg-button pg-button-secondary" href="/caisse#ventes-recentes"><Icon name="receipt" size={17}/> Ventes récentes</Link>}/>
      {caisse}
    </div>
    {guide}
    <section className="pg-home-next pg-card pg-card-pad" aria-label="Votre prochaine action">
      <span className="pg-badge"><Icon name="guide" size={16}/> Votre journée</span><h2>{premier.nom}</h2><p>{premier.info}</p>
      <Link className="pg-button" href={premier.lien}><Icon name={premier.icon} size={17}/> {premier.nom}<Icon name="arrow" size={16}/></Link>
    </section>
    <section className="pg-home-kpis" aria-label="Indicateurs du jour">
      {!seller ? (
        <>
          <Metric label="Ventes du jour" value={ventes && dinars(ventes.ttc, false)} hint={ventes ? `${ventes.tickets} ${ventes.tickets === 1 ? "ticket" : "tickets"} · encaissé` : "Lecture indisponible"} href="/caisse" icon="trend"/>
          <Metric label="Tickets du jour" value={ventes?.tickets} hint={ventes && ventes.tickets > 0 ? `${dinars(ventes.ttc / ventes.tickets)} en moyenne` : ventes ? "Aucun ticket enregistré" : "Lecture indisponible"} href="/caisse" icon="receipt" extra="pg-metric-pilotage"/>
          <Metric label="Fournées en cours" value={enCours} hint={prochains ? `${prochains.length} à lancer` : "Lecture indisponible"} href="/production" icon="layers"/>
        </>
      ) : (
        <>
          <Metric label="Comptage du soir" value="Tiroir caisse" hint="Saisir le comptage en fin de journée" href="/cloture" icon="check"/>
          <Metric label="Commandes gâteaux" value="Boutique" hint="Encaisser acomptes et livraisons" href="/cake-design" icon="cake"/>
        </>
      )}
      <Metric label="Articles à surveiller" value={alertes?.length} hint={alertes ? "Rupture, seuil ou date limite" : "Lecture indisponible"} href="/stocks?filtre=alerte" icon="alert"/>
    </section>
    {!seller && <div className="pg-home-board"><ProductionBoard orders={orders} preview/></div>}
    <div className="pg-home-panels">
      {!seller && <SalesChart series={series}/>}
      <section className="pg-card pg-card-pad pg-home-alerts">
        <div className="pg-card-head"><h2>À surveiller</h2><Link className="pg-text-link" href="/stocks?filtre=alerte">Voir les stocks <Icon name="arrow" size={16}/></Link></div>
        {!alertes ? <Notice kind="warning">L’état du stock n’a pas pu être vérifié.</Notice> : alertes.length ? <ul className="pg-home-rows">{alertes.slice(0,3).map(s => <li key={s.a.id}>
          <span className="pg-emblem" data-tone={s.signals[0].tone}><Icon name="alert" size={18}/></span><span><b>{s.a.nom}</b>
            <small>{quantite(s.quantity, s.a.unite)} en stock{s.nextDlc && s.signals[0].label.startsWith("DLC") ? ` · DLC ${dateLisible(s.nextDlc)}` : ""}</small></span>
          <span className="pg-badge" data-tone={s.signals[0].tone}>{s.signals[0].label}</span>
        </li>)}</ul> : <EmptyState icon="check" title="Aucun article à surveiller" text="Les quantités et dates limite ne signalent pas d’alerte."/>}
      </section>
      {!seller && (
        <section className="pg-card pg-card-pad pg-home-agenda">
          <div className="pg-card-head"><h2>Prochaines fournées</h2><Link className="pg-text-link" href="/production">Production <Icon name="arrow" size={16}/></Link></div>
          {!prochains ? <Notice kind="warning">Le planning n’a pas pu être chargé.</Notice> : prochains.length ? <ul className="pg-home-rows">{prochains.slice(0,3).map(o => <li key={o.id}>
            <span className="pg-emblem"><Icon name="calendar" size={18}/></span><span><b>{o.title}</b><small>{quantite(o.planned)} prévues{o.site ? ` · ${o.site}` : ""}</small></span>
            <span className="pg-badge">{dateLisible(o.date, "short")}</span>
          </li>)}</ul> : <EmptyState icon="layers" title="Aucune fournée à lancer" text="Planifiez une fabrication depuis Production."/>}
        </section>
      )}
    </div>
    <section className="pg-home-shortcuts" aria-label="Raccourcis métier">
      <div className="pg-card-head"><h2>Vos raccourcis</h2></div>
      <ul>{liens.map(l => <li key={l.href}><Link className="pg-card pg-shortcut" href={l.href}>
        <span className="pg-emblem"><Icon name={l.icon} size={19}/></span><span><b>{l.title}</b><small>{l.description}</small></span><Icon name="chevron" size={16}/>
      </Link></li>)}</ul>
    </section>
  </div>;
}
