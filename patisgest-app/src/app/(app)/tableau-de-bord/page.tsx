import Link from "next/link";
import { requireSession, ROLE_LABELS } from "@/lib/auth";
export const dynamic = "force-dynamic";
const cards = [
  ['/stocks','📦','Articles & stocks','Articles, lots et ordre FEFO'],
  ['/achats','🧾','Achats','Fournisseurs et réception de lots'],
  ['/recettes','📖','Recettes & coûts','Rendement, parage et coût par portion'],
  ['/simulation','🧮','Simulation prix','Hypothèses de marge et coût matières'],
  ['/production','👨‍🍳','Production','Ordres de fabrication et lots produits'],
  ['/planning','📅','Planning','Charge, tâches et besoins matières'],
  ['/transferts','🚚','Transferts','Mouvements entre les sites'],
  ['/caisse','💰','Caisse','Ventes et consommation de lots'],
  ['/cloture','📊','Clôture & pertes','Six flux et taux de perte'],
  ['/qualite','🌡️','HACCP & qualité','Températures, nettoyage et non-conformités'],
  ['/tracabilite','🔍','Traçabilité','Lots, mouvements et simulation de rappel'],
  ['/cake-design','🎂','Cake Design','Devis, acompte et rétroplanning'],
];
export default async function Dashboard() {
  const ctx=await requireSession();
  return <div><p className="text-xs font-bold uppercase tracking-widest text-violet-600">Pâtisserie El Yasmine · Pilote</p><h1 className="mt-2 text-3xl font-black">Bonjour {ctx.nom.split(' (')[0]} 👋</h1><p className="mt-2 text-slate-500">Votre espace de gestion · {ROLE_LABELS[ctx.role]}</p><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([href,icon,title,desc])=><Link key={href} href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-violet-300"><span className="text-3xl">{icon}</span><h2 className="mt-4 font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{desc}</p><p className="mt-5 text-sm font-bold text-violet-700">Ouvrir →</p></Link>)}</div><div className="mt-8 rounded-2xl border border-violet-100 bg-white p-5 text-sm text-slate-600"><b className="text-violet-800">Sprint 2 en construction</b><p className="mt-2">{ctx.mode==='pilote-local' ? 'Les opérations ci-dessus sont des simulations locales. Elles ne modifient pas la base distante.' : 'Les données Supabase sont affichées en lecture seule pendant le développement des opérations transactionnelles.'} D’autres modules restent à porter.</p></div></div>;
}
