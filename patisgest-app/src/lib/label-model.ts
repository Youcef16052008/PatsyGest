/**
 * Modèle d'étiquette produit (MOD-10, décret exécutif13-378 — MVP
 * allergènes ; valeurs nutritionnelles en V4). Pur et testable :
 * assemble les ingrédients de la recette active, met en évidence les
 * allergènes dans les noms, liste les allergènes/traces du produit et
 * choisit le lot (DLC la plus proche parmi les lots en stock).
 */

export type LabelIngredient = { code: string; nom: string; q: number; u: string };
export type LabelLot = { numero: string; dlc: string | null };
export type LabelProduct = {
  code: string;
  nom: string;
  allergenes: string[];
  traces: string[];
};

export type LabelModel = {
  code: string;
  nom: string;
  /** Ingrédients dans l'ordre de la recette, segments surlignés. */
  ingredientSegments: { text: string; allergen: boolean }[][];
  allergenes: string[]; // libellés français
  traces: string[];
  lot: string | null;
  dlc: string | null;
  sansRecette: boolean;
};

/** Les14 allergènes officiels (slugs base → libellé affiché). */
export const ALLERGEN_LABELS: Record<string, string> = {
  gluten: "Gluten",
  crustaces: "Crustacés",
  oeufs: "Œufs",
  poisson: "Poisson",
  arachides: "Arachides",
  soja: "Soja",
  lait: "Lait",
  fruits_coque: "Fruits à coque",
  celery: "Céleri",
  celeri: "Céleri",
  moutarde: "Moutarde",
  sesame: "Sésame",
  sulfites: "Sulfites",
  lupin: "Lupin",
  mollusques: "Mollusques",
};

/** Mots-clés (minuscules) par allergène — détection dans les noms d'ingrédients. */
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  gluten: ["gluten", "blé", "ble", "froment", "seigle", "orge", "avoine", "malt"],
  lait: ["lait", "beurre", "crème", "creme", "fromage", "yaourt", "lactose", "mascarpone", "ricotta", "ghee"],
  oeufs: ["œuf", "oeuf", "egg"],
  soja: ["soja"],
  fruits_coque: ["amande", "noisette", "noix", "cajou", "pistache", "macadamia", "pécan", "pecan", "fruit à coque", "fruits à coque"],
  arachides: ["arachide", "cacahuète", "cacahuete"],
  poisson: ["poisson", "thon", "saumon", "cabillaud"],
  crustaces: ["crevette", "crustacé", "crustace", "homard", "langouste"],
  mollusques: ["moule", "calmar", "huître", "huitre", "poulpe", "encornet"],
  sesame: ["sésame", "sesame"],
  moutarde: ["moutarde"],
  sulfites: ["sulfite", "so2"],
  lupin: ["lupin"],
  celery: ["céleri", "celeri"],
};

export function allergenLabel(slug: string): string {
  return ALLERGEN_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

function keywordsFor(slugs: string[]): string[] {
  const words: string[] = [];
  for (const s of slugs) for (const k of ALLERGEN_KEYWORDS[s] ?? [s]) words.push(k);
  return words;
}

/** Découpe un nom d'ingrédient : mots contenant un mot-clé d'allergène → surlignés. */
export function segmentIngredient(name: string, keywords: string[]): { text: string; allergen: boolean }[] {
  const parts = name.split(/(\s+)/);
  return parts.map((w) => {
    const lower = w.toLowerCase();
    const hit = keywords.some((k) => lower.includes(k));
    return { text: w, allergen: hit };
  });
}

/**
 * Construit le modèle d'étiquette. `ingredients` dans l'ordre de la recette
 * active ; `lots` déjà triés (DLC croissante, sans DLC en dernier).
 */
export function buildLabelModel(
  product: LabelProduct,
  ingredients: LabelIngredient[],
  lots: LabelLot[],
): LabelModel {
  const keywords = keywordsFor(product.allergenes);
  const lot = lots.find((l) => l.numero) ?? null;
  return {
    code: product.code,
    nom: product.nom,
    ingredientSegments: ingredients.map((i) => segmentIngredient(i.nom, keywords)),
    allergenes: product.allergenes.map(allergenLabel),
    traces: product.traces.map(allergenLabel),
    lot: lot?.numero ?? null,
    dlc: lot?.dlc ?? null,
    sansRecette: ingredients.length === 0,
  };
}
