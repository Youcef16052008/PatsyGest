export type FreeUnit = "g" | "kg" | "ml" | "cl" | "L" | "pcs";
export type FreePriceBasis = "total" | "par_kg" | "par_L" | "par_unite";

export type FreeIngredientLine = {
  id: string;
  nom: string;
  qty: number;
  unite: FreeUnit;
  prix: number;
  basePrix: FreePriceBasis;
  stockArticleId?: string | null;
};

export type FreeRecipe = {
  id: string;
  nom: string;
  categorie?: string;
  portions: number;
  unitePortion: string;
  emballageDa: number;
  cuissonMoDa: number;
  prixVenteDa: number;
  notes: string;
  ingredients: FreeIngredientLine[];
  statutPrix?: "valide" | "a_verifier_patron" | "bloque";
  saisiPar?: string;
  updatedAt: string;
};

export type StockSuggestion = {
  id: string;
  nom: string;
  unite: string;
  prixUnitaireDa: number | null;
};

export const FREE_RECIPES_KEY_PREFIX = "patisgest.free_recipes.v1.";

export function lineCostDa(line: FreeIngredientLine): number {
  const qty = Number(line.qty);
  const prix = Number(line.prix);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(prix) || prix < 0) return 0;

  let raw = 0;
  switch (line.basePrix) {
    case "total":
      raw = prix;
      break;
    case "par_kg": {
      const kg = line.unite === "g" ? qty / 1000 : line.unite === "kg" ? qty : qty;
      raw = kg * prix;
      break;
    }
    case "par_L": {
      const litres =
        line.unite === "ml" ? qty / 1000 : line.unite === "cl" ? qty / 100 : line.unite === "L" ? qty : qty;
      raw = litres * prix;
      break;
    }
    case "par_unite":
    default:
      raw = qty * prix;
      break;
  }
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

export function computeFreeRecipeSummary(recipe: Pick<FreeRecipe, "portions" | "emballageDa" | "cuissonMoDa" | "prixVenteDa" | "ingredients">) {
  const coutIngredients =
    Math.round(recipe.ingredients.reduce((sum, l) => sum + lineCostDa(l), 0) * 100) / 100;
  const fraisFixes =
    Math.round((Math.max(0, Number(recipe.emballageDa) || 0) + Math.max(0, Number(recipe.cuissonMoDa) || 0)) * 100) / 100;
  const coutTotal = Math.round((coutIngredients + fraisFixes) * 100) / 100;
  const portions = Math.max(1, Number(recipe.portions) || 1);
  const coutParPart = Math.round((coutTotal / portions) * 100) / 100;
  const prixVente = Math.max(0, Number(recipe.prixVenteDa) || 0);
  const beneficeParPart = Math.round((prixVente - coutParPart) * 100) / 100;
  const margePct = prixVente > 0 ? Math.round(((prixVente - coutParPart) / prixVente) * 1000) / 10 : null;
  const conseils = [2, 2.5, 3].map((coef) => ({
    coef,
    prix: Math.round(coutParPart * coef),
    benefice: Math.round(coutParPart * coef - coutParPart),
  }));
  return {
    coutIngredients,
    fraisFixes,
    coutTotal,
    coutParPart,
    prixVente,
    beneficeParPart,
    margePct,
    conseils,
  };
}

export function defaultPriceBasisForUnit(unite: string): FreePriceBasis {
  const u = unite.trim().toLowerCase();
  if (u === "kg" || u === "g") return "par_kg";
  if (u === "l" || u === "ml" || u === "cl") return "par_L";
  return "par_unite";
}

export function starterFreeRecipes(): FreeRecipe[] {
  const now = new Date().toISOString().slice(0, 10);
  return [
    {
      id: "free-baklawa",
      nom: "Baklawa aux amandes (Plateau 40 pièces)",
      portions: 40,
      unitePortion: "pièces",
      emballageDa: 250,
      cuissonMoDa: 600,
      prixVenteDa: 220,
      notes: "Cuisson 45 min à 170°C, sirop miel tiède à la sortie du four.",
      updatedAt: now,
      ingredients: [
        { id: "b1", nom: "Amandes blanchies moulues", qty: 1.2, unite: "kg", prix: 1900, basePrix: "par_kg" },
        { id: "b2", nom: "Farine pâtissière", qty: 1, unite: "kg", prix: 95, basePrix: "par_kg" },
        { id: "b3", nom: "Smen / Beurre fondu", qty: 450, unite: "g", prix: 900, basePrix: "par_kg" },
        { id: "b4", nom: "Miel pur + eau de fleur d’oranger", qty: 800, unite: "g", prix: 1100, basePrix: "par_kg" },
        { id: "b5", nom: "Sucre cristallisé", qty: 400, unite: "g", prix: 110, basePrix: "par_kg" },
      ],
    },
    {
      id: "free-millefeuille",
      nom: "Mille-feuille vanille maison",
      portions: 24,
      unitePortion: "parts",
      emballageDa: 180,
      cuissonMoDa: 450,
      prixVenteDa: 180,
      notes: "Pâte feuilletée inversée, crème pâtissière vanille + fondant.",
      updatedAt: now,
      ingredients: [
        { id: "m1", nom: "Farine pâtissière", qty: 1, unite: "kg", prix: 95, basePrix: "par_kg" },
        { id: "m2", nom: "Beurre de tourage", qty: 750, unite: "g", prix: 950, basePrix: "par_kg" },
        { id: "m3", nom: "Lait entier", qty: 1.5, unite: "L", prix: 120, basePrix: "par_L" },
        { id: "m4", nom: "Œufs", qty: 8, unite: "pcs", prix: 22, basePrix: "par_unite" },
        { id: "m5", nom: "Sucre + Maïzena + Vanille + Fondant", qty: 1, unite: "pcs", prix: 420, basePrix: "total" },
      ],
    },
    {
      id: "free-layercake",
      nom: "Layer Cake Anniversaire Chocolat (16 parts)",
      portions: 16,
      unitePortion: "parts",
      emballageDa: 450,
      cuissonMoDa: 1200,
      prixVenteDa: 450,
      notes: "Moule Ø22 cm haut · ganache montée chocolat noir.",
      updatedAt: now,
      ingredients: [
        { id: "l1", nom: "Chocolat noir pâtissier", qty: 700, unite: "g", prix: 1800, basePrix: "par_kg" },
        { id: "l2", nom: "Crème fraîche 35 %", qty: 1, unite: "L", prix: 780, basePrix: "par_L" },
        { id: "l3", nom: "Œufs", qty: 10, unite: "pcs", prix: 22, basePrix: "par_unite" },
        { id: "l4", nom: "Beurre + Sucre + Farine + Cacao", qty: 1, unite: "pcs", prix: 850, basePrix: "total" },
      ],
    },
  ];
}
