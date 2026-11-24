/**
 * Messages d'erreur Postgres → message utilisateur (Sprint 6, durcissement).
 *
 * Deux familles très différentes arrivent du driver Supabase :
 *
 *  1. **Nos propres messages métier** — `raise exception 'Conversion d unite
 *     manquante : g -> kg (MP-FAR).'` remontés en code `P0001`. Ils sont écrits
 *     en français, sans nom de table : ils doivent être affichés tels quels,
 *     c'est ce qui aide l'utilisateur à corriger sa saisie.
 *
 *  2. **Erreurs techniques** — `duplicate key value violates unique constraint
 *     "ofs_client_ref_uniq"`, `permission denied for table parametres_couts`,
 *     `relation "public.x" does not exist`… Elles exposent le schéma, les noms
 *     de contraintes et parfois des fragments de données. Elles ne doivent
 *     jamais atteindre l'écran : on affiche un message générique et on garde le
 *     détail en console pour le support.
 *
 * Pur et testable.
 */

export type ErreurBase = { code?: string | null; message?: string | null } | null | undefined;

/** Code Postgres des exceptions levées par nos `raise exception` (plpgsql). */
export const CODE_METIER = "P0001";

/** Vrai si l'erreur vient de notre code métier (message affichable). */
export function estErreurMetier(e: ErreurBase): boolean {
  return !!e && e.code === CODE_METIER && typeof e.message === "string" && e.message.length > 0;
}

/**
 * Message à afficher. `contexte` est le préfixe métier (« Vente refusée »).
 * Renvoie `${contexte} : <message métier>` pour P0001, sinon un message
 * générique qui indique à l'utilisateur quoi faire.
 */
export function messageUtilisateur(e: ErreurBase, contexte: string): string {
  if (estErreurMetier(e)) return `${contexte} : ${(e!.message as string).trim()}`;
  const code = e?.code ?? "";
  // Cas nommé avant le générique : l'utilisateur doit savoir QUOI corriger.
  // « Vérifiez la saisie » ne dit pas qu'il vient de saisir deux fois le même
  // numéro de lot, et c'est pourtant la seule chose à faire.
  if (code === "23505" && (e?.message ?? "").includes("lots_reception_unique")) {
    return `${contexte} : ce numéro de lot existe déjà pour cet article sur ce site. Corrigez la quantité du lot existant plutôt que d'en créer un second.`;
  }
  if (code === "23505" || code === "23514" || code === "23503") {
    // Violation d'unicité / de contrainte / de clé étrangère : déjà gérée en
    // amont par nos RPC, donc ici c'est un cas limite de concurrence.
    return `${contexte} : cette opération existe déjà ou viole une règle de gestion. Vérifiez la saisie puis réessayez.`;
  }
  if (code === "23502") {
    // NOT NULL : typiquement une sauvegarde incomplète ou un fichier édité.
    return `${contexte} : une valeur obligatoire manque. Le fichier est incomplet ou a été modifié.`;
  }
  if (code === "42501" || code === "42P01" || code === "42703") {
    return `${contexte} : accès refusé ou configuration incomplète. Contactez l'administrateur.`;
  }
  if (code === "PGRST301" || code === "PGRST116" || code === "") {
    return `${contexte} : impossible de joindre la base. Vérifiez la connexion puis réessayez.`;
  }
  return `${contexte} : opération impossible pour le moment. Réessayez ; si le problème persiste, notez l'heure et contactez le support.`;
}

/** Détail technique pour les logs serveur (jamais renvoyé à l'écran). */
export function detailTechnique(e: ErreurBase): string {
  return `${e?.code ?? "sans-code"} ${e?.message ?? "sans message"}`.trim();
}

/** Garder l’opération en file quand le résultat de l’écriture reste inconnu. */
export function echecHttpReessayable(status: number): boolean {
  return status === 0 || status === 401 || status === 429 || status >= 500;
}
