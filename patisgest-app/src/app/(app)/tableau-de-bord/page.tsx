import Link from "next/link";
import { canReadCosts, requireSession, ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { progressionOnboarding, COMPTEURS_VIDES, type CompteursOnboarding } from "@/lib/onboarding";
import OnboardingPanel from "@/components/onboarding-panel";
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

/** Compteurs réels pour l'assistant d'onboarding (MOD-15). */
async function compter(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string): Promise<CompteursOnboarding> {
  const [artRes, matRes, fourRes, famRes, verRes, ofRes, venteRes, lotRes] = await Promise.all([
    supabase.from('articles').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('articles').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('niveau', 'matiere'),
    supabase.from('fournisseurs').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('recette_familles').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('recette_versions').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('active', true),
    supabase.from('ordres_fabrication').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('ventes').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('lots').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
  ]);
  return {
    articles: artRes.count ?? 0,
    matieres: matRes.count ?? 0,
    fournisseurs: fourRes.count ?? 0,
    famillesRecette: famRes.count ?? 0,
    versionsActives: verRes.count ?? 0,
    ordresFabrication: ofRes.count ?? 0,
    ventes: venteRes.count ?? 0,
    lots: lotRes.count ?? 0,
  };
}

export default async function Dashboard() {
  const ctx=await requireSession();
  // Le vendeur ne voit pas les coûts (migration 17) : on lui cache aussi les
  // modules qui les exposent, comme dans la navigation.
  const navCards = cards.filter(([href])=>href!=='/recettes' && href!=='/simulation' || canReadCosts(ctx.role));

  // Mode pilote local : pas de base distante, l'assistant repartirait de zéro.
  let compteurs: CompteursOnboarding = COMPTEURS_VIDES;
  if (ctx.mode === 'supabase') {
    try {
      const supabase = await createClient();
      compteurs = await compter(supabase, ctx.clientId);
    } catch {
      compteurs = COMPTEURS_VIDES;
    }
  }
  const progression = progressionOnboarding(compteurs);

  return <div><p className="text-xs font-bold uppercase tracking-widest text-violet-600">Pâtisserie El Yasmine · Pilote</p><h1 className="mt-2 text-3xl font-black">Bonjour {ctx.nom.split(' (')[0]} 👋</h1><p className="mt-2 text-slate-500">Votre espace de gestion · {ROLE_LABELS[ctx.role]}</p><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{navCards.map(([href,icon,title,desc])=><Link key={href} href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-violet-300"><span className="text-3xl">{icon}</span><h2 className="mt-4 font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{desc}</p><p className="mt-5 text-sm font-bold text-violet-700">Ouvrir →</p></Link>)}</div>
    {ctx.mode === 'supabase' && <OnboardingPanel progression={progression} />}
    <div className="mt-8 rounded-2xl border border-violet-100 bg-white p-5 text-sm text-slate-600"><b className="text-violet-800">{ctx.mode==='pilote-local' ? 'Démo locale' : 'Pilote'}</b><p className="mt-2">{ctx.mode==='pilote-local' ? 'Les opérations ci-dessus sont des simulations locales. Elles ne modifient pas la base distante.' : 'Les écritures sont transactionnelles et isolées par établissement (RLS). Les exports CSV (module Clôture) servent de sauvegarde portable.'}</p></div></div>;
}
