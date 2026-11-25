/**
 * Politique de rôles — pur, sans dépendance Next/Supabase, donc testable
 * (NF-08). `auth.ts` ré-exporte ces fonctions pour ne pas dupliquer la règle.
 *
 * Séparation stricte des 3 personnes métier :
 *   • `proprietaire` : accès complet à tous les modules, prix, coûts, marges,
 *     salaires, suppression/annulation de dettes/recettes, paramètres équipe.
 *   • `labo` : production, planning, recettes (grammages/moules sans coûts ni
 *     suppression), stocks/achats (quantités/DLC sans prix), transferts, qualité,
 *     traçabilité, gâteaux vue atelier. Peut suggérer un prix pour validation
 *     patron (non vendable en caisse tant que le patron n'a pas approuvé).
 *     Zéro accès caisse, clôture financière, crédits, simulation ou coûts.
 *   • `vendeur` : caisse rapide, carnet de crédits (ajout & encaissement de
 *     règlement, jamais annulation/modification de dette), gâteaux comptoir
 *     (encaisser acomptes/soldes & livrer, jamais créer/modifier le prix d'un
 *     devis), clôture tiroir en mode aveugle (« compter ma caisse » sans voir
 *     les écarts ni les ventes globales), disponibilité boutique + réassort.
 */

export type Role = "proprietaire" | "labo" | "vendeur";

export type AppModule =
  | "stocks"
  | "achats"
  | "recettes"
  | "production"
  | "transferts"
  | "simulation"
  | "planning"
  | "tracabilite"
  | "cake-design"
  | "qualite"
  | "cloture"
  | "caisse";

export const MODULE_ROLES: Record<AppModule, readonly Role[]> = {
  stocks: ["proprietaire", "labo", "vendeur"],
  achats: ["proprietaire", "labo"],
  recettes: ["proprietaire", "labo"],
  production: ["proprietaire", "labo"],
  transferts: ["proprietaire", "labo"],
  simulation: ["proprietaire"],
  planning: ["proprietaire", "labo"],
  tracabilite: ["proprietaire", "labo"],
  "cake-design": ["proprietaire", "labo", "vendeur"],
  qualite: ["proprietaire", "labo"],
  cloture: ["proprietaire", "vendeur"],
  caisse: ["proprietaire", "vendeur"],
};

export function canAccessModule(role: Role, moduleKey: string): boolean {
  if (role === "proprietaire") return true;
  if (!Object.hasOwn(MODULE_ROLES, moduleKey)) return false;
  return MODULE_ROLES[moduleKey as AppModule].includes(role);
}

/** Qui peut écrire sur le périmètre atelier/stock (stocks, recettes, OF, achats, rappels). */
export function canWrite(role: Role): boolean {
  return role === "proprietaire" || role === "labo";
}

/**
 * Qui peut lire la STRUCTURE DE COÛTS (RC-01..RC-10) : matières FEFO,
 * MO chargée, énergie, frais généraux, taux horaire et charges.
 */
export function canReadCosts(role: Role): boolean {
  return role === "proprietaire";
}

/** Seul le propriétaire fixe ou modifie les prix de vente, la TVA ou les charges/salaires. */
export function canManagePrices(role: Role): boolean {
  return role === "proprietaire";
}

/** Seul le propriétaire peut créer un devis chiffré ou modifier le prix d'une commande gâteau. */
export function canCreateOrEditCakeQuotes(role: Role): boolean {
  return role === "proprietaire";
}

/** Qui peut encaisser au comptoir (POS). Le labo n'a jamais accès à la caisse. */
export function canSellAtPos(role: Role): boolean {
  return role === "proprietaire" || role === "vendeur";
}

/** Qui peut enregistrer un crédit ou un règlement client au comptoir. */
export function canUseCredits(role: Role): boolean {
  return role === "proprietaire" || role === "vendeur";
}

/** Seul le propriétaire peut annuler, modifier le total ou supprimer une dette client. */
export function canManageCreditsAdmin(role: Role): boolean {
  return role === "proprietaire";
}

/** Seul le propriétaire peut supprimer une recette ou modifier les paramètres de coûts/salaires. */
export function canDeleteRecipes(role: Role): boolean {
  return role === "proprietaire";
}

/**
 * Rôles labo et vendeur activés avec leurs vues sécurisées sans colonnes financières
 * réconciliées dans `supabase/50-roles-permissions-vues.sql`.
 */
export const ROLES_LABO_VENDEUR_ACTIFS = true;

/** Un rôle peut-il être attribué ou utilisé sur cette version ? */
export function roleDisponible(role: Role): boolean {
  return role === "proprietaire" || ROLES_LABO_VENDEUR_ACTIFS;
}

/**
 * NF-10 : qui peut lire le journal d'audit du tenant (propriétaire uniquement).
 */
export function canReadAudit(role: Role): boolean {
  return role === "proprietaire";
}
