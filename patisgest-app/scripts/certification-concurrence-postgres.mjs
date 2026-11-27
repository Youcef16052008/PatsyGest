#!/usr/bin/env node
/**
 * Concurrence sur un VRAI PostgreSQL avec deux connexions distinctes.
 *
 * Aucune table métier n'est créée, modifiée ni supprimée : le test utilise deux
 * verrous d'avis transactionnels et un rendez-vous partagé. Il peut donc être
 * exécuté contre le PostgreSQL hébergé via SUPABASE_DB_URL sans écriture de
 * données. PGlite, mono-connexion, ne peut pas produire cette preuve.
 */
import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const URL_HOSTED = process.env.PATSYGEST_HOSTED_PG_URL ?? process.env.SUPABASE_DB_URL ?? "";
const URL_CI = process.env.PATSYGEST_PG_URL ?? "";
const URL = URL_HOSTED || URL_CI;
const SOURCE = URL_HOSTED ? "hosted" : "ci-service";

function urlSecurisee() {
  if (!URL_HOSTED) return URL;
  const u = new URL(URL);
  if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
  return u.toString();
}

function nouveauClient() {
  return new Client({
    connectionString: urlSecurisee(),
    connectionTimeoutMillis: 15_000,
    ssl: URL_HOSTED ? { rejectUnauthorized: false } : undefined,
  });
}

async function fermer(client) {
  if (!client) return;
  try {
    await client.query("rollback");
  } catch {
    /* transaction déjà terminée ou connexion cassée */
  }
  try {
    await client.query("select pg_advisory_unlock_all()");
  } catch {
    /* verrous déjà libérés */
  }
  try {
    await client.end();
  } catch {
    /* connexion déjà fermée */
  }
}

async function principal() {
  assert.ok(URL.length > 0, "Aucune URL PostgreSQL fournie (PATSYGEST_HOSTED_PG_URL / SUPABASE_DB_URL / PATSYGEST_PG_URL)");

  const admin = nouveauClient();
  const c1 = nouveauClient();
  const c2 = nouveauClient();
  const clients = [admin, c1, c2];
  const cleRendezVous = 1_700_000_000 + (Date.now() % 100_000);
  const cleVerrou = cleRendezVous + 100_000;

  try {
    await Promise.all(clients.map((client) => client.connect()));
    // Verrou TRANSACTIONNEL exclusif : compatible avec un pooler en mode
    // transaction, contrairement à un verrou de session. Les deux workers
    // attendent derrière lui puis se disputent un second verrou exclusif.
    await admin.query("begin");
    await admin.query("select pg_advisory_xact_lock($1)", [cleRendezVous]);

    const parcours = async (client) => {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock_shared($1)", [cleRendezVous]);
      await client.query("select pg_advisory_xact_lock($1)", [cleVerrou]);
      await client.query("select pg_sleep(0.45)");
      await client.query("commit");
    };

    const debut = Date.now();
    const p1 = parcours(c1);
    const p2 = parcours(c2);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await admin.query("commit");
    await Promise.all([p1, p2]);
    const duree = Date.now() - debut;

    // Les deux workers sont relâchés ensemble, mais un seul verrou exclusif est
    // disponible : le second doit attendre le pg_sleep du premier.
    assert.ok(duree >= 700, `sérialisation non observée (${duree} ms)`);
    assert.equal((await admin.query("select 1 as ok")).rows[0].ok, 1, "connexion administrative morte");
    console.log(`[cert-concurrence] OK source=${SOURCE} connexions=2 duree=${duree}ms verrou=advisory`);
  } finally {
    for (const client of [c1, c2, admin]) await fermer(client);
  }
}

try {
  await principal();
} catch (erreur) {
  console.error(`[cert-concurrence] ÉCHEC : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  process.exitCode = 1;
}
