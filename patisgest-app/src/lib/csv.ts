/**
 * MOD-15 — Export CSV (US-15.2 « export complet, aucune donnée prisonnière »).
 *
 * Pur et testable. Contraintes du terrain prises en compte :
 *  - **Excel FR** : le séparateur attendu est `;` (la virgule est le séparateur
 *    décimal) et les accents/symboles exigent un BOM UTF-8, sinon `é` devient
 *    `Ã©` et le comptable ne peut pas exploiter le fichier.
 *  - **RFC 4180** : un champ contenant `;`, `"`, un saut de ligne ou un espace
 *    significatif est entouré de guillemets, les guillemets internes doublés.
 *  - **Injection de formule** (OWASP CSV injection) : un champ commençant par
 *    `=`, `+`, `-`, `@`, tabulation ou retour chariot est exécuté par Excel.
 *    On le préfixe d'une apostrophe. Un nom de client tapé au comptoir ne doit
 *    pas pouvoir devenir une formule dans le poste du comptable.
 *  - **Nombres** : jamais de séparateur de milliers, virgule décimale pour
 *    Excel FR ; un montant `null` devient une cellule vide, pas `NaN`.
 */

export const CSV_SEPARATEUR = ";";
export const CSV_BOM = "\uFEFF";

/** Délimiteurs qui déclenchent l'échappement RFC 4180. */
const A_ESCAPER = /["\n\r;]/;
/** Préfixes interprétés comme formules par Excel / LibreOffice. */
const FORMULE = /^\s*[=+\-@\t\r]/;

export type ValeurCsv = string | number | boolean | null | undefined | Date | string[];

function echapper(valeur: string): string {
  let s = valeur;
  if (FORMULE.test(s)) s = "'" + s;
  if (A_ESCAPER.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Une valeur → une cellule CSV. Les dates sont rendues en ISO (tri lexicographique). */
export function cellule(valeur: ValeurCsv): string {
  if (valeur === null || valeur === undefined) return "";
  if (Array.isArray(valeur)) return echapper(valeur.join(", "));
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? "" : valeur.toISOString();
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) return "";
    // Excel FR : virgule décimale, pas de séparateur de milliers.
    return String(valeur).replace(".", ",");
  }
  if (typeof valeur === "boolean") return valeur ? "oui" : "non";
  return echapper(String(valeur));
}

/** Assemble un CSV complet (entête + lignes) avec BOM et CRLF. */
export function versCsv(
  entetes: readonly string[],
  lignes: readonly (readonly ValeurCsv[])[],
): string {
  const out: string[] = [entetes.map((h) => echapper(h)).join(CSV_SEPARATEUR)];
  for (const ligne of lignes) {
    out.push(ligne.map(cellule).join(CSV_SEPARATEUR));
  }
  return CSV_BOM + out.join("\r\n") + "\r\n";
}

/** Nom de fichier sûr et horodaté : `patisgest-ventes-2026-11-17.csv`. */
export function nomFichier(prefixe: string, date = new Date()): string {
  const jour = date.toISOString().slice(0, 10);
  const base = prefixe
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `patisgest-${base || "export"}-${jour}.csv`;
}

/**
 * Tables exportables et leur rôle minimum. `cout: true` = la table porte des
 * données de coût : réservée à propriétaire/labo (cf. migration 17).
 */
export type TableExport = {
  cle: string;
  table: string;
  titre: string;
  cout?: boolean;
  /** F-15 : colonne de date pour le filtre de période (absente = pas de filtre). */
  colonneDate?: string;
};

export const TABLES_EXPORT: readonly TableExport[] = [
  { cle: "ventes", table: "ventes", titre: "Ventes", colonneDate: "date_vente" },
  { cle: "mouvements", table: "mouvements", titre: "Mouvements de stock", colonneDate: "date_mvt" },
  { cle: "lots", table: "lots", titre: "Lots", colonneDate: "date_reception" },
  { cle: "articles", table: "articles", titre: "Articles" },
  { cle: "clotures", table: "clotures", titre: "Clôtures", colonneDate: "date_cloture" },
  { cle: "transferts", table: "transferts", titre: "Transferts", colonneDate: "date_transfert" },
  { cle: "ordres", table: "ordres_fabrication", titre: "Ordres de fabrication" },
  { cle: "z-imports", table: "z_imports", titre: "Imports Z" },
  { cle: "cakes", table: "cakes", titre: "Cake design" },
  { cle: "recettes", table: "recette_versions", titre: "Versions de recettes", cout: true },
  { cle: "couts", table: "parametres_couts", titre: "Paramètres de coûts", cout: true },
] as const;

/** Une table de coût n'est exportable que par les rôles qui lisent les coûts. */
export function tableExportable(cle: string, peutLireCouts: boolean): boolean {
  const t = TABLES_EXPORT.find((x) => x.cle === cle);
  if (!t) return false;
  return t.cout ? peutLireCouts : true;
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * F-15 : période d'export `du` / `au` (AAAA-MM-JJ, bornes incluses).
 * Renvoie les bornes valides, ou un message pour la réponse 400.
 */
export function interpreterPeriode(
  du: string | null,
  au: string | null,
): { ok: true; du?: string; au?: string } | { ok: false; message: string } {
  const valide = (v: string) => DATE_ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  if (du !== null && !valide(du)) return { ok: false, message: "Période : « du » doit être une date AAAA-MM-JJ valide." };
  if (au !== null && !valide(au)) return { ok: false, message: "Période : « au » doit être une date AAAA-MM-JJ valide." };
  if (du !== null && au !== null && du > au) return { ok: false, message: "Période : « du » est postérieur à « au »." };
  return { ok: true, ...(du !== null ? { du } : {}), ...(au !== null ? { au } : {}) };
}
