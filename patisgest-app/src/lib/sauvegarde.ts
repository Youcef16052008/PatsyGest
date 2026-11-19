/**
 * US-15.2 / CA-15 — sauvegarde et restauration complète (JSON).
 *
 * « Sauvegarde → restauration sur base vide = données identiques. » Ce critère
 * est **automatisable**, contrairement au second volet de CA-15 (onboarding en
 * moins d'une heure, qui est humain). Ce module porte la partie vérifiable :
 * format du fichier, ordre de restauration, et contrôle d'intégrité.
 *
 * Choix de conception :
 *  - **Ordre topologique** : `clients` d'abord, puis les tables sans
 *    dépendance, puis celles qui pointent vers elles. Restaurer dans le
 *    désordre violerait les clés étrangères.
 *  - **Aucune donnée dérivée** : on n'exporte pas les compteurs ; ils se
 *    recalculent. En revanche on exporte tout ce qui a une valeur métier.
 *  - **Les comptes Auth ne sont pas dans le dump** (`auth.users` appartient à
 *    Supabase) : on sauvegarde `utilisateurs` (rôle + rattachement) qui les
 *    référence par `auth_user_id`.
 *  - **Version de format** explicite : un dump d'il y a deux ans doit refuser
 *    de se restaurer dans un schéma qui a changé, pas corrompre la base.
 */

export const FORMAT_SAUVEGARDE = "patisgest-sauvegarde";
export const VERSION_FORMAT = 1;
// Laisse une marge pour l’enveloppe multipart (Next.js et hébergeur).
export const MAX_OCTETS_SAUVEGARDE = 4 * 1024 * 1024;

/** Ordre de restauration : chaque table ne dépend que de celles avant elle. */
export const ORDRE_RESTAURATION = [
  "clients",
  "sites",
  "fournisseurs",
  "articles",
  "conversions",
  "parametres_couts",
  "recette_familles",
  "recette_versions",
  "lots",
  "mouvements",
  "historique_prix",
  "bons_commande",
  "ordres_fabrication",
  "ventes",
  "z_imports", // FK vers ventes : doit suivre ventes, pas le précéder
  "clotures",
  "transferts",
  "demandes_reassort", // FK vers clients, sites, articles, ordres_fabrication, transferts
  "cakes",
  "releve_temperatures",
  "nettoyages",
  "non_conformites",
  "taches_planning",
] as const;

/** Tables volontairement exclues, avec la raison (transparence RG-15.1). */
export const TABLES_EXCLUES: { table: string; raison: string }[] = [
  { table: "utilisateurs", raison: "rattachés à des comptes Auth Supabase (auth.users) — à recréer côté Auth" },
  { table: "acces_modules", raison: "réglages par compte non restaurés par le format actuel" },
  { table: "equipe_sites", raison: "affectations de sites non restaurées par le format actuel, si la fonctionnalité équipe est installée" },
  { table: "equipe_demandes", raison: "demandes et décisions d'adhésion non restaurées par le format actuel, si la fonctionnalité équipe est installée" },
  { table: "equipe_invitations", raison: "invitations non restaurées par le format actuel, si la fonctionnalité équipe est installée" },
  { table: "equipe_codes", raison: "codes d'équipe non restaurés par le format actuel, si la fonctionnalité équipe est installée" },
  { table: "equipe_journal_acces", raison: "journal d'accès non restauré par le format actuel, si la fonctionnalité équipe est installée" },
  { table: "equipe_admission_securite", raison: "état de sécurité de l'admission non restauré par le format actuel, si la fonctionnalité équipe est installée" },
];

/**
 * Colonne d'isolation multi-tenant, par table.
 *
 * `clients` n'a **pas** de `client_id` : sa clé est `id`, et toutes les autres
 * tables la référencent par `client_id`. Filtrer `clients` sur `client_id`
 * produit une erreur PostgREST (« column does not exist ») et fait échouer la
 * sauvegarde entière. Ce piège a été livré une fois ; il est désormais testé.
 */
export const COLONNE_TENANT: Record<string, "client_id" | "id"> = {
  clients: "id",
};

export function colonneTenant(table: string): "client_id" | "id" {
  return COLONNE_TENANT[table] ?? "client_id";
}

/**
 * Tables racines : elles ne s'insèrent pas, elles existent déjà. Sur une base
 * vierge, `clients` doit être créé avant toute ligne enfant, sinon les 21 clés
 * étrangères vers `clients.id` échouent. La restauration vérifie donc que le
 * client existe, au lieu de tenter un insert.
 */
export const TABLE_RACINE = "clients";

export function estTableRacine(table: string): boolean {
  return table === TABLE_RACINE;
}

export type TableSauvegardee = { table: string; lignes: Record<string, unknown>[] };

export type Sauvegarde = {
  format: typeof FORMAT_SAUVEGARDE;
  version: number;
  genere_le: string;
  client_id: string;
  client_nom: string;
  /** Dump complet, une entrée par table de ORDRE_RESTAURATION. */
  tables: TableSauvegardee[];
  /** Empreinte du contenu (détecte un fichier tronqué ou modifié). */
  empreinte: string;
  /** Tables non incluses, pour que l'utilisateur sache ce qu'il n'a pas. */
  exclues: { table: string; raison: string }[];
};

/**
 * Empreinte FNV-1a sur la sérialisation canonique : suffisante pour détecter
 * une troncature ou une altération accidentelle d'un fichier de sauvegarde
 * (ce n'est pas une signature cryptographique et ce n'est pas le but).
 */
