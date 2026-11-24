import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';

// Base jetable : vérifie la migration 40 (retrait du mode « carte ») sur la chaîne 01–39 puis 40.
test('retrait carte : ventes existantes en NULL, contrainte et vendre_panier refusent carte', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
     create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
     create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
     create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
     create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
     alter default privileges in schema public grant all on tables to authenticated,service_role;
     alter default privileges in schema public grant execute on functions to authenticated,service_role;
     grant execute on function auth.uid() to authenticated,anon,service_role;`);
    const sansQuarante = chaineDeploiement().filter((f) => !f.startsWith('40-'));
    for (const file of sansQuarante) {
      if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
      if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
      const sql = (await readFile(new URL(`../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', '');
      try { await db.exec(sql); } catch (e) { throw new Error(`${file}: ${e.message}`, { cause: e }); }
    }
    const client = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', user = '11111111-1111-1111-1111-111111111111', auth = '10000000-0000-0000-0000-000000000001';
    const site = 'dddddddd-dddd-dddd-dddd-dddddddddd01', article = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    await db.exec(`insert into clients(id,nom) values ('${client}','Atelier');
     insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values ('${user}','${client}','${auth}','owner@example.test','Propriétaire','proprietaire');
     insert into sites(id,client_id,nom,type) values ('${site}','${client}','Boutique 1','boutique');
     insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva) values ('${article}','${client}','A1','Produit','produit','piece',10,20);
     insert into ventes(client_id,site_id,numero,ticket,date_vente,source,mode_paiement,total_ht,total_ttc) values ('${client}','${site}','C1','ancien-carte',current_date,'caisse','carte',10,12);`);

    // Avant 40 : la vente carte existe.
    const avant = await db.query("select count(*)::int as n from public.ventes where mode_paiement='carte'");
    assert.equal(avant.rows[0].n, 1);

    const sql40 = await readFile(new URL('../supabase/40-retrait-mode-carte.sql', import.meta.url), 'utf8');
    await db.exec(sql40);

    const apres = await db.query("select count(*)::int as n, count(*) filter (where mode_paiement is null)::int as nulls from public.ventes where ticket='ancien-carte'");
    assert.equal(apres.rows[0].nulls, 1, 'la vente carte passe à mode non précisé');

    await assert.rejects(
      db.exec(`insert into ventes(client_id,site_id,numero,ticket,date_vente,source,mode_paiement,total_ht,total_ttc) values ('${client}','${site}','C2','nouveau-carte',current_date,'caisse','carte',1,1)`),
      /ventes_mode_paiement_valid/,
    );

    await db.exec(`select set_config('test.uid','${auth}',false); set role authenticated;`);
    await assert.rejects(
      db.query('select public.vendre_panier($1,$2::jsonb,$3,$4)', [site, JSON.stringify([{ articleId: article, qte: 1 }]), 'ticket-carte', 'carte']),
      /Mode de reglement invalide/,
    );
    const ok = await db.query('select public.vendre_panier($1,$2::jsonb,$3,$4) as r', [site, JSON.stringify([{ articleId: article, qte: 1 }]), 'ticket-cheque', 'cheque_virement']);
    assert.ok(ok.rows[0].r.sale_id);

    // Rejeu de la migration 40 : idempotent (corps déjà corrigé, aucune erreur).
    await db.exec('reset role');
    await db.exec(sql40);
  } finally {
    await db.close();
  }
});
