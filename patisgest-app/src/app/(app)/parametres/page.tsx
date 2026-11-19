import { requireSession, ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ModulesSettings, { type ModulesCompte } from "@/components/modules-settings";
import SitesSettings, { type SiteCompte } from "@/components/sites-settings";
import EquipeSettings, { type EquipeDonnees } from "@/components/equipe-settings";
import EtablissementForm from "@/components/etablissement-form";
import SauvegardePanel from "@/components/sauvegarde-panel";
import AppearancePicker from "@/components/appearance";
import { PageIntro } from "@/components/workspace-ui";
import type { Etablissement } from "@/lib/etablissement";
import { equipeExperimentaleActive } from "@/lib/equipe-experimental";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres — PâtisGest" };

/**
 * US-15.1 — paramètres de l'établissement. Le propriétaire règle l'identité
 * légale ; les autres rôles la consultent en lecture (ils en ont besoin pour
 * comprendre un ticket) mais ne peuvent pas la modifier.
 *
 * Mode pilote local : pas de base distante, on retombe sur l'identité de
 * session et les champs restent vides — la page doit s'ouvrir, pas planter.
 */
export default async function Parametres() {
  const ctx = await requireSession();

  let etablissement: Etablissement = {
    nom: ctx.clientNom,
    adresse: null,
    telephone: null,
    nif: null,
    nis: null,
    rc: null,
  };
  if (ctx.mode === "supabase") {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("clients")
        .select("nom, adresse, telephone, nif, nis, rc")
        .eq("id", ctx.clientId)
        .maybeSingle();
      if (data) {
        etablissement = {
          nom: (data.nom as string) ?? ctx.clientNom,
          adresse: (data.adresse as string | null) ?? null,
          telephone: (data.telephone as string | null) ?? null,
          nif: (data.nif as string | null) ?? null,
          nis: (data.nis as string | null) ?? null,
          rc: (data.rc as string | null) ?? null,
        };
      }
    } catch {
      // Base injoignable : on garde les valeurs de session, la page reste utile.
    }
  }

  let accounts:ModulesCompte[]=[];
  let sites: SiteCompte[] = [];
  let sitesError = false;
  let modulesError=false;
  const equipeExperimentale = equipeExperimentaleActive();
  let equipe: EquipeDonnees = { demandes: [], approbations: [], invitations: [] };
  let equipeError = true;
  if(ctx.role==='proprietaire' && ctx.mode==='supabase') {
    try {
      const db=await createClient();
      const [modulesResult, sitesResult] = await Promise.all([
        db.rpc('lister_acces_modules'),
        db.from('sites').select('id, nom, type, adresse', { count: 'exact' }).eq('client_id',ctx.clientId).order('nom').limit(1000),
      ]);
      modulesError=!!modulesResult.error || !Array.isArray(modulesResult.data);
      accounts=(modulesResult.data??[]) as ModulesCompte[];
      sitesError=!!sitesResult.error || sitesResult.count === null || sitesResult.count > 1000;
      sites=(sitesResult.data??[]) as SiteCompte[];
      if (equipeExperimentale && !sitesError) {
        const [demandes, approbations, invitations] = await Promise.all([
          db.rpc('equipe_lister_demandes'), db.rpc('equipe_lister_approbations'), db.rpc('equipe_lister_invitations'),
        ]);
        equipeError = !!demandes.error || !!approbations.error || !!invitations.error ||
          !Array.isArray(demandes.data) || !Array.isArray(approbations.data) || !Array.isArray(invitations.data) ||
          (demandes.data?.length ?? 0) > 500 || (approbations.data?.length ?? 0) > 500 || (invitations.data?.length ?? 0) > 500;
        if (!equipeError) equipe = { demandes: demandes.data, approbations: approbations.data, invitations: invitations.data } as EquipeDonnees;
      }
    } catch { modulesError=true; sitesError=true; equipeError=true; }
  }

  return (
    <div>
      <PageIntro title="Paramètres" description={`${ctx.clientNom} · ${ROLE_LABELS[ctx.role]}`}/>
      <section className="pg-card pg-card-pad">
        <div className="pg-card-head"><div><h2>Apparence</h2><p>Cinq interfaces, chacune en clair ou en sombre. Ce choix ne change que ce navigateur.</p></div><AppearancePicker/></div>
      </section>

      <div className="mt-6">
        {ctx.role === "proprietaire" ? (
          <>
            <EtablissementForm etablissement={etablissement} />
            {ctx.mode === 'supabase' && <SitesSettings sites={sites} error={sitesError}/>}
            {ctx.mode === 'supabase' && equipeExperimentale && <EquipeSettings data={equipe} sites={sites} error={equipeError}/>}
            {ctx.mode==='supabase' ? <ModulesSettings accounts={accounts} error={modulesError}/> : <section className="pg-card pg-card-pad mt-6"><h2>Accès aux modules</h2><p>Disponible en établissement connecté. La démo locale ne protège pas les données par compte.</p></section>}
            {ctx.mode === "supabase" ? (
              <SauvegardePanel />
            ) : (
              <section className="rounded-2xl border bg-white p-5 text-sm text-slate-500">
                <h2 className="font-bold text-slate-800">Sauvegarde &amp; restauration</h2>
                <p className="mt-1">
                  Disponible en mode pilote connecté : en démo locale il n’y a pas de base à sauvegarder.
                </p>
              </section>
            )}
          </>
        ) : (
          <section className="rounded-2xl border bg-white p-5 text-sm">
            <h2 className="font-bold">Identité de l’établissement</h2>
            <p className="mt-1 text-slate-500">
              Seul le propriétaire peut modifier ces mentions. Valeurs actuelles :
            </p>
            <ul className="mt-3 space-y-1 font-mono text-xs">
              <li>Nom : {etablissement.nom}</li>
              <li>Adresse : {etablissement.adresse ?? "—"}</li>
              <li>Téléphone : {etablissement.telephone ?? "—"}</li>
              <li>NIF : {etablissement.nif ?? "—"}</li>
              <li>NIS : {etablissement.nis ?? "—"}</li>
              <li>RC : {etablissement.rc ?? "—"}</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
