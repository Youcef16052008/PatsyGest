#!/usr/bin/env node
/**
 * Certification distante de la pile de production. Aucune valeur secrète n'est
 * journalisée : CRON_SECRET, SUPABASE_ANON_KEY et les clés service-role restent
 * uniquement dans des en-têtes. Le rapport ne contient que des statuts.
 */
import assert from "node:assert/strict";

const BASE = (process.env.CERT_BASE_URL ?? "https://patsy-gest.vercel.app").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const VERSION_ATTENDUE = Number(process.env.CERT_EXPECTED_SCHEMA_VERSION ?? "57");

async function sonder(url, headers = {}) {
  const reponse = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const brut = await reponse.text();
  let json = null;
  try {
    json = JSON.parse(brut);
  } catch {
    json = null;
  }
  return { status: reponse.status, json };
}

function objet(json) {
  return typeof json === "object" && json !== null && !Array.isArray(json) ? json : {};
}

async function principal() {
  assert.ok(SECRET.length >= 12, "CRON_SECRET absent ou trop court dans l'environnement CI");
  assert.ok(SUPABASE_URL.startsWith("https://"), "SUPABASE_URL absent ou invalide");
  assert.ok(ANON.length > 0, "SUPABASE_ANON_KEY absent");
  assert.ok(Number.isFinite(VERSION_ATTENDUE), "CERT_EXPECTED_SCHEMA_VERSION invalide");

  const sante = await sonder(`${BASE}/api/health`);
  assert.equal(sante.status, 200, `/api/health a répondu ${sante.status}`);
  assert.equal(objet(sante.json).ok, true, "/api/health n'est pas ok");

  const pile = await sonder(`${BASE}/api/health/stack`, {
    "x-cron-secret": SECRET,
    Accept: "application/json",
  });
  const corpsPile = objet(pile.json);
  assert.equal(pile.status, 200, `/api/health/stack a répondu ${pile.status}`);
  assert.equal(corpsPile.ok, true, "la pile hébergée n'est pas ok");
  const controles = objet(corpsPile.checks);
  for (const nom of ["application", "auth", "postgrest", "storage"]) {
    assert.equal(objet(controles[nom]).ok, true, `contrôle ${nom} en échec`);
  }
  const version = Number(objet(controles.postgrest).detail);
  assert.ok(Number.isFinite(version) && version >= VERSION_ATTENDUE, `version schéma ${version} < ${VERSION_ATTENDUE}`);
  assert.equal(objet(controles.storage).detail, "prive", "bucket OCR non privé");

  const authDirect = await sonder(`${SUPABASE_URL}/auth/v1/health`, {
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
  });
  assert.ok(authDirect.status > 0 && authDirect.status < 500, `Auth Supabase injoignable (${authDirect.status})`);

  const restDirect = await sonder(`${SUPABASE_URL}/rest/v1/`, {
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
  });
  assert.ok(restDirect.status > 0 && restDirect.status < 500, `PostgREST injoignable (${restDirect.status})`);

  const storageDirect = await sonder(`${SUPABASE_URL}/storage/v1/health`, {
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
  });
  assert.ok(storageDirect.status > 0 && storageDirect.status < 500, `Storage injoignable (${storageDirect.status})`);

  console.log(
    `[cert-production] OK app=${sante.status} stack=${pile.status} schema=${version} ` +
      `auth=${authDirect.status} postgrest=${restDirect.status} storage=${storageDirect.status}`,
  );
}

try {
  await principal();
} catch (erreur) {
  console.error(`[cert-production] ÉCHEC : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  process.exitCode = 1;
}
