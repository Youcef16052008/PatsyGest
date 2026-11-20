/** Vérifie uniquement qu'un formulaire provient encore de la même session.
 * Ce n'est pas une autorisation ; l'identité réelle vient toujours de Auth. */
export function sameSaleSession(
  session: { clientId: string; authUserId: string },
  client: FormDataEntryValue | null,
  user: FormDataEntryValue | null,
): boolean {
  return typeof client === "string" && typeof user === "string" &&
    client === session.clientId && user === session.authUserId;
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
