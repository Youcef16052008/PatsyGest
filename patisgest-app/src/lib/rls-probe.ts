/**
 * Protocole de test RLS — la leçon la plus utile de la check-list 60 cas.
 *
 * Deux pièges découverts en écrivant ces tests, et qui les rendaient
 * **silencieusement faux** :
 *
 * 1. **La session du connecteur SQL est `postgres`, superutilisateur.** Il
 *    contourne la RLS. Un test qui se contente de poser
 *    `request.jwt.claims` ne teste donc RIEN : il lit et écrit tout. Il faut
 *    aussi basculer le rôle (`set_config('role','authenticated',true)`).
 *
 * 2. **`set_config('role', …)` vaut `none`.** PostgreSQL attend le nom d'un
 *    rôle existant ; `none` signifie « garde ton rôle actuel » et ne change
 *    rien. Le nom doit être `authenticated` / `anon`.
 *
 * Ce module produit le préambule SQL correct et rappelle les assertions
 * attendues, pour que chaque test RLS soit explicite au lieu d'être supposé.
 */

export type Persona = "anon" | "vendeur" | "labo" | "proprietaire";

export const EMAILS: Record<Exclude<Persona, "anon">, string> = {
  proprietaire: "amina@patisserie.dz",
  labo: "sara@patisserie.dz",
  vendeur: "amine@patisserie.dz",
};

/**
 * Préambule SQL : bascule sur le rôle `authenticated` avec le JWT du persona.
 * `anon` n'a pas de ligne `utilisateurs` : on le laisse sans claims, en rôle
 * `anon`, ce qui est exactement ce que voit PostgREST sans jeton.
 */
export function preambule(persona: Persona): string {
  if (persona === "anon") {
    return [
      "perform set_config('request.jwt.claims', '', true);",
      "perform set_config('role', 'anon', true);",
    ].join("\n");
  }
  return [
    `select auth_user_id into v_uid from public.utilisateurs where email = '${EMAILS[persona]}';`,
    "if v_uid is null then raise exception 'Persona % introuvable', '" + persona + "'; end if;",
    "perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);",
    "perform set_config('role', 'authenticated', true);",
  ].join("\n");
}

/** Ce que chaque persona DOIT obtenir sur les tables de coût. */
export const PEUT_LIRE_COUTS: Record<Persona, boolean> = {
  anon: false,
  vendeur: false,
  labo: true,
  proprietaire: true,
};

/** Ce que chaque persona DOIT pouvoir faire sur l'identité légale (clients). */
export const PEUT_ECRIRE_IDENTITE: Record<Persona, boolean> = {
  anon: false,
  vendeur: false,
  labo: false, // seule exception : le propriétaire
  proprietaire: true,
};

/** Ce que chaque persona DOIT pouvoir faire sur le stock (articles/lots). */
export const PEUT_ECRIRE_STOCK: Record<Persona, boolean> = {
  anon: false,
  vendeur: false, // un vendeur encaisse, il ne réceptionne pas
  labo: true,
  proprietaire: true,
};

/**
 * Vérifie qu'un relevé respecte la politique attendue. Renvoie la liste des
 * écarts, vide si tout est conforme.
 */
export function ecartsPolitique(
  persona: Persona,
  releve: { couts: number; identiteModifiee: number; stockModifie: number },
): string[] {
  const ecarts: string[] = [];
  const peutCouts = PEUT_LIRE_COUTS[persona];
  if (peutCouts && releve.couts === 0) ecarts.push(`${persona} devrait lire les coûts mais en lit 0`);
  if (!peutCouts && releve.couts > 0) ecarts.push(`${persona} lit ${releve.couts} ligne(s) de coût — FUITE`);

  const peutIdentite = PEUT_ECRIRE_IDENTITE[persona];
  if (!peutIdentite && releve.identiteModifiee > 0) {
    ecarts.push(`${persona} a modifié ${releve.identiteModifiee} ligne(s) d'identité légale — FUITE`);
  }
  if (peutIdentite && releve.identiteModifiee === 0) {
    ecarts.push(`${persona} devrait pouvoir modifier l'identité mais 0 ligne touchée`);
  }

  const peutStock = PEUT_ECRIRE_STOCK[persona];
  if (!peutStock && releve.stockModifie > 0) {
    ecarts.push(`${persona} a modifié le stock (${releve.stockModifie}) — FUITE`);
  }
  if (peutStock && releve.stockModifie === 0 && persona !== "anon") {
    ecarts.push(`${persona} devrait pouvoir réceptionner du stock`);
  }
  return ecarts;
}
