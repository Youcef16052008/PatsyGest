"use server";

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { createClient } from "./supabase/server";
import { parseSaleInput } from "./stock-input";
import { parseZCsv } from "./z-input";

export type SaleState = { erreur?: string; succes?: string };

type SaleResult = {
  sale_id: string;
  duplicate: boolean;
  missing: number;
  totalHT: number;
  totalTTC: number;
  lots: { lotId: string; numero: string; qty: number }[];
};

/**
 * Vente de caisse réelle : passe par la RPC vendre_article de la base
 * (consommation FEFO atomique, journal des mouvements, idempotence ticket).
 * Tous les rôles authentifiés peuvent vendre ; la base revalide tenant + rôle.
 */
export async function sellProduct(_prev: SaleState, formData: FormData): Promise<SaleState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };

  let input;
  try {
    input = parseSaleInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("vendre_article", {
      p_article_id: input.articleId,
      p_site_id: input.siteId,
      p_qte: input.qte,
      p_ticket: crypto.randomUUID(),
    });
    if (error) {
      if (error.code === "P0001") return { erreur: error.message };
      if (error.code === "42501") return { erreur: "Votre rôle n'autorise pas cette vente." };
      if (error.code === "23505") return { erreur: "Ce ticket a déjà été enregistré." };
      return { erreur: `Vente refusée : ${error.message}` };
    }

    const result = data as SaleResult | null;
    if (result?.duplicate) return { erreur: "Ce ticket a déjà été enregistré." };

    const lots = (result?.lots ?? []).map((l) => `${l.numero} × ${l.qty}`).join(", ");
    const missing = Number(result?.missing ?? 0);
    revalidatePath("/caisse");
    revalidatePath("/stocks");
    return {
      succes:
        `Vente enregistrée — ${result?.totalHT} HT / ${result?.totalTTC} TTC.` +
        (lots ? ` Lots : ${lots}.` : "") +
        (missing > 0 ? ` Manquant : ${missing} (signalé, stock jamais négatif).` : ""),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
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
 * résolus et validés par la RPC `importer_z` (aucune ligne ignorée), FEFO,
 * idempotence par (date, caisse, n° Z), confirmation exigée si un autre Z du
 * jour a le même total HT. Rôles propriétaire + labo.
 */
export async function importZReal(_prev: SaleState, formData: FormData): Promise<SaleState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };

  const date = String(formData.get("date") ?? "").trim();
  const siteId = String(formData.get("siteId") ?? "").trim();
  const caisse = String(formData.get("caisse") ?? "").trim();
  const numeroZ = String(formData.get("numeroZ") ?? "").trim();
  const csv = String(formData.get("csv") ?? "");
  const confirm = formData.get("confirm") === "on";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > new Date().toISOString().slice(0, 10)) {
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
      return { erreur: `Import refusé : ${error.message}` };
    }
    const r = data as ZImportResult | null;
    if (r?.duplicate) return { erreur: "Ce Z a déjà été importé pour cette caisse et cette date." };
    revalidatePath("/caisse");
    revalidatePath("/stocks");
    return {
      succes:
        `Z importé — ${r?.lines} ligne(s), ${r?.totalHT} HT / ${r?.totalTTC} TTC.` +
        (Number(r?.missing ?? 0) > 0 ? ` Manquant : ${r?.missing} (signalé, stock jamais négatif).` : ""),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
