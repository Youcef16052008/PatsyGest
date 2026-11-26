/**
 * Types et gardes partagés des actions « journaux ».
 *
 * Ce fichier n'a volontairement PAS `"use server"` : il peut donc exporter
 * des types ET des fonctions utilitaires. Un fichier d'actions, lui, est
 * limité par Next 16 aux seules fonctions ASYNCHRONES exportées — d'où ce
 * partage, qui évite de dupliquer les gardes dans les quatre domaines.
 */

import { canWrite, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";

export type JournalState = { erreur?: string; succes?: string };

export async function requireWriter(): Promise<{ erreur: string } | null> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };
  return null;
}

export async function requireAnyRole(): Promise<{ erreur: string } | null> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  return null;
}

export function mapError(error: { code?: string; message: string }): string {
  return messageUtilisateur(error, "Opération refusée");
}

/** Clôture six flux produits + bilan espèces facultatif séparé (RPC saisir_cloture) — propriétaire uniquement. */
