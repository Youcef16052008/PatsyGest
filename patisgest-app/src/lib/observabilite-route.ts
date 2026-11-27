/**
 * Trace minimale des incidents inattendus des routes d'issue de secours.
 *
 * On journalise l'étape et la catégorie technique, jamais le message brut :
 * une erreur PostgREST peut contenir un identifiant de tenant, un fragment de
 * requête ou une valeur d'environnement. Le corps HTTP reste générique.
 */
export function journalErreurRoute(
  origine: string,
  etape: string,
  erreur: unknown,
): void {
  console.error(`[${origine}] incident inattendu`, {
    etape,
    type: erreur instanceof Error ? erreur.name : typeof erreur,
  });
}
