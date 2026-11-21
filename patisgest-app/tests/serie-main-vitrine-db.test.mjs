import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseMain } from './support/serie-main.mjs';


test('série main adaptée 01–31 : surface anonyme et interdiction des tables internes', async () => {
  const db = await baseMain();
  try {
    const fonctions = await db.query(`select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')
      order by p.proname, arguments`);
    // 38 : la vérification par source est exécutable par anon (voulu, voir revue B-008).
    assert.deepEqual(fonctions.rows.map((r) => r.proname), ['patisgest_demander_commande', 'patisgest_verifier_source_vitrine'], 'Toute fonction exécutable par anon doit être examinée');
    const tables = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p','v','m')
      and has_table_privilege('anon',c.oid,'select') order by c.relname`);
    assert.deepEqual(tables.rows.map(row => row.relname), ['vitrine_catalogue']);
    const ecritures = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p','v','m')
      and (has_table_privilege('anon',c.oid,'insert') or has_table_privilege('anon',c.oid,'update')
        or has_table_privilege('anon',c.oid,'delete')) order by c.relname`);
    assert.deepEqual(ecritures.rows, [], 'Aucune relation publique ne doit être modifiable directement par anon');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.articles'), /permission denied/i);
    await assert.rejects(db.query('select * from public.cakes'), /permission denied/i);
    assert.deepEqual((await db.query('select * from public.vitrine_catalogue')).rows, []);
    await assert.rejects(db.query("select public.patisgest_demander_commande('inconnue','x','Client test','0660123456',current_date+1,1,null,'test-key-001')"), /Vitrine introuvable ou non publiée/i);
  } finally {
    await db.close();
  }
});
