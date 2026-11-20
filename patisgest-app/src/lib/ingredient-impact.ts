/**
 * Impact d'une hausse (ou variation) de prix d'achat sur les recettes actives,
 * y compris via leurs sous-recettes / préparations communes (type Gramme).
 *
 * Principes :
 *  - Expansion récursive bornée à 3 générations (anti-cycle), avec parage RC-01
 *    et conversions d'unités directes/inverses (parité `patisgest_besoins_de_version`).
 *  - Présente côte à côte :
 *      1. Le coût aux lots utilisables (FEFO éligible, hors bloqués et hors périmés)
 *         — un ancien lot couvrant la fournée n'a pas subi la hausse.
 *      2. L'estimation au prochain achat (ancien → nouveau prix unitaire validé)
 *         — écart par série et effet par part/unité vendable (après perte RC-02).
 *  - Source explicite de chaque prix (réception fournisseur, lot FEFO, saisie).
 *  - Jamais de modification rétroactive des devis acceptés ni des prix catalogue ;
 *    si un coût est partiel (lot manquant / prix inconnu), aucun prix conseillé n'est émis.
 */

import {
  rc02RendementNet,
  rc03CoutTotal,
  rc04MoChargee,
  rc05CoutParPortion,
  rc06Marge,
  rc10GardeFous,
  type GardeFou,
} from "./cost-sheet.ts";
import { computeFefoCost, type FefoLot } from "./fefo-cost.ts";
import { jourLocal } from "./workspace-data.ts";

export type UnitConversion = {
  uniteFrom: string;
  uniteTo: string;
  facteur: number;
};

export type ImpactRecipeLine = {
  articleId?: string;
  code?: string;
  q: number;
  u?: string;
  parage?: number;
  subVersionId?: string;
  nom?: string;
};

export type ImpactRecipeVersion = {
  id: string;
  familleId: string;
  familleCode: string;
  familleNom: string;
  produitId: string | null;
  produitCode?: string;
  produitNom?: string;
  pvHt: number;
  version: number;
  active: boolean;
  rendementQte: number;
  rendementUnite: string;
  cuissonPct: number;
  moMin: number;
  tauxHoraire: number;
  chargesPct: number;
  emballage: number;
  energie: number;
  fraisGeneraux: number;
  ingredients: ImpactRecipeLine[];
};

export type ImpactArticle = {
  id: string;
  code: string;
  nom: string;
  unite: string;
};

export type ExpandedIngredientNeed = {
  articleId: string;
  code: string;
  nom: string;
  unite: string;
  qty: number;
  /** Quantité utilisée directement dans la recette de tête. */
  directQty: number;
  /** Quantité issue de sous-recettes. */
  subQty: number;
  /** Noms des sous-recettes qui amènent cet ingrédient. */
  viaSubRecipes: string[];
};

export type PriceSourceEntry = {
  pu: number;
  date: string;
  source: string;
  kind: "reception" | "lot" | "saisie";
};

export type RecipeImpactRow = {
  versionId: string;
  familleId: string;
  familleCode: string;
  familleNom: string;
  version: number;
  produitId: string | null;
  pvHt: number;
  rendementBrut: number;
  rendementNet: number;
  rendementUnite: string;
  /** Quantité totale de l'ingrédient consommée par série (parage + sous-recettes inclus). */
  qteIngredient: number;
  uniteIngredient: string;
  usage: "direct" | "sous-recette" | "mixte";
  viaSubRecipes: string[];
  /** Variation liée à l'ingrédient seul (nouveauPu − ancienPu) × qteIngredient. */
  deltaSerie: number;
  /** Effet par part / unité vendable (deltaSerie ÷ rendementNet). */
  deltaParPart: number;
  deltaParPartExact: number;
  /** Colonne 1 : valorisation aux lots FEFO éligibles actuels. */
  lots: {
    coutIngredientSerie: number;
    couvertIngredient: number;
    stockCouvreSerie: boolean;
    /** true si le stock éligible couvre la série à un prix moyen < nouveauPu. */
    ancienLotProtege: boolean;
    coutCompletSerie: number;
    coutParPart: number;
    margeParPartHt: number | null;
    tauxMargePct: number | null;
    /** true si au moins un ingrédient de la recette manque de stock/prix FEFO. */
    coutPartiel: boolean;
    ingredientsPartiels: string[];
    perimeExcluIngredient: number;
  };
  /** Colonne 2 : estimation au prochain achat (l'ingrédient valorisé à `nouveauPu`). */
  prochainAchat: {
    ancienCoutIngredientSerie: number;
    nouveauCoutIngredientSerie: number;
    /** Coût complet de la série en remplaçant le coût de l'ingrédient par `nouveauPu × qte`. */
    coutCompletSerie: number;
    coutParPart: number;
    /** Écart par part vendable entre prochain achat et lots actuellement en stock. */
    ecartVsLotsParPart: number;
    margeParPartHt: number | null;
    tauxMargePct: number | null;
    /** PV HT permettant de conserver la marge unitaire d'avant hausse ; null si coût partiel ou PV nul. */
    pvHtMaintienMarge: number | null;
    /** true si d'autres ingrédients de la recette n'ont pas de coût complet connu. */
    autresIngredientsPartiels: boolean;
  };
  gardeFous: GardeFou[];
};

