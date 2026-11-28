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

export type ContexteJournal = NonNullable<Awaited<ReturnType<typeof getSessionContext>>>;
export type GardeContexteJournal =
  | { ctx: ContexteJournal; denied: null }
  | { ctx: null; denied: { erreur: string } };

/**
 * Une seule lecture de session par action : le contexte vérifié est celui qui
 * sert à l'écriture. Une session expirée entre une garde et un second
 * `getSessionContext()` ne peut plus produire `ctx!.clientId === undefined`.
 */
export async function requireWriterContexte(): Promise<GardeContexteJournal> {
  const ctx = await getSessionContext();
  if (!ctx) return { ctx: null, denied: { erreur: "Session requise." } };
  if (!canWrite(ctx.role)) return { ctx: null, denied: { erreur: "Réservé aux rôles propriétaire et labo." } };
  return { ctx, denied: null };
}

export async function requireAnyRoleContexte(): Promise<GardeContexteJournal> {
  const ctx = await getSessionContext();
  if (!ctx) return { ctx: null, denied: { erreur: "Session requise." } };
  return { ctx, denied: null };
}

export async function requireWriter(): Promise<{ erreur: string } | null> {
  const { denied } = await requireWriterContexte();
  return denied;
}

export async function requireAnyRole(): Promise<{ erreur: string } | null> {
  const { denied } = await requireAnyRoleContexte();
  return denied;
}

export function mapError(error: { code?: string; message: string }): string {
  return messageUtilisateur(error, "Opération refusée");
}

/** Clôture six flux produits + bilan espèces facultatif séparé (RPC saisir_cloture) — propriétaire uniquement. */
