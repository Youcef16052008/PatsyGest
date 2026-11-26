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
 assert.equal(brouillons.at(0),'101-confidentialite-labo.sql');
 assert.equal(brouillons.at(-1),'128-caisse-collision-ticket-brouillon.sql');
 const listed=[...historique,...brouillons,...plan.main_hors_serie.map(x=>x.file),...plan.exclus];
 assert.equal(new Set(listed).size,listed.length,'Chaque SQL est classé une seule fois');
 // F-12 : les brouillons sont dans supabase/brouillons/ ; l'inventaire couvre les deux dossiers.
 const actual=[...await readdir(new URL('supabase/',root)), ...await readdir(new URL('supabase/brouillons/',root))].filter(n=>/^\d{2,3}-.*\.sql$/.test(n)).sort();
 const chemin=f=>(brouillons.includes(f)?'brouillons/':'')+f;
 assert.deepEqual([...listed].sort(),actual,'Classer tout SQL ajouté et examiner son ordre');
 for (const entry of [...plan.historique,...plan.brouillons_securite,...plan.main_hors_serie]) {
  assert.equal(sha(await readFile(new URL(`supabase/${chemin(entry.file)}`,root))),entry.sha256,entry.file);
 }
 for (const entry of plan.fixtures_vitrine) {
  const fixture=await readFile(new URL(`tests/fixtures/pilote-vitrine/${entry.file}`,root));
  assert.equal(sha(fixture),entry.sha256,entry.file);
  assert.equal(sha(fixture),sha(await readFile(new URL(`supabase/${entry.file}`,root))),`Fixture différente de main : ${entry.file}`);
 }
 assert.deepEqual(plan.fixtures_vitrine.map(x=>x.file),plan.main_hors_serie.filter(x=>!x.file.startsWith('24-') && !x.hors_fixture_pilote).map(x=>x.file));
});

test('aucune collision de numéro SQL et correspondance complète des brouillons', async () => {
 const plan=JSON.parse(await readFile(new URL('migrations/repetition.json',root),'utf8'));
 const entries=[...plan.historique,...plan.main_hors_serie,...plan.brouillons_securite];
 const numbers=entries.map(({file})=>file.match(/^(\d+)-/)[1]);
 assert.equal(new Set(numbers).size,numbers.length,'Numéro SQL dupliqué');
 assert.equal(plan.brouillons_securite.length,28);
 for(const [index,entry] of plan.brouillons_securite.slice(0,27).entries()) {
  const old=String(index+24).padStart(2,'0'), next=String(index+101);
  assert.equal(entry.file,`${next}-${entry.ancien_fichier.slice(3)}`);
  assert.ok(entry.ancien_fichier.startsWith(`${old}-`));
  assert.match(entry.sha256,/^[a-f0-9]{64}$/,'Empreinte SHA-256 réelle requise');
 }
 assert.deepEqual(plan.main_hors_serie.map(x=>x.file.match(/^\d+/)[0]),['24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','43','44','45','46','47','48','49','50','51','52','53']);
});
