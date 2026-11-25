import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { ROLE_LABELS, canReadCosts, requireSession, roleDisponible } from "@/lib/auth";
import { logout } from "@/lib/actions-auth";
import { WORKSPACE_LINKS } from "@/lib/workspace-nav";
import { QuickColorMode } from "@/components/appearance";
import { LanguageToggle } from "@/components/locale-provider";
import { ADVANCED_MODE_COOKIE, readAdvancedMode } from "@/lib/appearance";
import { lireModulesDesactives } from "@/lib/modules-access";
import WorkspaceNav from "@/components/workspace-nav";
import NetworkStatusPill from "@/components/network-status-pill";
import { DemoWorkspaceProvider } from "@/components/demo-workspace";
import { Icon } from "@/components/workspace-icons";
import { createClient } from "@/lib/supabase/server";
import { verifierVersionSchema } from "@/lib/schema-version";

export const dynamic = "force-dynamic";
const navCouts = new Set(["/recettes", "/simulation"]);

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSession();
  // F-19 : refus explicite si la base n'est pas à la version attendue (mode Supabase seulement).
  if (ctx.mode === "supabase") {
    const db = await createClient();
    const { data, error } = await db.from("app_schema_version").select("version").maybeSingle();
    const verif = verifierVersionSchema(data as { version: unknown } | null, error);
    if (!verif.ok) {
      return <div className="pg-shell"><main id="contenu" className="pg-content"><p role="alert">{verif.message}</p><form action={logout}><button type="submit" className="pg-button">Déconnexion</button></form></main></div>;
    }
  }
  // F-19 : un compte labo/vendeur ne voit pas d’écrans qui s’appuient sur des vues absentes.
  if (!roleDisponible(ctx.role)) return <div className="pg-shell"><main id="contenu" className="pg-content"><p role="alert">Le rôle {ROLE_LABELS[ctx.role]} n’est pas disponible sur cette version. Contactez le propriétaire de l’espace.</p><form action={logout}><button type="submit" className="pg-button">Déconnexion</button></form></main></div>;
  const disabled = await lireModulesDesactives(ctx);
  const advancedMode = readAdvancedMode((await cookies()).get(ADVANCED_MODE_COOKIE)?.value);
  const nav = WORKSPACE_LINKS.filter(({ href, advanced }) => (advancedMode || !advanced) && (!navCouts.has(href) || canReadCosts(ctx.role) || (ctx.role === "labo" && href === "/recettes")) && (href === '/parametres' || href === '/tableau-de-bord' || (disabled !== null && !disabled.has(href.slice(1)))));
  const demo = ctx.mode === "pilote-local";
  return <div className="pg-shell">
    <a href="#contenu" className="pg-skip">Aller au contenu</a>
    <header className="pg-topbar">
      <Link href="/tableau-de-bord" className="pg-brand"><span className="pg-brand-mark"><Icon name="logo" size={23}/></span>
        <span className="pg-brand-copy"><strong>PâtisGest</strong><small title={ctx.clientNom}>{ctx.clientNom}</small></span></Link>
      <div className="pg-top-actions">
        {demo && <span className="pg-demo-pill" title="Données fictives enregistrées dans ce navigateur">Démo locale</span>}
        <LanguageToggle/>
        <QuickColorMode/>
        <span className="pg-user" title={`${ctx.nom} · ${ROLE_LABELS[ctx.role]}`}><span className="pg-avatar" aria-hidden="true">{ctx.nom.trim().slice(0, 1).toLocaleUpperCase("fr")}</span><span><b>{ctx.nom.split(" (")[0]}</b><small>{ROLE_LABELS[ctx.role]}</small></span></span>
        <form action={logout}><button type="submit" className="pg-icon-button" aria-label="Déconnexion" title="Déconnexion"><Icon name="logout" size={18}/></button></form>
      </div>
    </header>
    <WorkspaceNav links={nav} advancedMode={advancedMode}/>
    <main id="contenu" className="pg-content" tabIndex={-1}>
      <NetworkStatusPill />
      {demo && <div className="pg-demo-banner"><span>DÉMO LOCALE</span> <span>Données fictives · enregistrées dans ce navigateur uniquement.</span></div>}
      {demo ? <DemoWorkspaceProvider>{children}</DemoWorkspaceProvider> : children}
    </main>
    <footer className="pg-footer"><Link href="/mentions-legales">Mentions légales &amp; CGU</Link><span>PâtisGest · Espace de gestion</span></footer>
  </div>;
}
