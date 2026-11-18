import { canReadCosts, canWrite, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { compterGuide } from "@/lib/onboarding-server";
import { articleAffiche, lireArticles, lireLots, lireProduction, lireSites, lireVentesJours } from "@/lib/workspace-read";
import { jourUTC, serieVentes } from "@/lib/workspace-data";
import DashboardWorkspace from "@/components/dashboard-workspace";
import DemoDashboard from "@/components/demo-dashboard";
import OnboardingPanel from "@/components/onboarding-panel";
import { CashPanel, lireIdentiteCaisse } from "@/components/cash-workspace";
import { Notice } from "@/components/workspace-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vue d’ensemble — PâtisGest" };

export default async function Dashboard() {
  const ctx = await requireSession();
  const coutsAutorises = canReadCosts(ctx.role);
  const nom = ctx.nom.split(" (")[0];
  const seller = ctx.role === "vendeur";
  if (ctx.mode === "pilote-local") return <DemoDashboard nom={nom} shop={ctx.clientNom} seller={seller}/>;

  const today = jourUTC();
  const db = await createClient();
  const { clientId } = ctx;
  const afficheOnboarding = ctx.mode === 'supabase' && coutsAutorises && canWrite(ctx.role);
  const guide = afficheOnboarding ? compterGuide(ctx, db) : null;
  const sitesPromise = lireSites(db, clientId);
  const [articles, lots, sites, orders, ventes, progression, identite] = await Promise.all([
    lireArticles(db, clientId), lireLots(db, clientId), sitesPromise,
    sitesPromise.then(s => lireProduction(db, clientId, s, today)), lireVentesJours(db, clientId, today), guide, lireIdentiteCaisse(db, ctx),
  ]);
  return <DashboardWorkspace nom={nom} shop={ctx.clientNom} today={today} canReadRecipes={coutsAutorises} seller={seller}
    articles={articles?.map(articleAffiche) ?? null} lots={lots} orders={orders} series={ventes ? serieVentes(ventes, today) : null}
    guide={progression ? <OnboardingPanel progression={progression}/> : afficheOnboarding ? <Notice kind="warning">Guide indisponible. Vérifiez votre connexion et rechargez la page.</Notice> : null}
    caisse={<CashPanel articles={articles} sites={sites} lots={lots} identite={identite}/>}/>;
}
