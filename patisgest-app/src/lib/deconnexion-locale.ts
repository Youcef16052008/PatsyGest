/**
 * Nettoyage local à la déconnexion.
 *
 * Module PUR : `oublierCetAppareil()` vit dans `catalogue-cache.ts` (qui
 * importe le stockage navigateur) — trop lourd à importer directement dans
 * un test. Cette fonction est le seul point qui décide QUOI effacer, et elle
 * est testée avec un faux `Storage` (voir `tests/deconnexion-locale.test.mjs`).
 *
 * Pourquoi c'est nécessaire : sur une tablette partagée, le cache hors-ligne
 * et l'identité (`patisgest.session.v1`) survivent à la déconnexion. Le
 * serveur efface bien les cookies, mais le navigateur conserve la coquille et
 * le catalogue du compte précédent. `oublierCetAppareil` existait… sans
 * aucun appelant (revue 11/01, W1-C).
 */
import { oublierCetAppareil } from "./catalogue-cache";

/** Efface catalogue + identité locale. N'échoue jamais (déconnexion = priorité). */
export function oublierDonneesLocalesDeSession(
  storage?: Parameters<typeof oublierCetAppareil>[0],
): void {
  try {
    oublierCetAppareil(storage);
  } catch {
    // Un stockage indisponible ne doit jamais empêcher de se déconnecter.
  }
}
