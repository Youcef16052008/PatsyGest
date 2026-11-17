import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * PâtisGest — Schéma complet (Sprint 1 Socle + Sprint 2+ Modules Métier).
 * Miroir exact de supabase/01-socle.sql et supabase/03-sprint2-modules.sql.
 * Règle d'or : client_id partout, isolement strict via RLS Supabase.
 */

export const roleEnum = pgEnum("role_utilisateur", [
  "proprietaire",
  "labo",
  "vendeur",
]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  adresse: text("adresse"),
  telephone: text("telephone"),
  nif: text("nif"),
  nis: text("nis"),
  rc: text("rc"),
  offre: text("offre").notNull().default("solo"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const utilisateurs = pgTable("utilisateurs", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id").notNull().unique(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  email: text("email").notNull(),
  nom: text("nom"),
  role: roleEnum("role").notNull().default("vendeur"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  nom: text("nom").notNull(),
  /** laboratoire | boutique */
  type: text("type").notNull().default("laboratoire"),
  adresse: text("adresse"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const fournisseurs = pgTable("fournisseurs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  code: text("code"),
  nom: text("nom").notNull(),
  contact: text("contact"),
  telephone: text("telephone"),
  email: text("email"),
  score: integer("score").notNull().default(4),
  delaiJours: integer("delai_jours").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const articles = pgTable("articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  code: text("code").notNull(),
  nom: text("nom").notNull(),
  /** matiere | semifini | produit | emballage | consommable */
  niveau: text("niveau").notNull().default("matiere"),
  unite: text("unite").notNull().default("kg"),
  seuil: numeric("seuil", { precision: 12, scale: 3 }).notNull().default("0"),
  pvHt: numeric("pv_ht", { precision: 12, scale: 2 }).notNull().default("0"),
  tva: numeric("tva", { precision: 5, scale: 2 }).notNull().default("19"),
  allergenes: text("allergenes").array().notNull().default([]),
  traces: text("traces").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const lots = pgTable("lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  fournisseurId: uuid("fournisseur_id").references(() => fournisseurs.id),
  numero: text("numero").notNull(),
  qteInit: numeric("qte_init", { precision: 12, scale: 4 }).notNull(),
  qteRest: numeric("qte_rest", { precision: 12, scale: 4 }).notNull(),
  pu: numeric("pu", { precision: 12, scale: 2 }).notNull().default("0"),
  dlc: date("dlc"),
  dateReception: date("date_reception").notNull().defaultNow(),
  ref: text("ref"),
  congele: boolean("congele").notNull().default(false),
  bloque: boolean("bloque").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mouvements = pgTable("mouvements", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id),
  lotId: uuid("lot_id").references(() => lots.id),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  /** entree | sortie | ecart | ajustement */
  type: text("type").notNull(),
  qte: numeric("qte", { precision: 12, scale: 4 }).notNull(),
  pu: numeric("pu", { precision: 12, scale: 2 }).notNull().default("0"),
  ref: text("ref"),
  motif: text("motif"),
  dateMvt: date("date_mvt").notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const historiquePrix = pgTable("historique_prix", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id),
  fournisseurId: uuid("fournisseur_id").references(() => fournisseurs.id),
  datePrix: date("date_prix").notNull().defaultNow(),
  pu: numeric("pu", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bonsCommande = pgTable("bons_commande", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  fournisseurId: uuid("fournisseur_id")
    .notNull()
    .references(() => fournisseurs.id),
  numero: text("numero").notNull(),
  dateBc: date("date_bc").notNull().defaultNow(),
  statut: text("statut").notNull().default("commande"),
  lignes: jsonb("lignes").notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const recetteFamilles = pgTable("recette_familles", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  code: text("code").notNull(),
  nom: text("nom").notNull(),
  produitId: uuid("produit_id").references(() => articles.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const recetteVersions = pgTable("recette_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  familleId: uuid("famille_id")
    .notNull()
    .references(() => recetteFamilles.id),
  version: integer("version").notNull().default(1),
  rendementQte: numeric("rendement_qte", { precision: 12, scale: 3 })
    .notNull()
    .default("1"),
  rendementUnite: text("rendement_unite").notNull().default("pcs"),
  cuissonPertePct: numeric("cuisson_perte_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  moMin: numeric("mo_min", { precision: 8, scale: 2 }).notNull().default("0"),
  energie: numeric("energie", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  emballage: numeric("emballage", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  fraisGeneraux: numeric("frais_generaux", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  ingredients: jsonb("ingredients").notNull().default([]),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ordresFabrication = pgTable("ordres_fabrication", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  familleId: uuid("famille_id")
    .notNull()
    .references(() => recetteFamilles.id),
  versionId: uuid("version_id")
    .notNull()
    .references(() => recetteVersions.id),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  numero: text("numero").notNull(),
  qtePrevue: numeric("qte_prevue", { precision: 12, scale: 3 }).notNull(),
  qteRealisee: numeric("qte_realisee", { precision: 12, scale: 3 })
    .notNull()
    .default("0"),
  datePrevue: date("date_prevue").notNull().defaultNow(),
  dateLancement: date("date_lancement"),
  statut: text("statut").notNull().default("planifie"),
  snapshot: jsonb("snapshot").notNull().default({}),
  besoins: jsonb("besoins").notNull().default([]),
  consommations: jsonb("consommations").notNull().default([]),
  manquants: jsonb("manquants").notNull().default([]),
  lotsProduits: jsonb("lots_produits").notNull().default([]),
  coutReel: numeric("cout_reel", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ventes = pgTable("ventes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  numero: text("numero").notNull(),
  ticket: text("ticket").notNull(),
  dateVente: date("date_vente").notNull().defaultNow(),
  source: text("source").notNull().default("caisse"),
  lignes: jsonb("lignes").notNull().default([]),
  manquants: jsonb("manquants").notNull().default([]),
  totalHt: numeric("total_ht", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  totalTtc: numeric("total_ttc", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clotures = pgTable("clotures", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id),
  dateCloture: date("date_cloture").notNull().defaultNow(),
  lignes: jsonb("lignes").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cakes = pgTable("cakes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  numero: text("numero").notNull(),
  clientNom: text("client_nom").notNull(),
  telephone: text("telephone"),
  dateEvent: date("date_event").notNull(),
  nbParts: integer("nb_parts").notNull().default(20),
  options: jsonb("options").notNull().default([]),
  prixHt: numeric("prix_ht", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  acompte: numeric("acompte", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  statut: text("statut").notNull().default("devis"),
  cgv: boolean("cgv").notNull().default(false),
  notes: text("notes"),
  retro: jsonb("retro").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const releveTemperatures = pgTable("releve_temperatures", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  dateReleve: date("date_releve").notNull().defaultNow(),
  frigoId: text("frigo_id").notNull(),
  frigoNom: text("frigo_nom").notNull(),
  seuilMax: numeric("seuil_max", { precision: 6, scale: 2 })
    .notNull()
    .default("4"),
  temperature: numeric("temperature", { precision: 6, scale: 2 }).notNull(),
  agent: text("agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const nettoyages = pgTable("nettoyages", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  dateNettoyage: date("date_nettoyage").notNull().defaultNow(),
  zone: text("zone").notNull(),
  fait: boolean("fait").notNull().default(true),
  agent: text("agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const nonConformites = pgTable("non_conformites", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  dateNc: date("date_nc").notNull().defaultNow(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  lotNumero: text("lot_numero"),
  action: text("action"),
  statut: text("statut").notNull().default("Ouverte"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const transferts = pgTable("transferts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  dateTransfert: date("date_transfert").notNull().defaultNow(),
  fromSiteId: uuid("from_site_id")
    .notNull()
    .references(() => sites.id),
  toSiteId: uuid("to_site_id")
    .notNull()
    .references(() => sites.id),
  motif: text("motif"),
  lignes: jsonb("lignes").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tachesPlanning = pgTable("taches_planning", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  dateTache: date("date_tache").notNull().defaultNow(),
  tache: text("tache").notNull(),
  ofNumero: text("of_numero"),
  dureeMin: integer("duree_min").notNull().default(60),
  responsable: text("responsable"),
  fait: boolean("fait").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Client = typeof clients.$inferSelect;
export type Utilisateur = typeof utilisateurs.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type Fournisseur = typeof fournisseurs.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Lot = typeof lots.$inferSelect;
export type Mouvement = typeof mouvements.$inferSelect;
export type BonCommande = typeof bonsCommande.$inferSelect;
export type RecetteFamille = typeof recetteFamilles.$inferSelect;
export type RecetteVersion = typeof recetteVersions.$inferSelect;
export type OrdreFabrication = typeof ordresFabrication.$inferSelect;
export type Vente = typeof ventes.$inferSelect;
export type Cloture = typeof clotures.$inferSelect;
export type Cake = typeof cakes.$inferSelect;
