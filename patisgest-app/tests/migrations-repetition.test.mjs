import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const sha = b => createHash('sha256').update(b).digest('hex');

test('répétition SQL : ordre explicite, inventaire complet et empreintes figées', async () => {
 const plan=JSON.parse(await readFile(new URL('migrations/repetition.json',root),'utf8'));
 assert.match(plan.statut,/REPETITION UNIQUEMENT/);
 const historique=plan.historique.map(x=>x.file), brouillons=plan.brouillons_securite.map(x=>x.file);
 assert.deepEqual(historique,[...historique].sort());
 assert.deepEqual(brouillons,[...brouillons].sort());
 assert.equal(historique.at(-1),'23-controle-modules.sql');
 assert.equal(brouillons.at(0),'24-confidentialite-labo.sql');
 assert.equal(brouillons.at(-1),'50-vitrine-depot-schema-brouillon.sql');
 const listed=[...historique,...brouillons,...plan.main_hors_serie.map(x=>x.file),...plan.exclus];
 assert.equal(new Set(listed).size,listed.length,'Chaque SQL est classé une seule fois');
 const actual=(await readdir(new URL('supabase/',root))).filter(n=>/^\d\d-.*\.sql$/.test(n)).sort();
 assert.deepEqual([...listed].sort(),actual,'Classer tout SQL ajouté et examiner son ordre');
 for (const entry of [...plan.historique,...plan.brouillons_securite,...plan.main_hors_serie]) {
  assert.equal(sha(await readFile(new URL(`supabase/${entry.file}`,root))),entry.sha256,entry.file);
 }
 for (const entry of plan.fixtures_vitrine) {
  const fixture=await readFile(new URL(`tests/fixtures/pilote-vitrine/${entry.file}`,root));
  assert.equal(sha(fixture),entry.sha256,entry.file);
  assert.equal(sha(fixture),sha(await readFile(new URL(`supabase/${entry.file}`,root))),`Fixture différente de main : ${entry.file}`);
 }
 assert.deepEqual(plan.fixtures_vitrine.map(x=>x.file),plan.main_hors_serie.filter(x=>!x.file.startsWith('24-')).map(x=>x.file));
});
