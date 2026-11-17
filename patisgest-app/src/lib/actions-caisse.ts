"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import { createClient } from "./supabase/server";
import { parseSaleInput } from "./stock-input";

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