export function empreinte(contenu: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < contenu.length; i++) {
    h ^= contenu.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Sérialisation canonique : clés triées, pour une empreinte stable. */
export function canonique(valeur: unknown): string {
  if (valeur === null || typeof valeur !== "object") return JSON.stringify(valeur) ?? "null";
  if (Array.isArray(valeur)) return `[${valeur.map(canonique).join(",")}]`;
  const obj = valeur as Record<string, unknown>;
  const cles = Object.keys(obj).sort();
  return `{${cles.map((k) => `${JSON.stringify(k)}:${canonique(obj[k])}`).join(",")}}`;
}

/** Construit une sauvegarde prête à être écrite sur disque. */
export function construireSauvegarde(
  clientId: string,
  clientNom: string,
  tables: TableSauvegardee[],
  genereLe = new Date(),
): Sauvegarde {
  // Ordre imposé, même si l'appelant les fournit dans le désordre.
  const parNom = new Map(tables.map((t) => [t.table, t]));
  const ordonnees: TableSauvegardee[] = ORDRE_RESTAURATION
    .filter((t) => parNom.has(t))
    .map((t) => ({ table: t, lignes: parNom.get(t)!.lignes ?? [] }));
  const corps = { client_id: clientId, tables: ordonnees };
  return {
    format: FORMAT_SAUVEGARDE,
    version: VERSION_FORMAT,
    genere_le: genereLe.toISOString(),
    client_id: clientId,
    client_nom: clientNom,
    tables: ordonnees,
    empreinte: empreinte(canonique(corps)),
    exclues: TABLES_EXCLUES,
  };
}

export type Probleme = { champ: string; message: string };

/**
 * Valide un fichier de sauvegarde AVANT toute écriture en base. Une
 * restauration partielle est pire qu'un refus : on refuse en bloc.
 */
export function validerSauvegarde(brut: unknown): { ok: boolean; problemes: Probleme[] } {
  const problemes: Probleme[] = [];
  const s = brut as Partial<Sauvegarde> | null;
  if (!s || typeof s !== "object") {
    return { ok: false, problemes: [{ champ: "racine", message: "Fichier illisible : ce n'est pas du JSON." }] };
  }
  if (s.format !== FORMAT_SAUVEGARDE) {
    problemes.push({ champ: "format", message: `Ce fichier n'est pas une sauvegarde PâtisGest (format attendu « ${FORMAT_SAUVEGARDE} »).` });
  }
  if (s.version !== VERSION_FORMAT) {
    problemes.push({
      champ: "version",
      message: `Version de format ${String(s.version)} non prise en charge (attendu ${VERSION_FORMAT}). Mettez l'application à jour.`,
    });
  }
  if (!s.client_id || typeof s.client_id !== "string") {
    problemes.push({ champ: "client_id", message: "client_id absent." });
  }
  if (!Array.isArray(s.tables)) {
    problemes.push({ champ: "tables", message: "Aucune table dans le fichier." });
  } else {
    const vues = new Set<string>();
    for (const t of s.tables) {
      if (!t || typeof t.table !== "string" || !Array.isArray(t.lignes)) {
        problemes.push({ champ: "tables", message: "Entrée de table malformée." });
        continue;
      }
      if (!(ORDRE_RESTAURATION as readonly string[]).includes(t.table)) {
        problemes.push({ champ: `tables.${t.table}`, message: `Table inconnue « ${t.table} » : le fichier ne correspond pas à cette version de l'application.` });
      }
      if (vues.has(t.table)) {
        problemes.push({ champ: `tables.${t.table}`, message: `Table « ${t.table} » présente deux fois.` });
      }
      vues.add(t.table);
    }
    if (problemes.length === 0) {
      const attendu = empreinte(canonique({ client_id: s.client_id, tables: s.tables }));
      if (s.empreinte !== attendu) {
        problemes.push({ champ: "empreinte", message: "Empreinte invalide : le fichier a été modifié ou tronqué. Restauration refusée." });
      }
    }
  }
  return { ok: problemes.length === 0, problemes };
}

/** Lit et vérifie le fichier reçu, à l'analyse comme à la confirmation. */
export async function lireFichierSauvegarde(
  fichier: FormDataEntryValue | null,
  clientId: string,
): Promise<{ dump: Sauvegarde } | { erreur: string }> {
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez un fichier de sauvegarde." };
  if (fichier.size > MAX_OCTETS_SAUVEGARDE) return { erreur: "Fichier trop volumineux (4 Mio maximum)." };

  try {
    const brut: unknown = JSON.parse(await fichier.text());
    const validation = validerSauvegarde(brut);
    if (!validation.ok) {
      return { erreur: `Sauvegarde refusée : ${validation.problemes.map((p) => p.message).join(" ")}` };
    }
    const dump = brut as Sauvegarde;
    if (dump.client_id !== clientId) {
      return { erreur: "Cette sauvegarde appartient à un autre établissement : restauration interdite." };
    }
    return { dump };
  } catch {
    return { erreur: "Fichier illisible : ce n'est pas du JSON valide ou traitable." };
  }
}

/** Résumé lisible avant d'ajouter les lignes manquantes. */
export function resumeSauvegarde(s: Sauvegarde): { table: string; lignes: number }[] {
  return s.tables.map((t) => ({ table: t.table, lignes: t.lignes.length }));
}

export function totalLignes(s: Sauvegarde): number {
  return s.tables.reduce((n, t) => n + t.lignes.length, 0);
}

/** Nom de fichier de sauvegarde horodaté (seconde près : deux dumps/jour). */
export function nomFichierSauvegarde(clientNom: string, date = new Date()): string {
  const base = clientNom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const horo = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `patisgest-sauvegarde-${base || "etablissement"}-${horo}.json`;
}
