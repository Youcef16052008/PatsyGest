import "server-only";
import Link from "next/link";
import { canWrite, type SessionContext } from "@/lib/auth";
import { lireProduction, lireSites, type WorkspaceDB } from "@/lib/workspace-read";
import { jourLocal } from "@/lib/workspace-data";
import OfForms from "./of-forms";
import KitchenLabScreen from "./kitchen-lab-screen";
import { PageIntro } from "./workspace-ui";

export default async function ProductionWorkspace({ ctx, db }: { ctx: SessionContext; db: WorkspaceDB }) {
  const { clientId } = ctx;
  const canEdit = canWrite(ctx.role);
  const labo=ctx.role === "labo";
  const today = jourLocal();
  const [sites, versionsRes] = await Promise.all([
    lireSites(db, clientId),
    canEdit && !labo ? db.from("recette_versions").select("id, version, recette_familles!inner(nom)")
      .eq("client_id", clientId).order("version", { ascending: false }) : null,
  ]);
  const [orders, labVersions, familles, cakesRes] = await Promise.all([
    lireProduction(db, clientId, sites, undefined, ctx.role),
    labo ? db.from("labo_recette_versions").select("id, version, famille_id").eq("client_id",clientId) : null,
    labo ? db.from("recette_familles").select("id, nom").eq("client_id",clientId) : null,
    db.from(labo ? "labo_cakes" : "cakes").select("id, numero, client_nom, date_event, nb_parts, statut").eq("client_id", clientId).gte("date_event", today).order("date_event").limit(20),
  ]);
  const versions = (versionsRes?.data ?? []).flatMap(v => {
    const famille = Array.isArray(v.recette_familles) ? v.recette_familles[0] : v.recette_familles;
    return famille?.nom ? [{ id: v.id, label: `${famille.nom} · v${v.version}` }] : [];
  }).concat((labVersions?.data??[]).flatMap(v=>{const fam=(familles?.data??[]).find(f=>f.id===v.famille_id);return fam ? [{id:v.id,label:`${fam.nom} · v${v.version}`}] : [];})).sort((a,b) => a.label.localeCompare(b.label,"fr"));
  const cakes = ((cakesRes.data ?? []) as { id: string; numero: string; client_nom: string; date_event: string; nb_parts: number; statut: string }[]).map((c) => ({
    id: c.id,
    numero: c.numero,
    client: c.client_nom,
    eventDate: c.date_event,
    portions: c.nb_parts,
    statut: c.statut,
  }));
  return <>
    <PageIntro
      title="Production"
      label="Laboratoire"
      description="Planifiez les quantités et voyez immédiatement où en est chaque fournée."
      actions={<Link href="/planning" className="pg-button pg-button-secondary">Demain au labo →</Link>}
    />
    <div className="pg-stack">
      <KitchenLabScreen
        mode="supabase"
        scopeKey={clientId}
        today={today}
        auteurNom={ctx.nom.split(" (")[0]}
        auteurRole={ctx.role}
        orders={orders ?? []}
        cakes={cakes}
      />
      <OfForms sites={sites ?? []} orders={orders} canEdit={canEdit} versions={versions} optionsIndisponibles={Boolean(versionsRes?.error || labVersions?.error || familles?.error || !sites)}/>
    </div>
  </>;
}
