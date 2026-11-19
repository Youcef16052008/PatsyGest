import { requireSession, ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import EtablissementForm from "@/components/etablissement-form";
import SauvegardePanel from "@/components/sauvegarde-panel";
import AppearancePicker from "@/components/appearance";
import { PageIntro } from "@/components/workspace-ui";
import VitrineForm, { type RecetteVitrine, type SiteVitrine } from "@/components/vitrine-form";
import type { Etablissement } from "@/lib/etablissement";
import { DOMAINE_SERVICE_PAR_DEFAUT } from "@/lib/domaines";

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

  // Vitrine : sites + recettes du catalogue. Lecture réservée au personnel
  // connecté (RLS) ; en mode pilote local il n'y a pas de base, la section
  // est simplement masquée.
  let sites: SiteVitrine[] = [];
  let recettes: RecetteVitrine[] = [];
  if (ctx.mode === "supabase") {
    try {
      const supabase = await createClient();
      const [sitesRes, famillesRes, versionsRes] = await Promise.all([
        supabase
          .from("sites")
          .select("id, nom, subdomain, publication")
          .eq("client_id", ctx.clientId)
          .order("nom"),
        supabase
          .from("recette_familles")
          .select("id, nom, nom_vitrine, description_vitrine, photo_vitrine, visible_vitrine, ordre_vitrine, produit_id")
          .eq("client_id", ctx.clientId)
          .order("nom")
          .limit(200),
        supabase.from("recette_versions").select("famille_id").eq("client_id", ctx.clientId).limit(500),
      ]);

      const familles = (famillesRes.data ?? []) as {
        id: string;
        nom: string;
        nom_vitrine: string | null;
        description_vitrine: string | null;
        photo_vitrine: string | null;
        visible_vitrine: boolean;
        ordre_vitrine: number;
        produit_id: string | null;
      }[];

      // Les prix de vente viennent d'`articles` : la vitrine les lit via la
      // vue publique, l'écran d'admin les lit ici (même valeur, même source).
      const produitIds = familles.map((f) => f.produit_id).filter((id): id is string => !!id);
      const articlesRes = produitIds.length
        ? await supabase.from("articles").select("id, pv_ht, unite").in("id", produitIds)
        : { data: [] as { id: string; pv_ht: number; unite: string }[] };
      const articles = new Map(
        ((articlesRes.data ?? []) as { id: string; pv_ht: number; unite: string }[]).map((a) => [a.id, a]),
      );

      const avecVersions = new Set(
        ((versionsRes.data ?? []) as { famille_id: string }[]).map((v) => v.famille_id),
      );

      const visiblesParClient = familles.filter((f) => f.visible_vitrine).length;
      sites = ((sitesRes.data ?? []) as { id: string; nom: string; subdomain: string | null; publication: string }[])
        .map((s) => ({
          id: s.id,
          nom: s.nom,
          sousDomaine: s.subdomain,
          publication: s.publication,
          recettesVisibles: visiblesParClient,
        }));

      recettes = familles.map((f) => {
        const article = f.produit_id ? articles.get(f.produit_id) : undefined;
        return {
          id: f.id,
          nom: f.nom,
          nomVitrine: f.nom_vitrine,
          description: f.description_vitrine,
          photo: f.photo_vitrine,
          visible: f.visible_vitrine,
          ordre: f.ordre_vitrine,
          // Même règle que la vue publique : 0 → null (« prix sur demande »).
          prixHt: article && Number(article.pv_ht) > 0 ? Number(article.pv_ht) : null,
          unite: article?.unite ?? null,
          aDesVersions: avecVersions.has(f.id),
        };
      });
    } catch {
      // Base injoignable : la page reste utile, la section vitrine est vide.
    }
  }

  return (
    <div>
      <PageIntro title="Paramètres" description={`${ctx.clientNom} · ${ROLE_LABELS[ctx.role]}`}/>
      <section className="pg-card pg-card-pad">
        <div className="pg-card-head"><div><h2>Apparence</h2><p>Cinq interfaces, chacune en clair ou en sombre. Ce choix ne change que ce navigateur.</p></div><AppearancePicker/></div>
      </section>

      <div className="mt-6">
        {ctx.mode === "supabase" && sites.length > 0 && (
          <VitrineForm
            role={ctx.role}
            sites={sites}
            recettes={recettes}
            domaine={process.env.PATISGEST_DOMAINE ?? DOMAINE_SERVICE_PAR_DEFAUT}
          />
        )}
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
