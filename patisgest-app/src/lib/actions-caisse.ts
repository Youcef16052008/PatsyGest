"use server";

import { revalidatePath } from "next/cache";
import { canSellAtPos, getSessionContext } from "./auth";
import { echecHttpReessayable, messageUtilisateur } from "./erreurs-db";
import { parseCartSaleInput, PAYMENT_MODE_LABELS, type PaymentMode } from "./pos-cart";
import { createClient } from "./supabase/server";
import { parseSaleInput } from "./stock-input";
import { parseZCsv } from "./z-input";
import { sameSaleReplay, sameSaleSession } from "./sale-session";
import { estProprietaireSeul } from "./permissions";
import { dateMetierPasFuture } from "./workspace-data.ts";

export type SaleReceiptLine = {
  articleId: string;
  nom: string;
  qty: number;
  puHT?: number;
  tva?: number;
  totalHT?: number;
  totalTTC?: number;
  missing?: number;
  lots?: string[];
};

export type SaleState = {
  erreur?: string;
  succes?: string;
  ticket?: string;
  numero?: string;
  modePaiement?: PaymentMode;
  totalHT?: number;
  totalTTC?: number;
  lots?: string[];
  lignesTicket?: SaleReceiptLine[];
  manquant?: number;
  duplicate?: boolean;
  reessayer?: boolean;
  enregistreeA?: string;
};

type SaleResult = {
  sale_id: string;
  numero?: string;
  duplicate: boolean;
  missing: number;
  totalHT: number;
  totalTTC: number;
  modePaiement?: PaymentMode;
  lots: { lotId: string; numero: string; qty: number; articleId?: string }[];
};

function readTicketLines(raw: unknown): SaleReceiptLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l) => {
    if (!l || typeof l !== "object") return [];
    const r = l as Record<string, unknown>;
    const qty = Number(r.qty);
    if (!Number.isFinite(qty) || qty <= 0) return [];
    const lots = Array.isArray(r.lots)
      ? (r.lots as { numero?: string; qty?: number }[]).map((x) => `${x.numero ?? "lot"} × ${x.qty ?? 0}`)
      : [];
    return [
      {
        articleId: String(r.articleId ?? ""),
        nom: String(r.nom ?? r.code ?? "Produit"),
        qty,
        puHT: r.pu != null ? Number(r.pu) : undefined,
        tva: r.tva != null ? Number(r.tva) : undefined,
        totalHT: r.totalHT != null ? Number(r.totalHT) : undefined,
        totalTTC: r.totalTTC != null ? Number(r.totalTTC) : undefined,
        missing: r.missing != null ? Number(r.missing) : undefined,
        lots,
      },
    ];
  });
}

/**
 * Encaissement panier multiproduit (1 à 50 articles) via `vendre_panier` :
 * transaction unique, FEFO éligible (hors lots bloqués et hors lots périmés),
 * arrondi exact au centime par ligne, mode de règlement enregistré et
 * idempotence stricte par `ticket` (reprise hors-ligne sans doublon).
 */
