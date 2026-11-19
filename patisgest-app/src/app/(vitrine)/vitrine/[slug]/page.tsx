import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { libellePrix, lireVitrinePublique } from "@/lib/vitrine";
import VitrineCommande from "@/components/vitrine-commande";
import { resoudreHote, DOMAINE_SERVICE_PAR_DEFAUT } from "@/lib/domaines";

/**
 * Vitrine publique d'une boutique : `/vitrine/<slug>` sur le domaine de
 * l'application, ou `/` sur `slug.patisgest.dz` après réécriture par le
 * middleware (qui produit justement `/vitrine/<slug>`).
 *
 * Le segment `vitrine` est STATIQUE et obligatoire : un `/[slug]` à la
 * racine entrerait en collision avec `/[module]` côté application (Next
 * refuse le build : « Ambiguous app routes »).
 *
 * Cette page est rendue SANS session : elle ne lit que la vue publique
 * `vitrine_catalogue` (migration 26), qui ne porte aucun coût. Ne jamais
 * y importer une lecture interne (`workspace-read`, `auth`, `actions-*`) :
 * cela ferait fuiter des marges ou forcerait une redirection de connexion.
 *
 * `dynamic = "force-dynamic"` : une vitrine doit refléter immédiatement
 * une recette dépubliée ou un prix changé. Le coût est nul (2 visiteurs
 * par jour au démarrage), et le cache viendra avec le routage CDN.
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

async function resoudreSlug(params: Promise<Params>, entetes: Headers): Promise<string | null> {
  const { slug } = await params;
  const valeur = decodeURIComponent(slug ?? "").trim().toLowerCase();
  if (valeur && valeur !== "_") return valeur;

  // Réécriture interne du middleware : la boutique vient de l'en-tête Host.
  const hote = resoudreHote(entetes.get("host"), DOMAINE_SERVICE_PAR_DEFAUT, []);
  if (hote.type === "boutique") return hote.sousDomaine;
  return null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const entetes = await headers();
  const slug = await resoudreSlug(params, entetes);
  if (!slug) return { title: "Vitrine — PâtisGest" };

  const vitrine = await lireVitrinePublique(slug);
  if (vitrine.indisponible) return { title: "Vitrine — PâtisGest" };

  return {
    title: `${vitrine.boutique} — ${vitrine.etablissement}`,
    description: `Les pâtisseries de ${vitrine.etablissement}, commandables en ligne.`,
    robots: { index: true, follow: true },
  };
}

export default async function VitrinePage({ params }: { params: Promise<Params> }) {
  const entetes = await headers();
  const slug = await resoudreSlug(params, entetes);
  if (!slug) notFound();

  const vitrine = await lireVitrinePublique(slug);

  if (vitrine.indisponible) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
        <h1 className="text-2xl font-bold">Boutique indisponible</h1>
        <p className="text-slate-600">{vitrine.indisponible}</p>
        <p className="text-sm text-slate-500">
          Si vous êtes le gérant, la publication de la vitrine se règle depuis
          l&apos;espace de gestion, module « Établissement ».
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-sm font-bold uppercase tracking-wide text-violet-700">
          {vitrine.etablissement}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">{vitrine.boutique}</h1>
        <p className="mt-2 text-slate-600">
          {vitrine.articles.length} pâtisserie{vitrine.articles.length > 1 ? "s" : ""} à la
          commande. Chaque commande est confirmée par la boutique avant d&apos;être préparée.
        </p>
      </header>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {vitrine.articles.map((a) => (
          <li key={a.cleNom} className="rounded-xl border border-slate-200 p-4">
            {a.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.photo}
                alt={a.nom}
                className="mb-3 h-40 w-full rounded-lg object-cover"
                loading="lazy"
              />
            ) : (
              <div className="mb-3 flex h-40 w-full items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
                Photo à venir
              </div>
            )}
            <h2 className="text-lg font-bold text-slate-900">{a.nom}</h2>
            {a.description && <p className="mt-1 text-sm text-slate-600">{a.description}</p>}
            <p className="mt-2 font-bold text-violet-800">{libellePrix(a)}</p>
          </li>
        ))}
      </ul>

      <VitrineCommande
        sousDomaine={vitrine.sousDomaine}
        articles={vitrine.articles.map((a) => ({
          cleNom: a.cleNom,
          nom: a.nom,
          prix: libellePrix(a),
        }))}
      />

      <footer className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-500">
        <p>
          Pour commander, appelez la boutique ou passez par le formulaire de commande
          en ligne. Aucun paiement n&apos;est demandé sur cette page.
        </p>
      </footer>
    </main>
  );
}
