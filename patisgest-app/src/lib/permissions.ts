/**
 * Politique de rôles — pur, sans dépendance Next/Supabase, donc testable
 * (NF-08). `auth.ts` ré-exporte ces fonctions pour ne pas dupliquer la règle.
 *
 * Cahier §5 / RG-15.2 : propriétaire (tout) · labo (production, recettes,
 * sans lecture des coûts) · vendeur (caisse + clôture en lecture).
 */

export type Role = "proprietaire" | "labo" | "vendeur";

/** Qui peut écrire : stocks, recettes, OF, achats, clôtures, rappels. */
export function canWrite(role: Role): boolean {
  return role === "proprietaire" || role === "labo";
}

/**
 * Qui peut lire la STRUCTURE DE COÛTS (RC-01..RC-10) : matières FEFO,
 * MO chargée, énergie, frais généraux, taux horaire et charges.
 *
 * Le vendeur encaisse : il voit des prix de vente (PV HT/TTC), jamais un
 * coût de revient. Cette règle est appliquée à trois niveaux :
 *   1. navigation/rendu (`canReadCosts` dans la page module) ;
 *   2. actions serveur (`ficheCoutReal`, `simulerReal`) ;
 *   3. RLS Postgres (migration 17, policies SELECT par rôle).
 */
export function canReadCosts(role: Role): boolean {
  return role === "proprietaire";
}

/**
 * F-19 : les rôles labo et vendeur s'appuient sur des vues (`labo_*`,
 * `vendeur_*`) absentes du chemin déployable 01–23 + 25–34. Décision produit :
 * ils sont masqués tant que les migrations 101/115/116 ne sont pas réconciliées.
 * Passer à `true` seulement après réconciliation et test de la matrice app × schéma.
 */
export const ROLES_LABO_VENDEUR_ACTIFS = false;

/** Un rôle peut-il être attribué ou utilisé sur cette version ? */
export function roleDisponible(role: Role): boolean {
  return role === "proprietaire" || ROLES_LABO_VENDEUR_ACTIFS;
}
