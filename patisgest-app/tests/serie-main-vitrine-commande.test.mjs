import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseMain } from './support/serie-main.mjs';

// La fixture rejoue les migrations de source suivies, dont le rattrapage 32,
// sur PGlite isolé et des données strictement fictives.
test('vitrine publiée : fixture main et commande anonyme', async () => {
  const db = await baseMain();
  try {
    await db.exec(`insert into clients(id,nom) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Fictif');
      insert into sites(id,client_id,nom,type,subdomain,publication) values
        ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Fictif','boutique','demo-test','publiee');
      insert into recette_familles(id,client_id,code,nom,visible_vitrine) values
        ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','REC','Tarte test',true);
      set role anon;`);
    const catalogue = await db.query("select cle_nom from public.vitrine_catalogue where subdomain='demo-test'");
    assert.deepEqual(catalogue.rows.map(row => row.cle_nom), ['tarte test']);

    const result = (await db.query("select public.patisgest_demander_commande('demo-test','tarte test','Client test','0660123456',current_date+1,8,null,'test-key-001') as r")).rows[0].r;
    assert.equal(result.deja_enregistree, false);
    assert.match(result.numero, /^VIT-/);
    await db.exec('reset role');
    const count = await db.query("select count(*)::integer as n from cakes where cle_vitrine='test-key-001'");
    assert.equal(count.rows[0].n, 1);
  } finally {
    await db.close();
  }
});
