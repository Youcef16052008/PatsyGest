import {
  addRestockRequest,
  advanceCake,
  completeProduction,
  createCake,
  createProduction,
  createPurchase,
  createRecipe,
  payCake,
  seed,
  sell,
  sellCart,
  startProduction,
  type State,
} from "./patisgest-store.ts";
import {
  buildPriceMercuriale,
  computeIngredientImpact,
  expandRecipeNeeds,
  type ImpactArticle,
  type ImpactRecipeVersion,
  type UnitConversion,
} from "./ingredient-impact.ts";
import type { FefoLot } from "./fefo-cost.ts";
import { computeTomorrowLabPlan, type TomorrowLabPlan } from "./tomorrow-lab.ts";
import { jourLocal, plusJours, type CatalogProduct, type ProductionItem, type SaleSummary, type StockLot, type WorkspaceSite } from "./workspace-data.ts";

export const DEMO_STORAGE_KEY = "patisgest-demo-v1";
export const DEMO_SITES: WorkspaceSite[] = [
  { id: "Boutique", label: "Boutique", type: "boutique" },
  { id: "Labo", label: "Laboratoire", type: "laboratoire" },
];
const photos: Record<string, string> = { eclair: "eclair", "demo-croissant": "croissant", "demo-pain": "pain", "demo-tarte": "tarte" };