export type IngredientImpactReport = {
  article: ImpactArticle;
  ancienPu: number;
  sourceAncien: string;
  nouveauPu: number;
  sourceNouveau: string;
  ecartUnitaire: number;
  variationPct: number | null;
  asOf?: string;
  recettes: RecipeImpactRow[];
  conversionsManquantes: string[];
};

const MAX_DEPTH = 3;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;
const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;

/** Conversion d'unité identique à `patisgest_convertir` (identité, directe, inverse). */
export function convertUnitQty(
  qty: number,
  fromUnit: string | undefined,
  toUnit: string,
  conversions: readonly UnitConversion[],
): number | null {
  if (!fromUnit || fromUnit === toUnit) return qty;
  const direct = conversions.find((c) => c.uniteFrom === fromUnit && c.uniteTo === toUnit);
  if (direct && direct.facteur > 0) return round6(qty * direct.facteur);
  const inverse = conversions.find((c) => c.uniteFrom === toUnit && c.uniteTo === fromUnit);
  if (inverse && inverse.facteur > 0) return round6(qty / inverse.facteur);
  return null;
}

/**
 * Développe les besoins matières d'une version de recette (parage RC-01,
 * conversions d'unités et sous-recettes jusqu'à 3 générations, anti-cycle).
 */
export function expandRecipeNeeds(params: {
  version: ImpactRecipeVersion;
  allVersions: readonly ImpactRecipeVersion[];
  articles: readonly ImpactArticle[];
  conversions?: readonly UnitConversion[];
  scale?: number;
}): { needs: ExpandedIngredientNeed[]; missingConversions: string[] } {
  const { version, allVersions, articles, conversions = [], scale = 1 } = params;
  const verById = new Map(allVersions.map((v) => [v.id, v]));
  const artById = new Map(articles.map((a) => [a.id, a]));
  const artByCode = new Map(articles.map((a) => [a.code, a]));
  const acc = new Map<string, ExpandedIngredientNeed>();
  const missingConversions: string[] = [];

  function walk(
    current: ImpactRecipeVersion,
    curScale: number,
    depth: number,
    ancestors: Set<string>,
    topSubLabel: string | null,
  ) {
    if (depth > MAX_DEPTH) return;
    for (const line of current.ingredients ?? []) {
      const q = Number(line.q);
      if (!Number.isFinite(q) || q <= 0) continue;

      if (line.articleId || line.code) {
        const art = line.articleId ? artById.get(line.articleId) : line.code ? artByCode.get(line.code) : undefined;
        if (!art) continue;
        const parage = Math.max(0, Number(line.parage ?? 0));
        let qty = q * (1 + parage / 100);
        if (line.u && line.u !== art.unite) {
          const conv = convertUnitQty(qty, line.u, art.unite, conversions);
          if (conv === null) {
            missingConversions.push(`${line.u} → ${art.unite} (${art.code})`);
            continue;
          }
          qty = conv;
        }
        const scaled = round4(qty * curScale);
        const prev = acc.get(art.id);
        if (!prev) {
          acc.set(art.id, {
            articleId: art.id,
            code: art.code,
            nom: art.nom,
            unite: art.unite,
            qty: scaled,
            directQty: topSubLabel === null ? scaled : 0,
            subQty: topSubLabel !== null ? scaled : 0,
            viaSubRecipes: topSubLabel ? [topSubLabel] : [],
          });
        } else {
          prev.qty = round4(prev.qty + scaled);
          if (topSubLabel === null) prev.directQty = round4(prev.directQty + scaled);
          else {
            prev.subQty = round4(prev.subQty + scaled);
            if (!prev.viaSubRecipes.includes(topSubLabel)) prev.viaSubRecipes.push(topSubLabel);
          }
        }
      } else if (line.subVersionId) {
        if (depth >= MAX_DEPTH) continue;
        const sub = verById.get(line.subVersionId);
        if (!sub || ancestors.has(sub.familleId) || !(sub.rendementQte > 0)) continue;
        let subQty = q;
        if (line.u && line.u !== sub.rendementUnite) {
          const conv = convertUnitQty(subQty, line.u, sub.rendementUnite, conversions);
          if (conv === null) {
            missingConversions.push(`${line.u} → ${sub.rendementUnite} (${sub.familleNom})`);
            continue;
          }
          subQty = conv;
        }
        const label = topSubLabel ?? `${sub.familleNom} v${sub.version}`;
        const nextAncestors = new Set(ancestors);
        nextAncestors.add(sub.familleId);
        walk(sub, (subQty / sub.rendementQte) * curScale, depth + 1, nextAncestors, label);
      }
    }
  }

  walk(version, scale, 0, new Set([version.familleId]), null);
  return { needs: [...acc.values()], missingConversions };
}

