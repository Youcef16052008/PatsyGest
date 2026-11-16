import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * PâtisGest — Sprint 1 : socle.
 * Miroir de supabase/01-socle.sql (la RLS est définie côté SQL).
 * Règle d'or : client_id partout, isolement via RLS (jamais filtré côté client seul).
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

export type Client = typeof clients.$inferSelect;
export type Utilisateur = typeof utilisateurs.$inferSelect;
export type Site = typeof sites.$inferSelect;
