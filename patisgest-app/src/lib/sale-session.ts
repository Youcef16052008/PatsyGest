/**
 * Vérifie uniquement qu'un formulaire provient encore de la même session.
 * Ce n'est pas une autorisation ; l'identité réelle vient toujours de Auth.
 *
 * Les valeurs sont `trim()`ées : `sellProduct` recopie le FormData des
 * appelants hérités, et un identifiant entouré d'espaces (copier/coller,
 * client non-React) refusait un ticket légitime. Un identifiant vide ou
 * composé d'espaces reste refusé — le trim ne relâche aucune autorisation.
 */
export function sameSaleSession(
  session: { clientId: string; authUserId: string },
  client: FormDataEntryValue | null,
  user: FormDataEntryValue | null,
): boolean {
  if (typeof client !== "string" || typeof user !== "string") return false;
  const clientId = client.trim();
  const authUserId = user.trim();
  if (!clientId || !authUserId) return false;
  return clientId === session.clientId && authUserId === session.authUserId;
}

/** Une réponse « déjà enregistré » ne confirme le ticket que si le contenu
 * persistant est lisible et identique ; les montants restent ceux enregistrés. */
export function sameSaleReplay(
  requested: { lignes: { articleId: string; qte: number }[]; modePaiement: string },
  stored: { lignes: unknown; mode_paiement: unknown },
): boolean {
  if (stored.mode_paiement !== requested.modePaiement || !Array.isArray(stored.lignes)) return false;
  const existing = new Map<string, number>();
  for (const line of stored.lignes) {
    if (!line || typeof line !== "object" || typeof line.articleId !== "string" || existing.has(line.articleId)) return false;
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) return false;
    existing.set(line.articleId, qty);
  }
  return existing.size === requested.lignes.length && requested.lignes.every(line => existing.get(line.articleId) === line.qte);
}