export const demoProducts = (state: State): CatalogProduct[] =>
  state.articles
    .filter((a) => a.niveau === "produit")
    .map((a) => ({
      id: a.id,
      label: a.nom,
      code: a.code,
      unit: a.unite,
      prixHT: a.prix,
      tva: a.tva,
      ...(photos[a.id] && { photo: `/appearance/${photos[a.id]}.webp` }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

export const demoLots = (state: State): StockLot[] =>
  state.lots.map((l) => ({
    id: l.id,
    articleId: l.articleId,
    siteId: l.site,
    numero: l.numero,
    qte: l.qte,
    dlc: l.dlc || null,
    bloque: l.bloque,
    congele: l.congele,
    recu: l.date,
  }));

export const demoOrders = (state: State): ProductionItem[] =>
  state.productions.map((p) => ({
    id: p.id,
    numero: p.numero,
    title: p.snapshot.name,
    version: p.snapshot.version,
    devis: state.cakes.find(c => c.ofId === p.id)?.numero ?? null,
    statut: p.status,
    planned: p.planned,
    done: p.completed,
    date: p.plannedDate ?? p.date,
    site: "Laboratoire",
  }));

export function demoSales(state: State): SaleSummary[] {
  const names = new Map(state.articles.map((a) => [a.id, a]));
  return state.sales.slice(0, 50).map((s) => {
    const items =
      s.lines && s.lines.length > 0
        ? s.lines.map((l) => ({
            name: names.get(l.articleId)?.nom ?? "Produit non répertorié",
            quantity: l.qty,
            unit: names.get(l.articleId)?.unite,
          }))
        : [
            {
              name: names.get(s.articleId)?.nom ?? "Produit non répertorié",
              quantity: s.qty,
              unit: names.get(s.articleId)?.unite,
            },
          ];
    return {
      id: s.id,
      numero: s.numero,
      date: s.date,
      site: "Boutique",
      items,
      totalTTC: s.totalTTC,
      source: s.source,
      modePaiement: s.modePaiement ?? null,
    };
  });
}

const DEMO_CONVERSIONS: UnitConversion[] = [
  { uniteFrom: "g", uniteTo: "kg", facteur: 0.001 },
  { uniteFrom: "ml", uniteTo: "L", facteur: 0.001 },
  { uniteFrom: "cl", uniteTo: "L", facteur: 0.01 },
];

/** Construit les versions actives `ImpactRecipeVersion` à partir de l'état de démonstration. */
export function demoImpactVersions(state: State): ImpactRecipeVersion[] {
  const artById = new Map(state.articles.map((a) => [a.id, a]));
  const subVerByProduct = new Map<string, string>();
  for (const r of state.recipes) {
    const v = r.versions.at(-1);
    const art = artById.get(r.productId);
    if (v && art?.niveau === "sous_recette") subVerByProduct.set(art.id, `${r.id}-v${v.version}`);
  }
  return state.recipes.flatMap((r, idx) => {
    const v = r.versions.at(-1);
    const art = artById.get(r.productId);
    if (!v || !art) return [];
    const isSub = art.niveau === "sous_recette";
    return [
      {
        id: `${r.id}-v${v.version}`,
        familleId: r.id,
        familleCode: `REC-${String(idx + 1).padStart(3, "0")}`,
        familleNom: r.name,
        produitId: isSub ? null : art.id,
        produitCode: art.code,
        produitNom: art.nom,
        pvHt: isSub ? 0 : art.prix,
        version: v.version,
        active: true,
        rendementQte: v.baseYield,
        rendementUnite: art.unite,
        cuissonPct: v.lossPercent,
        moMin: v.labourMinutes,
        tauxHoraire: v.hourlyRate,
        chargesPct: v.chargesPercent,
        emballage: v.packaging,
        energie: v.energy,
        fraisGeneraux: v.overhead,
        ingredients: v.ingredients.map((i) => {
          const subVerId = subVerByProduct.get(i.articleId);
          return subVerId
            ? { subVersionId: subVerId, q: i.qty, u: i.unite, parage: i.parage }
            : { articleId: i.articleId, q: i.qty, u: i.unite, parage: i.parage };
        }),
      },
    ];
  });
}

export function demoMercurialeFor(state: State, articleId: string, asOf = jourLocal()) {
  const lots = state.lots
    .filter((l) => l.site === "Labo")
    .map((l) => ({
      id: l.id,
      articleId: l.articleId,
      numero: l.numero,
      qte_rest: l.qte,
      pu: l.pu,
      dlc: l.dlc || null,
      date_reception: l.date,
      congele: l.congele,
      bloque: l.bloque,
      fournisseurNom: l.origin?.type === "purchase" ? l.origin.supplier : undefined,
    }));
  const history = (state.purchases ?? []).map((p) => ({
    articleId: p.articleId,
    datePrix: p.date,
    pu: p.pu,
    fournisseurNom: `${p.fournisseur} (${p.numero})`,
  }));
  return buildPriceMercuriale({ articleId, history, lots, asOf });
}

export function demoIngredientImpact(
  state: State,
  params: { articleId: string; ancienPu: number; sourceAncien: string; nouveauPu: number; sourceNouveau: string; asOf?: string },
) {
  const asOf = params.asOf ?? jourLocal();
  const articles: ImpactArticle[] = state.articles.map((a) => ({ id: a.id, code: a.code, nom: a.nom, unite: a.unite }));
  const target = articles.find((a) => a.id === params.articleId);
  if (!target) throw new Error("Ingrédient introuvable.");
  const lotsByArticle = new Map<string, FefoLot[]>();
  for (const l of state.lots) {
    if (l.site !== "Labo") continue;
    const arr = lotsByArticle.get(l.articleId) ?? [];
    arr.push({
      id: l.id,
      qte_rest: l.qte,
      pu: l.pu,
      dlc: l.dlc || null,
      date_reception: l.date,
      congele: l.congele,
      bloque: l.bloque,
    });
    lotsByArticle.set(l.articleId, arr);
  }
  return computeIngredientImpact({
    article: target,
    ancienPu: params.ancienPu,
    sourceAncien: params.sourceAncien,
    nouveauPu: params.nouveauPu,
    sourceNouveau: params.sourceNouveau,
    versions: demoImpactVersions(state),
    articles,
    lotsByArticle,
    conversions: DEMO_CONVERSIONS,
    asOf,
  });
}

/** Calcule le plan « Demain au labo » à partir de l'état de démonstration. */
export function demoTomorrowPlan(state: State, targetDate: string): TomorrowLabPlan {
  const allVersions = demoImpactVersions(state);
  const verByProduct = new Map(allVersions.flatMap((v) => (v.produitId ? [[v.produitId, v] as const] : [])));
  const articles: ImpactArticle[] = state.articles.map((a) => ({ id: a.id, code: a.code, nom: a.nom, unite: a.unite }));

  const products = state.articles
    .filter((a) => a.niveau === "produit")
    .map((p) => {
      const ver = verByProduct.get(p.id);
      if (!ver) return { id: p.id, code: p.code, nom: p.nom, unite: p.unite, seuil: p.seuil, recipe: null };
      const expanded = expandRecipeNeeds({
        version: ver,
        allVersions,
        articles,
        conversions: DEMO_CONVERSIONS,
      });
      return {
        id: p.id,
        code: p.code,
        nom: p.nom,
        unite: p.unite,
        seuil: p.seuil,
        recipe: {
          recipeId: ver.familleId,
          versionId: ver.id,
          version: ver.version,
          nom: ver.familleNom,
          rendementBrut: ver.rendementQte,
          moMin: ver.moMin,
          besoinsSerie: expanded.needs.map((n) => ({
            articleId: n.articleId,
            code: n.code,
            nom: n.nom,
            unite: n.unite,
            qty: n.qty,
          })),
        },
      };
    });

  const sales = state.sales.map((s) => ({
    date: s.date,
    siteId: "Boutique",
    source: s.source ?? "caisse",
    lignes:
      s.lines && s.lines.length > 0
        ? s.lines.map((l) => ({ articleId: l.articleId, qty: l.qty }))
        : [{ articleId: s.articleId, qty: s.qty }],
  }));

  const restockRequests = (state.restockRequests ?? []).map((r) => ({
    id: r.id,
    targetDate: r.targetDate,
    siteId: r.site,
    siteLabel: r.site,
    articleId: r.articleId,
    qty: r.qty,
    motif: r.motif,
    demandeur: r.demandeur,
    statut: r.status,
    ofNumero: r.ofId ? state.productions.find((o) => o.id === r.ofId)?.numero ?? null : null,
    transfertRef: r.transferId ? state.transfers.find((t) => t.id === r.transferId)?.ref ?? null : null,
  }));

  const confirmedOrders = (state.cakes ?? []).map((c) => {
    const prodTask = c.tasks.find((t) => t.offset === -1);
    return {
      id: c.id,
      numero: c.numero,
      clientNom: c.client,
      eventDate: c.eventDate,
      productionDate: prodTask?.dueDate ?? plusJours(c.eventDate, -1),
      statut: c.status,
      articleId: null,
      qty: c.portions,
      nbParts: c.portions,
      notes: c.notes || null,
    };
  });

  const lots = state.lots.map((l) => ({
    id: l.id,
    articleId: l.articleId,
    siteId: l.site,
    siteRole: (l.site === "Labo" ? "labo" : "boutique") as "labo" | "boutique",
    numero: l.numero,
    qte: l.qte,
    dlc: l.dlc || null,
    bloque: l.bloque,
  }));

  const existingOrders = state.productions.map((o) => ({
    id: o.id,
    numero: o.numero,
    produitId: o.snapshot.productId,
    datePrevue: o.plannedDate ?? o.date,
    statut: o.status,
    qtePrevue: o.planned,
    qteRealisee: o.completed,
    clientRef: o.clientRef ?? null,
  }));

  return computeTomorrowLabPlan({
    targetDate,
    labSiteId: "Labo",
    products,
    sales,
    restockRequests,
    confirmedOrders,
    lots,
    existingOrders,
  });
}

/** Cas illustratif initial uniquement. N’écrase jamais la démo déjà saisie. */
export function createDemoWorkspace(today = jourLocal()): State {
  let state = structuredClone(seed);
  // Sous-recette de démonstration pour illustrer la propagation d'une hausse matière (beurre en g → kg).
  state.articles.push({
    id: "demo-creme",
    code: "SR-001",
    nom: "Crème mousseline vanille",
    niveau: "sous_recette",
    unite: "kg",
    seuil: 2,
    prix: 0,
    tva: 19,
  });
  state.lots = state.lots.map((l, i) => ({
    ...l,
    date: plusJours(today, -i - 15),
    dlc: plusJours(today, i === 2 ? 3 : 22 - i),
    qte: l.articleId === "eclair" ? 76 : l.qte,
  }));
  state = createRecipe(state, "Crème mousseline vanille", "demo-creme", {
    baseYield: 2,
    lossPercent: 4,
    labourMinutes: 25,
    hourlyRate: 500,
    chargesPercent: 25,
    packaging: 0,
    energy: 40,
    overhead: 30,
    ingredients: [
      { articleId: "beurre", qty: 400, parage: 0, unite: "g" },
      { articleId: "sucre", qty: 350, parage: 0, unite: "g" },
      { articleId: "farine", qty: 180, parage: 0, unite: "g" },
    ],
  });

  const produits = [
    {
      id: "demo-croissant",
      nom: "Croissant au beurre",
      code: "PF-002",
      prix: 120,
      recette: {
        baseYield: 24,
        lossPercent: 6,
        labourMinutes: 75,
        hourlyRate: 500,
        chargesPercent: 25,
        packaging: 120,
        energy: 140,
        overhead: 90,
        ingredients: [
          { articleId: "farine", qty: 1.4, parage: 0 },
          { articleId: "beurre", qty: 0.85, parage: 3 },
          { articleId: "sucre", qty: 0.18, parage: 0 },
        ],
      },
    },
    {
      id: "demo-pain",
      nom: "Pain au chocolat",
      code: "PF-003",
      prix: 150,
      recette: {
        baseYield: 20,
        lossPercent: 5,
        labourMinutes: 70,
        hourlyRate: 500,
        chargesPercent: 25,
        packaging: 140,
        energy: 130,
        overhead: 95,
        ingredients: [
          { articleId: "farine", qty: 1.3, parage: 0 },
          { articleId: "beurre", qty: 0.8, parage: 3 },
          { articleId: "sucre", qty: 0.25, parage: 0 },
        ],
      },
    },
    {
      id: "demo-tarte",
      nom: "Tartelette citron",
      code: "PF-004",
      prix: 240,
      recette: {
        baseYield: 16,
        lossPercent: 5,
        labourMinutes: 80,
        hourlyRate: 500,
        chargesPercent: 25,
        packaging: 220,
        energy: 120,
        overhead: 110,
        ingredients: [
          { articleId: "farine", qty: 0.9, parage: 0 },
          { articleId: "beurre", qty: 450, parage: 2, unite: "g" },
          { articleId: "demo-creme", qty: 1.2, parage: 0, unite: "kg" },
        ],
      },
    },
  ];
  for (const produit of produits) {
    state.articles.push({ id: produit.id, nom: produit.nom, code: produit.code, prix: produit.prix, niveau: "produit", unite: "pcs", seuil: 10, tva: 19 });
    state.lots.push({
      id: `lot-${produit.id}`,
      articleId: produit.id,
      site: "Boutique",
      numero: `${produit.code}-A`,
      qte: 72,
      pu: produit.prix * 0.41,
      dlc: plusJours(today, 10),
      date: plusJours(today, -15),
      bloque: false,
      congele: false,
    });
    state = createRecipe(state, produit.nom, produit.id, produit.recette);
  }
  // Ventes fictives sur 14 jours (dont tickets multiproduits et modes de règlement distincts).
  for (let i = 13; i >= 0; i--) {
    const produitsBoutique = ["eclair", ...produits.map((p) => p.id)];
    const date = plusJours(today, -i);
    for (let j = 0; j < 2 + (i % 3); j++) {
      const taille = 2 + ((i + j * 3) % 5);
      const avant = state.movements.length;
      const mode = (i + j) % 3 === 0 ? "cheque_virement" : "especes";
      if (i === 0 && j === 0) {
        state = sellCart(
          state,
          [
            { articleId: "eclair", qty: 3 },
            { articleId: "demo-croissant", qty: 4 },
            { articleId: "demo-tarte", qty: 2 },
          ],
          { modePaiement: "especes", date },
        );
      } else {
        state = sell(state, produitsBoutique[(i + j) % 4], taille, mode);
        state.sales[0] = { ...state.sales[0], date };
        state.movements = state.movements.map((m, index) => (index >= avant ? { ...m, date } : m));
      }
    }
  }
  // Hausse matière illustrative (+15 % sur le beurre au prochain bon de commande).
  state = createPurchase(state, state.suppliers[1], "beurre", 12, 805);
  // Demande boutique + commande Cake Design confirmée pour illustrer « Demain au labo ».
  const tomorrow = plusJours(today, 1);
  state = addRestockRequest(state, {
    targetDate: tomorrow,
    site: "Boutique",
    articleId: "demo-croissant",
    qty: 36,
    motif: "Vitrine du matin + plateau entreprise",
    demandeur: "Boutique",
  });
  state = createCake(state, {
    client: "Famille Benali (démo)",
    telephone: "0550 00 00 00",
    eventDate: plusJours(today, 2),
    portions: 24,
    recipeId: "recette-eclair",
    productionQty: 24,
    priceCents: 1850000,
    options: [{ name: "Fleurs sucre & cake topper", costCents: 180000, minutes: 45 }],
    notes: "Entremets vanille-citron Ø28 cm · retrait 15h",
  });
  const demoCakeId = state.cakes[0].id;
  state = payCake(state, demoCakeId, 600000);
  state = advanceCake(state, demoCakeId, "confirme");

  const recCroissant = state.recipes.find((r) => r.productId === "demo-croissant")!.id;
  const recPain = state.recipes.find((r) => r.productId === "demo-pain")!.id;
  const recTarte = state.recipes.find((r) => r.productId === "demo-tarte")!.id;
  state = createProduction(state, 24, recCroissant, today);
  state = createProduction(state, 32, "recette-eclair", tomorrow);
  state = createProduction(state, 28, recPain, today);
  state = startProduction(state, state.productions.at(-1)!.id);
  state = createProduction(state, 18, recTarte, today);
  const aFinir = state.productions.at(-1)!;
  state = startProduction(state, aFinir.id);
  state = completeProduction(state, aFinir.id, 18, "TP-DEMO-01", plusJours(today, 7));
  return state;
}
