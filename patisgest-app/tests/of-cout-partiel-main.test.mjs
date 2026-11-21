import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseMain } from './support/serie-main.mjs';

// Hypothèse à valider avec le métier : les 800 DA de matières consommées pour
// 80 unités sont répartis sur les 80 unités prévues. Ne couvre ni les pertes,
// ni la main-d'œuvre, ni la réévaluation des lots historiques.
test('OF partiel sur la série main adaptée : préparation et coût attendu', async (t) => {
  const db = await baseMain();
  try {
    await db.exec(`insert into clients(id,nom) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Fictif');
      insert into utilisateurs(id,auth_user_id,client_id,email,role) values
        ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner@example.test','proprietaire');
      insert into sites(id,client_id,nom) values
        ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Labo');
      insert into articles(id,client_id,code,nom,niveau,unite) values
        ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','PROD','Produit','produit','pcs');
      insert into recette_familles(id,client_id,code,nom,produit_id) values
        ('55555555-5555-5555-5555-555555555555','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','REC','Recette','44444444-4444-4444-4444-444444444444');
      insert into recette_versions(id,client_id,famille_id,rendement_qte) values
        ('66666666-6666-6666-6666-666666666666','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555',80);
      insert into ordres_fabrication(id,client_id,famille_id,version_id,site_id,numero,qte_prevue,statut,consommations) values
        ('77777777-7777-7777-7777-777777777777','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666','33333333-3333-3333-3333-333333333333','OF-TEST',80,'encours','[{"qty":80,"pu":10}]');
      select set_config('test.uid','22222222-2222-2222-2222-222222222222',false);`);
    const initial = await db.query("select qte_prevue, qte_realisee, cout_reel from ordres_fabrication where numero='OF-TEST'");
    assert.equal(Number(initial.rows[0].qte_prevue), 80);
    assert.equal(Number(initial.rows[0].cout_reel), 0);
    await t.test('deux clôtures de 40 ne doivent pas compter deux fois les matières',
      { todo: 'coût partiel et traitement des pertes à valider avant migration' }, async () => {
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
