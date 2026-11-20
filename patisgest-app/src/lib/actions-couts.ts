"use server";

import { revalidatePath } from "next/cache";
import { canWrite, canReadCosts, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import {
  aggregatePertes,
  computeScaledFicheCout,
  rc07TauxPerte,
  rc08ManqueAJagner,
  rc10GardeFous,
  selectProductVersion,
  type ActiveProductVersion,
  type ClotureLigne,
  type GardeFou,
} from "./cost-sheet";
import { computeFefoCost, type FefoLot } from "./fefo-cost";
import {
  buildPriceMercuriale,
  computeIngredientImpact,
  type ImpactArticle,
  type ImpactRecipeLine,
  type ImpactRecipeVersion,
  type IngredientImpactReport,
  type UnitConversion,
} from "./ingredient-impact";
import { createClient } from "./supabase/server";

export type CoutsState = {
  erreur?: string;
  succes?: string;
  // Paramètres RC-04
  tauxHoraire?: number;
  chargesPct?: number;
  // Fiche
  produit?: string;
  famille?: string;
  version?: number;
  rendement?: string;
  lignes?: {
    code: string;
    nom: string;
    qty: number;
    unit: string;
    couvert: number;
    cout: number;
    insuffisant: boolean;
    perimeExclu?: number;
  }[];
  matiere?: number;
  emballage?: number;
  mo?: number;
  energie?: number;
  fraisGeneraux?: number;
  total?: number;
  net?: number;
  portion?: number;
  pvHt?: number;
  marge?: number;
  taux?: number;
  coutPartiel?: boolean;
  perte?: { taux: number; manque: number; source?: string };
  gardeFous?: GardeFou[];
};

export type ImpactActionState = {
  erreur?: string;
  succes?: string;
  rapport?: IngredientImpactReport;
};

/** Enregistre les paramètres de coûts (RC-04 : taux horaire + charges). */
export async function sauverParamsCoutsReal(_prev: CoutsState, formData: FormData): Promise<CoutsState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };
  const taux = Number(formData.get("tauxHoraire"));
  const charges = Number(formData.get("chargesPct"));
  if (!Number.isFinite(taux) || taux < 0 || taux > 1_000_000) return { erreur: "Taux horaire invalide." };
  if (!Number.isFinite(charges) || charges < 0 || charges > 1000) return { erreur: "Charges invalides (0-1000 %)." };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("parametres_couts")
      .upsert(
        { client_id: ctx.clientId, taux_horaire: taux, charges_pct: charges, updated_at: new Date().toISOString() },
        { onConflict: "client_id" },
      );
    if (error) return { erreur: messageUtilisateur(error, "Sauvegarde refusée") };
    revalidatePath("/simulation");
    return { succes: "Paramètres de coûts enregistrés.", tauxHoraire: taux, chargesPct: charges };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/**
 * Fiche de coût RC-01..RC-10 d'un produit : version active FILTRÉE sur le produit
 * demandé, prix de vente `pv_ht` réel, matières FEFO éligibles (hors lots bloqués
 * et hors lots périmés), paramètres RC-04, mise à l'échelle cohérente sur `qte`,
 * pertes RC-07/08 et garde-fous RC-10.
 */
