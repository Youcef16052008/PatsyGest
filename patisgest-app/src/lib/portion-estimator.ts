/**
 * Estimateur parts ↔ moule & chiffrage indicatif en DA (sans compte).
 *
 * Principes :
 *  - Deux sens de calcul : moule → parts et parts → moule recommandé, avec
 *    hypothèse de portion explicite en cm³ (150 cm³ par défaut : rond Ø 26 cm
 *    × 4,5 cm = 16 parts moyennes, Ø 30 cm × 4,5 cm = 21 parts).
 *  - Séparation explicite entre ingrédients redimensionnables (selon le volume
 *    ou le nombre d'unités) et frais fixes par commande (boîte, support, décor).
 *  - Formules strictement alignées sur RC-01..RC-10 (cost-sheet.ts) : parage,
 *    rendement net vendable après cuisson/découpe, MO chargée, jamais de TVA
 *    dans le coût, marge sur HT.
 *  - Garde d'honnêteté : si une ligne n'a pas de prix unitaire valide, le coût
 *    est marqué incomplet et aucun prix HT conseillé / prix plancher n'est émis.
 *  - Conservation en brouillon uniquement sur action explicite du pâtissier ;
 *    n'écrase jamais un devis existant ou accepté.
 */

import {
  rc01Consommation,
  rc02RendementNet,
  rc03CoutTotal,
  rc04MoChargee,
  rc05CoutParPortion,
  rc06Marge,
  rc10GardeFous,
  type GardeFou,
} from "./cost-sheet.ts";

export type PortionSizeKey = "petite" | "moyenne" | "genereuse" | "personnalisee";

export const PORTION_PROFILES: Record<
  Exclude<PortionSizeKey, "personnalisee">,
  { label: string; volumeCm3: number; note: string }
> = {
  petite: { label: "Petite (buffet)", volumeCm3: 120, note: "120 cm³ · assortiment ou réception" },
  moyenne: { label: "Moyenne (boutique)", volumeCm3: 150, note: "150 cm³ · entremets standard" },
  genereuse: { label: "Généreuse (fête)", volumeCm3: 190, note: "190 cm³ · part événementielle" },
};

export type MoldShape = "rond" | "carre" | "rectangle" | "unites";

export type MoldSpec =
  | { forme: "rond"; diametreCm: number; hauteurCm: number }
  | { forme: "carre"; coteCm: number; hauteurCm: number }
  | { forme: "rectangle"; longueurCm: number; largeurCm: number; hauteurCm: number }
  | { forme: "unites"; nbUnites: number };

export type MoldPortionResult = {
  volumeCm3: number | null;
  volumePartCm3: number | null;
  parts: number;
  formatLabel: string;
  conseilDecoupe: string;
};

export type MoldRecommendation = {
  moule: Exclude<MoldSpec, { forme: "unites" }>;
  formatLabel: string;
  volumeRequisCm3: number;
  volumeMouleCm3: number;
  dimensionIdealeCm: string;
  partsObtenues: number;
  conseilDecoupe: string;
};

