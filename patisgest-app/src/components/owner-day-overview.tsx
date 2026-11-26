import Link from 'next/link';
import { cakeDayLabel, ownerDayPlan, productionDayLabel, type DayCake } from '@/lib/owner-day';
import { dinars, dateLisible, plusJours, type ProductionItem, type StockArticle, type StockLot, type VentesJour } from '@/lib/workspace-data';
import { Icon } from './workspace-icons';
import OwnerMotionControl from './owner-motion-control';

export default function OwnerDayOverview({ nom, shop, today, articles, lots, cakes, orders, series, creditsDa, creditsAvailable }: {
  nom: string; shop: string; today: string; articles: StockArticle[] | null; lots: StockLot[] | null;
  cakes: DayCake[] | null; orders: ProductionItem[] | null; series: VentesJour[] | null;
  creditsDa: number; creditsAvailable: boolean;
}) {
  const plan = ownerDayPlan({ today, articles, lots, cakes, orders, creditsDa, creditsAvailable, salesAvailable: series !== null });
  const salesToday = series?.find(day => day.day === today);
  const incomplete = !articles || !lots || !cakes || !orders || !series || !creditsAvailable;
  return <>
    <header className="pg-owner-heading">
      <div className="pg-owner-hero-copy">
        <p className="pg-owner-eyebrow"><span aria-hidden="true"/> Votre atelier au quotidien</p>
        <h1>Bonjour {nom}<span className="pg-owner-greeting-dot">.</span></h1>
        <p className="pg-owner-hero-description">Voici l’essentiel pour aujourd’hui et demain.</p>
        <p className="pg-owner-date"><Icon name="calendar" size={15}/> <span>{shop} · {dateLisible(today, 'full')}</span></p>
        {series && <Link href="/caisse" className="pg-button pg-owner-hero-button"><Icon name="receipt" size={17}/> Ouvrir la caisse <Icon name="arrow" size={16}/></Link>}
      </div>
      <div className="pg-owner-hero-art" aria-hidden="true">
        <span className="pg-owner-signature"><span className="pg-owner-signature-ring"/><Icon name="logo" size={25}/></span>
        <span className="pg-owner-art-sparkle pg-owner-art-sparkle-one"><Icon name="guide" size={24}/></span>
        <span className="pg-owner-art-sparkle pg-owner-art-sparkle-two"><Icon name="guide" size={13}/></span>
        <span className="pg-owner-art-stamp"><Icon name="cake" size={18}/> Fait avec passion</span>
      </div>
      <OwnerMotionControl/>
    </header>
    <div className="pg-owner-overview">
      <section className="pg-card pg-card-pad pg-owner-priorities" aria-labelledby="owner-today">
        <div className="pg-owner-section-heading"><div className="pg-owner-section-title"><span className="pg-owner-section-icon"><Icon name="sun" size={20}/></span><div><p className="pg-kicker">Vos priorités</p><h2 id="owner-today">Aujourd’hui</h2></div></div>{salesToday && <div className="pg-owner-sales"><span className="pg-owner-sales-label">Ventes enregistrées <Icon name="trend" size={15}/></span><strong>{dinars(salesToday.ttc, false)}</strong><small>{salesToday.tickets} ticket{salesToday.tickets > 1 ? 's' : ''}</small></div>}</div>
        {plan.actions.length ? <ol className="pg-owner-actions">{plan.actions.slice(0, 3).map((item, index) => <li key={item.id}>
          <span className="pg-owner-action-number" data-urgent={item.urgent}>{index + 1}</span>
          <div><h3>{item.title}</h3><p>{item.explanation}</p><Link className="pg-text-link" href={item.href}>{item.action} <Icon name="arrow" size={15}/></Link></div>
        </li>)}</ol> : <p className="pg-owner-empty">{incomplete ? 'Certaines informations ne sont pas disponibles. Consultez les modules concernés.' : 'Aucune action prioritaire détectée dans les données disponibles.'}</p>}
        {plan.actions.length > 3 && <div className="pg-owner-other-actions"><p>Autres points à suivre</p><ul>{plan.actions.slice(3).map(item => <li key={item.id}><Link href={item.href}>{item.title} <Icon name="arrow" size={14}/></Link></li>)}</ul></div>}
        {plan.actions.length > 0 && incomplete && <p className="pg-muted pg-owner-more">Certaines données sont indisponibles : cette liste peut être incomplète.</p>}
      </section>
      <section className="pg-card pg-card-pad pg-owner-tomorrow" aria-labelledby="owner-tomorrow">
        <div className="pg-owner-section-title"><span className="pg-owner-section-icon pg-owner-section-icon-tomorrow"><Icon name="calendar" size={20}/></span><div><p className="pg-kicker">Anticiper</p><h2 id="owner-tomorrow">Préparer demain</h2></div></div>
        <p className="pg-owner-tomorrow-date">{dateLisible(plusJours(today, 1), 'full')}</p>
        {cakes === null ? <p className="pg-owner-tomorrow-row">Commandes indisponibles.</p> : <div className="pg-owner-tomorrow-row">
          <span className="pg-owner-tomorrow-icon"><Icon name="cake" size={19}/></span>
          <div><strong>{plan.tomorrowCakes.length} commande{plan.tomorrowCakes.length > 1 ? 's' : ''} pour demain</strong><p>{plan.tomorrowCakes.length ? `Vérifiez la préparation et le retrait : ${plan.tomorrowCakes.slice(0, 2).map(cakeDayLabel).join(', ')}${plan.tomorrowCakes.length > 2 ? '…' : ''}.` : 'Aucune commande prévue demain dans la liste chargée.'}</p><Link className="pg-text-link" href="/cake-design">Voir les commandes <Icon name="arrow" size={15}/></Link></div>
        </div>}
        {orders === null ? <p className="pg-owner-tomorrow-row">Planning de production indisponible.</p> : <div className="pg-owner-tomorrow-row">
          <span className="pg-owner-tomorrow-icon"><Icon name="grain" size={19}/></span>
          <div><strong>{plan.tomorrowOrders.length} fournée{plan.tomorrowOrders.length > 1 ? 's' : ''} prévue{plan.tomorrowOrders.length > 1 ? 's' : ''}</strong><p>{plan.tomorrowOrders.length ? `Confirmez les quantités et les ingrédients : ${plan.tomorrowOrders.slice(0, 2).map(productionDayLabel).join(', ')}${plan.tomorrowOrders.length > 2 ? '…' : ''}.` : 'Vérifiez le planning et préparez les ingrédients nécessaires.'}</p><Link className="pg-text-link" href="/production">Voir la production <Icon name="arrow" size={15}/></Link></div>
        </div>}
      </section>
    </div>
  </>;
}
