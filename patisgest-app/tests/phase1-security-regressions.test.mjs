import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseMain } from './support/serie-main.mjs';

// Chaîne source 01–39 dans PGlite éphémère, avec identités et données fictives.
// Ces tests valident les gardes locales; ils ne remplacent pas une revue de
// migration et ne lisent/écrivent jamais le projet Supabase du pilote.

test('D2 — la vue publique anon ne projette plus client_id', async () => {
  const db = await baseMain();
  try {
    const clientId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await db.exec(`insert into public.clients(id,nom)
        values ('${clientId}','Établissement fictif');
      insert into public.sites(id,client_id,nom,type,subdomain,publication)
        values ('dddddddd-dddd-dddd-dddd-dddddddddddd','${clientId}','Boutique fictive','boutique','d2-fixture','publiee');
      insert into public.recette_familles(client_id,code,nom,cle_nom,visible_vitrine)
        values ('${clientId}','D2','Recette fictive','recette-fictive',true);
      set role anon;`);
    const { rows } = await db.query("select * from public.vitrine_catalogue where subdomain='d2-fixture'");
    assert.equal(rows.length, 1, 'La fixture publique doit être visible au visiteur anon');
    assert.equal(Object.hasOwn(rows[0], 'client_id'), false, 'La vue publique ne doit pas exposer la clé tenant');
  } finally {
    await db.close();
  }
});

test('D4 — le laboratoire ne modifie pas les colonnes sensibles de sites en direct', async () => {
  const db = await baseMain();
  try {
    const clientId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const authId = '10000000-0000-0000-0000-000000000001';
    const siteId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    await db.exec(`insert into public.clients(id,nom) values ('${clientId}','Établissement fictif');
      insert into auth.users(id,email) values ('${authId}','labo@example.test');
      insert into public.utilisateurs(id,client_id,auth_user_id,email,nom,role)
        values ('11111111-1111-1111-1111-111111111111','${clientId}','${authId}','labo@example.test','Labo fictif','labo');
      insert into public.sites(id,client_id,nom,type)
        values ('${siteId}','${clientId}','Boutique fictive','boutique');
      select set_config('test.uid','${authId}',false);
      set role authenticated;`);

    await assert.rejects(
      db.query(`update public.sites set subdomain='support',publication='brouillon' where id='${siteId}'`),
      'Une écriture directe du laboratoire ne doit pas réserver un domaine ou publier',
    );
    const { rows } = await db.query("select has_column_privilege('authenticated','public.sites','publication','UPDATE') as peut_publier");
    assert.equal(rows[0].peut_publier, false);
  } finally {
    await db.close();
  }
});

test('D7 — la restauration refuse toute FK restaurée vers un autre tenant avant insertion', async () => {
  const db = await baseMain();
  try {
    const clientA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const clientB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const authA = '10000000-0000-0000-0000-000000000002';
    const articleB = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const familleA = 'cccccccc-0000-0000-0000-000000000001';
    await db.exec(`insert into public.clients(id,nom)
        values ('${clientA}','Tenant A fictif'),('${clientB}','Tenant B fictif');
      insert into public.articles(id,client_id,code,nom,niveau,unite)
        values ('${articleB}','${clientB}','B-1','Article B fictif','matiere','kg');
      insert into auth.users(id,email) values ('${authA}','owner-a@example.test');
      insert into public.utilisateurs(id,client_id,auth_user_id,email,nom,role)
        values ('22222222-2222-2222-2222-222222222222','${clientA}','${authA}','owner-a@example.test','Propriétaire A','proprietaire');
      select set_config('test.uid','${authA}',false);
      set role authenticated;`);

    const dump = {
      version: 1,
      client_id: clientA,
      tables: [{
        table: 'recette_familles',
        lignes: [{
          id: familleA,
          client_id: clientA,
          code: 'CROSS-TENANT',
          nom: 'Famille A fictive',
          produit_id: articleB,
          created_at: '2026-01-01T00:00:00Z',
          visible_vitrine: false,
          ordre_vitrine: 100,
        }],
      }],
    };
    await assert.rejects(
      db.query('select public.restaurer_sauvegarde($1::jsonb)', [JSON.stringify(dump)]),
      /Référence étrangère inter-tenant détectée/,
    );
    await db.exec('reset role');
    const after = await db.query(`select count(*)::integer as n from public.recette_familles where id='${familleA}'`);
    assert.equal(after.rows[0].n, 0, 'Le prévol doit rejeter avant toute insertion');
  } finally {
    await db.close();
  }
});

test('D9 — un propriétaire ne peut pas modifier son offre via UPDATE direct', async () => {
  const db = await baseMain();
  try {
    const clientId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const authId = '10000000-0000-0000-0000-000000000003';
    await db.exec(`insert into public.clients(id,nom,offre) values ('${clientId}','Tenant fictif','starter');
      insert into auth.users(id,email) values ('${authId}','owner@example.test');
      insert into public.utilisateurs(id,client_id,auth_user_id,email,nom,role)
        values ('33333333-3333-3333-3333-333333333333','${clientId}','${authId}','owner@example.test','Propriétaire','proprietaire');
      select set_config('test.uid','${authId}',false);
      set role authenticated;`);
    await assert.rejects(
      db.query(`update public.clients set offre='enterprise' where id='${clientId}'`),
      'La facturation ne doit pas être modifiable par un propriétaire tenant',
    );
    const { rows } = await db.query("select has_column_privilege('authenticated','public.clients','offre','UPDATE') as peut_modifier_offre");
    assert.equal(rows[0].peut_modifier_offre, false);
  } finally {
    await db.close();
  }
});
