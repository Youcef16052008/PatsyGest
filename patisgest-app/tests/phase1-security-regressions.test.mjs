import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseMain } from './support/serie-main.mjs';

// Répétition locale des fichiers SQL source 01–31 uniquement : aucune base
// Supabase distante, aucun brouillon sécurité 101–128, aucune donnée client.
// Chaque assertion TODO exprime le comportement correct attendu après remédiation;
// elle reste non bloquante tant que la séquence SQL du pilote n'est pas réconciliée.

test('D2 — une lecture anon du catalogue ne doit pas révéler client_id', {
  todo: 'Retirer l’identifiant interne de la projection publique après réconciliation de la migration 32',
}, async () => {
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

test('D4 — le laboratoire ne doit pas modifier directement les champs de publication/domaine', {
  todo: 'Fermer l’UPDATE direct sur sites et conserver la mutation derrière une RPC validée',
}, async () => {
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

    // `support` est réservé par la RPC de réservation, mais est un label DNS
    // valide au niveau du CHECK. La policy source 01 laisse le labo le changer.
    await assert.rejects(
      db.query(`update public.sites set subdomain='support',publication='brouillon' where id='${siteId}'`),
      'Une écriture directe du laboratoire ne doit pas pouvoir réserver un domaine ni publier',
    );
  } finally {
    await db.close();
  }
});

test('D7 — la restauration propriétaire doit refuser une FK vers l’article d’un autre tenant', {
  todo: 'Ajouter les gardes de toutes les références inter-tenant et valider le manifeste réel avant SQL approuvé',
}, async () => {
  const db = await baseMain();
  try {
    const clientA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const clientB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const authA = '10000000-0000-0000-0000-000000000002';
    const articleB = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
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
      client_id: clientA,
      tables: [{
        table: 'recette_familles',
        lignes: [{
          id: 'cccccccc-0000-0000-0000-000000000001',
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
      'La restauration SECURITY DEFINER doit refuser un produit appartenant à B',
    );
  } finally {
    await db.close();
  }
});
