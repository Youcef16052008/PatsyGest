import "server-only";
import Link from "next/link";
import { canReadCosts, canWrite, type SessionContext } from "@/lib/auth";
import { lireProduction, lireSites, type WorkspaceDB } from "@/lib/workspace-read";
import OfForms from "./of-forms";
import { PageIntro } from "./workspace-ui";

export default async function ProductionWorkspace({ ctx, db }: { ctx: SessionContext; db: WorkspaceDB }) {
  const { clientId } = ctx;
  const canEdit = canReadCosts(ctx.role) && canWrite(ctx.role);
  const [sites, versionsRes] = await Promise.all([
    lireSites(db, clientId),
    canEdit ? db.from("recette_versions").select("id, version, recette_familles!inner(nom)")
      .eq("client_id", clientId).order("version", { ascending: false }) : null,
  ]);
  const orders = await lireProduction(db, clientId, sites);
  const versions = (versionsRes?.data ?? []).flatMap(v => {
    const famille = Array.isArray(v.recette_familles) ? v.recette_familles[0] : v.recette_familles;
    return famille?.nom ? [{ id: v.id, label: `${famille.nom} · v${v.version}` }] : [];
  }).sort((a,b) => a.label.localeCompare(b.label,"fr"));
  return <>
    <PageIntro
      title="Production"
      label="Laboratoire"
      description="Planifiez les quantités et voyez immédiatement où en est chaque fournée."
      actions={<Link href="/planning" className="pg-button pg-button-secondary">Demain au labo →</Link>}
    />
    <OfForms sites={sites ?? []} orders={orders} canEdit={canEdit} versions={versions} optionsIndisponibles={Boolean(versionsRes?.error || !sites)}/>
  </>;
}
