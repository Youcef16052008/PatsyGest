export type StarterDzSector = "boulangerie" | "patisserie" | "cake_shop" | "commun";
export type StarterDzActivity = "mixte" | "boulangerie" | "patisserie" | "cake_shop";
export type StarterVatRegime = "ifu_0" | "reel_dz";

export type StarterDzArticle = {
  code: string;
  nom: string;
  niveau: "produit" | "matiere";
  unite: string;
  seuil: number;
  /** Prix final affiché au comptoir (DA). */
  prixDa: number;
  /** Taux de TVA algérien (LF 2026) au régime réel : 0 % (pain/exonéré), 9 % (réduit), 19 % (normal). */
  tvaReel: 0 | 9 | 19;
  secteur: StarterDzSector;
};

export const PACK_PATISSERIE_DZ: StarterDzArticle[] = [
  // Boulangerie & Viennoiserie
  { code: "PF-BAG", nom: "Baguette traditionnelle", niveau: "produit", unite: "pcs", seuil: 40, prixDa: 15, tvaReel: 0, secteur: "boulangerie" },
  { code: "PF-PCM", nom: "Pain complet / céréales", niveau: "produit", unite: "pcs", seuil: 20, prixDa: 50, tvaReel: 9, secteur: "boulangerie" },
  { code: "PF-BRI", nom: "Brioche artisanale", niveau: "produit", unite: "pcs", seuil: 12, prixDa: 160, tvaReel: 19, secteur: "boulangerie" },
  { code: "PF-CRO", nom: "Croissant au beurre", niveau: "produit", unite: "pcs", seuil: 20, prixDa: 60, tvaReel: 19, secteur: "boulangerie" },
  { code: "PF-PAC", nom: "Pain au chocolat", niveau: "produit", unite: "pcs", seuil: 20, prixDa: 70, tvaReel: 19, secteur: "boulangerie" },
  // Pâtisserie française & orientale
  { code: "PF-MIL", nom: "Mille-feuille vanille", niveau: "produit", unite: "pcs", seuil: 12, prixDa: 180, tvaReel: 19, secteur: "patisserie" },
  { code: "PF-ECL", nom: "Éclair au chocolat", niveau: "produit", unite: "pcs", seuil: 12, prixDa: 200, tvaReel: 19, secteur: "patisserie" },
  { code: "PF-TAR", nom: "Tartelette fruits", niveau: "produit", unite: "pcs", seuil: 10, prixDa: 240, tvaReel: 19, secteur: "patisserie" },
  { code: "PF-BAK", nom: "Baklawa amandes", niveau: "produit", unite: "kg", seuil: 3, prixDa: 3200, tvaReel: 19, secteur: "patisserie" },
  { code: "PF-MAK", nom: "Makrout el louz / miel", niveau: "produit", unite: "kg", seuil: 4, prixDa: 1800, tvaReel: 19, secteur: "patisserie" },
  { code: "PF-KAL", nom: "Kalb El Louz", niveau: "produit", unite: "pcs", seuil: 20, prixDa: 120, tvaReel: 19, secteur: "patisserie" },
  // Cake Shop & Sur-mesure
  { code: "PF-ANN", nom: "Gâteau anniversaire (10 parts)", niveau: "produit", unite: "pcs", seuil: 2, prixDa: 3800, tvaReel: 19, secteur: "cake_shop" },
  { code: "PF-BEN", nom: "Bento Cake personnalisé", niveau: "produit", unite: "pcs", seuil: 4, prixDa: 1600, tvaReel: 19, secteur: "cake_shop" },
  { code: "PF-CUP", nom: "Boîte 6 Cupcakes décorés", niveau: "produit", unite: "boîte", seuil: 4, prixDa: 1200, tvaReel: 19, secteur: "cake_shop" },
  // Matières premières essentielles (TVA algérienne LF 2026)
  { code: "MP-FAR", nom: "Farine pâtissière / boulangère", niveau: "matiere", unite: "kg", seuil: 25, prixDa: 95, tvaReel: 9, secteur: "commun" },
  { code: "MP-LEV", nom: "Levure boulangère fraîche", niveau: "matiere", unite: "kg", seuil: 3, prixDa: 420, tvaReel: 9, secteur: "boulangerie" },
  { code: "MP-BEU", nom: "Beurre de tourage / pâtissier", niveau: "matiere", unite: "kg", seuil: 10, prixDa: 950, tvaReel: 19, secteur: "commun" },
  { code: "MP-SUC", nom: "Sucre cristallisé", niveau: "matiere", unite: "kg", seuil: 15, prixDa: 110, tvaReel: 9, secteur: "commun" },
  { code: "MP-LAI", nom: "Lait entier", niveau: "matiere", unite: "L", seuil: 12, prixDa: 90, tvaReel: 9, secteur: "commun" },
  { code: "MP-OEU", nom: "Œufs frais", niveau: "matiere", unite: "pcs", seuil: 60, prixDa: 22, tvaReel: 9, secteur: "commun" },
  { code: "MP-AMA", nom: "Amandes blanchies", niveau: "matiere", unite: "kg", seuil: 5, prixDa: 1900, tvaReel: 19, secteur: "patisserie" },
  { code: "MP-MIE", nom: "Miel pur", niveau: "matiere", unite: "kg", seuil: 4, prixDa: 1100, tvaReel: 9, secteur: "patisserie" },
  { code: "MP-CHO", nom: "Chocolat noir pâtissier", niveau: "matiere", unite: "kg", seuil: 4, prixDa: 1800, tvaReel: 19, secteur: "commun" },
  { code: "MP-CRE", nom: "Crème fraîche 35 %", niveau: "matiere", unite: "L", seuil: 6, prixDa: 780, tvaReel: 19, secteur: "commun" },
];

export function filterPackByActivityAndVat(
  activity: StarterDzActivity = "mixte",
  tvaRegime: StarterVatRegime = "ifu_0",
) {
  const items = PACK_PATISSERIE_DZ.filter(
    (item) => activity === "mixte" || item.secteur === "commun" || item.secteur === activity,
  );
  return items.map((item) => {
    const tva = tvaRegime === "ifu_0" ? 0 : item.tvaReel;
    const pvHt = tva > 0 ? Math.round((item.prixDa / (1 + tva / 100)) * 100) / 100 : item.prixDa;
    return { ...item, tva, pvHt };
  });
}
