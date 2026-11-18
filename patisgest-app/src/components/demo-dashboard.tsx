"use client";
import { demoLots, demoOrders, DEMO_SITES } from "@/lib/demo-workspace";
import { serieVentes } from "@/lib/workspace-data";
import PilotDashboard from "./pilot-dashboard";
import type { Role } from "@/lib/permissions";
import DashboardWorkspace from "./dashboard-workspace";
import DemoCaisse from "./demo-caisse";
import { useDemoWorkspace } from "./demo-workspace";

export default function DemoDashboard({ nom, shop, role }: { nom: string; shop: string; role: Role }) {
  const { data } = useDemoWorkspace();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (role !== "vendeur") {
    const owner=role === "proprietaire";
    const closing=owner && data ? DEMO_SITES.filter(s=>s.type==='boutique').map(s=>{const items=data.closings.filter(c=>c.date===today&&c.site===s.id).sort((a,b)=>b.revision-a.revision);return {id:s.id,site:s.label,closed:items.length>0,cashDeclared:items[0]?.caisseBilan!=null};}) : null;
    return <PilotDashboard nom={nom} shop={shop} today={today} owner={owner} articles={data?.articles.map(a=>({id:a.id,nom:a.nom,code:a.code,niveau:a.niveau,unite:a.unite,seuil:a.seuil}))??null} lots={data?demoLots(data):null} orders={data?demoOrders(data):null} series={owner&&data?serieVentes(data.sales,today):null} closing={closing}/>;
  }
  const seller=true;
  return <DashboardWorkspace nom={nom} shop={shop} today={today} seller={seller} canReadRecipes={!seller}
    series={data ? serieVentes(data.sales, today) : null} articles={data?.articles ?? null} lots={data ? demoLots(data) : null}
    orders={data ? demoOrders(data) : null} caisse={<DemoCaisse dashboard shop={shop}/>}/>;
}
