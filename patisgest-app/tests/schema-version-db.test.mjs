// Revue F-19 : migration 35 (table de version) et vérification côté application.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { verifierVersionSchema, VERSION_SCHEMA_REQUISE } from '../src/lib/schema-version.ts';

const sql = () => readFile(new URL('../supabase/35-version-schema-app.sql', import.meta.url), 'utf8');

async function base() {
  const db = new PGlite();
  await db.exec('create role authenticated; create role anon;');
  await db.exec('grant usage on schema public to authenticated, anon;');
  return db;
}

test('F-19 migration 35 : crée la table, version 35, rejouable sans effet', async () => {
  const db = await base();
  await db.exec(await sql());
  await db.exec(await sql());
  const r = await db.query('select version from public.app_schema_version');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].version, 35);
});

test('F-19 migration 35 : ne abaisse jamais une version plus récente', async () => {
  const db = await base();
  await db.exec(await sql());
  await db.exec('update public.app_schema_version set version = 99');
  await db.exec(await sql());
  const r = await db.query('select version from public.app_schema_version');
  assert.equal(r.rows[0].version, 99);
});

test('F-19 migration 35 : lecture réservée aux authentifiés, pas d’écriture côté client', async () => {
  const db = await base();
  await db.exec(await sql());
  await db.exec('set role authenticated');
  const lu = await db.query('select version from public.app_schema_version');
  assert.equal(lu.rows.length, 1);
  await assert.rejects(() => db.exec('update public.app_schema_version set version = 1'), /permission denied/);
  await db.exec('reset role');
  await db.exec('set role anon');
  await assert.rejects(() => db.query('select version from public.app_schema_version'), /permission denied/);
});

test('F-19 vérification application : absent, ancien, à jour', () => {
  assert.equal(VERSION_SCHEMA_REQUISE, 35);
  assert.equal(verifierVersionSchema(null, { code: '42P01' }).ok, false);
  assert.equal(verifierVersionSchema(null, null).ok, false);
  const ancien = verifierVersionSchema({ version: 34 }, null);
  assert.equal(ancien.ok, false);
  assert.equal(ancien.raison, 'ancien');
  assert.match(ancien.message, /34.*35/);
  assert.deepEqual(verifierVersionSchema({ version: 35 }, null), { ok: true, version: 35 });
  assert.equal(verifierVersionSchema({ version: 36 }, null).ok, true);
});
