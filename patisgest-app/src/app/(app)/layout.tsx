import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ROLE_LABELS, canAccessModule, canReadCosts, getSessionContextDetaille, roleDisponible } from "@/lib/auth";
import { logout } from "@/lib/actions-auth";
import { WORKSPACE_LINKS } from "@/lib/workspace-nav";
import { LanguageToggle } from "@/components/locale-provider";
import { ADVANCED_MODE_COOKIE, readAdvancedMode } from "@/lib/appearance";
import { lireModulesDesactives } from "@/lib/modules-access";
import WorkspaceNav from "@/components/workspace-nav";
import NetworkStatusPill from "@/components/network-status-pill";
import { DemoWorkspaceProvider } from "@/components/demo-workspace";
import TrialGuardClient from "@/components/trial-guard-client";
import ClientLogout from "@/components/client-logout";
import { Icon } from "@/components/workspace-icons";
import { createClient } from "@/lib/supabase/server";
import { verifierVersionSchema } from "@/lib/schema-version";
import { lireStatutEssaiPartage } from "@/lib/trial-server";
import { essaiActif } from "@/lib/licence-mode";
import type { ServerLicenseBundle } from "@/lib/trial-lock-client";

export const dynamic = "force-dynamic";
const navCouts = new Set(["/recettes", "/simulation"]);

export default async function AppLayout({ children }: { children: ReactNode }) {
  // `allowLocked` : un essai verrouillé doit pouvoir VOIR l'écran de
  // verrouillage. Sans cela, `requireSession` renverrait vers `/connexion`,
  // qui redirige vers `/tableau-de-bord`, qui revient ici : boucle infinie.
  // Le contenu métier reste masqué plus bas (`serverLocked ? null : children`).
  // `detaille` (et non `ctx`) : une session fraîche reste redirigée vers la
  // connexion ; seule la session « verrouillée » est admise à s'afficher.
  const { ctx } = await getSessionContextDetaille({ allowLocked: true });
  if (!ctx) redirect("/connexion");
  // F-19 : refus explicite si la base n'est pas à la version attendue (mode Supabase seulement).
  if (ctx.mode === "supabase") {
    const db = await createClient();
    const { data, error } = await db.from("app_schema_version").select("version").maybeSingle();
    const verif = verifierVersionSchema(data as { version: unknown } | null, error);
    if (!verif.ok) {
      return <div className="pg-shell"><main id="contenu" className="pg-content"><p role="alert">{verif.message}</p><ClientLogout ariaLabel="Déconnexion" className="pg-button">Déconnexion</ClientLogout></main></div>;
    }
  }
  // F-19 : un compte labo/vendeur ne voit pas d’écrans qui s’appuient sur des vues absentes.
  if (!roleDisponible(ctx.role)) return <div className="pg-shell"><main id="contenu" className="pg-content"><p role="alert">Le rôle {ROLE_LABELS[ctx.role]} n’est pas disponible sur cette version. Contactez le propriétaire de l’espace.</p><ClientLogout ariaLabel="Déconnexion" className="pg-button">Déconnexion</ClientLogout></main></div>;
  // Mode « tout gratuit » (licence-mode.ts) : tant qu'il est actif, inutile
  // d'interroger la licence — rien ne se verrouille. C'est le SEUL interrupteur.
  const suiviLicence = essaiActif();
  // Même RPC que celle émise par la garde de `getSessionContextDetaille`
  // (dédupliquée dans trial-server.ts) : un seul aller-retour réseau par rendu.
  const trialStatus = suiviLicence && ctx.mode === "supabase" ? await lireStatutEssaiPartage() : null;
  const disabled = await lireModulesDesactives(ctx);
  const advancedMode = readAdvancedMode((await cookies()).get(ADVANCED_MODE_COOKIE)?.value);
  const nav = WORKSPACE_LINKS.filter(({ href, advanced }) => (advancedMode || !advanced) && (!navCouts.has(href) || canReadCosts(ctx.role) || (ctx.role === "labo" && href === "/recettes")) && (href === '/parametres' || href === '/tableau-de-bord' || (canAccessModule(ctx.role, href.slice(1)) && disabled !== null && !disabled.has(href.slice(1)))));
  const demo = ctx.mode === "pilote-local";
  const serverLocked = suiviLicence && Boolean(trialStatus?.verrouille);
  return <div className="pg-shell">
    <a href="#contenu" className="pg-skip">Aller au contenu</a>
    <header className="pg-topbar">
      <Link href="/tableau-de-bord" className="pg-brand"><span className="pg-brand-mark"><Icon name="logo" size={23}/></span>
        <span className="pg-brand-copy"><strong>PâtisGest</strong><small title={ctx.clientNom}>{ctx.clientNom}</small></span></Link>
      <div className="pg-top-actions">
        {demo && <span className="pg-demo-pill" title="Données fictives enregistrées dans ce navigateur">Démo locale</span>}
        <LanguageToggle/>
        <span className="pg-user" title={`${ctx.nom} · ${ROLE_LABELS[ctx.role]}`}><span className="pg-avatar" aria-hidden="true">{ctx.nom.trim().slice(0, 1).toLocaleUpperCase("fr")}</span><span><b>{ctx.nom.split(" (")[0]}</b><small>{ROLE_LABELS[ctx.role]}</small></span></span>
        <ClientLogout ariaLabel="Déconnexion" title="Déconnexion" className="pg-icon-button"><Icon name="logout" size={18}/></ClientLogout>
      </div>
    </header>
    <WorkspaceNav links={nav} advancedMode={advancedMode}/>
    <main id="contenu" className="pg-content" tabIndex={-1}>
      {suiviLicence && (
        <TrialGuardClient
          scopeId={ctx.mode === "supabase" ? ctx.clientId : "demo-pilote"}
          mode={ctx.mode}
          initialBundle={(trialStatus?.signedBundle as unknown as ServerLicenseBundle | undefined) ?? null}
          initialLocked={serverLocked}
          masterPhone={process.env.PATISGEST_MASTER_PHONE ?? null}
          onLogoutAction={logout}
        />
      )}
      <NetworkStatusPill />
      {demo && <div className="pg-demo-banner"><span>DÉMO LOCALE</span> <span>Données fictives · enregistrées dans ce navigateur uniquement.</span></div>}
      {serverLocked ? null : demo ? <DemoWorkspaceProvider>{children}</DemoWorkspaceProvider> : children}
    </main>
    <footer className="pg-footer"><Link href="/mentions-legales">Mentions légales &amp; CGU</Link><span>PâtisGest · Espace de gestion</span></footer>
  </div>;
}
