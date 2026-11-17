import type { ReactNode } from "react";
import Link from "next/link";
import { ROLE_LABELS, canReadCosts, requireSession } from "@/lib/auth";
import { logout } from "@/lib/actions-auth";

export const dynamic = "force-dynamic";
const navBase = [["/tableau-de-bord","Vue d’ensemble"],["/stocks","Articles & stocks"],["/achats","Achats"],["/recettes","Recettes & coûts"],["/simulation","Simulation prix"],["/production","Production"],["/planning","Planning"],["/transferts","Transferts"],["/caisse","Caisse"],["/cloture","Clôture"],["/qualite","Qualité"],["/tracabilite","Traçabilité"],["/cake-design","Cake Design"],["/parametres","Paramètres"]];
// Les modules de coûts (recettes, simulation) ne sont pas proposés au vendeur :
// il encaisse, il ne lit pas le coût de revient (cf. lib/permissions.ts).
const navCouts = new Set(["/recettes","/simulation"]);
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx=await requireSession();
  const nav=navBase.filter(([href])=>!navCouts.has(href)||canReadCosts(ctx.role));
  return <div className="min-h-screen bg-[#f6f5fa] text-slate-800"><header className="border-b bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-4"><Link href="/tableau-de-bord" className="text-xl font-black text-violet-800">🧁 PâtisGest</Link><span className="hidden text-sm text-slate-500 sm:block">{ctx.clientNom}</span><span className="flex-1"/><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">{ROLE_LABELS[ctx.role]}</span><form action={logout}><button className="text-sm font-semibold text-slate-600 hover:text-violet-700">Déconnexion</button></form></div></header>
    {ctx.mode === 'pilote-local' && <div className="bg-amber-100 px-5 py-2 text-center text-xs font-semibold text-amber-900">DÉMO LOCALE · Données fictives enregistrées dans ce navigateur uniquement. Aucune synchronisation Supabase.</div>}
    <div className="mx-auto max-w-7xl px-5"><nav className="flex gap-1 overflow-x-auto border-b border-slate-200 py-3">{nav.map(([href,label])=><Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-violet-100 hover:text-violet-800">{label}</Link>)}</nav><main className="py-8">{children}</main>
      <footer className="border-t border-slate-200 py-4 text-xs text-slate-500">
        <Link href="/mentions-legales" className="font-semibold hover:text-violet-700">Mentions légales &amp; CGU</Link>
        <span className="mx-2">·</span>Phase pilote — données à sauvegarder (exports CSV dans Clôture)
      </footer></div></div>;
}
