"use server";

import { canWrite, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";

export type RappelLot = {
  id: string; numero: string; code: string; nom: string;
  dlc: string | null; site_id: string; bloque: boolean; bloque_motif: string | null;
};
export type RappelVente = { ticket: string; date_vente: string; total_ht: number; site_id?: string; code?: string; nom?: string };
export type RappelReport = {
  lot: RappelLot;
  of_producteur: { numero: string; statut: string } | null;
  ventes: RappelVente[];
  of_consigneurs: { numero: string; statut: string }[];
  transferts: { ref: string; direction: string }[];
  descendants: RappelLot[];
  ventes_descendants: RappelVente[];
};

export type RappelState = {
  erreur?: string;
  succes?: string;
  report?: RappelReport;
  touches?: number;
};

async function writerContext(): Promise<{ ok: true } | { ok: false; state: RappelState }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, state: { erreur: "Session requise." } };
  if (!canWrite(ctx.role)) return { ok: false, state: { erreur: "Réservé aux rôles propriétaire et labo." } };
  return { ok: true };
}

/** Rapport de rappel (rappel_lot) : ventes, OFs, transferts et lots en cascade. */
export async function rappelLotReal(_prev: RappelState, formData: FormData): Promise<RappelState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  const lotId = String(formData.get("lotId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(lotId)) return { erreur: "Lot invalide." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rappel_lot", { p_lot_id: lotId });
    if (error) return { erreur: messageUtilisateur(error, "Rapport impossible") };
    return { report: data as RappelReport };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/**
 * Blocage d'un lot avec motif, propagation facultative aux descendants
 * connus (miroirs de transfert + lots des OF consommateurs, profondeur max3).
 * Le déblocage ne se propage jamais.
 */
export async function bloquerLotReal(_prev: RappelState, formData: FormData): Promise<RappelState> {
  const denied = await writerContext();
  if (!denied.ok) return denied.state;
  const lotId = String(formData.get("lotId") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim();
  const descendants = formData.get("descendants") === "on";
  if (!/^[0-9a-f-]{36}$/i.test(lotId)) return { erreur: "Lot invalide." };
  if (motif.length < 1 || motif.length > 200) return { erreur: "Motif requis (200 max)." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bloquer_lot", {
      p_lot_id: lotId, p_bloque: true, p_motif: motif, p_descendants: descendants,
    });
    if (error) return { erreur: messageUtilisateur(error, "Blocage refusé") };
    const r = data as { touches?: number };
    return { succes: `Lot bloqué${descendants ? ` (+ ${Math.max((r?.touches ?? 1) - 1, 0)} descendant(s))` : ""}.`, touches: r?.touches };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Déblocage du lot choisi uniquement (jamais propagé). */
export async function debloquerLotReal(_prev: RappelState, formData: FormData): Promise<RappelState> {
  const denied = await writerContext();
  if (!denied.ok) return denied.state;
  const lotId = String(formData.get("lotId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(lotId)) return { erreur: "Lot invalide." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bloquer_lot", {
      p_lot_id: lotId, p_bloque: false, p_motif: null, p_descendants: false,
    });
    if (error) return { erreur: messageUtilisateur(error, "Déblocage refusé") };
    return { succes: "Lot débloqué (les descendants restent bloqués)." };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
