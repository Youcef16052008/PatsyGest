import type { ReactNode } from "react";
import Link from "next/link";
import { ROLE_LABELS, canReadCosts, requireSession } from "@/lib/auth";
import { logout } from "@/lib/actions-auth";
import { WORKSPACE_LINKS } from "@/lib/workspace-nav";
import AppearancePicker, { QuickColorMode } from "@/components/appearance";
import WorkspaceNav from "@/components/workspace-nav";
import { DemoWorkspaceProvider } from "@/components/demo-workspace";
import { Icon } from "@/components/workspace-icons";

export const dynamic = "force-dynamic";
const navCouts = new Set(["/recettes", "/simulation"]);

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSession();
  const nav = WORKSPACE_LINKS.filter(({ href }) => !navCouts.has(href) || canReadCosts(ctx.role));
  const demo = ctx.mode === "pilote-local";
  return <div className="pg-shell">
    <a href="#contenu" className="pg-skip">Aller au contenu</a>
    <header className="pg-topbar">
      <Link href="/tableau-de-bord" className="pg-brand"><span className="pg-brand-mark"><Icon name="logo" size={23}/></span>
        <span className="pg-brand-copy"><strong>PâtisGest</strong><small title={ctx.clientNom}>{ctx.clientNom}</small></span></Link>
      <div className="pg-top-actions">
        {demo && <span className="pg-demo-pill" title="Données fictives enregistrées dans ce navigateur">Démo locale</span>}
        <AppearancePicker compact/><QuickColorMode/>
        <span className="pg-user" title={`${ctx.nom} · ${ROLE_LABELS[ctx.role]}`}><span className="pg-avatar" aria-hidden="true">{ctx.nom.trim().slice(0, 1).toLocaleUpperCase("fr")}</span><span><b>{ctx.nom.split(" (")[0]}</b><small>{ROLE_LABELS[ctx.role]}</small></span></span>
        <form action={logout}><button type="submit" className="pg-icon-button" aria-label="Déconnexion" title="Déconnexion"><Icon name="logout" size={18}/></button></form>
      </div>
    </header>
    <WorkspaceNav links={nav}/>
    <main id="contenu" className="pg-content" tabIndex={-1}>
      {demo && <div className="pg-demo-banner"><span>DÉMO LOCALE</span> <span>Données fictives · enregistrées dans ce navigateur uniquement.</span></div>}
      {demo ? <DemoWorkspaceProvider>{children}</DemoWorkspaceProvider> : children}
    </main>
    <footer className="pg-footer"><Link href="/mentions-legales">Mentions légales &amp; CGU</Link><span>PâtisGest · Espace de gestion</span></footer>
  </div>;
}
