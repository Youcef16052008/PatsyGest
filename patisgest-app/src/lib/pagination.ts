export type PageLecture<T> = {
  data: readonly T[] | null;
  error?: unknown;
};

export type PagesLues<T> =
  | { ok: true; lignes: T[] }
  | { ok: false; raison: "limite" | "lecture"; error?: unknown };

/**
 * Lit une collection paginée sans confondre une dernière page pleine avec une
 * collection tronquée. Si la limite est atteinte, une sonde d'une ligne sépare
 * exactement `limite` lignes de `limite + 1`; rien n'est jamais retourné comme
 * complet si la sonde échoue ou révèle des lignes supplémentaires.
 */
export async function lirePages<T>(
  lirePage: (offset: number, limite: number) => Promise<PageLecture<T>>,
  limiteTotale: number,
  taillePage = 500,
): Promise<PagesLues<T>> {
  if (!Number.isSafeInteger(limiteTotale) || limiteTotale < 0) {
    throw new RangeError("La limite totale doit être un entier positif ou nul.");
  }
  if (!Number.isSafeInteger(taillePage) || taillePage < 1) {
    throw new RangeError("La taille de page doit être un entier strictement positif.");
  }

  const lignes: T[] = [];
  while (lignes.length < limiteTotale) {
    const offset = lignes.length;
    const quantite = Math.min(taillePage, limiteTotale - offset);
    const page = await lirePage(offset, quantite);
    if (page.error !== undefined && page.error !== null) return { ok: false, raison: "lecture", error: page.error };
    if (page.data === null) return { ok: false, raison: "lecture" };
    lignes.push(...page.data);
    if (page.data.length < quantite) return { ok: true, lignes };
  }

  const sonde = await lirePage(limiteTotale, 1);
  if (sonde.error !== undefined && sonde.error !== null) return { ok: false, raison: "lecture", error: sonde.error };
  if (sonde.data === null) return { ok: false, raison: "lecture" };
  if (sonde.data.length > 0) return { ok: false, raison: "limite" };
  return { ok: true, lignes };
}