export async function sellCart(_prev: SaleState, formData: FormData): Promise<SaleState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise.", reessayer: true };
  if (!canSellAtPos(ctx.role)) {
    return { erreur: "La caisse est réservée au comptoir (propriétaire et vendeur)." };
  }
  // Empêche un ancien onglet d'envoyer sa file après changement de session.
  // Ces valeurs ne sont pas une autorisation : la session et la RLS restent
  // contrôlées côté serveur, et les identifiants déclarés doivent correspondre.
  if (!sameSaleSession(ctx, formData.get("expectedClientId"), formData.get("expectedAuthUserId"))) {
    return { erreur: "La session a changé. Reconnectez-vous avec le compte d'origine pour reprendre ce ticket." };
  }

  let input;
  try {
    input = parseCartSaleInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Panier invalide." };
  }

  try {
    const supabase = await createClient();
    const pTicket = input.ticket ?? crypto.randomUUID();

    let rpcRes = await supabase.rpc("vendre_panier", {
      p_site_id: input.siteId,
      p_lignes: input.lignes,
      p_ticket: pTicket,
      p_mode_paiement: input.modePaiement,
    });

    // Repli transitoire si la migration 21 n'a pas encore été appliquée sur la base distante :
    // un ticket à 1 article continue de fonctionner via `vendre_article` ; un panier >1 article
    // demande explicitement l'application de la migration 21.
    if (rpcRes.error && (rpcRes.error.code === "PGRST202" || rpcRes.error.code === "42883")) {
      if (input.lignes.length > 1) {
        return {
          erreur:
            "Le panier multiproduit nécessite l’application de la migration SQL 21 sur la base Supabase.",
        };
      }
      // `vendre_article` (signature 4 args, migration pré-21) force « especes ».
      // Un autre mode ne peut donc pas être rejoué sans être silencieusement
      // transformé : on refuse explicitement plutôt que d'encaisser un faux tiroir.
      if (input.modePaiement !== "especes") {
        return {
          erreur: "Migration SQL 21 requise pour enregistrer ce mode de règlement.",
        };
      }
      rpcRes = await supabase.rpc("vendre_article", {
        p_article_id: input.lignes[0].articleId,
        p_site_id: input.siteId,
        p_qte: input.lignes[0].qte,
        p_ticket: pTicket,
      });
    }

    const { data, error, status } = rpcRes;
    if (error) {
      if (error.code === "P0001") return { erreur: error.message };
      if (error.code === "42501") return { erreur: "Votre rôle n'autorise pas cette vente." };
      if (error.code === "23505") return { erreur: "Conflit lors de la vente. Vérifiez l’historique avant toute reprise." };
      return { erreur: messageUtilisateur(error, "Vente refusée"), reessayer: echecHttpReessayable(status) };
    }

    const result = data as SaleResult | null;
    // Certaines violations d'unicité SQL peuvent produire duplicate=true mais
    // sans vente retrouvée. Ce n'est pas une confirmation d'enregistrement.
    if (!result || typeof result.sale_id !== "string" || !result.sale_id || typeof result.duplicate !== "boolean") {
      return { erreur: "Résultat de vente non confirmé. Vérifiez l'historique avant de reprendre.", reessayer: true };
    }
    revalidatePath("/caisse");
    revalidatePath("/cloture");
    revalidatePath("/tableau-de-bord");
    revalidatePath("/stocks");
    revalidatePath("/planning");

    if (result?.duplicate) {
      const { data: vente } = await supabase
        .from("ventes")
        .select("id, numero, total_ht, total_ttc, lignes, mode_paiement, created_at")
        .eq("client_id", ctx.clientId)
        .eq("site_id", input.siteId)
        .eq("ticket", pTicket)
        .maybeSingle();
      if (vente && vente.id === result.sale_id && sameSaleReplay(input, vente)) {
        const lignesTicket = readTicketLines(vente.lignes);
        const allLots = lignesTicket.flatMap((l) => l.lots ?? []);
        return {
          duplicate: true,
          succes: `Ticket ${vente.numero} déjà enregistré — aucun doublon créé.`,
          ticket: pTicket,
          numero: vente.numero,
          modePaiement: result.modePaiement ?? input.modePaiement,
          enregistreeA: vente.created_at,
          totalHT: Number(vente.total_ht),
          totalTTC: Number(vente.total_ttc),
          lots: allLots,
          lignesTicket,
        };
      }
      return { erreur: "Ticket existant non vérifié ou différent : contrôlez l'historique avant toute reprise.", reessayer: true };
    }

    const { data: vente } = result?.sale_id
      ? await supabase
          .from("ventes")
          .select("numero, lignes, created_at")
          .eq("client_id", ctx.clientId)
          .eq("id", result.sale_id)
          .maybeSingle()
      : { data: null };

    const lignesTicket = readTicketLines(vente?.lignes);
    const lotsList = (result?.lots ?? []).map((l) => `${l.numero} × ${l.qty}`);
    const lotsText = lotsList.join(", ");
    const missing = Number(result?.missing ?? 0);
    const modeLabel = PAYMENT_MODE_LABELS[input.modePaiement];
    return {
      succes:
        `Vente enregistrée (${input.lignes.length} produit${input.lignes.length > 1 ? "s" : ""}, ${modeLabel}) — ${result?.totalTTC} DA.` +
        (lotsText ? ` Lots : ${lotsText}.` : "") +
        (missing > 0 ? ` Manquant : ${missing} (signalé, stock jamais négatif).` : ""),
      ticket: pTicket,
      numero: vente?.numero ?? result?.numero,
      modePaiement: input.modePaiement,
      enregistreeA: vente?.created_at,
      totalHT: Number(result?.totalHT ?? 0),
      totalTTC: Number(result?.totalTTC ?? 0),
      lots: lotsList,
      lignesTicket,
      manquant: missing,
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur.", reessayer: true };
  }
}

export type ZImportResult = {
  z_import_id: string;
  sale_id: string | null;
  duplicate: boolean;
  lines: number;
  totalHT: number;
  totalTTC: number;
  missing: number;
};

/**
 * Import de Z sécurisé : format strict revérifié côté serveur, codes articles
 * résolus et validés par la RPC `importer_z` (aucune ligne ignorée), FEFO éligible,
 * idempotence par (date, caisse, n° Z), confirmation exigée si un autre Z du
 * jour a le même total HT. Rôles propriétaire + labo.
 */