export async function ficheCoutReal(_prev: CoutsState, formData: FormData): Promise<CoutsState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canReadCosts(ctx.role)) return { erreur: "Coûts de revient réservés aux rôles propriétaire et labo." };
  const produitId = String(formData.get("produitId") ?? "").trim();
  const qte = Number(formData.get("qte"));
  const jete = Number(formData.get("jete") ?? 0);
  const casse = Number(formData.get("casse") ?? 0);
  const fabrique = Number(formData.get("fabrique") ?? 0);
  const refRaw = String(formData.get("reference") ?? "").trim();
  const reference = refRaw === "" ? null : Number(refRaw);
  if (!/^[0-9a-f-]{36}$/i.test(produitId)) return { erreur: "Produit invalide." };
  if (!Number.isFinite(qte) || qte <= 0 || qte > 100_000_000) return { erreur: "Quantité invalide." };
  if (reference !== null && (!Number.isFinite(reference) || reference < 0)) return { erreur: "Référence invalide." };

  try {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);
    const trenteJours = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

    const [simRes, verRes, paramsRes, artRes, cloRes] = await Promise.all([
      supabase.rpc("simuler_recette", { p_produit_id: produitId, p_qte: qte }),
      supabase
        .from("recette_versions")
        .select("version, active, rendement_qte, rendement_unite, mo_min, energie, emballage, frais_generaux, cuisson_perte_pct, recette_familles!inner(produit_id, code, nom)")
        .eq("client_id", ctx.clientId)
        .eq("active", true)
        .eq("recette_familles.produit_id", produitId),
      supabase.from("parametres_couts").select("taux_horaire, charges_pct").eq("client_id", ctx.clientId).limit(1),
      supabase.from("articles").select("code, nom, pv_ht").eq("client_id", ctx.clientId).eq("id", produitId).maybeSingle(),
      supabase.from("clotures").select("lignes").eq("client_id", ctx.clientId).gte("date_cloture", trenteJours).limit(120),
    ]);
    if (simRes.error) return { erreur: messageUtilisateur(simRes.error, "Fiche impossible") };
    if (verRes.error) return { erreur: messageUtilisateur(verRes.error, "Lecture recette impossible") };
    if (artRes.error) return { erreur: messageUtilisateur(artRes.error, "Lecture produit impossible") };

    const sim = simRes.data as {
      famille: { code: string; nom: string };
      version: number;
      rendement_qte: number;
      rendement_unite: string;
      besoins: { articleId: string; code: string; nom: string; qty: number; unit: string }[];
    };

    type ProductVerRow = ActiveProductVersion & {
      active: boolean;
      rendementUnite: string;
    };
    const candidates: ProductVerRow[] = ((verRes.data ?? []) as {
      version: number;
      active: boolean;
      rendement_qte: number;
      rendement_unite: string;
      mo_min: number;
      energie: number;
      emballage: number;
      frais_generaux: number;
      cuisson_perte_pct: number;
      recette_familles: { produit_id: string; code: string; nom: string } | { produit_id: string; code: string; nom: string }[];
    }[]).flatMap((row) => {
      const fam = Array.isArray(row.recette_familles) ? row.recette_familles[0] : row.recette_familles;
      if (!fam) return [];
      return [
        {
          produitId: String(fam.produit_id),
          code: String(fam.code ?? ""),
          nom: String(fam.nom ?? ""),
          version: Number(row.version ?? sim.version),
          active: Boolean(row.active),
          rendementQte: Number(row.rendement_qte ?? sim.rendement_qte),
          rendementUnite: String(row.rendement_unite ?? sim.rendement_unite),
          moMin: Number(row.mo_min ?? 0),
          energie: Number(row.energie ?? 0),
          emballage: Number(row.emballage ?? 0),
          fraisGeneraux: Number(row.frais_generaux ?? 0),
          cuissonPct: Number(row.cuisson_perte_pct ?? 0),
        },
      ];
    });

    const selected = selectProductVersion(candidates, produitId);
    if (!selected) return { erreur: "Aucune version de recette active pour ce produit." };

    const params = ((paramsRes.data ?? [])[0] ?? null) as { taux_horaire: number; charges_pct: number } | null;
    const tauxHoraire = Number(params?.taux_horaire ?? 0);
    const chargesPct = Number(params?.charges_pct ?? 0);
    const artRow = artRes.data as { code: string; nom: string; pv_ht: number } | null;
    if (!artRow) return { erreur: "Produit introuvable dans votre catalogue." };
    const pvHt = Number(artRow.pv_ht ?? 0);
    const articleCode = String(artRow.code ?? "");

    const lignes = await Promise.all(
      (sim.besoins ?? []).map(async (b) => {
        const lotsRes = await supabase
          .from("lots")
          .select("id, qte_rest, pu, dlc, date_reception, congele, bloque")
          .eq("client_id", ctx.clientId)
          .eq("article_id", b.articleId)
          .eq("bloque", false)
          .gt("qte_rest", 0)
          .limit(300);
        const lots = (lotsRes.data ?? []) as FefoLot[];
        const fefo = computeFefoCost(lots, b.qty, today);
        return {
          code: b.code,
          nom: b.nom,
          qty: b.qty,
          unit: b.unit,
          couvert: fefo.couvert,
          cout: fefo.cout,
          insuffisant: fefo.insuffisant,
          perimeExclu: fefo.perimeExclu,
        };
      }),
    );
    const matiere = Math.round(lignes.reduce((s, l) => s + l.cout, 0) * 100) / 100;
    const coutPartiel = lignes.some((l) => l.insuffisant);

    const fiche = computeScaledFicheCout({
      version: selected,
      qte,
      matiereFefo: matiere,
      tauxHoraire,
      chargesPct,
      pvHt,
    });

    const clotureLignes: ClotureLigne[] = [];
    for (const c of (cloRes.data ?? []) as { lignes: unknown }[]) {
      if (Array.isArray(c.lignes)) {
        for (const l of c.lignes as Record<string, unknown>[]) {
          clotureLignes.push({
            code: String(l.code ?? ""),
            produit: Number(l.produit ?? 0),
            jete: Number(l.jete ?? 0),
            casse: Number(l.casse ?? 0),
          });
        }
      }
    }
    const reel = aggregatePertes(clotureLignes, articleCode);
    const perteReelle = reel.produit > 0;
    const pertes = perteReelle
      ? {
          taux: reel.taux,
          manque: rc08ManqueAJagner(reel.jete, reel.casse, pvHt),
          source: `réelles 30 j (clôtures, ${reel.produit} fabriqués)`,
        }
      : {
          taux: rc07TauxPerte(jete, casse, fabrique > 0 ? fabrique : 1),
          manque: rc08ManqueAJagner(jete, casse, pvHt),
          source: "saisies manuellement",
        };

    const gardeFous = rc10GardeFous(fiche.rc03Total, reference, pvHt, null);
    if (coutPartiel) {
      gardeFous.push({
        code: "RC-10-x10",
        message: "Stock FEFO éligible insuffisant pour certains besoins — coût partiel (ne pas utiliser comme prix plancher).",
      });
    }
    if (lignes.some((l) => (l.perimeExclu ?? 0) > 0)) {
      gardeFous.push({
        code: "RC-10-prix2x",
        message: "Un ou plusieurs lots à DLC dépassée ont été exclus du calcul FEFO.",
      });
    }

    revalidatePath("/simulation");
    return {
      produit: selected.nom,
      famille: `${selected.code} — ${selected.nom}`,
      version: selected.version,
      rendement:
        Math.abs(qte - selected.rendementQte) < 1e-9
          ? `${selected.rendementQte} ${selected.rendementUnite}`
          : `${qte} ${selected.rendementUnite} (recette de base : ${selected.rendementQte} ${selected.rendementUnite})`,
      lignes,
      matiere,
      emballage: fiche.emballageScaled,
      mo: fiche.rc04Mo,
      energie: fiche.energieScaled,
      fraisGeneraux: fiche.fraisGenerauxScaled,
      total: fiche.rc03Total,
      net: fiche.rc02RendementNet,
      portion: fiche.rc05ParPortion,
      pvHt,
      marge: fiche.rc06.marge,
      taux: fiche.rc06.taux,
      coutPartiel,
      perte: pertes,
      gardeFous,
      tauxHoraire,
      chargesPct,
      succes: coutPartiel
        ? "Fiche calculée avec coût partiel (stock FEFO incomplet signalé)."
        : "Fiche de coût RC-01..RC-10 calculée (version et PV HT du produit vérifiés).",
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/**
 * Impact d'une variation de prix d'achat matière sur toutes les recettes
 * actives (directes et via sous-recettes, conversions d'unités incluses).
 * Strictement réservé aux rôles autorisés aux coûts ; lecture seule (aucun
 * devis accepté ni prix catalogue n'est modifié).
 */
export async function analyserHausseMatiereReal(
  _prev: ImpactActionState,
  formData: FormData,
): Promise<ImpactActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canReadCosts(ctx.role)) return { erreur: "Analyse des coûts réservée aux rôles propriétaire et labo." };

  const articleId = String(formData.get("articleId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(articleId)) return { erreur: "Ingrédient invalide." };

  const ancienRaw = String(formData.get("ancienPu") ?? "").trim();
  const nouveauRaw = String(formData.get("nouveauPu") ?? "").trim();
  const sourceAncienRaw = String(formData.get("sourceAncien") ?? "").trim().slice(0, 120);
  const sourceNouveauRaw = String(formData.get("sourceNouveau") ?? "").trim().slice(0, 120);

  try {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);

    const [artsRes, versRes, paramsRes, lotsRes, convRes, histRes, fournRes] = await Promise.all([
      supabase.from("articles").select("id, code, nom, unite, niveau, pv_ht").eq("client_id", ctx.clientId).limit(1000),
      supabase
        .from("recette_versions")
        .select("id, famille_id, version, active, rendement_qte, rendement_unite, cuisson_perte_pct, mo_min, emballage, energie, frais_generaux, ingredients, recette_familles!inner(id, code, nom, produit_id)")
        .eq("client_id", ctx.clientId)
        .limit(500),
      supabase.from("parametres_couts").select("taux_horaire, charges_pct").eq("client_id", ctx.clientId).maybeSingle(),
      supabase
        .from("lots")
        .select("id, article_id, fournisseur_id, numero, qte_rest, pu, dlc, date_reception, congele, bloque")
        .eq("client_id", ctx.clientId)
        .gt("qte_rest", 0)
        .limit(2000),
      supabase.from("conversions").select("unite_from, unite_to, facteur").eq("client_id", ctx.clientId).limit(200),
      supabase
        .from("historique_prix")
        .select("article_id, fournisseur_id, date_prix, pu")
        .eq("client_id", ctx.clientId)
        .eq("article_id", articleId)
        .order("date_prix", { ascending: false })
        .limit(20),
      supabase.from("fournisseurs").select("id, nom").eq("client_id", ctx.clientId).limit(200),
    ]);

    if (artsRes.error) return { erreur: messageUtilisateur(artsRes.error, "Lecture articles impossible") };
    if (versRes.error) return { erreur: messageUtilisateur(versRes.error, "Lecture recettes impossible") };

    const artRows = (artsRes.data ?? []) as { id: string; code: string; nom: string; unite: string; niveau: string; pv_ht: number }[];
    const articles: ImpactArticle[] = artRows.map((a) => ({ id: a.id, code: a.code, nom: a.nom, unite: a.unite }));
    const artById = new Map(artRows.map((a) => [a.id, a]));
    const target = articles.find((a) => a.id === articleId);
    if (!target) return { erreur: "Ingrédient introuvable." };

    const tauxHoraire = Number((paramsRes.data as { taux_horaire?: number } | null)?.taux_horaire ?? 0);
    const chargesPct = Number((paramsRes.data as { charges_pct?: number } | null)?.charges_pct ?? 0);
    const fournMap = new Map(((fournRes.data ?? []) as { id: string; nom: string }[]).map((f) => [f.id, f.nom]));

    const lotRows = (lotsRes.data ?? []) as {
      id: string;
      article_id: string;
      fournisseur_id: string | null;
      numero: string;
      qte_rest: number;
      pu: number;
      dlc: string | null;
      date_reception: string;
      congele: boolean;
      bloque: boolean;
    }[];

    const lotsByArticle = new Map<string, FefoLot[]>();
    for (const l of lotRows) {
      const arr = lotsByArticle.get(l.article_id) ?? [];
      arr.push({
        id: l.id,
        qte_rest: Number(l.qte_rest),
        pu: Number(l.pu),
        dlc: l.dlc,
        date_reception: l.date_reception,
        congele: Boolean(l.congele),
        bloque: Boolean(l.bloque),
      });
      lotsByArticle.set(l.article_id, arr);
    }

    const merc = buildPriceMercuriale({
      articleId,
      history: ((histRes.data ?? []) as { article_id: string; fournisseur_id: string | null; date_prix: string; pu: number }[]).map((h) => ({
        articleId: h.article_id,
        datePrix: h.date_prix,
        pu: Number(h.pu),
        fournisseurNom: h.fournisseur_id ? fournMap.get(h.fournisseur_id) : undefined,
      })),
      lots: lotRows
        .filter((l) => l.article_id === articleId)
        .map((l) => ({
          id: l.id,
          articleId: l.article_id,
          numero: l.numero,
          qte_rest: Number(l.qte_rest),
          pu: Number(l.pu),
          dlc: l.dlc,
          date_reception: l.date_reception,
          congele: Boolean(l.congele),
          bloque: Boolean(l.bloque),
          fournisseurNom: l.fournisseur_id ? fournMap.get(l.fournisseur_id) : undefined,
        })),
      asOf: today,
    });

    const ancienPu = ancienRaw !== "" ? Number(ancienRaw) : (merc.defaultAncien?.pu ?? Number.NaN);
    const nouveauPu = nouveauRaw !== "" ? Number(nouveauRaw) : (merc.defaultNouveau?.pu ?? Number.NaN);
    if (!Number.isFinite(ancienPu) || ancienPu < 0 || ancienPu > 100_000_000) {
      return { erreur: "Renseignez l’ancien prix unitaire HT (DA)." };
    }
    if (!Number.isFinite(nouveauPu) || nouveauPu < 0 || nouveauPu > 100_000_000) {
      return { erreur: "Renseignez le nouveau prix unitaire HT (DA)." };
    }
    const sourceAncien =
      sourceAncienRaw ||
      (merc.defaultAncien && Math.abs(merc.defaultAncien.pu - ancienPu) < 0.005
        ? merc.defaultAncien.source
        : "Prix de référence saisi");
    const sourceNouveau =
      sourceNouveauRaw ||
      (merc.defaultNouveau && Math.abs(merc.defaultNouveau.pu - nouveauPu) < 0.005
        ? merc.defaultNouveau.source
        : "Nouveau prix saisi (simulation)");

    const versions: ImpactRecipeVersion[] = ((versRes.data ?? []) as {
      id: string;
      famille_id: string;
      version: number;
      active: boolean;
      rendement_qte: number;
      rendement_unite: string;
      cuisson_perte_pct: number;
      mo_min: number;
      emballage: number;
      energie: number;
      frais_generaux: number;
      ingredients: unknown;
      recette_familles:
        | { id: string; code: string; nom: string; produit_id: string | null }
        | { id: string; code: string; nom: string; produit_id: string | null }[];
    }[]).flatMap((v) => {
      const fam = Array.isArray(v.recette_familles) ? v.recette_familles[0] : v.recette_familles;
      if (!fam) return [];
      const prod = fam.produit_id ? artById.get(fam.produit_id) : undefined;
      return [
        {
          id: v.id,
          familleId: v.famille_id,
          familleCode: String(fam.code ?? ""),
          familleNom: String(fam.nom ?? ""),
          produitId: fam.produit_id,
          produitCode: prod?.code,
          produitNom: prod?.nom,
          pvHt: Number(prod?.pv_ht ?? 0),
          version: Number(v.version),
          active: Boolean(v.active),
          rendementQte: Number(v.rendement_qte),
          rendementUnite: String(v.rendement_unite ?? "pcs"),
          cuissonPct: Number(v.cuisson_perte_pct ?? 0),
          moMin: Number(v.mo_min ?? 0),
          tauxHoraire,
          chargesPct,
          emballage: Number(v.emballage ?? 0),
          energie: Number(v.energie ?? 0),
          fraisGeneraux: Number(v.frais_generaux ?? 0),
          ingredients: Array.isArray(v.ingredients) ? (v.ingredients as ImpactRecipeLine[]) : [],
        },
      ];
    });

    const conversions: UnitConversion[] = ((convRes.data ?? []) as { unite_from: string; unite_to: string; facteur: number }[]).map((c) => ({
      uniteFrom: c.unite_from,
      uniteTo: c.unite_to,
      facteur: Number(c.facteur),
    }));

    const rapport = computeIngredientImpact({
      article: target,
      ancienPu,
      sourceAncien,
      nouveauPu,
      sourceNouveau,
      versions,
      articles,
      lotsByArticle,
      conversions,
      asOf: today,
    });

    return {
      rapport,
      succes:
        rapport.recettes.length > 0
          ? `${rapport.recettes.length} recette(s) active(s) impactée(s) par ${target.nom} (aucun prix ni devis accepté modifié).`
          : `Aucune recette active n’utilise ${target.nom} (ni directement ni via sous-recette).`,
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