const CERCLES_RONDS_CM = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 40] as const;
const CADRES_CARRES_CM = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40] as const;
const CADRES_RECT_CM: readonly (readonly [number, number])[] = [
  [24, 18],
  [28, 20],
  [30, 20],
  [34, 24],
  [36, 27],
  [40, 30],
  [50, 35],
  [60, 40],
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;
const fmtCm = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

function requireRange(n: number, label: string, min: number, max: number): number {
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${label} : valeur attendue entre ${min} et ${max}.`);
  }
  return n;
}

export function describeMold(spec: MoldSpec): string {
  switch (spec.forme) {
    case "rond":
      return `Cercle rond Ø ${fmtCm(spec.diametreCm)} cm × H ${fmtCm(spec.hauteurCm)} cm`;
    case "carre":
      return `Cadre carré ${fmtCm(spec.coteCm)} × ${fmtCm(spec.coteCm)} cm × H ${fmtCm(spec.hauteurCm)} cm`;
    case "rectangle":
      return `Cadre rectangle ${fmtCm(spec.longueurCm)} × ${fmtCm(spec.largeurCm)} cm × H ${fmtCm(spec.hauteurCm)} cm`;
    case "unites":
      return `Coffret / série de ${Math.round(spec.nbUnites)} pièces`;
  }
}

function cuttingGuide(spec: MoldSpec, parts: number): string {
  if (spec.forme === "unites") {
    return `${parts} pièces individuelles (prévoir caissettes ou intercalaires).`;
  }
  if (spec.forme === "rond") {
    if (parts <= 12) return `Découpe rayonnante classique en ${parts} parts égales.`;
    const coeur = Math.max(4, Math.round(parts * 0.3));
    const couronne = Math.max(6, parts - coeur);
    const diamCoeur = Math.max(8, Math.round(spec.diametreCm * 0.5));
    return `Découpe événement : cercle central Ø ~${diamCoeur} cm (${coeur} parts) + couronne extérieure (${couronne} parts), ou lanières parallèles.`;
  }
  if (spec.forme === "carre") {
    const rows = Math.max(1, Math.round(Math.sqrt(parts)));
    const cols = Math.max(1, Math.ceil(parts / rows));
    const l = fmtCm(spec.coteCm / rows);
    const w = fmtCm(spec.coteCm / cols);
    return `Quadrillage ${rows} × ${cols} (environ ${l} × ${w} cm par part, jusqu’à ${rows * cols} parts).`;
  }
  const ratio = spec.longueurCm / Math.max(1, spec.largeurCm);
  const cols = Math.max(1, Math.round(Math.sqrt(parts * ratio)));
  const rows = Math.max(1, Math.ceil(parts / cols));
  const l = fmtCm(spec.longueurCm / cols);
  const w = fmtCm(spec.largeurCm / rows);
  return `Quadrillage ${cols} × ${rows} (environ ${l} × ${w} cm par part, jusqu’à ${cols * rows} parts).`;
}

/** Calcule le volume (cm³) d'un moule géométrique. */
export function moldVolumeCm3(spec: Exclude<MoldSpec, { forme: "unites" }>): number {
  const h = requireRange(spec.hauteurCm, "Hauteur du gâteau", 1, 40);
  if (spec.forme === "rond") {
    const d = requireRange(spec.diametreCm, "Diamètre du moule", 6, 100);
    const r = d / 2;
    return round2(Math.PI * r * r * h);
  }
  if (spec.forme === "carre") {
    const c = requireRange(spec.coteCm, "Côté du cadre", 6, 100);
    return round2(c * c * h);
  }
  const l = requireRange(spec.longueurCm, "Longueur du cadre", 6, 150);
  const w = requireRange(spec.largeurCm, "Largeur du cadre", 6, 150);
  return round2(l * w * h);
}

/** Sens 1 : Moule → nombre de parts et conseil de découpe. */
export function mouleVersParts(spec: MoldSpec, volumePartCm3 = 150): MoldPortionResult {
  if (spec.forme === "unites") {
    const n = Math.round(requireRange(spec.nbUnites, "Nombre de pièces", 1, 10_000));
    return {
      volumeCm3: null,
      volumePartCm3: null,
      parts: n,
      formatLabel: describeMold({ forme: "unites", nbUnites: n }),
      conseilDecoupe: cuttingGuide({ forme: "unites", nbUnites: n }, n),
    };
  }
  const volPart = requireRange(volumePartCm3, "Volume par part (cm³)", 40, 1000);
  const volumeCm3 = moldVolumeCm3(spec);
  const parts = Math.max(1, Math.round(volumeCm3 / volPart));
  return {
    volumeCm3,
    volumePartCm3: volPart,
    parts,
    formatLabel: describeMold(spec),
    conseilDecoupe: cuttingGuide(spec, parts),
  };
}

/** Sens 2 : Parts souhaitées → moule standard recommandé et parts obtenues. */
export function partsVersMoule(
  partsCibles: number,
  forme: Exclude<MoldShape, "unites">,
  hauteurCm = 4.5,
  volumePartCm3 = 150,
): MoldRecommendation {
  const parts = Math.round(requireRange(partsCibles, "Nombre de parts", 1, 500));
  const h = requireRange(hauteurCm, "Hauteur du gâteau", 1, 40);
  const volPart = requireRange(volumePartCm3, "Volume par part (cm³)", 40, 1000);
  const volumeRequisCm3 = round2(parts * volPart);
  const surfaceCm2 = volumeRequisCm3 / h;

  if (forme === "rond") {
    const diamIdeal = 2 * Math.sqrt(surfaceCm2 / Math.PI);
    const standard =
      CERCLES_RONDS_CM.find((d) => Math.round((Math.PI * (d / 2) ** 2 * h) / volPart) >= parts) ??
      Math.min(100, Math.ceil(diamIdeal / 2) * 2);
    const moule: MoldSpec = { forme: "rond", diametreCm: standard, hauteurCm: h };
    const volumeMouleCm3 = moldVolumeCm3(moule);
    const partsObtenues = Math.max(1, Math.round(volumeMouleCm3 / volPart));
    return {
      moule,
      formatLabel: describeMold(moule),
      volumeRequisCm3,
      volumeMouleCm3,
      dimensionIdealeCm: `Ø ${fmtCm(diamIdeal)} cm théorique`,
      partsObtenues,
      conseilDecoupe: cuttingGuide(moule, partsObtenues),
    };
  }

  if (forme === "carre") {
    const coteIdeal = Math.sqrt(surfaceCm2);
    const standard =
      CADRES_CARRES_CM.find((c) => Math.round((c * c * h) / volPart) >= parts) ??
      Math.min(100, Math.ceil(coteIdeal / 2) * 2);
    const moule: MoldSpec = { forme: "carre", coteCm: standard, hauteurCm: h };
    const volumeMouleCm3 = moldVolumeCm3(moule);
    const partsObtenues = Math.max(1, Math.round(volumeMouleCm3 / volPart));
    return {
      moule,
      formatLabel: describeMold(moule),
      volumeRequisCm3,
      volumeMouleCm3,
      dimensionIdealeCm: `${fmtCm(coteIdeal)} × ${fmtCm(coteIdeal)} cm théorique`,
      partsObtenues,
      conseilDecoupe: cuttingGuide(moule, partsObtenues),
    };
  }

  const ratio = 4 / 3;
  const largIdeale = Math.sqrt(surfaceCm2 / ratio);
  const longIdeale = largIdeale * ratio;
  const cadre = CADRES_RECT_CM.find(([l, w]) => Math.round((l * w * h) / volPart) >= parts);
  const longueurCm = cadre ? cadre[0] : Math.min(150, Math.ceil(longIdeale / 2) * 2);
  const largeurCm = cadre ? cadre[1] : Math.min(150, Math.ceil(largIdeale / 2) * 2);
  const moule: MoldSpec = { forme: "rectangle", longueurCm, largeurCm, hauteurCm: h };
  const volumeMouleCm3 = moldVolumeCm3(moule);
  const partsObtenues = Math.max(1, Math.round(volumeMouleCm3 / volPart));
  return {
    moule,
    formatLabel: describeMold(moule),
    volumeRequisCm3,
    volumeMouleCm3,
    dimensionIdealeCm: `${fmtCm(longIdeale)} × ${fmtCm(largIdeale)} cm théorique`,
    partsObtenues,
    conseilDecoupe: cuttingGuide(moule, partsObtenues),
  };
}

/** Ligne d'ingrédient ou d'élément de l'estimateur en DA. */
export type EstimatorIngredient = {
  id: string;
  nom: string;
  /** Quantité pour la recette de base. */
  qteBase: number;
  unite: string;
  /** Prix unitaire HT en DA ; `null` ou `<= 0` = prix inconnu → coût incomplet. */
  puHt: number | null;
  /** Taux de parage RC-01 (%). */
  paragePct: number;
  /** true = varie avec le moule / les parts ; false = quantité fixe par gâteau (ex. topper, support). */
  redimensionnable: boolean;
};

export type EstimatorInput = {
  modeleNom: string;
  /** Nombre de parts/pièces de la recette de base (pour le facteur d'échelle). */
  partsBase: number;
  /** Nombre de parts/pièces cibles (ou issu du moule choisi). */
  partsCibles: number;
  /** Volume du moule de base et du moule cible (optionnels : si fournis, l'échelle suit le volume). */
  volumeBaseCm3?: number | null;
  volumeCibleCm3?: number | null;
  /** Perte cuisson / parage final RC-02 (%). */
  pertePct: number;
  /** Temps de travail en minutes (pour le format cible). */
  moMin: number;
  /** Taux horaire RC-04 (DA/h). */
  tauxHoraire: number;
  /** Charges sociales/patronales RC-04 (%). */
  chargesPct: number;
  /** Emballage / boîte / support fixe par commande (DA HT). */
  emballageFixe: number;
  /** Énergie + cuisson (DA HT). */
  energie: number;
  /** Frais généraux d'atelier (DA HT). */
  fraisGeneraux: number;
  /** Coefficient multiplicateur souhaité pour le prix HT proposé (ex. 2.6). */
  coefficientCible: number;
  /** Prix de vente HT testé (optionnel : sinon utilise le prix HT proposé). */
  prixHtSaisi?: number | null;
  /** Coût de référence optionnel pour les garde-fous RC-10. */
  coutReference?: number | null;
  lignes: EstimatorIngredient[];
};

export type EstimatorLineResult = {
  id: string;
  nom: string;
  unite: string;
  redimensionnable: boolean;
  qteAjustee: number;
  qteAvecParage: number;
  puHt: number | null;
  coutLigne: number;
  prixManquant: boolean;
};

export type EstimatorResult = {
  facteurEchelle: number;
  lignes: EstimatorLineResult[];
  /** Matières dont la quantité suit le moule / les parts (DA HT). */
  coutMatieresVariables: number;
  /** Composants de recette fixes par gâteau (DA HT). */
  coutComposantsFixes: number;
  /** Total matières RC-01 (variables + fixes, DA HT). */
  coutMatieres: number;
  /** Emballage + énergie + frais généraux (DA HT). */
  coutFraisFixes: number;
  /** Main-d'œuvre chargée RC-04 (DA HT). */
  coutMo: number;
  /** Coût complet RC-03 (hors TVA, DA HT). */
  coutComplet: number;
  /** Parts / unités réellement vendables après perte RC-02. */
  rendementNet: number;
  /** Coût complet par part/unité vendable RC-05 (hors TVA, DA HT). */
  coutParPartVendable: number;
  /** Coût matière seul par part/unité vendable (DA HT). */
  matiereParPartVendable: number;
  /** true si au moins une ligne n'a pas de prix valide : interdit tout prix plancher/conseillé. */
  coutIncomplet: boolean;
  lignesSansPrix: string[];
  /** Prix HT proposé pour la commande entière (null si coût incomplet). */
  prixHtPropose: number | null;
  /** Prix HT proposé par part vendable (null si coût incomplet). */
  prixParPartHtPropose: number | null;
  /** Marge HT et taux de marge RC-06 (null si coût incomplet ou prix nul). */
  margeCommandeHt: number | null;
  margeParPartHt: number | null;
  tauxMargePct: number | null;
  gardeFous: GardeFou[];
};

/** Calcule l'estimation complète en DA selon RC-01..RC-10. */
export function computeEstimationDa(input: EstimatorInput): EstimatorResult {
  const partsBase = requireRange(input.partsBase, "Parts de base", 1, 10_000);
  const partsCibles = requireRange(input.partsCibles, "Parts cibles", 1, 10_000);
  const pertePct = requireRange(input.pertePct, "Perte cuisson/découpe (%)", 0, 95);
  const moMin = requireRange(input.moMin, "Durée de travail (min)", 0, 100_000);
  const tauxHoraire = requireRange(input.tauxHoraire, "Taux horaire (DA)", 0, 1_000_000);
  const chargesPct = requireRange(input.chargesPct, "Charges (%)", 0, 1000);
  const emballageFixe = requireRange(input.emballageFixe, "Emballage fixe (DA)", 0, 100_000_000);
  const energie = requireRange(input.energie, "Énergie (DA)", 0, 100_000_000);
  const fraisGeneraux = requireRange(input.fraisGeneraux, "Frais généraux (DA)", 0, 100_000_000);
  const coeff = requireRange(input.coefficientCible, "Coefficient cible", 1, 20);

  if (!Array.isArray(input.lignes) || input.lignes.length === 0 || input.lignes.length > 60) {
    throw new Error("Ajoutez entre 1 et 60 lignes d’ingrédients.");
  }

  const useVolume =
    input.volumeBaseCm3 != null &&
    input.volumeBaseCm3 > 0 &&
    input.volumeCibleCm3 != null &&
    input.volumeCibleCm3 > 0;
  const rawScale = useVolume
    ? input.volumeCibleCm3! / input.volumeBaseCm3!
    : partsCibles / partsBase;
  const facteurEchelle = round4(rawScale);

  const lignes: EstimatorLineResult[] = [];
  let matVar = 0;
  let matFix = 0;
  const lignesSansPrix: string[] = [];

  for (const l of input.lignes) {
    const nom = String(l.nom ?? "").trim();
    if (!nom) throw new Error("Chaque ingrédient doit avoir un nom.");
    const qBase = requireRange(l.qteBase, `Quantité (${nom})`, 0.0001, 1_000_000);
    const parage = requireRange(l.paragePct, `Parage (${nom})`, 0, 500);
    const qteAjustee = round4(l.redimensionnable ? qBase * rawScale : qBase);
    const qteAvecParage = rc01Consommation(qteAjustee, parage);
    const prixManquant = l.puHt === null || !Number.isFinite(l.puHt) || l.puHt <= 0;
    if (prixManquant) {
      lignesSansPrix.push(nom);
      lignes.push({
        id: l.id,
        nom,
        unite: l.unite,
        redimensionnable: l.redimensionnable,
        qteAjustee,
        qteAvecParage,
        puHt: null,
        coutLigne: 0,
        prixManquant: true,
      });
    } else {
      const pu = requireRange(l.puHt!, `Prix (${nom})`, 0.01, 100_000_000);
      const coutLigne = round2(qteAvecParage * pu);
      if (l.redimensionnable) matVar += coutLigne;
      else matFix += coutLigne;
      lignes.push({
        id: l.id,
        nom,
        unite: l.unite,
        redimensionnable: l.redimensionnable,
        qteAjustee,
        qteAvecParage,
        puHt: pu,
        coutLigne,
        prixManquant: false,
      });
    }
  }

  const coutMatieresVariables = round2(matVar);
  const coutComposantsFixes = round2(matFix);
  const coutMatieres = round2(coutMatieresVariables + coutComposantsFixes);
  const coutFraisFixes = round2(emballageFixe + energie + fraisGeneraux);
  const coutMo = rc04MoChargee(moMin, tauxHoraire, chargesPct);
  const coutComplet = rc03CoutTotal(coutMatieres, emballageFixe, coutMo, energie, fraisGeneraux);
  const rendementNet = rc02RendementNet(partsCibles, pertePct);
  const coutParPartVendable = rc05CoutParPortion(coutComplet, rendementNet);
  const matiereParPartVendable = rc05CoutParPortion(coutMatieres, rendementNet);
  const coutIncomplet = lignesSansPrix.length > 0;

  let prixHtPropose: number | null = null;
  let prixParPartHtPropose: number | null = null;
  let margeCommandeHt: number | null = null;
  let margeParPartHt: number | null = null;
  let tauxMargePct: number | null = null;

  // Règle impérative : une estimation partielle ne devient jamais un prix conseillé ou plancher.
  if (!coutIncomplet) {
    const autoHt = round2(coutComplet * coeff);
    const retenu =
      input.prixHtSaisi != null && Number.isFinite(input.prixHtSaisi) && input.prixHtSaisi > 0
        ? round2(input.prixHtSaisi)
        : autoHt;
    prixHtPropose = retenu;
    prixParPartHtPropose = round2(retenu / rendementNet);
    const mCmd = rc06Marge(retenu, coutComplet);
    margeCommandeHt = mCmd.marge;
    margeParPartHt = round2(mCmd.marge / rendementNet);
    tauxMargePct = round2(mCmd.taux * 100);
  }

  const gardeFous = rc10GardeFous(
    coutComplet,
    input.coutReference ?? null,
    prixHtPropose,
    !coutIncomplet && coutComplet > 0 ? round2(coutComplet * coeff) : null,
  );

  return {
    facteurEchelle,
    lignes,
    coutMatieresVariables,
    coutComposantsFixes,
    coutMatieres,
    coutFraisFixes,
    coutMo,
    coutComplet,
    rendementNet,
    coutParPartVendable,
    matiereParPartVendable,
    coutIncomplet,
    lignesSansPrix,
    prixHtPropose,
    prixParPartHtPropose,
    margeCommandeHt,
    margeParPartHt,
    tauxMargePct,
    gardeFous,
  };
}

export type EstimatorPreset = {
  id: "entremets-20" | "anniversaire" | "coffret";
  titre: string;
  sousTitre: string;
  mouleBase: MoldSpec;
  volumePartCm3: number;
  partsBase: number;
  pertePct: number;
  moMinBase: number;
  tauxHoraire: number;
  chargesPct: number;
  emballageFixe: number;
  energie: number;
  fraisGeneraux: number;
  coefficientCible: number;
  lignes: EstimatorIngredient[];
};

/**
 * Trois modèles locaux illustratifs en DA (valeurs d'exemple modifiables,
 * pas un barème réglementaire ni une mercuriale officielle).
 */
export const ESTIMATOR_PRESETS: readonly EstimatorPreset[] = [
  {
    id: "entremets-20",
    titre: "Entremets chocolat-praliné",
    sousTitre: "Référence 20 parts · cercle Ø 30 cm × 4,5 cm",
    mouleBase: { forme: "rond", diametreCm: 30, hauteurCm: 4.5 },
    volumePartCm3: 150,
    partsBase: 20,
    pertePct: 5,
    moMinBase: 95,
    tauxHoraire: 500,
    chargesPct: 25,
    emballageFixe: 350,
    energie: 180,
    fraisGeneraux: 250,
    coefficientCible: 2.5,
    lignes: [
      { id: "choco", nom: "Chocolat noir couverture", qteBase: 0.65, unite: "kg", puHt: 2200, paragePct: 2, redimensionnable: true },
      { id: "creme", nom: "Crème liquide 35 %", qteBase: 0.9, unite: "L", puHt: 950, paragePct: 3, redimensionnable: true },
      { id: "beurre", nom: "Beurre pâtissier", qteBase: 0.45, unite: "kg", puHt: 1400, paragePct: 2, redimensionnable: true },
      { id: "praline", nom: "Praliné amande-noisette", qteBase: 0.4, unite: "kg", puHt: 2600, paragePct: 2, redimensionnable: true },
      { id: "biscuit", nom: "Œufs, sucre & farine (dacquoise)", qteBase: 0.8, unite: "kg", puHt: 420, paragePct: 0, redimensionnable: true },
      { id: "plaquette", nom: "Plaquette chocolat & décor finition", qteBase: 1, unite: "pcs", puHt: 220, paragePct: 0, redimensionnable: false },
    ],
  },
  {
    id: "anniversaire",
    titre: "Gâteau d’anniversaire fruits rouges",
    sousTitre: "Layer cake haut · cercle Ø 22 cm × 8 cm (20 parts)",
    mouleBase: { forme: "rond", diametreCm: 22, hauteurCm: 8 },
    volumePartCm3: 150,
    partsBase: 20,
    pertePct: 6,
    moMinBase: 120,
    tauxHoraire: 500,
    chargesPct: 25,
    emballageFixe: 480,
    energie: 200,
    fraisGeneraux: 300,
    coefficientCible: 2.6,
    lignes: [
      { id: "genoise", nom: "Base génoise (œufs, farine, sucre)", qteBase: 1.1, unite: "kg", puHt: 380, paragePct: 4, redimensionnable: true },
      { id: "mascarpone", nom: "Mascarpone & crème montée", qteBase: 1.0, unite: "kg", puHt: 1350, paragePct: 3, redimensionnable: true },
      { id: "beurre-anniv", nom: "Beurre doux (crème de lissage)", qteBase: 0.5, unite: "kg", puHt: 1400, paragePct: 2, redimensionnable: true },
      { id: "fruits", nom: "Compotée de fruits rouges", qteBase: 0.55, unite: "kg", puHt: 1200, paragePct: 5, redimensionnable: true },
      { id: "drum-topper", nom: "Semelle épaisse (cake drum) & inscription", qteBase: 1, unite: "pcs", puHt: 380, paragePct: 0, redimensionnable: false },
    ],
  },
  {
    id: "coffret",
    titre: "Coffret soirée amande & pistache",
    sousTitre: "Série à l’unité · 24 pièces assorties",
    mouleBase: { forme: "unites", nbUnites: 24 },
    volumePartCm3: 150,
    partsBase: 24,
    pertePct: 4,
    moMinBase: 90,
    tauxHoraire: 500,
    chargesPct: 25,
    emballageFixe: 420,
    energie: 160,
    fraisGeneraux: 220,
    coefficientCible: 2.4,
    lignes: [
      { id: "amandes", nom: "Amandes mondées moulues", qteBase: 0.75, unite: "kg", puHt: 2100, paragePct: 3, redimensionnable: true },
      { id: "pistaches", nom: "Pistaches concassées", qteBase: 0.2, unite: "kg", puHt: 4200, paragePct: 2, redimensionnable: true },
      { id: "beurre-cof", nom: "Beurre clarifié / smen fin", qteBase: 0.35, unite: "kg", puHt: 1400, paragePct: 0, redimensionnable: true },
      { id: "miel-sucre", nom: "Miel, sucre & eau de fleur d’oranger", qteBase: 0.5, unite: "kg", puHt: 650, paragePct: 0, redimensionnable: true },
      { id: "ruban", nom: "Caissettes & ruban coffret", qteBase: 1, unite: "lot", puHt: 180, paragePct: 0, redimensionnable: false },
    ],
  },
];

// ------------------------------------------------ Brouillon explicite (local)

export const ESTIMATOR_DRAFT_KEY = "patisgest.estimationDraft.v1";

export type EstimatorDraft = {
  version: 1;
  savedAt: string;
  presetId: EstimatorPreset["id"];
  modeleNom: string;
  formatLabel: string;
  conseilDecoupe: string;
  parts: number;
  rendementNet: number;
  pertePct: number;
  moMin: number;
  facteurEchelle: number;
  coutIncomplet: boolean;
  /** Prix HT proposé pour préremplir un nouveau devis ; null si coût incomplet. */
  prixHtPropose: number | null;
  /** Note prête pour Cake Design (format, parts, découpe — sans exposer les coûts internes). */
  noteDevis: string;
};

/** Construit la note métier de devis (consignes format/parts/découpe, aucun coût matière). */
export function formatDraftCakeNote(draft: Pick<EstimatorDraft, "modeleNom" | "formatLabel" | "parts" | "conseilDecoupe">): string {
  const raw = `${draft.modeleNom} · ${draft.formatLabel} (${draft.parts} parts). ${draft.conseilDecoupe}`;
  return raw.slice(0, 480);
}

export function buildEstimatorDraft(params: {
  presetId: EstimatorPreset["id"];
  modeleNom: string;
  formatLabel: string;
  conseilDecoupe: string;
  parts: number;
  pertePct: number;
  moMin: number;
  result: EstimatorResult;
  savedAt?: string;
}): EstimatorDraft {
  const modeleNom = params.modeleNom.trim().slice(0, 100) || "Gâteau sur commande";
  const formatLabel = params.formatLabel.trim().slice(0, 120);
  const conseilDecoupe = params.conseilDecoupe.trim().slice(0, 220);
  const parts = Math.max(1, Math.min(10_000, Math.round(params.parts)));
  return {
    version: 1,
    savedAt: params.savedAt ?? new Date().toISOString(),
    presetId: params.presetId,
    modeleNom,
    formatLabel,
    conseilDecoupe,
    parts,
    rendementNet: params.result.rendementNet,
    pertePct: params.pertePct,
    moMin: params.moMin,
    facteurEchelle: params.result.facteurEchelle,
    coutIncomplet: params.result.coutIncomplet,
    prixHtPropose: params.result.coutIncomplet ? null : params.result.prixHtPropose,
    noteDevis: formatDraftCakeNote({ modeleNom, formatLabel, parts, conseilDecoupe }),
  };
}

export function parseEstimatorDraft(raw: unknown): EstimatorDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<EstimatorDraft>;
  if (d.version !== 1) return null;
  if (typeof d.modeleNom !== "string" || !d.modeleNom.trim()) return null;
  if (typeof d.formatLabel !== "string" || typeof d.noteDevis !== "string") return null;
  if (typeof d.parts !== "number" || !Number.isInteger(d.parts) || d.parts < 1 || d.parts > 10_000) return null;
  if (typeof d.coutIncomplet !== "boolean") return null;
  const prix =
    d.coutIncomplet || d.prixHtPropose == null
      ? null
      : typeof d.prixHtPropose === "number" && Number.isFinite(d.prixHtPropose) && d.prixHtPropose > 0
        ? round2(d.prixHtPropose)
        : null;
  return {
    version: 1,
    savedAt: typeof d.savedAt === "string" ? d.savedAt : new Date(0).toISOString(),
    presetId: d.presetId === "anniversaire" || d.presetId === "coffret" ? d.presetId : "entremets-20",
    modeleNom: d.modeleNom.slice(0, 100),
    formatLabel: d.formatLabel.slice(0, 120),
    conseilDecoupe: typeof d.conseilDecoupe === "string" ? d.conseilDecoupe.slice(0, 220) : "",
    parts: d.parts,
    rendementNet: typeof d.rendementNet === "number" && d.rendementNet > 0 ? d.rendementNet : d.parts,
    pertePct: typeof d.pertePct === "number" && d.pertePct >= 0 ? d.pertePct : 0,
    moMin: typeof d.moMin === "number" && d.moMin >= 0 ? d.moMin : 0,
    facteurEchelle: typeof d.facteurEchelle === "number" && d.facteurEchelle > 0 ? d.facteurEchelle : 1,
    coutIncomplet: d.coutIncomplet,
    prixHtPropose: prix,
    noteDevis: d.noteDevis.slice(0, 480),
  };
}

export function saveEstimatorDraft(draft: EstimatorDraft): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.setItem(ESTIMATOR_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadEstimatorDraft(): EstimatorDraft | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(ESTIMATOR_DRAFT_KEY);
    if (!raw) return null;
    return parseEstimatorDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearEstimatorDraft(): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(ESTIMATOR_DRAFT_KEY);
  } catch {
    // ignore
  }
}
