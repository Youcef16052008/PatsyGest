import "server-only";
import type { createClient } from "./supabase/server";
import { plusJours, type CatalogProduct, type ProductionItem, type SaleSummary, type StockArticle, type StockLot, type WorkspaceSite } from "./workspace-data";

export type WorkspaceDB = Awaited<ReturnType<typeof createClient>>;

type Rows<T> = { data: T[] | null; error: unknown };
const PAGE_SIZE = 500;
// Les quantités et indicateurs ne doivent pas se fonder sur les 100 premières
// lignes. En cas d'échec d'une page, ne jamais présenter un stock partiel à 0.
async function lirePages<T>(page: (debut: number, fin: number) => PromiseLike<Rows<T>>): Promise<T[] | null> {
  const result: T[] = [];
  for (let offset = 0; offset < 20000; offset += PAGE_SIZE) {
    const { data, error } = await page(offset, offset + PAGE_SIZE - 1);
    if (error || !data) return null;
    result.push(...data);
    if (data.length < PAGE_SIZE) return result;
  }
  return null;
}

export type ArticleRow = StockArticle & { pv_ht: number; tva: number; allergenes: string[]; traces: string[] };
export function lireArticles(db: WorkspaceDB, clientId: string, seulementProduits = false) {
  return lirePages<ArticleRow>((start, end) => {
    let select = db.from("articles").select("id, nom, code, niveau, unite, seuil, pv_ht, tva, allergenes, traces").eq("client_id", clientId);
    if (seulementProduits) select = select.eq("niveau", "produit");
    return select.order("nom").order("id").range(start, end).overrideTypes<ArticleRow[], { merge: false }>();
  });
}
export const articleAffiche = (a: ArticleRow): StockArticle => ({ id: a.id, nom: a.nom, code: a.code, niveau: a.niveau, unite: a.unite, seuil: Number(a.seuil) });
export const produitCaisse = (a: ArticleRow): CatalogProduct => ({ id: a.id, label: a.nom, code: a.code, unit: a.unite, prixHT: Number(a.pv_ht), tva: Number(a.tva) });

export async function lireSites(db: WorkspaceDB, clientId: string): Promise<WorkspaceSite[] | null> {
  const rows = await lirePages<{ id: string; nom: string; type: string }>((start, end) => db.from("sites").select("id, nom, type")
    .eq("client_id", clientId).order("nom").order("id").range(start, end));
  return rows?.map(({ id, nom, type }) => ({ id, label: nom, type })) ?? null;
}

export async function lireLots(db: WorkspaceDB, clientId: string): Promise<StockLot[] | null> {
  type LotRow = { id: string; article_id: string; site_id: string; numero: string; qte_rest: number; dlc: string | null; bloque: boolean; congele: boolean; date_reception: string };
  const rows = await lirePages<LotRow>((start, end) => db.from("lots").select("id, article_id, site_id, numero, qte_rest, dlc, bloque, congele, date_reception")
    .eq("client_id", clientId).gt("qte_rest", 0).order("id").range(start, end));
  return rows?.map(l => ({ id: l.id, articleId: l.article_id, siteId: l.site_id, numero: l.numero, qte: Number(l.qte_rest), dlc: l.dlc, bloque: l.bloque, congele: l.congele, recu: l.date_reception })) ?? null;
}

export async function lireProduction(db: WorkspaceDB, clientId: string, sites: WorkspaceSite[] | null, apercu?: string): Promise<ProductionItem[] | null> {
  type OrderRow = { id: string; numero: string; statut: string; qte_prevue: number; qte_realisee: number; date_prevue: string; site_id: string; titre: string | null };
  const rows = await lirePages<OrderRow>((start, end) => {
    // Ne pas charger le snapshot complet (ingrédients/coûts) pour le tableau.
    let select = db.from("ordres_fabrication").select("id, numero, statut, qte_prevue, qte_realisee, date_prevue, site_id, titre:snapshot->>recette").eq("client_id", clientId);
    if (apercu) select = select.or(`statut.in.(planifie,encours,partiel),date_prevue.gte.${plusJours(apercu, -6)}`);
    return select.order("date_prevue").order("id").range(start, end).overrideTypes<OrderRow[], { merge: false }>();
  });
  const noms = new Map(sites?.map(s => [s.id, s.label]));
  return rows?.map(o => ({ id: o.id, numero: o.numero, title: o.titre || "Fabrication", statut: o.statut, planned: Number(o.qte_prevue), done: Number(o.qte_realisee), date: o.date_prevue ?? "", site: noms.get(o.site_id) ?? "" })) ?? null;
}

export async function lireVentesJours(db: WorkspaceDB, clientId: string, today: string) {
  type Row = { date_vente: string; total_ttc: number };
  const rows = await lirePages<Row>((start, end) => db.from("ventes").select("date_vente, total_ttc").eq("client_id", clientId)
    .gte("date_vente", plusJours(today, -13)).lte("date_vente", today).order("id").range(start, end));
  return rows?.map(v => ({ date: v.date_vente, totalTTC: Number(v.total_ttc) })) ?? null;
}

export async function lireHistoriqueCaisse(db: WorkspaceDB, clientId: string, articles: readonly StockArticle[], sites: readonly WorkspaceSite[]): Promise<SaleSummary[] | null> {
  const result = await db.from("ventes").select("id, source, site_id, date_vente, created_at, total_ttc, lignes").eq("client_id", clientId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(40);
  if (result.error) return null;
  const produits = new Map(articles.map(a => [a.id, a]));
  const lieux = new Map(sites.map(s => [s.id, s.label]));
  return (result.data ?? []).map(v => ({
    id: String(v.id), date: String(v.date_vente ?? v.created_at), site: lieux.get(v.site_id) ?? "",
    totalTTC: Number(v.total_ttc), source: v.source,
    items: (Array.isArray(v.lignes) ? v.lignes : []).flatMap(l => {
      if (!l || typeof l !== "object") return [];
      const qte = Number(l.qty);
      if (!Number.isFinite(qte) || qte <= 0) return [];
      const product = produits.get(l.articleId);
      return [{ name: product?.nom ?? "Produit non répertorié", quantity: qte, unit: product?.unite }];
    }),
  }));
}
