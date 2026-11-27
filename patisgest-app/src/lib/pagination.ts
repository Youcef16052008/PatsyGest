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
 *
 * Une page COURTE n'est acceptée comme fin de collection qu'après une sonde à
 * l'offset suivant : un PostgREST lent, un proxy ou une réponse partielle ne
 * doit jamais transformer un export 20 000 lignes en fichier silencieusement
 * incomplet.
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

  const sonde = async (
    offset: number,
  ): Promise<Extract<PagesLues<T>, { ok: false }> | null> => {
    const page = await lirePage(offset, 1);
    if (page.error !== undefined && page.error !== null) return { ok: false, raison: "lecture", error: page.error };
    if (page.data === null) return { ok: false, raison: "lecture" };
    if (page.data.length > 1) {
      return { ok: false, raison: "lecture", error: new Error("Une sonde de pagination a renvoyé plusieurs lignes.") };
    }
    if (page.data.length > 0) return { ok: false, raison: "limite" };
    return null;
  };

  const lignes: T[] = [];
  while (lignes.length < limiteTotale) {
    const offset = lignes.length;
    const quantite = Math.min(taillePage, limiteTotale - offset);
    const page = await lirePage(offset, quantite);
    if (page.error !== undefined && page.error !== null) return { ok: false, raison: "lecture", error: page.error };
    if (page.data === null) return { ok: false, raison: "lecture" };
    if (page.data.length > quantite) {
      return { ok: false, raison: "lecture", error: new Error("Une page a dépassé la taille demandée.") };
    }
    lignes.push(...page.data);
    if (page.data.length < quantite) {
      const suite = await sonde(offset + page.data.length);
      if (suite?.raison === "limite") {
        return {
          ok: false,
          raison: "lecture",
          error: new Error("Réponse paginée tronquée : une ligne existe après une page courte."),
        };
      }
      if (suite) return suite;
      return { ok: true, lignes };
    }
  }

  const apresLimite = await sonde(limiteTotale);
  if (apresLimite) return apresLimite;
  return { ok: true, lignes };
}
