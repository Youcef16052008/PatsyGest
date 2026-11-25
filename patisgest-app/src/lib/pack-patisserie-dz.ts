export type StarterDzArticle = {
  code: string;
  nom: string;
  niveau: "produit" | "matiere";
  unite: string;
  seuil: number;
  prixDa: number;
};

export const PACK_PATISSERIE_DZ: StarterDzArticle[] = [
  // Produits finis prêts pour la caisse
  { code: "PF-CRO", nom: "Croissant au beurre", niveau: "produit", unite: "pcs", seuil: 15, prixDa: 60 },
  { code: "PF-PAC", nom: "Pain au chocolat", niveau: "produit", unite: "pcs", seuil: 15, prixDa: 70 },
  { code: "PF-MIL", nom: "Mille-feuille vanille", niveau: "produit", unite: "pcs", seuil: 12, prixDa: 180 },
  { code: "PF-ECL", nom: "Éclair au chocolat", niveau: "produit", unite: "pcs", seuil: 12, prixDa: 200 },
  { code: "PF-TAR", nom: "Tartelette fruits", niveau: "produit", unite: "pcs", seuil: 10, prixDa: 240 },
  { code: "PF-BAK", nom: "Baklawa amandes", niveau: "produit", unite: "kg", seuil: 3, prixDa: 3200 },
  { code: "PF-MAK", nom: "Makrout el louz / miel", niveau: "produit", unite: "kg", seuil: 4, prixDa: 1800 },
  { code: "PF-KAL", nom: "Kalb El Louz", niveau: "produit", unite: "pcs", seuil: 20, prixDa: 120 },
  { code: "PF-ANN", nom: "Gâteau anniversaire (10 parts)", niveau: "produit", unite: "pcs", seuil: 2, prixDa: 3800 },
  // Matières premières essentielles
  { code: "MP-FAR", nom: "Farine pâtissière T45", niveau: "matiere", unite: "kg", seuil: 25, prixDa: 95 },
  { code: "MP-BEU", nom: "Beurre de tourage / pâtissier", niveau: "matiere", unite: "kg", seuil: 10, prixDa: 950 },
  { code: "MP-SUC", nom: "Sucre cristallisé", niveau: "matiere", unite: "kg", seuil: 15, prixDa: 110 },
  { code: "MP-OEU", nom: "Œufs frais", niveau: "matiere", unite: "pcs", seuil: 60, prixDa: 22 },
  { code: "MP-AMA", nom: "Amandes blanchies", niveau: "matiere", unite: "kg", seuil: 5, prixDa: 1900 },
  { code: "MP-MIE", nom: "Miel pur", niveau: "matiere", unite: "kg", seuil: 4, prixDa: 1100 },
  { code: "MP-CHO", nom: "Chocolat noir pâtissier", niveau: "matiere", unite: "kg", seuil: 4, prixDa: 1800 },
  { code: "MP-CRE", nom: "Crème fraîche 35 %", niveau: "matiere", unite: "L", seuil: 6, prixDa: 780 },
];