/**
 * Construit la liste ordonnée (plus récent d'abord) des prix d'achat connus
 * d'un ingrédient avec leur source lisible, pour préremplir ancien/nouveau prix.
 */
export function buildPriceMercuriale(params: {
  articleId: string;
  history?: readonly { articleId: string; datePrix: string; pu: number; fournisseurNom?: string }[];
  lots?: readonly (FefoLot & { articleId: string; numero: string; fournisseurNom?: string })[];
  asOf?: string;
}): {
  entries: PriceSourceEntry[];
  lotFefoActif: PriceSourceEntry | null;
  defaultAncien: PriceSourceEntry | null;
  defaultNouveau: PriceSourceEntry | null;
} {
  // F-17 : sans date, les lots périmés seraient valorisés comme disponibles.
  const { articleId, history = [], lots = [], asOf = jourLocal() } = params;
  const receptions: PriceSourceEntry[] = history
    .filter((h) => h.articleId === articleId && Number.isFinite(h.pu) && h.pu > 0)
    .sort((a, b) => (a.datePrix === b.datePrix ? 0 : a.datePrix < b.datePrix ? 1 : -1))
    .map((h) => ({
      pu: round2(h.pu),
      date: h.datePrix,
      source: h.fournisseurNom
        ? `Réception du ${h.datePrix} (${h.fournisseurNom})`
        : `Réception du ${h.datePrix}`,
      kind: "reception",
    }));

  const artLots = lots.filter((l) => l.articleId === articleId);
  const fefoProbe = artLots.length > 0 ? computeFefoCost(artLots, 0.0001, asOf) : null;
  const firstLot = fefoProbe?.lignes[0]
    ? artLots.find((l) => l.id === fefoProbe.lignes[0].lotId)
    : undefined;
  const lotFefoActif: PriceSourceEntry | null = firstLot
    ? {
        pu: round2(firstLot.pu),
        date: firstLot.date_reception ?? "",
        source: `1er lot FEFO utilisable (${firstLot.numero}${firstLot.dlc ? `, DLC ${firstLot.dlc}` : ""})`,
        kind: "lot",
      }
    : null;

  const lotEntries: PriceSourceEntry[] = artLots
    .filter((l) => !l.bloque && l.qte_rest > 0 && l.pu > 0 && (!asOf || !l.dlc || l.dlc >= asOf))
    .sort((a, b) => ((a.date_reception ?? "") < (b.date_reception ?? "") ? 1 : -1))
    .map((l) => ({
      pu: round2(l.pu),
      date: l.date_reception ?? "",
      source: `Lot ${l.numero}${l.fournisseurNom ? ` · ${l.fournisseurNom}` : ""}`,
      kind: "lot",
    }));

  const entries = [...receptions, ...lotEntries];

  let defaultAncien: PriceSourceEntry | null = null;
  let defaultNouveau: PriceSourceEntry | null = null;
  if (receptions.length >= 2) {
    defaultNouveau = receptions[0];
    defaultAncien = receptions.find((r) => r.pu !== receptions[0].pu) ?? receptions[1];
  } else if (receptions.length === 1 && lotFefoActif && lotFefoActif.pu !== receptions[0].pu) {
    defaultNouveau = receptions[0];
    defaultAncien = lotFefoActif;
  } else if (lotFefoActif) {
    defaultAncien = lotFefoActif;
    defaultNouveau = {
      pu: round2(lotFefoActif.pu * 1.15),
      date: asOf ?? "",
      source: "Simulation prochain achat (+15 %)",
      kind: "saisie",
    };
  } else if (receptions.length === 1) {
    defaultAncien = receptions[0];
    defaultNouveau = {
      pu: round2(receptions[0].pu * 1.15),
      date: asOf ?? "",
      source: "Simulation prochain achat (+15 %)",
      kind: "saisie",
    };
  }

  return { entries, lotFefoActif, defaultAncien, defaultNouveau };
}

