/**
 * MOD-10 — Allergènes matières → produits (décret exécutif 13-378, annexe II).
 *
 * La règle légale est *déclarative et descendante* : ce qui est étiqueté sur un
 * produit, ce sont les allergènes **présents dans ses ingrédients**. Jusqu'ici
 * l'application faisait saisir `articles.allergenes` à la main sur le produit
 * fini, sans lien avec les matières. Mesuré sur le jeu pilote :
 *
 *   PF-CRO (Croissant) déclarait gluten, lait, OEUFS
 *   recette v1 = farine (gluten) + beurre (lait) + sucre + lait (lait)
 *   → « œufs » était déclaré sans aucune matière à œufs dans la recette.
 *
 * Ce module calcule les allergènes **dérivés** de la recette (matières +
 * semi-finis, récursivement) et les compare à la déclaration manuelle.
 * Pur et testable : aucune dépendance Next/Supabase.
 */

export type AllergenSlug =
  | "gluten" | "crustaces" | "oeufs" | "poisson" | "arachides" | "soja"
  | "lait" | "fruits_coque" | "celeri" | "moutarde" | "sesame" | "sulfites"
  | "lupin" | "mollusques";

/** Les 14 allergènes à déclaration obligatoire (annexe II du décret 13-378). */
export const ALLERGEN_SLUGS: readonly AllergenSlug[] = [
  "gluten", "crustaces", "oeufs", "poisson", "arachides", "soja", "lait",
  "fruits_coque", "celeri", "moutarde", "sesame", "sulfites", "lupin", "mollusques",
] as const;

/**
 * Article du référentiel tel que le calcul le voit. `allergenes` = déclaration
 * de la fiche article (ce que le fournisseur ou le labo a saisi) ; `traces`
 * ne descendent pas dans les produits (une trace n'est pas un ingrédient).
 */
export type ArticleAllergene = {
  code: string;
  nom: string;
  niveau?: string;
  allergenes: string[];
};

/** Ligne de recette : soit une matière (`articleId`/`code`), soit une sous-recette. */
export type LabelLigne =
  | { articleId: string; q?: number; u?: string }
  | { subVersionId: string; q?: number; u?: string };

export type VersionRecette = {
  id: string;
  familleId: string;
  /** Lignes de la version : articles et/ou sous-recettes figées. */
  ingredients: LabelLigne[];
};

export type DerivationAllergenes = {
  /** Slugs triés des allergènes réellement présents dans les ingrédients. */
  derives: AllergenSlug[];
  /** Slugs déclarés sur la fiche produit par l'utilisateur. */
  declares: AllergenSlug[];
  /** Déclarés mais absents des ingrédients → mention à retirer (sur-déclaration). */
  enTrop: AllergenSlug[];
  /** Présents dans les ingrédients mais non déclarés → BLOQUANT (risque légal). */
  manquants: AllergenSlug[];
  /** Codes articles réellement parcourus (traçabilité du calcul). */
  articlesLus: string[];
};

const normaliser = (s: string): string =>
  s
    // « œ » et « æ » sont des ligatures : NFD ne les décompose pas. Sans cette
    // table, « Œufs » restait « œufs » et ne matchait jamais le slug « oeufs ».
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Ramène une saisie libre (« Œufs », "fruits a coque", "céléri") au slug officiel. */
export function normaliserSlug(brut: string): string {
  const n = normaliser(brut).replace(/[\s-]+/g, "_");
  // Alias fréquents rencontrés dans les saisies et les anciennes données.
  const alias: Record<string, string> = {
    oeuf: "oeufs",
    oeufs: "oeufs",
    celeri: "celeri",
    fruits_a_coque: "fruits_coque",
    fruit_a_coque: "fruits_coque",
    crustace: "crustaces",
    mollusque: "mollusques",
    sulfite: "sulfites",
    arachide: "arachides",
  };
  return alias[n] ?? n;
}

/** Ne garde que les 14 allergènes légaux, dédupliqués et triés. */
export function normaliserListe(slugs: readonly string[]): AllergenSlug[] {
  const set = new Set<string>();
  for (const s of slugs) {
    const n = normaliserSlug(s);
    if ((ALLERGEN_SLUGS as readonly string[]).includes(n)) set.add(n);
  }
  return [...set].sort() as AllergenSlug[];
}

/**
 * Calcule les allergènes dérivés d'une version de recette.
 *
 * Expansion récursive des sous-recettes (profondeur max 3, comme
 * `patisgest_besoins_de_version`), avec mémo sur la version et garde
 * anti-cycle : une sous-recette qui se référencerait elle-même ne doit ni
 * boucler ni faire exploser la pile.
 */
export function allergenesDerives(
  versionId: string,
  versions: VersionRecette[],
  articles: ArticleAllergene[],
): { derives: AllergenSlug[]; articlesLus: string[] } {
  const parIdVersion = new Map(versions.map((v) => [v.id, v]));
  const parIdArticle = new Map(articles.map((a) => [a.code, a]));
  const trouves = new Set<string>();
  const articlesLus: string[] = [];

  const visites = new Set<string>();
  const parcourir = (id: string, profondeur: number): void => {
    if (profondeur > 3) return;
    if (visites.has(id)) return; // anti-cycle + mémo
    visites.add(id);
    const v = parIdVersion.get(id);
    if (!v) return;
    for (const ligne of v.ingredients ?? []) {
      if ("subVersionId" in ligne && ligne.subVersionId) {
        parcourir(ligne.subVersionId, profondeur + 1);
        continue;
      }
      const code = "articleId" in ligne ? ligne.articleId : undefined;
      if (!code) continue;
      const art = parIdArticle.get(code);
      if (!art) continue;
      articlesLus.push(art.code);
      for (const s of art.allergenes ?? []) {
        const n = normaliserSlug(s);
        if ((ALLERGEN_SLUGS as readonly string[]).includes(n)) trouves.add(n);
      }
    }
  };

  parcourir(versionId, 0);
  return { derives: [...trouves].sort() as AllergenSlug[], articlesLus };
}

/**
 * Compare la déclaration de la fiche produit aux allergènes dérivés.
 * `manquants` est le cas grave : le produit contient un allergène que
 * l'étiquette ne mentionne pas.
 */
export function verifierDeclaration(
  declares: readonly string[],
  derives: readonly string[],
  articlesLus: readonly string[] = [],
): DerivationAllergenes {
  const decl = normaliserListe(declares);
  const der = normaliserListe(derives);
  const setDecl = new Set<string>(decl);
  const setDer = new Set<string>(der);
  return {
    derives: der,
    declares: decl,
    enTrop: decl.filter((a) => !setDer.has(a)),
    manquants: der.filter((a) => !setDecl.has(a)),
    articlesLus: [...articlesLus],
  };
}

/** Le produit est-il conforme pour l'impression d'étiquette ? */
export function declarationConforme(d: DerivationAllergenes): boolean {
  return d.manquants.length === 0;
}
