import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Client Drizzle DIRECT (contourne la RLS : usage scripts/jobs serveur UNIQUEMENT).
 * Les lectures applicatives passent par le client Supabase serveur (RLS active).
 * Voir src/lib/supabase/server.ts et doc Architecture §5/§7.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL manquante. Copie .env.example vers .env.local (voir README)."
  );
}

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