export async function importZReal(_prev: SaleState, formData: FormData): Promise<SaleState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!estProprietaireSeul(ctx.role)) return { erreur: "L’import de Z est réservé au propriétaire." };

  const date = String(formData.get("date") ?? "").trim();
  const siteId = String(formData.get("siteId") ?? "").trim();
  const caisse = String(formData.get("caisse") ?? "").trim();
  const numeroZ = String(formData.get("numeroZ") ?? "").trim();
  const csv = String(formData.get("csv") ?? "");
  const confirm = formData.get("confirm") === "on";

  if (!dateMetierPasFuture(date)) {
    return { erreur: "Date de Z invalide." };
  }
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return { erreur: "Site invalide." };
  if (caisse.length < 1 || caisse.length > 80) return { erreur: "Caisse requise (80 max)." };
  if (numeroZ.length < 1 || numeroZ.length > 80) return { erreur: "Numéro Z requis (80 max)." };
  try {
    parseZCsv(csv);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Données Z invalides." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("importer_z", {
      p_date: date,
      p_site_id: siteId,
      p_caisse: caisse,
      p_numero_z: numeroZ,
      p_csv: csv,
      p_confirm: confirm,
    });
    if (error) {
      if (error.code === "P0001") return { erreur: error.message };
      if (error.code === "42501") return { erreur: "Votre rôle n'autorise pas cet import." };
      if (error.code === "23505") return { erreur: "Ce Z a déjà été importé pour cette caisse et cette date." };
      return { erreur: messageUtilisateur(error, "Import refusé") };
    }
    const r = data as ZImportResult | null;
    if (r?.duplicate) return { erreur: "Ce Z a déjà été importé pour cette caisse et cette date." };
    revalidatePath("/caisse");
    revalidatePath("/cloture");
    revalidatePath("/stocks");
    return {
      succes:
        `Z importé — ${r?.lines} ligne(s), ${r?.totalTTC} DA.` +
        (Number(r?.missing ?? 0) > 0 ? ` Manquant : ${r?.missing} (signalé, stock jamais négatif).` : ""),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

// ---------------------------------------------------------------- avoirs

export type AvoirState = {
  erreur?: string;
  succes?: string;
  numero?: string;
  mode?: string;
  qte?: number;
};

export type AvoirResult = {
  avoir_id: string;
  numero: string;
  mode: string;
  qte: number;
  article: string;
  lot_retour_cree: boolean;
};

/**
 * US-06.4 — enregistrer un retour/avoir.
 *
 * Deux modes seulement, choisis explicitement par le vendeur :
 * `remise_en_stock` (la marchandise redevient vendable) ou `destruction`
 * (perte tracée). Le serveur refuse le reste, et refuse de rendre plus que ce
 * qui a été vendu, avoirs précédents inclus.
 */
export async function createAvoir(_prev: AvoirState, formData: FormData): Promise<AvoirState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session expirée. Reconnectez-vous." };
  if (!estProprietaireSeul(ctx.role)) return { erreur: "Seul le propriétaire peut enregistrer un avoir ou retour." };

  const venteId = String(formData.get("venteId") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim();
  const qte = Number(String(formData.get("qte") ?? "").replace(",", "."));

  if (!venteId) return { erreur: "Choisissez la vente concernée." };
  if (!Number.isFinite(qte) || qte <= 0) return { erreur: "Quantité rendue invalide." };
  if (motif.length < 3) return { erreur: "Indiquez le motif du retour (au moins 3 caractères)." };
  if (mode !== "remise_en_stock" && mode !== "destruction") {
    return { erreur: "Précisez ce que devient la marchandise : remise en stock ou destruction." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("enregistrer_avoir", {
      p_vente_id: venteId,
      p_mode: mode,
      p_motif: motif,
      p_qte: qte,
    });
    if (error) {
      if (error.code === "P0001") return { erreur: error.message };
      if (error.code === "42501") return { erreur: "Votre rôle n'autorise pas cette opération." };
      return { erreur: messageUtilisateur(error, "Avoir refusé") };
    }
    const r = data as AvoirResult | null;
    if (!r?.avoir_id) return { erreur: "Avoir non confirmé. Vérifiez avant de recommencer." };

    revalidatePath("/caisse");
    revalidatePath("/stocks");
    revalidatePath("/cloture");
    revalidatePath("/tracabilite");
    return {
      succes:
        `Avoir ${r.numero} enregistré — ${r.qte} × ${r.article}. ` +
        (r.mode === "remise_en_stock"
          ? r.lot_retour_cree
            ? "Remis en stock dans un lot de retour dédié."
            : "Remis en stock dans son lot d’origine."
          : "Destruction consignée ; la perte reste comptée."),
      numero: r.numero,
      mode: r.mode,
      qte: r.qte,
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur. L’avoir n’a pas été enregistré." };
  }
}
