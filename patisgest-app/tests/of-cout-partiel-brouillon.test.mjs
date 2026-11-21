import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { baseMain } from './support/serie-main.mjs';
import { creerFixtureOfCout } from './support/fixture-of-cout.mjs';

// Ce test compare une proposition existante sur une base fictive : 101/102
// sont des brouillons et ne sont pas autorisés au déploiement sur le pilote.
async function baseAvecBrouillons() {
  const db = await baseMain();
  try {
    for (const file of ['101-confidentialite-labo.sql', '102-cout-of-partiel.sql']) {
      await db.exec(await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8'));
    }
    await creerFixtureOfCout(db);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

test('brouillon 102 : deux lots partiels ne doublent pas le coût matière', async () => {
  const db = await baseAvecBrouillons();
  try {
    const first = (await db.query("select public.terminer_of('77777777-7777-7777-7777-777777777777',40,'LOT-1',current_date+1) r")).rows[0].r;
    const second = (await db.query("select public.terminer_of('77777777-7777-7777-7777-777777777777',40,'LOT-2',current_date+1) r")).rows[0].r;
    const order = (await db.query("select cout_reel,statut from ordres_fabrication where numero='OF-TEST'")).rows[0];
    assert.deepEqual([Number(first.cout_unitaire), Number(second.cout_unitaire), Number(order.cout_reel)], [10, 10, 800]);
    assert.equal(order.statut, 'termine');
  } finally { await db.close(); }
});

test('brouillon 102 : 78/80 affecte 780 DA mais ne constate pas encore la perte', async () => {
  const db = await baseAvecBrouillons();
  try {
    const result = (await db.query("select public.terminer_of('77777777-7777-7777-7777-777777777777',78,'LOT-78',current_date+1) r")).rows[0].r;
    const order = (await db.query("select cout_reel,statut,qte_realisee from ordres_fabrication where numero='OF-TEST'")).rows[0];
    assert.equal(Number(result.cout_unitaire), 10);
    assert.equal(Number(order.qte_realisee), 78);
    assert.equal(Number(order.cout_reel), 780);
    // Le 102 ne termine pas l'OF anticipativement et n'enregistre pas les
    // 20 DA restants : une opération distincte de perte reste à concevoir.
    assert.equal(order.statut, 'partiel');
  } finally { await db.close(); }
});
