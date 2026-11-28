/**
 * Attente bornée du rafraîchissement de session dans `proxy.ts`.
 *
 * Le problème mesuré : `proxy.ts` abandonnait `supabase.auth.getUser()` au
 * bout de 1 200 ms. Or c'est pendant cet appel que `@supabase/ssr` **écrit les
 * nouveaux cookies** via `setAll`. En abandonnant trop tôt, la réponse partait
 * AVEC les anciens cookies et sans la rotation : sur une connexion lente, la
 * session rafraîchie était perdue en silence, à chaque requête.
 *
 * La correction ne consiste donc pas à attendre plus longtemps (cela
 * bloquerait la navigation hors-ligne), mais à **savoir dans quel cas on
 * abandonne** :
 *   - le rafraîchissement aboutit dans le budget  → réponse normale ;
 *   - il échoue (hors ligne, réseau)             → on file tout de suite,
 *     c'est le comportement attendu hors-ligne ;
 *   - le budget expire alors qu'il est EN VOL    → on répond quand même,
 *     mais on marque la réponse (`x-patisgest-session-stale`) pour que la
 *     perte de rotation soit observable au lieu d'être silencieuse.
 *
 * Module pur : il ne touche ni `NextResponse` ni Supabase, ce qui le rend
 * testable sans pile réseau.
 */

/** En-tête posé lorsque une rotation de cookie peut encore aboutir après la réponse. */
export const EN_TETE_SESSION_PERIMEE = "x-patisgest-session-stale";

/**
 * Budget total d'attente. Mesuré : à 1 200 ms une connexion lente perdait la
 * rotation ; 2 500 ms couvre les rafraîchissements lents observés sans
 * retarder sensiblement une navigation hors-ligne (celle-ci échoue vite).
 */
export const BUDGET_SESSION_MS = 2500;

export type IssueRafraichissement = "fini" | "echec" | "budget";

export type ResultatRafraichissement = {
  issue: IssueRafraichissement;
  /** true si une rotation de cookie peut encore arriver APRÈS cette réponse. */
  perime: boolean;
  dureeMs: number;
};

/**
 * Attend `rafraichir()` au plus `budgetMs`.
 *
 * Ne lève jamais : un rejet est traduit en `issue: "echec"` (hors-ligne).
 * Le minuteur est toujours annulé, y compris en cas de succès rapide, pour ne
 * pas maintenir la boucle d'événements en vie.
 */
export async function attendreRafraichissement(
  rafraichir: () => Promise<unknown>,
  {
    budgetMs = BUDGET_SESSION_MS,
    horloge = () => Date.now(),
  }: { budgetMs?: number; horloge?: () => number } = {},
): Promise<ResultatRafraichissement> {
  const debut = horloge();
  let minuteur: ReturnType<typeof setTimeout> | undefined;

  // `then(succès, échec)` : le rejet est traité ici, donc jamais « unhandled ».
  const travail = Promise.resolve()
    .then(rafraichir)
    .then(
      () => "fini" as const,
      () => "echec" as const,
    );

  const budget = new Promise<"budget">((resoudre) => {
    minuteur = setTimeout(() => resoudre("budget"), Math.max(0, budgetMs));
  });

  try {
    const issue = await Promise.race([travail, budget]);
    return {
      issue,
      // Un échec n'est PAS « périmé » : aucune rotation n'est en attente.
      perime: issue === "budget",
      dureeMs: horloge() - debut,
    };
  } finally {
    if (minuteur !== undefined) clearTimeout(minuteur);
  }
}
