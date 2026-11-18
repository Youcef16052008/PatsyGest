import { completeProduction, createProduction, createRecipe, seed, sell, startProduction, type State } from "./patisgest-store";
import { jourUTC, plusJours, type CatalogProduct, type ProductionItem, type SaleSummary, type StockLot, type WorkspaceSite } from "./workspace-data";

export const DEMO_STORAGE_KEY = "patisgest-demo-v1";
export const DEMO_SITES: WorkspaceSite[] = [{ id: "Boutique", label: "Boutique", type: "boutique" }, { id: "Labo", label: "Laboratoire", type: "laboratoire" }];
const photos: Record<string, string> = { eclair: "eclair", "demo-croissant": "croissant", "demo-pain": "pain", "demo-tarte": "tarte" };
export const demoProducts = (state: State): CatalogProduct[] => state.articles.filter(a => a.niveau === "produit").map(a => ({
  id: a.id, label: a.nom, code: a.code, unit: a.unite, prixHT: a.prix, tva: a.tva,
  ...(photos[a.id] && { photo: `/appearance/${photos[a.id]}.webp` }),
})).sort((a, b) => a.label.localeCompare(b.label, "fr"));
export const demoLots = (state: State): StockLot[] => state.lots.map(l => ({
  id: l.id, articleId: l.articleId, siteId: l.site, numero: l.numero, qte: l.qte, dlc: l.dlc || null, bloque: l.bloque, congele: l.congele, recu: l.date,
}));
export const demoOrders = (state: State): ProductionItem[] => state.productions.map(p => ({
  id: p.id, numero: p.numero, title: p.snapshot.name, statut: p.status, planned: p.planned, done: p.completed, date: p.plannedDate ?? p.date, site: "Laboratoire",
}));
export function demoSales(state: State): SaleSummary[] {
  const names = new Map(state.articles.map(a => [a.id, a]));
  return state.sales.slice(0, 40).map(s => ({
    id: s.id, date: s.date, site: "Boutique", items: [{ name: names.get(s.articleId)?.nom ?? "Produit non répertorié", quantity: s.qty, unit: names.get(s.articleId)?.unite }], totalTTC: s.totalTTC,
  }));
}

/** Cas illustratif initial uniquement. N’écrase jamais la démo déjà saisie. */
export function createDemoWorkspace(today = jourUTC()): State {
  let state = structuredClone(seed);
  state.lots = state.lots.map((l, i) => ({ ...l, date: plusJours(today, -i - 15), dlc: plusJours(today, i === 2 ? 3 : 22 - i), qte: l.articleId === "eclair" ? 76 : l.qte }));
  const recetteBase = state.recipes[0].versions[0];
  const produits = [
    { id: "demo-croissant", nom: "Croissant au beurre", code: "PF-002", prix: 120 },
    { id: "demo-pain", nom: "Pain au chocolat", code: "PF-003", prix: 150 },
    { id: "demo-tarte", nom: "Tartelette citron", code: "PF-004", prix: 240 },
  ];
  for (const produit of produits) {
    state.articles.push({ ...produit, niveau: "produit", unite: "pcs", seuil: 10, tva: 19 });
    state.lots.push({ id: `lot-${produit.id}`, articleId: produit.id, site: "Boutique", numero: `${produit.code}-A`, qte: 72,
      pu: produit.prix * .41, dlc: plusJours(today, 10), date: plusJours(today, -15), bloque: false, congele: false });
    state = createRecipe(state, produit.nom, produit.id, recetteBase);
  }
  // Saisies fictives, passées par le moteur de démo plutôt qu’un compteur décoratif.
  for (let i = 13; i >= 0; i--) {
    const produitsBoutique = ["eclair", ...produits.map(p => p.id)];
    for (let j = 0; j < 2 + (i % 3); j++) {
      const taille = 2 + ((i + j * 3) % 5);
      const avant = state.movements.length;
      state = sell(state, produitsBoutique[(i + j) % 4], taille);
      const date = plusJours(today, -i);
      state.sales[0] = { ...state.sales[0], date };
      state.movements = state.movements.map((m, index) => index >= avant ? { ...m, date } : m);
    }
  }
  state = createProduction(state, 24, state.recipes[1].id, today);
  state = createProduction(state, 32, state.recipes[0].id, plusJours(today, 1));
  state = createProduction(state, 28, state.recipes[2].id, today);
  state = startProduction(state, state.productions.at(-1)!.id);
  state = createProduction(state, 18, state.recipes[3].id, today);
  const aFinir = state.productions.at(-1)!;
  state = startProduction(state, aFinir.id);
  state = completeProduction(state, aFinir.id, 18, "TP-DEMO-01", plusJours(today, 7));
  return state;
}
