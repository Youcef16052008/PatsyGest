import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { baseMain } from './support/serie-main.mjs';
import { creerFixtureOfCout } from './support/fixture-of-cout.mjs';

const ofId = '77777777-7777-7777-7777-777777777777';
const owner = '22222222-2222-2222-2222-222222222222';
const labo = '22222222-2222-2222-2222-222222222223';
const other = '22222222-2222-2222-2222-222222222224';
const close = (db, motif = 'Pertes de cuisson') => db.query('select public.patisgest_clore_of_perte_experimentale($1,$2) r', [ofId,motif]);

test('proposition locale : clôture partielle et perte matière atomiques, isolées et idempotentes', async () => {
  const db = await baseMain();
  try {
    // Le brouillon est incompatible avec le SQL main tant que 102 est absent.
    const proposal = await readFile(new URL('../migrations/propositions/cloture-of-perte-experimentale.sql', import.meta.url), 'utf8');
    await assert.rejects(db.exec(proposal), /correction de coût partiel attendue est absente/);
    // La migration contient BEGIN : libérer explicitement la transaction en échec.
    await db.exec('rollback');
    for (const file of ['101-confidentialite-labo.sql','102-cout-of-partiel.sql'])
      await db.exec(await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8'));
    await db.exec(proposal);
    await creerFixtureOfCout(db);
    await db.exec(`insert into clients(id,nom) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Autre fictif');
      insert into utilisateurs(id,auth_user_id,client_id,email,role) values
       ('11111111-1111-1111-1111-111111111112','${labo}','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','labo@example.test','labo'),
       ('11111111-1111-1111-1111-111111111113','${other}','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','autre@example.test','proprietaire');
      set role authenticated;`);
    // Avant production et avec un motif insuffisant : aucune écriture.
    await assert.rejects(close(db), /Seul un OF partiel/);
    await assert.rejects(close(db,'x'), /motif/);
    const partial = (await db.query("select public.terminer_of($1,78,'LOT-78',current_date+1) r",[ofId])).rows[0].r;
    assert.equal(Number(partial.cout_unitaire),10);
    await db.exec(`select set_config('test.uid','${labo}',false)`);
    await assert.rejects(close(db), /Reserve au proprietaire/);
    await db.exec(`select set_config('test.uid','${other}',false)`);
    await assert.rejects(close(db), /OF introuvable/);
    await db.exec(`select set_config('test.uid','${owner}',false)`);
    // Une quantité sans prix ne doit pas être présentée comme une perte connue.
    await db.exec('reset role');
    await db.query("update ordres_fabrication set consommations='[{\"qty\":80,\"pu\":0}]' where id=$1",[ofId]);
    await db.exec('set role authenticated');
    await assert.rejects(close(db), /prix de matiere inconnu/);
    assert.equal((await db.query('select count(*)::int n from of_pertes_matiere_experimentales')).rows[0].n,0);
    await db.exec('reset role');
    await db.query("update ordres_fabrication set consommations='[{\"qty\":80,\"pu\":10}]' where id=$1",[ofId]);
    await db.exec('set role authenticated');
    await assert.rejects(db.query("insert into of_pertes_matiere_experimentales(client_id,of_id,quantite_perdue,montant_matiere,motif,auteur_auth_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',$1,2,0,'Faux','22222222-2222-2222-2222-222222222222')",[ofId]), /permission denied/);
    await db.query("select public.modifier_acces_module('11111111-1111-1111-1111-111111111111','production',false)");
    await assert.rejects(close(db), /Module desactive/i);
    await db.query("select public.modifier_acces_module('11111111-1111-1111-1111-111111111111','production',true)");
    const result = (await close(db)).rows[0].r;
    assert.deepEqual([Number(result.quantite_perdue), Number(result.montant_matiere), result.deja_enregistree],[2,20,false]);
    const again = (await close(db)).rows[0].r;
    assert.equal(again.perte_id,result.perte_id);
    assert.equal(again.deja_enregistree,true);
    await assert.rejects(close(db,'Autre motif'), /motif different/);
    const order=(await db.query('select statut,cout_reel,qte_realisee from ordres_fabrication where id=$1',[ofId])).rows[0];
    assert.deepEqual([order.statut,Number(order.cout_reel),Number(order.qte_realisee)],['termine',780,78]);
    assert.equal((await db.query('select count(*)::int n from of_pertes_matiere_experimentales')).rows[0].n,1);
    await assert.rejects(db.query("select public.terminer_of($1,2,'LOT-2',current_date+1)",[ofId]),/OF non lance/);
    await db.exec('set role anon');
    await assert.rejects(close(db), /permission denied/);
    await assert.rejects(db.query('select * from public.of_pertes_matiere_experimentales'), /permission denied/);
  } finally { await db.close(); }
});
