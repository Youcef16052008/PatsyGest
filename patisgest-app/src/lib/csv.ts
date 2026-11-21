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
const FORMULE = /^[=+\-@\t\r]/;

export type ValeurCsv =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | readonly ValeurCsv[]
  | { readonly [cle: string]: ValeurCsv };

function echapper(valeur: string): string {
  let s = valeur;
  // Excel/LibreOffice peuvent ignorer les espaces de tête avant une formule.
  if (/^[\s\uFEFF]*[=+\-@]/.test(s) || FORMULE.test(s)) s = "'" + s;
  if (A_ESCAPER.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Rendu déterministe des valeurs complexes sans perdre leurs propriétés JSON. */
function valeurTexte(valeur: Exclude<ValeurCsv, null | undefined>): string {
  if (Array.isArray(valeur)) {
    return valeur.map((item) => item == null ? "" : valeurTexte(item)).join(", ");
  }
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? "" : valeur.toISOString();
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) return "";
    // Excel FR : virgule décimale, pas de séparateur de milliers.
    return String(valeur).replace(".", ",");
  }
  if (typeof valeur === "boolean") return valeur ? "oui" : "non";
  if (typeof valeur === "object") {
    // Une cellule JSON explicite est plus utile que [object Object]. Trier les
    // clés à chaque niveau rend les exports comparables d'une exécution à l'autre.
    return JSON.stringify(valeur, (_cle, item: unknown) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const objet = item as Record<string, unknown>;
        return Object.fromEntries(Object.keys(objet).sort().map((cle) => [cle, objet[cle]]));
      }
      return item;
    });
  }
  return String(valeur);
}

/** Une valeur → une cellule CSV. Les dates sont rendues en ISO (tri lexicographique). */
export function cellule(valeur: ValeurCsv): string {
  if (valeur === null || valeur === undefined) return "";
  // Les nombres typés restent de vraies valeurs numériques (notamment les
  // montants négatifs) ; c'est le texte utilisateur qui doit être neutralisé.
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) return "";
    return String(valeur).replace(".", ",");
  }
  if (typeof valeur === "boolean") return valeur ? "oui" : "non";
  return echapper(valeurTexte(valeur));
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
};

export const TABLES_EXPORT: readonly TableExport[] = [
  { cle: "ventes", table: "ventes", titre: "Ventes" },
  { cle: "mouvements", table: "mouvements", titre: "Mouvements de stock" },
  { cle: "lots", table: "lots", titre: "Lots" },
  { cle: "articles", table: "articles", titre: "Articles" },
  { cle: "clotures", table: "clotures", titre: "Clôtures" },
  { cle: "transferts", table: "transferts", titre: "Transferts" },
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
