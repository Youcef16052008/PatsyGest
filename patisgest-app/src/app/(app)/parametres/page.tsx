import { requireSession, ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import EtablissementForm from "@/components/etablissement-form";
import SauvegardePanel from "@/components/sauvegarde-panel";
import type { Etablissement } from "@/lib/etablissement";

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

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Paramètres</p>
      <h1 className="mt-2 text-3xl font-black">Établissement &amp; mentions légales</h1>
      <p className="mt-2 text-sm text-slate-500">
        Votre rôle : {ROLE_LABELS[ctx.role]} · Établissement : {ctx.clientNom}
      </p>

      <div className="mt-6">
        {ctx.role === "proprietaire" ? (
          <>
            <EtablissementForm etablissement={etablissement} />
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
