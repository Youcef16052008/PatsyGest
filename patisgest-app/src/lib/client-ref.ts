/**
 * Référence idempotente des écritures (B-007 pour les transferts, 16 pour les OF).
 *
 * Générée côté formulaire, une par ouverture : si le formulaire est renvoyé
 * (double clic, resoumission, rejeu hors ligne), la base reconstruit le même
 * transfert au lieu de déplacer le stock une seconde fois. `randomUUID` fait
 * 36 caractères, la colonne `transferts.client_ref` accepte jusqu'à 64.
 */
export function nouveauClientRef(): string {
  const cryptoDisponible = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoDisponible?.randomUUID) return cryptoDisponible.randomUUID();
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
