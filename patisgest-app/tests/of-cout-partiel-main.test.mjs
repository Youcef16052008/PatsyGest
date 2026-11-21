import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseMain } from './support/serie-main.mjs';
import { creerFixtureOfCout } from './support/fixture-of-cout.mjs';

// Décision métier : les 800 DA de matières consommées pour 80 unités prévues
// sont répartis sur ces 80 unités. Ne couvre pas encore l’enregistrement des pertes,
// ni la main-d'œuvre, ni la réévaluation des lots historiques.
test('OF partiel sur la série main adaptée : préparation et coût attendu', async (t) => {
  const db = await baseMain();
  try {
    await creerFixtureOfCout(db);
    const initial = await db.query("select qte_prevue, qte_realisee, cout_reel from ordres_fabrication where numero='OF-TEST'");
    assert.equal(Number(initial.rows[0].qte_prevue), 80);
    assert.equal(Number(initial.rows[0].cout_reel), 0);
    await t.test('deux clôtures de 40 ne doivent pas compter deux fois les matières',
      { todo: 'correction SQL et enregistrement des pertes non déployés' }, async () => {
        const first = (await db.query("select public.terminer_of('77777777-7777-7777-7777-777777777777',40,'LOT-1',current_date+1) r")).rows[0].r;
        const second = (await db.query("select public.terminer_of('77777777-7777-7777-7777-777777777777',40,'LOT-2',current_date+1) r")).rows[0].r;
        const order = await db.query("select cout_reel,statut from ordres_fabrication where numero='OF-TEST'");
        assert.deepEqual([Number(first.cout_unitaire), Number(second.cout_unitaire), Number(order.rows[0].cout_reel)], [10, 10, 800]);
        assert.equal(order.rows[0].statut, 'termine');
      });
  } finally {
    await db.close();
  }
});
