import "server-only";
import Link from "next/link";
import { canWrite, type SessionContext } from "@/lib/auth";
import { lireProduction, lireSites, type WorkspaceDB } from "@/lib/workspace-read";
import OfForms from "./of-forms";
import { PageIntro } from "./workspace-ui";

export default async function ProductionWorkspace({ ctx, db }: { ctx: SessionContext; db: WorkspaceDB }) {
  const { clientId } = ctx;
  const canEdit = canWrite(ctx.role);
  const labo=ctx.role === "labo";
  const [sites, versionsRes] = await Promise.all([
    lireSites(db, clientId),
    canEdit && !labo ? db.from("recette_versions").select("id, version, recette_familles!inner(nom)")
      .eq("client_id", clientId).order("version", { ascending: false }) : null,
  ]);
  const [orders, labVersions, familles] = await Promise.all([lireProduction(db, clientId, sites, undefined, labo), labo ? db.from("labo_recette_versions").select("id, version, famille_id").eq("client_id",clientId) : null, labo ? db.from("recette_familles").select("id, nom").eq("client_id",clientId) : null]);
  const versions = (versionsRes?.data ?? []).flatMap(v => {
    const famille = Array.isArray(v.recette_familles) ? v.recette_familles[0] : v.recette_familles;
    return famille?.nom ? [{ id: v.id, label: `${famille.nom} · v${v.version}` }] : [];
  }).concat((labVersions?.data??[]).flatMap(v=>{const fam=(familles?.data??[]).find(f=>f.id===v.famille_id);return fam ? [{id:v.id,label:`${fam.nom} · v${v.version}`}] : [];})).sort((a,b) => a.label.localeCompare(b.label,"fr"));
  return <>
    <PageIntro
      title="Production"
      label="Laboratoire"
      description="Planifiez les quantités et voyez immédiatement où en est chaque fournée."
      actions={<Link href="/planning" className="pg-button pg-button-secondary">Demain au labo →</Link>}
    />
    <OfForms sites={sites ?? []} orders={orders} canEdit={canEdit} versions={versions} optionsIndisponibles={Boolean(versionsRes?.error || labVersions?.error || familles?.error || !sites)}/>
  </>;
}
