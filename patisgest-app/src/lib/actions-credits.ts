"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import type { CreditAccountType, CreditEntry, CreditPaymentEntry } from "./credits";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";

type CreditRow = {
  id: string;
  nom_debiteur: string;
  telephone: string;
  type_compte: string;
  montant_total_da: number;
  montant_regle_da: number;
  date_echeance: string | null;
  note: string;
  statut: string;
  reglements: unknown;
  created_at: string;
};

function mapRow(r: CreditRow): CreditEntry {
  const regs = Array.isArray(r.reglements)
    ? (r.reglements as { montant_da?: number; montantDa?: number; note?: string; at?: string }[]).map(
        (x): CreditPaymentEntry => ({
          montantDa: Number(x.montant_da ?? x.montantDa ?? 0),
          note: String(x.note ?? ""),
          at: String(x.at ?? ""),
        }),
      )
    : [];
  return {
    id: r.id,
    nomDebiteur: r.nom_debiteur,
    telephone: r.telephone ?? "",
    typeCompte: r.type_compte === "cafe_entreprise" ? "cafe_entreprise" : "particulier",
    montantTotalDa: Number(r.montant_total_da) || 0,
    montantRegleDa: Number(r.montant_regle_da) || 0,
    dateEcheance: r.date_echeance,
    note: r.note ?? "",
    statut: r.statut === "solde" || r.statut === "annule" ? r.statut : "ouvert",
    reglements: regs,
    createdAt: r.created_at,
  };
}

export async function loadCreditsCloud(): Promise<{
  ok: boolean;
  tableAvailable: boolean;
  credits: CreditEntry[];
}> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase") {
    return { ok: false, tableAvailable: false, credits: [] };
  }
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("credits_clients")
      .select("id, nom_debiteur, telephone, type_compte, montant_total_da, montant_regle_da, date_echeance, note, statut, reglements, created_at")
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return { ok: false, tableAvailable: false, credits: [] };
      }
      return { ok: false, tableAvailable: true, credits: [] };
    }
    return { ok: true, tableAvailable: true, credits: ((data ?? []) as CreditRow[]).map(mapRow) };
  } catch {
    return { ok: false, tableAvailable: false, credits: [] };
  }
}

export async function createCreditCloud(input: {
  nomDebiteur: string;
  telephone?: string;
  typeCompte: CreditAccountType;
  montantTotalDa: number;
  montantRegleDa?: number;
  dateEcheance?: string | null;
  note?: string;
}): Promise<{ ok: boolean; entry?: CreditEntry; erreur?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase") return { ok: false, erreur: "Session Supabase requise." };

  const nom = input.nomDebiteur.trim();
  const total = Math.round(Number(input.montantTotalDa) * 100) / 100;
  const regle = Math.max(0, Math.round((Number(input.montantRegleDa) || 0) * 100) / 100);
  if (!nom || !Number.isFinite(total) || total <= 0 || regle > total) {
    return { ok: false, erreur: "Nom et montant valide requis." };
  }

  try {
    const db = await createClient();
    const { data, error } = await db
      .from("credits_clients")
      .insert({
        client_id: ctx.clientId,
        nom_debiteur: nom.slice(0, 140),
        telephone: (input.telephone ?? "").trim().slice(0, 40),
        type_compte: input.typeCompte,
        montant_total_da: total,
        montant_regle_da: regle,
        date_echeance: input.dateEcheance || null,
        note: (input.note ?? "").trim().slice(0, 400),
        statut: regle >= total ? "solde" : "ouvert",
        reglements: regle > 0 ? [{ montant_da: regle, note: "Avance initiale", at: new Date().toISOString() }] : [],
        cree_par: ctx.authUserId,
      })
      .select("id, nom_debiteur, telephone, type_compte, montant_total_da, montant_regle_da, date_echeance, note, statut, reglements, created_at")
      .single();

    if (error) return { ok: false, erreur: messageUtilisateur(error, "Enregistrement refusé") };
    revalidatePath("/tableau-de-bord");
    revalidatePath("/caisse");
    return { ok: true, entry: mapRow(data as CreditRow) };
  } catch {
    return { ok: false, erreur: "Serveur inaccessible." };
  }
}

export async function payCreditCloud(
  creditId: string,
  montantDa: number,
  note = "",
): Promise<{ ok: boolean; erreur?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase") return { ok: false, erreur: "Session Supabase requise." };
  try {
    const db = await createClient();
    const { error } = await db.rpc("enregistrer_reglement_credit", {
      p_credit_id: creditId,
      p_montant_da: montantDa,
      p_note: note,
    });
    if (error) return { ok: false, erreur: messageUtilisateur(error, "Règlement refusé") };
    revalidatePath("/tableau-de-bord");
    revalidatePath("/caisse");
    return { ok: true };
  } catch {
    return { ok: false, erreur: "Serveur inaccessible." };
  }
}
