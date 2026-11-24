/**
 * NF-10 — présentation du journal d'audit.
 *
 * Pur et testable (aucune dépendance Next/Supabase), comme `dashboard-insights`
 * et `cost-sheet` : la règle « ce qu'on affiche et ce qu'on ne lâche pas » ne
 * doit pas dépendre d'une page.
 *
 * Deux responsabilités :
 *   1. traduire une ligne brute `journal_audit` en libellé lisible en français ;
 *   2. ne jamais exposer plus que le journal ne contient déjà : ce module ne
 *      reconstruit aucun montant, aucun coût, aucun secret.
 */

/** Une ligne telle que lue par l'application (colonnes utiles seulement). */
export type LigneAudit = {
  id: string;
  cree_le: string;
  acteur_email: string;
  acteur_id: string | null;
  action: string;
  table_cible: string;
  ligne_id: string | null;
  details: unknown;
};

export type AuditAffiche = {
  id: string;
  quand: string;
  acteur: string;
  libelle: string;
  cible: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "autre";
  /** true si l'acteur n'est pas un compte identifié (import, tâche de service). */
  systeme: boolean;
};

/** Libellés métier des tables auditées (CDC §4.1). */
const TABLES: Record<string, string> = {
  ventes: "Vente",
  mouvements: "Mouvement de stock",
  clotures: "Clôture",
  ordres_fabrication: "Ordre de fabrication",
  articles: "Article",
  lots: "Lot",
  utilisateurs: "Compte / rôle",
};

/** Libellé court de la cible : « Vente », « Lot », « Compte / rôle »… */
export function libelleTable(table: string): string {
  return TABLES[table] ?? table;
}

/**
 * Traduit `action` (forme `table.operation` produite par le déclencheur) en
 * phrase française. Une action inconnue est affichée telle quelle : mieux vaut
 * montrer une valeur brute que masquer une ligne d'audit.
 */
export function libelleAction(action: string, table: string): string {
  const operation = action.split(".").pop()?.toLowerCase() ?? "";
  const cible = libelleTable(table);
  switch (operation) {
    case "insert": return `${cible} créé`;
    case "update": return `${cible} modifié`;
    case "delete": return `${cible} supprimé`;
    default: return action || `${cible} (action inconnue)`;
  }
}

function operationDe(action: string): AuditAffiche["operation"] {
  const operation = action.split(".").pop()?.toUpperCase();
  return operation === "INSERT" || operation === "UPDATE" || operation === "DELETE"
    ? operation
    : "autre";
}

/**
 * Formate une date ISO pour l'affichage. Le fuseau est celui d'Alger
 * (`Africa/Algiers`) : c'est le fuseau métier du pilote (R5). On ne réutilise
 * pas `toISOString().slice(0,10)` — c'est précisément le bug de date UTC que la
 * revue R5 a identifié sur les formulaires métier.
 */
export function quandAudit(iso: string, fuseau = "Africa/Algiers"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = new Intl.DateTimeFormat("fr-DZ", {
    timeZone: fuseau,
    dateStyle: "short",
    timeStyle: "short",
  });
  // fr-DZ utilise des espaces insécables et parfois des séparateurs exotiques.
  return fmt.format(d).replace(/[\u202f\u00a0]/g, " ");
}

/**
 * Transforme des lignes brutes en lignes affichables.
 * `limite` borne le rendu : le journal d'un an représente des dizaines de
 * milliers de lignes, on n'en envoie pas plus d'une page au navigateur.
 */
export function presenterJournal(lignes: LigneAudit[], limite = 200): AuditAffiche[] {
  return lignes.slice(0, Math.max(0, limite)).map((l) => ({
    id: l.id,
    quand: quandAudit(l.cree_le),
    acteur: l.acteur_email?.trim() || "inconnu",
    libelle: libelleAction(l.action, l.table_cible),
    cible: l.ligne_id ? `${libelleTable(l.table_cible)} ${l.ligne_id.slice(0, 8)}` : libelleTable(l.table_cible),
    operation: operationDe(l.action),
    systeme: l.acteur_id === null,
  }));
}

/**
 * Résumé par opération, pour l'en-tête de l'écran.
 * Ne compte que les lignes reçues : c'est un résumé de page, pas un total du
 * journal (qui demanderait un `count(*)` séparé sur des dizaines de milliers de
 * lignes). Le libellé de l'écran doit le dire pour ne pas mentir.
 */
export function resumeJournal(affiches: AuditAffiche[]): { creations: number; modifications: number; suppressions: number } {
  return {
    creations: affiches.filter((a) => a.operation === "INSERT").length,
    modifications: affiches.filter((a) => a.operation === "UPDATE").length,
    suppressions: affiches.filter((a) => a.operation === "DELETE").length,
  };
}
