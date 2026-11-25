/**
 * B.3 — Mode « Saison & Fêtes Algériennes » (Ramadan, Aïd El-Fitr, Aïd El-Adha, Mariages).
 * Agrège les plateaux / kg commandés en une liste de courses consolidée pour le marché.
 */

import { normalizeAlgerianPhone } from "./whatsapp.ts";

export type FeteIngredient = {
  nom: string;
  qtyPerUnit: number;
  unite: "g" | "kg" | "ml" | "L" | "pcs";
  prixUnitaireDa: number; // prix par kg, par L ou par pièce selon l'unité de base
};

export type FeteSpecialty = {
  id: string;
  nom: string;
  uniteVente: string;
  prixVenteUniteDa: number;
  saisons: ("ramadan" | "aid_fitr" | "aid_adha" | "mariage")[];
  ingredients: FeteIngredient[];
};

export const FETE_SPECIALTIES: FeteSpecialty[] = [
  {
    id: "fete-baklawa",
    nom: "Baklawa aux amandes (kg)",
    uniteVente: "kg",
    prixVenteUniteDa: 3200,
    saisons: ["aid_fitr", "mariage", "aid_adha"],
    ingredients: [
      { nom: "Amandes blanchies", qtyPerUnit: 550, unite: "g", prixUnitaireDa: 1900 },
      { nom: "Farine pâtissière", qtyPerUnit: 350, unite: "g", prixUnitaireDa: 95 },
      { nom: "Smen / Beurre fondu", qtyPerUnit: 200, unite: "g", prixUnitaireDa: 900 },
      { nom: "Miel pur + eau fleur d’oranger", qtyPerUnit: 350, unite: "g", prixUnitaireDa: 1100 },
      { nom: "Sucre cristallisé", qtyPerUnit: 150, unite: "g", prixUnitaireDa: 110 },
    ],
  },
  {
    id: "fete-makrout-assel",
    nom: "Makrout El Assel / Dattes (kg)",
    uniteVente: "kg",
    prixVenteUniteDa: 1600,
    saisons: ["aid_fitr", "ramadan", "aid_adha"],
    ingredients: [
      { nom: "Semoule moyenne", qtyPerUnit: 600, unite: "g", prixUnitaireDa: 120 },
      { nom: "Pâte de dattes (Ghars)", qtyPerUnit: 350, unite: "g", prixUnitaireDa: 450 },
      { nom: "Smen / Beurre fondu", qtyPerUnit: 200, unite: "g", prixUnitaireDa: 900 },
      { nom: "Miel pur + eau fleur d’oranger", qtyPerUnit: 300, unite: "g", prixUnitaireDa: 1100 },
      { nom: "Huile de friture", qtyPerUnit: 200, unite: "ml", prixUnitaireDa: 160 },
    ],
  },
  {
    id: "fete-makrout-louz",
    nom: "Makrout El Louz (kg)",
    uniteVente: "kg",
    prixVenteUniteDa: 3600,
    saisons: ["aid_fitr", "mariage"],
    ingredients: [
      { nom: "Amandes blanchies", qtyPerUnit: 700, unite: "g", prixUnitaireDa: 1900 },
      { nom: "Sucre cristallisé", qtyPerUnit: 350, unite: "g", prixUnitaireDa: 110 },
      { nom: "Œufs frais", qtyPerUnit: 4, unite: "pcs", prixUnitaireDa: 22 },
      { nom: "Sucre glace", qtyPerUnit: 150, unite: "g", prixUnitaireDa: 160 },
      { nom: "Citron (zeste)", qtyPerUnit: 2, unite: "pcs", prixUnitaireDa: 25 },
    ],
  },
  {
    id: "fete-tcharek",
    nom: "Tcharek Msaker (plateau 50 pcs)",
    uniteVente: "plateau",
    prixVenteUniteDa: 4500,
    saisons: ["aid_fitr", "mariage"],
    ingredients: [
      { nom: "Farine pâtissière", qtyPerUnit: 1.1, unite: "kg", prixUnitaireDa: 95 },
      { nom: "Smen / Beurre fondu", qtyPerUnit: 450, unite: "g", prixUnitaireDa: 900 },
      { nom: "Amandes blanchies", qtyPerUnit: 500, unite: "g", prixUnitaireDa: 1900 },
      { nom: "Sucre glace", qtyPerUnit: 500, unite: "g", prixUnitaireDa: 160 },
      { nom: "Sucre cristallisé", qtyPerUnit: 250, unite: "g", prixUnitaireDa: 110 },
    ],
  },
  {
    id: "fete-kalb-louz",
    nom: "Kalb El Louz (plateau 24 parts)",
    uniteVente: "plateau",
    prixVenteUniteDa: 2800,
    saisons: ["ramadan"],
    ingredients: [
      { nom: "Semoule grosse (Kalb El Louz)", qtyPerUnit: 1.5, unite: "kg", prixUnitaireDa: 140 },
      { nom: "Sucre cristallisé", qtyPerUnit: 1.2, unite: "kg", prixUnitaireDa: 110 },
      { nom: "Amandes blanchies", qtyPerUnit: 250, unite: "g", prixUnitaireDa: 1900 },
      { nom: "Smen / Beurre fondu", qtyPerUnit: 250, unite: "g", prixUnitaireDa: 900 },
    ],
  },
  {
    id: "fete-griwech",
    nom: "Griwech au miel & sésame (kg)",
    uniteVente: "kg",
    prixVenteUniteDa: 1500,
    saisons: ["ramadan", "aid_fitr", "aid_adha"],
    ingredients: [
      { nom: "Farine pâtissière", qtyPerUnit: 650, unite: "g", prixUnitaireDa: 95 },
      { nom: "Beurre / Margarine feuilletage", qtyPerUnit: 180, unite: "g", prixUnitaireDa: 650 },
      { nom: "Miel pur + eau fleur d’oranger", qtyPerUnit: 350, unite: "g", prixUnitaireDa: 1100 },
      { nom: "Graines de sésame", qtyPerUnit: 80, unite: "g", prixUnitaireDa: 750 },
      { nom: "Huile de friture", qtyPerUnit: 250, unite: "ml", prixUnitaireDa: 160 },
    ],
  },
];

