import "server-only";

import { canReadCosts, type Role } from "./auth";
import { expandRecipeNeeds, type ImpactArticle, type ImpactRecipeLine, type ImpactRecipeVersion, type UnitConversion } from "./ingredient-impact";
import {
  computeTomorrowLabPlan,
  type RestockRequestItem,
  type TomorrowConfirmedOrder,
  type TomorrowExistingOf,
  type TomorrowLabPlan,
  type TomorrowLot,
  type TomorrowProduct,
} from "./tomorrow-lab";
import { jourUTC, plusJours, type WorkspaceSite } from "./workspace-data";
import { lireArticles, lireLots, lireSites, lireVentesPeriode, type WorkspaceDB } from "./workspace-read";

export type TomorrowServerBundle = {
  targetDate: string;
  sites: WorkspaceSite[];
  boutiqueSites: WorkspaceSite[];
  labSite: WorkspaceSite | null;
  products: { id: string; code: string; nom: string; unite: string }[];
  restockRequests: RestockRequestItem[];
  /** Plan complet réservé aux rôles autorisés aux recettes (`proprietaire`, `labo`). */
  plan: TomorrowLabPlan | null;
};

/**
 * Charge les données « Demain au labo » en respectant strictement la frontière
 * de rôles : un `vendeur` ne charge ni `recette_versions`, ni `recette_familles`,
 * ni les snapshots d'OF ; il peut soumettre et suivre ses demandes boutique.
 */
