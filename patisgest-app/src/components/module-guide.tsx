import "server-only";
import Link from "next/link";
import type { ReactNode } from "react";
import { canReadCosts, canWrite, type SessionContext } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";
import { compterGuide } from "@/lib/onboarding-server";
import { etapeApres, lienGuide, prerequisManquant, type CleOnboarding, type EtapeOnboarding } from "@/lib/onboarding";
import ArticleGuide from "./article-guide";
import FournisseurForm from "./fournisseur-form";
import RecetteGuide from "./recette-guide";
import { CreateOfForm } from "./of-forms";
import SaleForm from "./sale-form";

const lienAction = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";
const lienSecondaire = "inline-flex min-h-11 items-center text-sm font-semibold text-violet-800 underline-offset-4 hover:underline";
type Supabase = Awaited<ReturnType<typeof createClient>>;

function InfoGuide({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded-2xl border border-violet-100 bg-white p-4 text-sm text-slate-700">{children}</p>;
}

/** Ne charge que les options du formulaire ciblé, pas les listes du module. */
async function formulaire(ctx: SessionContext, db: Supabase, etape: EtapeOnboarding) {
  // Le guide reste privé même lorsqu'on l'ouvre directement par URL.
  if (ctx.mode !== "supabase" || !canReadCosts(ctx.role) || !canWrite(ctx.role)) return null;
  if (etape.fait) {
    // Un OF peut être confirmé en base mais toujours présent dans la file si
    // la réponse s'est perdue. Garder la possibilité de synchroniser la file.
    if (etape.cle === "premier-of") return <CreateOfForm guide guideTermine versions={[]} sites={[]} />;
    if (etape.cle !== "premiere-vente") return null;
  }
  const { clientId } = ctx;
  const erreur = <InfoGuide>Impossible de charger le formulaire. Vérifiez votre connexion et rechargez.</InfoGuide>;
  switch (etape.cle) {
    case "matieres": return <ArticleGuide niveau="matiere" />;
    case "produits": return <ArticleGuide niveau="produit" />;
    case "fournisseurs": return <FournisseurForm guide />;
    case "recettes": {
      const [articles, familles] = await Promise.all([
        db.from("articles").select("id, code, nom, niveau, unite").eq("client_id", clientId).in("niveau", ["matiere", "produit"]).order("nom"),
        db.from("recette_familles").select("id, code, nom, produit_id").eq("client_id", clientId).order("nom"),
      ]);
      if (articles.error || familles.error) return erreur;
      const produits = articles.data.filter((a) => a.niveau === "produit");
      const idsProduits = new Set(produits.map((p) => p.id));
      const ingredients = articles.data.filter((a) => a.niveau === "matiere");
      if (!produits.length || !ingredients.length) return <InfoGuide>Créez un ingrédient et un produit dans Stocks.</InfoGuide>;
      return <RecetteGuide
        produits={produits.map((p) => ({ id: p.id, label: `${p.code} · ${p.nom}` }))}
        ingredients={ingredients.map((a) => ({ id: a.id, label: `${a.code} · ${a.nom}`, unite: a.unite }))}
        familles={familles.data.filter((f) => idsProduits.has(f.produit_id)).map((f) => ({ id: f.id, label: `${f.code} · ${f.nom}` }))}
      />;
    }
    case "premier-of": {
      const [sites, versions] = await Promise.all([
        db.from("sites").select("id, nom").eq("client_id", clientId).order("nom"),
        db.from("recette_versions").select("id, version, recette_familles!inner(nom)").eq("client_id", clientId).eq("active", true).order("version"),
      ]);
      if (sites.error || versions.error) return erreur;
      if (!sites.data.length) return <InfoGuide>Un site de production est nécessaire pour planifier.</InfoGuide>;
      if (!versions.data.length) return <InfoGuide>Activez une version dans Recettes avant de planifier.</InfoGuide>;
      return <CreateOfForm guide sites={sites.data.map((s) => ({ id: s.id, label: s.nom }))}
        versions={versions.data.flatMap((v) => {
          const famille = Array.isArray(v.recette_familles) ? v.recette_familles[0] : v.recette_familles;
          return famille ? [{ id: v.id, label: `${famille.nom} · v${v.version}` }] : [];
        })} />;
    }
    case "premiere-vente": {
      const [sites, produits, client] = await Promise.all([
        db.from("sites").select("id, nom, type").eq("client_id", clientId).order("nom"),
        db.from("articles").select("id, nom").eq("client_id", clientId).eq("niveau", "produit").order("nom"),
        db.from("clients").select("nom, adresse, telephone, nif, nis, rc").eq("id", clientId).maybeSingle(),
      ]);
      if (!etape.fait && (sites.error || produits.error || client.error)) return erreur;
      if (!etape.fait && (!sites.data?.length || !produits.data?.length)) return <InfoGuide>Un produit et un site de vente sont nécessaires pour encaisser.</InfoGuide>;
      const etablissement = client.data ?? { nom: ctx.clientNom, adresse: null, telephone: null, nif: null, nis: null, rc: null };
      // Laisser SaleForm monté après revalidation pour conserver le ticket.
      return <SaleForm key={`${ctx.clientId}:${ctx.authUserId}`} queueIdentity={{clientId:ctx.clientId,authUserId:ctx.authUserId}} guide guideTermine={etape.fait} etablissement={etablissement}
        articles={(produits.data ?? []).map((a) => ({ id: a.id, label: a.nom }))}
        sites={(sites.data ?? []).map((s) => ({ id: s.id, label: s.nom, type: s.type }))} />;
    }
  }
}

export default async function ModuleGuide({ cle, ctx, db, module, titre }: {
  cle: CleOnboarding; ctx: SessionContext; db: Supabase; module: string; titre: string;
}) {
  const progression = await compterGuide(ctx, db);
  const etape = progression?.etapes.find((e) => e.cle === cle);
  if (!progression || !etape) return <div className="mx-auto max-w-3xl space-y-3">
    <InfoGuide>Le guide n’a pas pu lire votre progression. Vérifiez votre connexion et rechargez.</InfoGuide>
    <Link href={`/${module}`} className={lienSecondaire}>Ouvrir le formulaire complet</Link>
  </div>;
  const prerequisite = etape.fait ? undefined : prerequisManquant(progression, etape);
  const prochaine = etapeApres(progression, etape, etape.fait);
  const contenu = prerequisite ? null : await formulaire(ctx, db, etape);

  return (
    <section id={etape.ancre} aria-labelledby="titre-etape-guide" className="mx-auto max-w-3xl scroll-mt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-t-2xl bg-violet-950 px-4 py-2 text-violet-50 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">Guide actif</span>
          <span className="font-semibold">Étape {etape.numero}/{progression.total}</span>
        </div>
        <Link href="/tableau-de-bord" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-white underline-offset-4 hover:underline">
          Quitter le guide <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="space-y-4 rounded-b-2xl border border-t-0 border-violet-100 bg-slate-50 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-violet-700">{titre}</p>
            <h1 id="titre-etape-guide" className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{etape.titre}</h1>
          </div>
          <output aria-label={`${progression.faites} étapes terminées sur ${progression.total}`} className="rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold tabular-nums text-violet-950">
            {progression.faites} / {progression.total} terminées
          </output>
        </div>
        {prerequisite && <div className="space-y-3 rounded-2xl border border-violet-100 bg-white p-4 sm:p-6">
          <p className="text-sm text-slate-700">Étape requise avant celle-ci : <b>{prerequisite.titre}</b>.</p>
          <Link href={lienGuide(prerequisite)} className={lienAction}>Reprendre le guide <span aria-hidden="true">→</span></Link>
        </div>}
        {etape.fait && <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6">
          <p role="status" className="font-bold text-emerald-950">✓ {progression.prochaine ? "Étape terminée" : "Les 6 étapes sont terminées !"}</p>
          {etape.cle === "premier-of" && <p className="text-sm text-emerald-950">Pour lancer la fabrication, ouvrez le formulaire complet.</p>}
          {prochaine && <p className="text-sm text-emerald-950">Ensuite : {prochaine.titre.toLowerCase()}.</p>}
          <Link href={prochaine ? lienGuide(prochaine) : "/tableau-de-bord"} prefetch={false} className={lienAction}>
            {prochaine ? "Étape suivante" : "Retour au tableau de bord"} <span aria-hidden="true">→</span>
          </Link>
        </div>}
        {contenu}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-violet-100 pt-1">
          <Link href={`/${etape.module}`} className={lienSecondaire}>Formulaire complet</Link>
          {!etape.bloquante && !etape.fait && !prerequisite && (
            <Link href={prochaine ? lienGuide(prochaine) : "/tableau-de-bord"} prefetch={false} className={lienSecondaire}>Passer pour l’instant</Link>
          )}
        </div>
      </div>
    </section>
  );
}