export type FeteMarketLine = {
  nom: string;
  quantiteAffichee: string;
  quantiteBase: number;
  uniteBase: "kg" | "L" | "pcs";
  coutEstimeDa: number;
};

export type FeteShoppingPlan = {
  lignesMarche: FeteMarketLine[];
  budgetAchatsDa: number;
  chiffreAffairesEstimeDa: number;
  beneficeEstimeDa: number;
};

export function computeFetesShoppingList(
  quantities: Record<string, number>,
  specialties: FeteSpecialty[] = FETE_SPECIALTIES,
): FeteShoppingPlan {
  const agg = new Map<string, { nom: string; baseQty: number; uniteBase: "kg" | "L" | "pcs"; prixUniteBase: number }>();
  let chiffreAffaires = 0;

  for (const spec of specialties) {
    const qty = Math.max(0, Number(quantities[spec.id] ?? 0) || 0);
    if (qty <= 0) continue;
    chiffreAffaires += qty * spec.prixVenteUniteDa;

    for (const ing of spec.ingredients) {
      let uniteBase: "kg" | "L" | "pcs" = "pcs";
      let factor = 1;
      if (ing.unite === "g") {
        uniteBase = "kg";
        factor = 0.001;
      } else if (ing.unite === "kg") {
        uniteBase = "kg";
        factor = 1;
      } else if (ing.unite === "ml") {
        uniteBase = "L";
        factor = 0.001;
      } else if (ing.unite === "L") {
        uniteBase = "L";
        factor = 1;
      }
      const addQty = qty * ing.qtyPerUnit * factor;
      const key = `${ing.nom.toLowerCase()}|${uniteBase}`;
      const prev = agg.get(key);
      if (prev) {
        prev.baseQty += addQty;
      } else {
        agg.set(key, {
          nom: ing.nom,
          baseQty: addQty,
          uniteBase,
          prixUniteBase: ing.prixUnitaireDa,
        });
      }
    }
  }

  const lignesMarche: FeteMarketLine[] = [...agg.values()]
    .map((item) => {
      const roundedQty =
        item.uniteBase === "pcs"
          ? Math.ceil(item.baseQty)
          : Math.round(item.baseQty * 100) / 100;
      const cout = Math.round(roundedQty * item.prixUniteBase);
      return {
        nom: item.nom,
        quantiteAffichee: `${roundedQty} ${item.uniteBase}`,
        quantiteBase: roundedQty,
        uniteBase: item.uniteBase,
        coutEstimeDa: cout,
      };
    })
    .sort((a, b) => b.coutEstimeDa - a.coutEstimeDa);

  const budgetAchatsDa = Math.round(lignesMarche.reduce((s, l) => s + l.coutEstimeDa, 0));
  const chiffreAffairesEstimeDa = Math.round(chiffreAffaires);
  return {
    lignesMarche,
    budgetAchatsDa,
    chiffreAffairesEstimeDa,
    beneficeEstimeDa: chiffreAffairesEstimeDa - budgetAchatsDa,
  };
}

export function whatsappMarketListUrl(params: {
  phone?: string | null;
  titre: string;
  plan: FeteShoppingPlan;
}): string {
  const num = normalizeAlgerianPhone(params.phone);
  const fmt = (n: number) => `${new Intl.NumberFormat("fr-DZ").format(Math.round(n))} DA`;
  const lines = [
    `*Liste de courses marché — ${params.titre}*`,
    ...params.plan.lignesMarche.map((l) => `• ${l.nom} : ${l.quantiteAffichee} (~${fmt(l.coutEstimeDa)})`),
    `*Budget estimé : ${fmt(params.plan.budgetAchatsDa)}*`,
  ];
  const encoded = encodeURIComponent(lines.join("\n"));
  return num ? `https://wa.me/${num}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