export async function lireDemainAuLabo(
  db: WorkspaceDB,
  clientId: string,
  role: Role,
  requestedDate?: string,
): Promise<TomorrowServerBundle> {
  const today = jourUTC();
  const targetDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : plusJours(today, 1);

  const [sitesRaw, articlesRaw, reqRes] = await Promise.all([
    lireSites(db, clientId),
    lireArticles(db, clientId),
    // Si la migration 21 n'est pas encore appliquée, `reqRes.error` est ignoré proprement.
    db
      .from("demandes_reassort")
      .select("id, site_id, article_id, date_cible, qte, motif, demandeur, statut")
      .eq("client_id", clientId)
      .gte("date_cible", today)
      .order("date_cible", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const sites = sitesRaw ?? [];
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const boutiqueSites = sites.filter((s) => s.type === "boutique");
  const labSite = sites.find((s) => s.type === "laboratoire" || s.type === "labo") ?? sites[0] ?? null;
  const articles = articlesRaw ?? [];
  const productRows = articles.filter((a) => a.niveau === "produit");

  const restockRequests: RestockRequestItem[] = reqRes.error
    ? []
    : ((reqRes.data ?? []) as {
        id: string;
        site_id: string;
        article_id: string;
        date_cible: string;
        qte: number;
        motif: string;
        demandeur: string;
        statut: RestockRequestItem["statut"];
      }[]).map((r) => ({
        id: r.id,
        targetDate: r.date_cible,
        siteId: r.site_id,
        siteLabel: siteById.get(r.site_id)?.label ?? "Boutique",
        articleId: r.article_id,
        qty: Number(r.qte),
        motif: r.motif ?? "",
        demandeur: r.demandeur ?? "",
        statut: r.statut,
      }));

  // Vendeur : pas de lecture des recettes ni du plan de fabrication.
  if (!canReadCosts(role)) {
    return {
      targetDate,
      sites,
      boutiqueSites: boutiqueSites.length > 0 ? boutiqueSites : sites,
      labSite,
      products: productRows.map((p) => ({ id: p.id, code: p.code, nom: p.nom, unite: p.unite })),
      restockRequests,
      plan: null,
    };
  }

  const [lotsRaw, ventesRes, versRes, convRes, ofsRes, cakesRes] = await Promise.all([
    lireLots(db, clientId),
    lireVentesPeriode(db, clientId, plusJours(targetDate, -28), plusJours(targetDate, -1)),
    db
      .from("recette_versions")
      .select("id, famille_id, version, active, rendement_qte, rendement_unite, cuisson_perte_pct, mo_min, ingredients, recette_familles!inner(id, code, nom, produit_id)")
      .eq("client_id", clientId)
      .limit(500),
    db.from("conversions").select("unite_from, unite_to, facteur").eq("client_id", clientId).limit(200),
    db
      .from("ordres_fabrication")
      .select("id, numero, date_prevue, statut, qte_prevue, qte_realisee, client_ref, famille_id, recette_familles(produit_id)")
      .eq("client_id", clientId)
      .eq("date_prevue", targetDate)
      .limit(200),
    db
      .from("cakes")
      .select("id, numero, client_nom, date_event, nb_parts, statut, notes")
      .eq("client_id", clientId)
      .eq("statut", "confirme")
      .gte("date_event", targetDate)
      .lte("date_event", plusJours(targetDate, 2))
      .limit(100),
  ]);

  const impactArticles: ImpactArticle[] = articles.map((a) => ({
    id: a.id,
    code: a.code,
    nom: a.nom,
    unite: a.unite,
  }));

  const conversions: UnitConversion[] = ((convRes.data ?? []) as { unite_from: string; unite_to: string; facteur: number }[]).map((c) => ({
    uniteFrom: c.unite_from,
    uniteTo: c.unite_to,
    facteur: Number(c.facteur),
  }));

  const allVersions: ImpactRecipeVersion[] = ((versRes.data ?? []) as {
    id: string;
    famille_id: string;
    version: number;
    active: boolean;
    rendement_qte: number;
    rendement_unite: string;
    cuisson_perte_pct: number;
    mo_min: number;
    ingredients: unknown;
    recette_familles:
      | { id: string; code: string; nom: string; produit_id: string | null }
      | { id: string; code: string; nom: string; produit_id: string | null }[];
  }[]).flatMap((v) => {
    const fam = Array.isArray(v.recette_familles) ? v.recette_familles[0] : v.recette_familles;
    if (!fam) return [];
    return [
      {
        id: v.id,
        familleId: v.famille_id,
        familleCode: String(fam.code ?? ""),
        familleNom: String(fam.nom ?? ""),
        produitId: fam.produit_id,
        pvHt: 0,
        version: Number(v.version),
        active: Boolean(v.active),
        rendementQte: Number(v.rendement_qte),
        rendementUnite: String(v.rendement_unite ?? "pcs"),
        cuissonPct: Number(v.cuisson_perte_pct ?? 0),
        moMin: Number(v.mo_min ?? 0),
        tauxHoraire: 0,
        chargesPct: 0,
        emballage: 0,
        energie: 0,
        fraisGeneraux: 0,
        ingredients: Array.isArray(v.ingredients) ? (v.ingredients as ImpactRecipeLine[]) : [],
      },
    ];
  });

  const activeByProduct = new Map<string, ImpactRecipeVersion>();
  for (const v of allVersions) {
    if (!v.active || !v.produitId) continue;
    const prev = activeByProduct.get(v.produitId);
    if (!prev || v.version > prev.version) activeByProduct.set(v.produitId, v);
  }

  const products: TomorrowProduct[] = productRows.map((p) => {
    const ver = activeByProduct.get(p.id);
    if (!ver) return { id: p.id, code: p.code, nom: p.nom, unite: p.unite, seuil: p.seuil, recipe: null };
    const expanded = expandRecipeNeeds({ version: ver, allVersions, articles: impactArticles, conversions });
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

  const lots: TomorrowLot[] = (lotsRaw ?? []).map((l) => {
    const s = siteById.get(l.siteId);
    const isLab = s ? s.type === "laboratoire" || s.type === "labo" || (labSite?.id === s.id && s.type !== "boutique") : false;
    return {
      id: l.id,
      articleId: l.articleId,
      siteId: l.siteId,
      siteRole: isLab ? "labo" : "boutique",
      numero: l.numero,
      qte: l.qte,
      dlc: l.dlc,
      bloque: l.bloque,
    };
  });

  const existingOrders: TomorrowExistingOf[] = ((ofsRes.data ?? []) as {
    id: string;
    numero: string;
    date_prevue: string;
    statut: string;
    qte_prevue: number;
    qte_realisee: number;
    client_ref: string | null;
    recette_familles: { produit_id: string | null } | { produit_id: string | null }[] | null;
  }[]).map((o) => {
    const rf = Array.isArray(o.recette_familles) ? o.recette_familles[0] : o.recette_familles;
    return {
      id: o.id,
      numero: o.numero,
      produitId: rf?.produit_id ?? null,
      datePrevue: o.date_prevue,
      statut: o.statut,
      qtePrevue: Number(o.qte_prevue),
      qteRealisee: Number(o.qte_realisee),
      clientRef: o.client_ref,
    };
  });

  const confirmedOrders: TomorrowConfirmedOrder[] = ((cakesRes.data ?? []) as {
    id: string;
    numero: string;
    client_nom: string;
    date_event: string;
    nb_parts: number;
    statut: string;
    notes: string | null;
  }[]).map((c) => ({
    id: c.id,
    numero: c.numero,
    clientNom: c.client_nom,
    eventDate: c.date_event,
    productionDate: plusJours(c.date_event, -1),
    statut: c.statut,
    articleId: null,
    qty: Number(c.nb_parts),
    nbParts: Number(c.nb_parts),
    notes: c.notes,
  }));

  const plan = computeTomorrowLabPlan({
    targetDate,
    labSiteId: labSite?.id ?? "labo",
    products,
    sales: (ventesRes?.rows ?? []).map((v) => ({
      date: v.date,
      siteId: v.siteId,
      source: v.source,
      lignes: v.lignes,
    })),
    restockRequests,
    confirmedOrders,
    lots,
    existingOrders,
  });

  return {
    targetDate,
    sites,
    boutiqueSites: boutiqueSites.length > 0 ? boutiqueSites : sites,
    labSite,
    products: productRows.map((p) => ({ id: p.id, code: p.code, nom: p.nom, unite: p.unite })),
    restockRequests,
    plan,
  };
}