/**
 * Calcule l'impact d'un changement de prix (`ancienPu` → `nouveauPu`) d'un
 * ingrédient sur toutes les recettes actives qui le consomment (directement ou
 * via sous-recette), en séparant coût des lots utilisables et prochain achat.
 */
export function computeIngredientImpact(params: {
  article: ImpactArticle;
  ancienPu: number;
  sourceAncien: string;
  nouveauPu: number;
  sourceNouveau: string;
  versions: readonly ImpactRecipeVersion[];
  articles: readonly ImpactArticle[];
  lotsByArticle: ReadonlyMap<string, readonly FefoLot[]>;
  conversions?: readonly UnitConversion[];
  asOf?: string;
}): IngredientImpactReport {
  const {
    article,
    ancienPu,
    sourceAncien,
    nouveauPu,
    sourceNouveau,
    versions,
    articles,
    lotsByArticle,
    conversions = [],
    asOf = jourLocal(),
  } = params;

  if (!Number.isFinite(ancienPu) || ancienPu < 0 || ancienPu > 100_000_000) {
    throw new Error("Ancien prix unitaire invalide.");
  }
  if (!Number.isFinite(nouveauPu) || nouveauPu < 0 || nouveauPu > 100_000_000) {
    throw new Error("Nouveau prix unitaire invalide.");
  }

  const ecartUnitaire = round2(nouveauPu - ancienPu);
  const variationPct = ancienPu > 0 ? round2(((nouveauPu - ancienPu) / ancienPu) * 100) : null;
  const conversionsManquantes = new Set<string>();
  const recettes: RecipeImpactRow[] = [];

  for (const ver of versions) {
    if (!ver.active) continue;
    if (!(ver.rendementQte > 0) || ver.cuissonPct < 0 || ver.cuissonPct >= 100) continue;

    const { needs, missingConversions } = expandRecipeNeeds({
      version: ver,
      allVersions: versions,
      articles,
      conversions,
      scale: 1,
    });
    for (const m of missingConversions) conversionsManquantes.add(m);

    const target = needs.find((n) => n.articleId === article.id);
    if (!target || !(target.qty > 0)) continue;

    const rendementNet = rc02RendementNet(ver.rendementQte, ver.cuissonPct);
    const mo = rc04MoChargee(ver.moMin, ver.tauxHoraire, ver.chargesPct);

    // Valorisation FEFO sur les lots éligibles (hors bloqués et hors périmés si asOf).
    let autresMatieresFefo = 0;
    const autresPartiels: string[] = [];
    let targetFefo = { cout: 0, couvert: 0, insuffisant: true, perimeExclu: 0, sansPrixConnu: 0, insuffisantStock: true };

    for (const need of needs) {
      const lots = lotsByArticle.get(need.articleId) ?? [];
      const fefo = computeFefoCost([...lots], need.qty, asOf);
      if (need.articleId === article.id) {
        targetFefo = fefo;
      } else {
        autresMatieresFefo += fefo.cout;
        if (fefo.insuffisant) autresPartiels.push(need.nom);
      }
    }

    const ingredientsPartiels = targetFefo.insuffisant
      ? [article.nom, ...autresPartiels]
      : [...autresPartiels];
    const coutPartielLots = ingredientsPartiels.length > 0;
    const matiereLots = round2(autresMatieresFefo + targetFefo.cout);
    const coutLotsSerie = rc03CoutTotal(matiereLots, ver.emballage, mo, ver.energie, ver.fraisGeneraux);
    const coutLotsParPart = rc05CoutParPortion(coutLotsSerie, rendementNet);

    // Colonne 2 : prochain achat (ancien vs nouveau prix validé).
    const ancienCoutIng = round2(target.qty * ancienPu);
    const nouveauCoutIng = round2(target.qty * nouveauPu);
    const deltaSerie = round2(target.qty * (nouveauPu - ancienPu));
    const deltaParPartExact = round4(deltaSerie / rendementNet);
    const deltaParPart = round2(deltaSerie / rendementNet);

    const matiereProchain = round2(autresMatieresFefo + nouveauCoutIng);
    const coutProchainSerie = rc03CoutTotal(matiereProchain, ver.emballage, mo, ver.energie, ver.fraisGeneraux);
    const coutProchainParPart = rc05CoutParPortion(coutProchainSerie, rendementNet);

    const autresIngredientsPartiels = autresPartiels.length > 0 || missingConversions.length > 0;
    const pvHt = Number.isFinite(ver.pvHt) && ver.pvHt > 0 ? round2(ver.pvHt) : 0;

    const margeLots = !coutPartielLots && pvHt > 0 ? rc06Marge(pvHt, coutLotsParPart) : null;
    const margeProchain = !autresIngredientsPartiels && pvHt > 0 ? rc06Marge(pvHt, coutProchainParPart) : null;
    const pvHtMaintienMarge =
      !autresIngredientsPartiels && pvHt > 0 ? round2(Math.max(0, pvHt + deltaParPartExact)) : null;

    const stockCouvreSerie = !targetFefo.insuffisant;
    const puMoyenLots = targetFefo.couvert > 0 ? targetFefo.cout / targetFefo.couvert : 0;
    const ancienLotProtege = stockCouvreSerie && nouveauPu > puMoyenLots + 0.005;

    const usage: RecipeImpactRow["usage"] =
      target.directQty > 0 && target.subQty > 0
        ? "mixte"
        : target.subQty > 0
          ? "sous-recette"
          : "direct";

    const gardeFous = rc10GardeFous(
      nouveauPu,
      ancienPu > 0 ? ancienPu : null,
      nouveauPu,
      ancienPu > 0 ? ancienPu : null,
    );

    recettes.push({
      versionId: ver.id,
      familleId: ver.familleId,
      familleCode: ver.familleCode,
      familleNom: ver.familleNom,
      version: ver.version,
      produitId: ver.produitId,
      pvHt,
      rendementBrut: ver.rendementQte,
      rendementNet,
      rendementUnite: ver.rendementUnite,
      qteIngredient: target.qty,
      uniteIngredient: target.unite,
      usage,
      viaSubRecipes: target.viaSubRecipes,
      deltaSerie,
      deltaParPart,
      deltaParPartExact,
      lots: {
        coutIngredientSerie: targetFefo.cout,
        couvertIngredient: targetFefo.couvert,
        stockCouvreSerie,
        ancienLotProtege,
        coutCompletSerie: coutLotsSerie,
        coutParPart: round2(coutLotsParPart),
        margeParPartHt: margeLots ? margeLots.marge : null,
        tauxMargePct: margeLots ? round2(margeLots.taux * 100) : null,
        coutPartiel: coutPartielLots || missingConversions.length > 0,
        ingredientsPartiels,
        perimeExcluIngredient: targetFefo.perimeExclu,
      },
      prochainAchat: {
        ancienCoutIngredientSerie: ancienCoutIng,
        nouveauCoutIngredientSerie: nouveauCoutIng,
        coutCompletSerie: coutProchainSerie,
        coutParPart: round2(coutProchainParPart),
        ecartVsLotsParPart: round2(coutProchainParPart - coutLotsParPart),
        margeParPartHt: margeProchain ? margeProchain.marge : null,
        tauxMargePct: margeProchain ? round2(margeProchain.taux * 100) : null,
        pvHtMaintienMarge,
        autresIngredientsPartiels,
      },
      gardeFous,
    });
  }

  recettes.sort((a, b) => Math.abs(b.deltaParPartExact) - Math.abs(a.deltaParPartExact) || a.familleNom.localeCompare(b.familleNom, "fr"));

  return {
    article,
    ancienPu: round2(ancienPu),
    sourceAncien: (sourceAncien ?? "").trim() || "Prix précédent",
    nouveauPu: round2(nouveauPu),
    sourceNouveau: (sourceNouveau ?? "").trim() || "Nouveau prix",
    ecartUnitaire,
    variationPct,
    asOf,
    recettes,
    conversionsManquantes: [...conversionsManquantes],
  };
}
