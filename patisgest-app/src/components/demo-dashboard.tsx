"use client";
import { demoLots, demoOrders } from "@/lib/demo-workspace";
import { jourUTC, serieVentes } from "@/lib/workspace-data";
import DashboardWorkspace from "./dashboard-workspace";
import DemoCaisse from "./demo-caisse";
import { useDemoWorkspace } from "./demo-workspace";

export default function DemoDashboard({ nom, shop, seller }: { nom: string; shop: string; seller: boolean }) {
  const { data } = useDemoWorkspace();
  const today = jourUTC();
  return <DashboardWorkspace nom={nom} shop={shop} today={today} seller={seller} canReadRecipes={!seller}
    series={data ? serieVentes(data.sales, today) : null} articles={data?.articles ?? null} lots={data ? demoLots(data) : null}
    orders={data ? demoOrders(data) : null} caisse={<DemoCaisse dashboard shop={shop}/>}/>;
}
