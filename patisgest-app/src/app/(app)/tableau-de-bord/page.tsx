import { canReadCosts, canWrite, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { compterGuide } from "@/lib/onboarding-server";
import { articleAffiche, lireArticles, lireArticlesQuantites, lireLots, lireProduction, lireSites, lireVentesJours, lireVentesPeriode } from "@/lib/workspace-read";
import { plusJours, serieVentes } from "@/lib/workspace-data";
import DashboardWorkspace from "@/components/dashboard-workspace";
import DemoDashboard from "@/components/demo-dashboard";
import OnboardingPanel from "@/components/onboarding-panel";
import { CashPanel, lireIdentiteCaisse } from "@/components/cash-workspace";
import { lireModulesDesactives } from "@/lib/modules-access";
import PilotDashboard, { type DashboardUpcomingCake } from "@/components/pilot-dashboard";
import { cakeConnectedTotals } from "@/lib/cake-money";
import { loadCreditsCloud } from "@/lib/actions-credits";
import { loadOwnerPriceAlertsCloud } from "@/lib/actions-price-alerts";
import { Notice } from "@/components/workspace-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vue d’ensemble — PâtisGest" };

export default async function Dashboard() {
  const ctx = await requireSession();
  const coutsAutorises = canReadCosts(ctx.role);
  const nom = ctx.nom.split(" (")[0];
  const seller = ctx.role === "vendeur";
  if (ctx.mode === "pilote-local") return <DemoDashboard nom={nom} shop={ctx.clientNom} role={ctx.role}/>;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const db = await createClient();
  const { clientId } = ctx;
  if (ctx.role === "proprietaire" || ctx.role === "labo") {
    const owner=ctx.role === "proprietaire";
    const disabled = await lireModulesDesactives(ctx);
    if (disabled === null) return <Notice kind="warning">Les autorisations ne sont pas disponibles. Contactez le propriétaire.</Notice>;
    const stocksOn=!disabled.has('stocks'), productionOn=!disabled.has('production');
    const salesOn=owner&&!disabled.has('caisse'), closingOn=owner&&!disabled.has('cloture'), cakesOn=owner&&!disabled.has('cake-design');
    const sitesPromise=lireSites(db,clientId);
    const [articles,lots,sites,orders,ventes,close,cakesRes,fullArticles,creditsRes,clientRes,alertsRes] = await Promise.all([
      stocksOn ? lireArticlesQuantites(db,clientId,ctx.role === "labo") : null, stocksOn ? lireLots(db,clientId,ctx.role) : null, sitesPromise,
      productionOn ? sitesPromise.then(s=>lireProduction(db,clientId,s,today,ctx.role)) : null,
      salesOn ? lireVentesPeriode(db,clientId,plusJours(today,-29),today) : null,
      closingOn ? db.from("clotures").select("site_id, caisse_bilan, revision").eq("client_id",clientId).eq("date_cloture",today).limit(1000) : null,
      cakesOn
        ? db.from("cakes").select("id, numero, client_nom, telephone, date_event, nb_parts, prix_ht, tva_pct, acompte, statut, notes").eq("client_id",clientId).gte("date_event",today).order("date_event").limit(20)
        : !owner
          ? db.from("labo_cakes").select("id, numero, client_nom, date_event, nb_parts, statut").eq("client_id",clientId).gte("date_event",today).order("date_event").limit(20)
          : null,
      owner && stocksOn ? lireArticles(db, clientId) : null,
      owner ? loadCreditsCloud() : Promise.resolve({ ok: false, tableAvailable: false, credits: [] }),
      owner ? db.from("clients").select("telephone").eq("id", clientId).maybeSingle() : Promise.resolve({ data: null }),
      owner ? loadOwnerPriceAlertsCloud() : Promise.resolve({ ok: false, tableAvailable: false, alerts: [] }),
    ]);
    const boutiques=sites?.filter(s=>s.type==='boutique');
    const closing=owner && boutiques && close && !close.error && (close.data?.length??0)<1000 ? boutiques.map(s=>{
      const entries=(close.data??[]).filter(c=>c.site_id===s.id).sort((a,b)=>Number(b.revision??0)-Number(a.revision??0));
      return {id:s.id,site:s.label,closed:entries.length>0,cashDeclared:entries[0]?.caisse_bilan!=null};
    }) : null;
    const priceById = new Map((fullArticles ?? []).map((a) => [a.id, Math.round(Number(a.pv_ht ?? 0) * (1 + Number(a.tva ?? 0) / 100) * 100) / 100]));
    const enrichedArticles = articles ? articles.map((a) => ({ ...a, prixTTC: priceById.get(a.id) ?? 0 })) : null;
    const upcomingCakes: DashboardUpcomingCake[] = ((cakesRes?.data ?? []) as { id: string; numero: string; client_nom: string; telephone: string | null; date_event: string; nb_parts: number; prix_ht: number; tva_pct: number; acompte: number; statut: string; notes: string | null }[]).map((c) => {
      const totals = cakeConnectedTotals(Number(c.prix_ht), Number(c.tva_pct ?? 0), Number(c.acompte));
      return {
        id: c.id,
        numero: c.numero,
        client: c.client_nom,
        telephone: c.telephone,
        eventDate: c.date_event,
        portions: c.nb_parts,
        prixTotalDa: totals.ttc,
        acompteDa: Number(c.acompte),
        resteDa: totals.balance,
        statut: c.statut,
        notes: c.notes,
      };
    });
    const ownerPhoneDefault = String((clientRes.data as { telephone?: string | null } | null)?.telephone ?? "");
    return <PilotDashboard nom={nom} shop={ctx.clientNom} today={today} owner={owner} articles={enrichedArticles} lots={lots} orders={orders} series={ventes && !ventes.truncated ? serieVentes(ventes.rows,today,30):null} sales={ventes && !ventes.truncated ? ventes.rows.map(r=>({date:r.date,totalTTC:r.totalTTC,modePaiement:r.modePaiement,lignes:r.lignes})) : null} shopIds={boutiques?.map(s=>s.id)??null} closing={closing} upcomingCakes={upcomingCakes} mode="supabase" scopeKey={clientId} ownerPhoneDefault={ownerPhoneDefault} initialCredits={creditsRes.credits} creditsTableAvailable={creditsRes.tableAvailable} initialOwnerAlerts={alertsRes.alerts}/>;
  }
  const afficheOnboarding = ctx.mode === 'supabase' && coutsAutorises && canWrite(ctx.role);
  const guide = afficheOnboarding ? compterGuide(ctx, db) : null;
  const sitesPromise = lireSites(db, clientId);
  const [articles, lots, sites, orders, ventes, progression, identite] = await Promise.all([
    lireArticles(db, clientId), lireLots(db, clientId, ctx.role), sitesPromise,
    sitesPromise.then(s => lireProduction(db, clientId, s, today, ctx.role)), lireVentesJours(db, clientId, today), guide, lireIdentiteCaisse(db, ctx),
  ]);
  return <DashboardWorkspace nom={nom} shop={ctx.clientNom} today={today} canReadRecipes={coutsAutorises} seller={seller}
    articles={articles?.map(articleAffiche) ?? null} lots={lots} orders={orders} series={ventes ? serieVentes(ventes, today) : null}
    guide={progression ? <OnboardingPanel progression={progression}/> : afficheOnboarding ? <Notice kind="warning">Guide indisponible. Vérifiez votre connexion et rechargez la page.</Notice> : null}
    caisse={<CashPanel queueIdentity={{clientId:ctx.clientId,authUserId:ctx.authUserId}} articles={articles} sites={sites} lots={lots} identite={identite} clientId={ctx.clientId}/>}/>;
}
