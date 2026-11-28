import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { creerChaineActive } from './support/chaine-active.mjs';
import {
  createRateLimiter,
  createConcurrencySemaphore,
  extractClientIpFromHeaders,
} from '../src/lib/rate-limit.ts';
import { validerOctetsImageOcr } from '../src/lib/ocr-server.ts';
import { getLicenseKeyPair } from '../src/lib/trial-crypto.ts';
import nextConfig from '../next.config.ts';

const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa58';
const SITE_BOUTIQUE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
const SITE_LABO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
const ART_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
const ART_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccc02';
const LOT_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
const LOT_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';
const U_PROP = '11111111-1111-4111-8111-111111111101';
const A_PROP = '21111111-1111-4111-8111-111111111101';
const U_VEND = '11111111-1111-4111-8111-111111111102';
const A_VEND = '21111111-1111-4111-8111-111111111102';
const U_LABO = '11111111-1111-4111-8111-111111111103';
const A_LABO = '21111111-1111-4111-8111-111111111103';

let etat;

async function commeRole(db, authUid, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role authenticated; select set_config('test.uid','${authUid}',true)`);
    const res = await fn();
    await db.exec('commit');
    return res;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

before(async () => {
  etat = await creerChaineActive();
  const { db } = etat;
  await db.exec(`
    insert into auth.users (id, email) values
      ('${A_PROP}', 'patron58@test.dz'),
      ('${A_VEND}', 'vendeur58@test.dz'),
      ('${A_LABO}', 'labo58@test.dz');
    insert into public.clients (id, nom) values ('${CLIENT}', 'Pâtisserie Durcissement 58');
    insert into public.sites (id, client_id, nom, type) values
      ('${SITE_BOUTIQUE}', '${CLIENT}', 'Boutique Centre', 'boutique'),
      ('${SITE_LABO}', '${CLIENT}', 'Labo Principal', 'laboratoire');
    insert into public.utilisateurs (id, client_id, auth_user_id, email, nom, role) values
      ('${U_PROP}', '${CLIENT}', '${A_PROP}', 'patron58@test.dz', 'Patron 58', 'proprietaire'),
      ('${U_VEND}', '${CLIENT}', '${A_VEND}', 'vendeur58@test.dz', 'Vendeur 58', 'vendeur'),
      ('${U_LABO}', '${CLIENT}', '${A_LABO}', 'labo58@test.dz', 'Labo 58', 'labo');
    insert into public.equipe_sites (utilisateur_id, site_id) values
      ('${U_PROP}', '${SITE_BOUTIQUE}'), ('${U_PROP}', '${SITE_LABO}'),
      ('${U_VEND}', '${SITE_BOUTIQUE}'), ('${U_LABO}', '${SITE_LABO}');
    insert into public.articles (id, client_id, code, nom, niveau, unite, pv_ht, tva) values
      ('${ART_1}', '${CLIENT}', 'CROIS', 'Croissant Beurre', 'produit', 'piece', 100, 19),
      ('${ART_2}', '${CLIENT}', 'PIST', 'Pâte Pistache', 'produit', 'kg', 10, 19);
    insert into public.lots (id, client_id, article_id, site_id, numero, qte_init, qte_rest, pu, date_reception) values
      ('${LOT_1}', '${CLIENT}', '${ART_1}', '${SITE_BOUTIQUE}', 'LOT-58-1', 20, 20, 40, (now() at time zone 'Africa/Algiers')::date),
      ('${LOT_2}', '${CLIENT}', '${ART_2}', '${SITE_BOUTIQUE}', 'LOT-58-2', 20, 20, 15, (now() at time zone 'Africa/Algiers')::date);
  `);
});

after(async () => {
  if (etat?.db) await etat.db.close();
});

test('Migration 58 SQL : avoir multi-articles, verrou FOR UPDATE, TTC aligné et déduction tiroir vendeur', async () => {
  const { db, version } = etat;
  assert.equal(version, 58);

  // Vérifier la présence structurelle du verrou FOR UPDATE et pg_advisory_xact_lock dans les définitions compilées
  const defs = await db.query(`
    select proname, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and proname in ('enregistrer_avoir_article', 'valider_tiroir_jour')
  `);
  const byName = Object.fromEntries(defs.rows.map((r) => [r.proname, String(r.def)]));
  assert.match(byName.enregistrer_avoir_article, /for update/i, 'FOR UPDATE manquant sur enregistrer_avoir_article');
  assert.match(byName.valider_tiroir_jour, /pg_advisory_xact_lock/i, 'pg_advisory_xact_lock manquant sur valider_tiroir_jour');

  // Vente multi-articles en espèces : 2x ART_1 (238.00 TTC) + 0.3334x ART_2 (round(0.3334 * 10 * 1.19, 2) = 3.97 TTC, vs 3.96 si arrondi HT d'abord)
  const vente = await commeRole(db, A_VEND, async () => {
    const r = await db.query(
      `select public.vendre_panier($1::uuid, $2::jsonb, 'T-MULTI-58', 'especes') as res`,
      [
        SITE_BOUTIQUE,
        JSON.stringify([
          { articleId: ART_1, qte: 2 },
          { articleId: ART_2, qte: 0.3334 },
        ]),
      ],
    );
    return r.rows[0].res;
  });
  assert.ok(vente.sale_id, 'sale_id attendu');
  assert.equal(Number(vente.totalTTC), 241.97);

  // Le rôle labo doit être bloqué sur enregistrer_avoir_article
  await assert.rejects(
    commeRole(db, A_LABO, () =>
      db.query(
        `select public.enregistrer_avoir_article($1::uuid, 'destruction', 'Refus labo', 0.1, $2::uuid)`,
        [vente.sale_id, ART_2],
      ),
    ),
    /Reserve au comptoir|non autorise/i,
  );

  // Rembourser le 2e article du ticket (ART_2, 0.3334 kg) — impossible avant migration 58 !
  const avoir2 = await commeRole(db, A_VEND, async () => {
    const r = await db.query(
      `select public.enregistrer_avoir_article($1::uuid, 'remise_en_stock', 'Client change d avis', 0.3334, $2::uuid) as res`,
      [vente.sale_id, ART_2],
    );
    return r.rows[0].res;
  });
  assert.equal(avoir2.article_id, ART_2);
  assert.equal(Number(avoir2.qte), 0.3334);
  // Vérifier l'arrondi TTC aligné sur vendre_panier : 3.97 (et non 3.96)
  assert.equal(Number(avoir2.total_ttc), 3.97);
  // Le lot LOT_2 doit être restauré à 20
  const lot2 = await db.query(`select qte_rest from public.lots where id = '${LOT_2}'`);
  assert.equal(Number(lot2.rows[0].qte_rest), 20);

  // Un 2e avoir sur le même article ART_2 doit être rejeté (plafond atteint)
  await assert.rejects(
    commeRole(db, A_VEND, () =>
      db.query(
        `select public.enregistrer_avoir_article($1::uuid, 'destruction', 'Double avoir', 0.1, $2::uuid)`,
        [vente.sale_id, ART_2],
      ),
    ),
    /superieure a la quantite vendue/i,
  );

  // Clôture tiroir aveugle vendeur : doit déduire l'avoir espèces (3.97 DA) des ventes espèces (241.97 DA) => attendu = 238.00 DA
  const today = (await db.query(`select (now() at time zone 'Africa/Algiers')::date as d`)).rows[0].d;
  const clotureVendeur = await commeRole(db, A_VEND, async () => {
    const r = await db.query(
      `select public.valider_tiroir_jour($1::date, $2::uuid, 1000, 1238, 0, 'Comptage soir') as res`,
      [today, SITE_BOUTIQUE],
    );
    return r.rows[0].res;
  });
  assert.equal(clotureVendeur.blind, true);
  assert.equal(clotureVendeur.revision, 1);

  const bilanRow = await db.query(`select caisse_bilan from public.clotures where id = $1`, [clotureVendeur.id]);
  const bilan = bilanRow.rows[0].caisse_bilan;
  assert.equal(Number(bilan.especes_attendues), 238, 'Les avoirs espèces du jour doivent être déduits de l attendu vendeur');
  assert.equal(Number(bilan.ecart), 0, 'Écart doit être 0 (1238 - (1000 + 238))');
});

test('Migration 58 SQL : gardes modules caisse/cloture + intégrité credits_clients + audit + Loi 18-07', async () => {
  const { db } = etat;

  // Désactiver les modules `caisse` et `cloture` pour le vendeur
  await commeRole(db, A_PROP, async () => {
    await db.query(`select public.modifier_acces_module($1::uuid, 'caisse', false)`, [U_VEND]);
    await db.query(`select public.modifier_acces_module($1::uuid, 'cloture', false)`, [U_VEND]);
  });

  const today = (await db.query(`select (now() at time zone 'Africa/Algiers')::date as d`)).rows[0].d;
  await assert.rejects(
    commeRole(db, A_VEND, () =>
      db.query(`select public.valider_tiroir_jour($1::date, $2::uuid, 0, 0, 0, 'Blocked')`, [today, SITE_BOUTIQUE]),
    ),
    /Module desactive/i,
  );
  await assert.rejects(
    commeRole(db, A_VEND, () =>
      db.query(
        `insert into public.credits_clients (client_id, nom_debiteur, montant_total_da) values ($1, 'Blocked', 500)`,
        [CLIENT],
      ),
    ),
    /row-level security/i,
  );

  // Réactiver `caisse` et `cloture` pour le vendeur
  await commeRole(db, A_PROP, async () => {
    await db.query(`select public.modifier_acces_module($1::uuid, 'caisse', true)`, [U_VEND]);
    await db.query(`select public.modifier_acces_module($1::uuid, 'cloture', true)`, [U_VEND]);
  });

  // Vendeur ne peut pas forger statut='annule' à l'insertion d'un crédit
  await assert.rejects(
    commeRole(db, A_VEND, () =>
      db.query(
        `insert into public.credits_clients (client_id, nom_debiteur, montant_total_da, statut)
         values ($1, 'Fraude', 1000, 'annule')`,
        [CLIENT],
      ),
    ),
    /Seul le proprietaire peut annuler/i,
  );

  // Vendeur insère un crédit avec faux `reglements` et faux `cree_par` -> trigger nettoie et force cree_par = auth.uid()
  const creditId = await commeRole(db, A_VEND, async () => {
    const r = await db.query(
      `insert into public.credits_clients (client_id, nom_debiteur, telephone, montant_total_da, montant_regle_da, reglements, cree_par)
       values ($1, 'Café El Bahia', '0555 12 34 56', 2500, 500, '[{"montant_da":99999,"note":"fake"}]'::jsonb, $2::uuid)
       returning id, cree_par, reglements, statut`,
      [CLIENT, A_PROP],
    );
    assert.equal(r.rows[0].cree_par, A_VEND, 'cree_par doit être forcé à auth.uid()');
    assert.equal(r.rows[0].statut, 'ouvert');
    assert.equal(r.rows[0].reglements.length, 1);
    assert.equal(Number(r.rows[0].reglements[0].montant_da), 500, 'faux reglements doivent être écrasés');
    return r.rows[0].id;
  });

  // Vérifier que l'insertion credits_clients a été journalisée dans journal_audit
  const auditCredit = await db.query(
    `select count(*)::int as n from public.journal_audit where client_id = $1 and table_cible = 'credits_clients'`,
    [CLIENT],
  );
  assert.ok(auditCredit.rows[0].n >= 1, 'credits_clients doit être tracé dans journal_audit');

  // Auto-promotion statut='solde' lorsque le propriétaire ramène montant_total_da = montant_regle_da
  await commeRole(db, A_PROP, async () => {
    await db.query(
      `update public.credits_clients set montant_total_da = 500 where id = $1`,
      [creditId],
    );
  });
  const afterUpdate = await db.query(`select statut from public.credits_clients where id = $1`, [creditId]);
  assert.equal(afterUpdate.rows[0].statut, 'solde', 'statut doit passer automatiquement à solde');

  // Loi 18-07 : export inclut credits_clients, et anonymiser_credit_client masque le nom & téléphone
  const exportData = await commeRole(db, A_PROP, async () => {
    const r = await db.query(`select public.exporter_donnees_personnelles() as res`);
    return r.rows[0].res;
  });
  assert.ok(Array.isArray(exportData.credits_clients), 'exporter_donnees_personnelles doit contenir credits_clients');
  assert.ok(
    exportData.credits_clients.some((c) => c.id === creditId && c.nom_debiteur === 'Café El Bahia'),
    'le crédit client doit apparaître dans l export Loi 18-07',
  );

  await commeRole(db, A_PROP, async () => {
    const r = await db.query(
      `select public.anonymiser_credit_client($1::uuid, 'Demande client Loi 18-07', 'REQ-58-001') as res`,
      [creditId],
    );
    assert.equal(r.rows[0].res.lignes_affectees, 1);
  });
  const anonRow = await db.query(
    `select nom_debiteur, telephone from public.credits_clients where id = $1`,
    [creditId],
  );
  assert.equal(anonRow.rows[0].nom_debiteur, 'Client anonymise (REQ-58-001)');
  assert.equal(anonRow.rows[0].telephone, '');
});

test('Migration 58 SQL : RPCs admin provisioning & master réservées à service_role', async () => {
  const { db } = etat;

  const privs = await db.query(`
    select
      has_function_privilege('anon', 'public.provisionner_espace_patisserie_admin(uuid,text,text,text,text,integer,boolean)', 'execute') as p_anon,
      has_function_privilege('authenticated', 'public.provisionner_espace_patisserie_admin(uuid,text,text,text,text,integer,boolean)', 'execute') as p_auth,
      has_function_privilege('service_role', 'public.provisionner_espace_patisserie_admin(uuid,text,text,text,text,integer,boolean)', 'execute') as p_srv,
      has_function_privilege('anon', 'public.master_maj_licence_admin(uuid,text,integer,text,text)', 'execute') as m_anon,
      has_function_privilege('authenticated', 'public.master_maj_licence_admin(uuid,text,integer,text,text)', 'execute') as m_auth,
      has_function_privilege('service_role', 'public.master_maj_licence_admin(uuid,text,integer,text,text)', 'execute') as m_srv
  `);
  const row = privs.rows[0];
  assert.equal(row.p_anon, false);
  assert.equal(row.p_auth, false);
  assert.equal(row.p_srv, true);
  assert.equal(row.m_anon, false);
  assert.equal(row.m_auth, false);
  assert.equal(row.m_srv, true);

  // Provisionnement atomique d'une nouvelle pâtisserie
  const newAuth = '99999999-9999-4999-8999-999999999958';
  const prov = await db.query(
    `select public.provisionner_espace_patisserie_admin($1::uuid, 'Maison Zineb', 'Zineb', 'zineb@maison.dz', '0550112233', 75, false) as res`,
    [newAuth],
  );
  const created = prov.rows[0].res;
  assert.ok(created.client_id);
  assert.ok(created.utilisateur_id);
  assert.ok(created.site_labo_id);
  assert.ok(created.site_boutique_id);

  const sitesCount = await db.query(
    `select count(*)::int as n from public.equipe_sites where utilisateur_id = $1`,
    [created.utilisateur_id],
  );
  assert.equal(sitesCount.rows[0].n, 2, 'Le propriétaire provisionné doit être affecté aux 2 sites');

  // Incrément atomique de license_version via master_maj_licence_admin
  const maj1 = await db.query(
    `select public.master_maj_licence_admin($1::uuid, 'duree_essai', 60, null, null) as res`,
    [created.client_id],
  );
  const maj2 = await db.query(
    `select public.master_maj_licence_admin($1::uuid, 'marquer_paye', null, null, 'master@patisgest.dz') as res`,
    [created.client_id],
  );
  assert.equal(maj1.rows[0].res.license_version, 2);
  assert.equal(maj2.rows[0].res.license_version, 3);
  const cli = await db.query(
    `select statut_abonnement, essai_duree_jours, license_version, paye_par_master from public.clients where id = $1`,
    [created.client_id],
  );
  assert.equal(cli.rows[0].statut_abonnement, 'paye');
  assert.equal(cli.rows[0].essai_duree_jours, 60);
  assert.equal(cli.rows[0].license_version, 3);
  assert.equal(cli.rows[0].paye_par_master, 'master@patisgest.dz');
});

test('Unit : rate-limiter, sémaphore de concurrence et extraction IP', () => {
  const rl = createRateLimiter({ maxAttempts: 2, windowMs: 10_000 });
  assert.equal(rl.consume('ip-1', 1000).allowed, true);
  assert.equal(rl.consume('ip-1', 2000).allowed, true);
  const blocked = rl.consume('ip-1', 3000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs >= 7_000);
  // Après expiration de la fenêtre, autorisé de nouveau
  assert.equal(rl.consume('ip-1', 12_000).allowed, true);
  rl.reset('ip-1');
  assert.equal(rl.check('ip-1', 12_500).remaining, 2);

  const sem = createConcurrencySemaphore(2);
  const r1 = sem.tryAcquire();
  const r2 = sem.tryAcquire();
  assert.ok(r1 && r2);
  assert.equal(sem.tryAcquire(), null, '3e acquisition simultanée doit être refusée');
  assert.equal(sem.inFlight(), 2);
  r1();
  r1(); // double release idempotent
  assert.equal(sem.inFlight(), 1);
  r2();
  assert.equal(sem.inFlight(), 0);

  const ip = extractClientIpFromHeaders({
    get: (k) => (k === 'x-forwarded-for' ? '197.200.1.5, 10.0.0.1' : null),
  });
  assert.equal(ip, '197.200.1.5');
});

test('Unit : validation des magic bytes OCR (PNG/JPEG/WebP vs contenu falsifié)', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'latin1');
  const spoofed = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

  assert.equal(validerOctetsImageOcr(png, 'image/png').ok, true);
  assert.equal(validerOctetsImageOcr(jpeg, 'image/jpeg').ok, true);
  assert.equal(validerOctetsImageOcr(webp, 'image/webp').ok, true);
  assert.equal(validerOctetsImageOcr(spoofed, 'image/png').ok, false);
  assert.equal(validerOctetsImageOcr(png, 'image/jpeg').ok, false);
});

test('Unit : trial-crypto échoue fermé si PATISGEST_LICENSE_PRIVATE_JWK est malformée ou incomplète', () => {
  const prev = process.env.PATISGEST_LICENSE_PRIVATE_JWK;
  try {
    process.env.PATISGEST_LICENSE_PRIVATE_JWK = '{malformed-json';
    assert.throws(() => getLicenseKeyPair(), /JSON mal formé/i);
    process.env.PATISGEST_LICENSE_PRIVATE_JWK = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'abc' });
    assert.throws(() => getLicenseKeyPair(), /incomplet/i);
  } finally {
    if (prev === undefined) delete process.env.PATISGEST_LICENSE_PRIVATE_JWK;
    else process.env.PATISGEST_LICENSE_PRIVATE_JWK = prev;
  }
});

test('Unit : Service Worker survit à QuotaExceededError lors de cache.put sur asset statique', async () => {
  const handlers = {};
  const fakeResponse = {
    ok: true,
    status: 200,
    type: 'basic',
    redirected: false,
    headers: { get: () => 'application/javascript' },
    clone() {
      return this;
    },
  };
  const context = {
    URL,
    self: {
      location: { origin: 'https://app.test' },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      addEventListener: (name, fn) => {
        handlers[name] = fn;
      },
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      open: async () => ({
        match: async () => undefined,
        put: async () => {
          throw new Error('QuotaExceededError');
        },
      }),
    },
    fetch: async () => fakeResponse,
  };
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);

  let promise;
  handlers.fetch({
    request: { url: 'https://app.test/_next/static/chunks/app.js', method: 'GET', mode: 'cors' },
    respondWith: (p) => {
      promise = p;
    },
  });
  const res = await promise;
  assert.equal(res, fakeResponse, 'La réponse réseau doit être retournée même si cache.put échoue');
});

test('Unit : next.config.ts configure les en-têtes de sécurité (dev & prod)', async () => {
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const prodRules = await nextConfig.headers();
    const prodMap = Object.fromEntries(prodRules[0].headers.map((h) => [h.key, h.value]));
    assert.equal(prodMap['X-Content-Type-Options'], 'nosniff');
    assert.equal(prodMap['X-Frame-Options'], 'DENY');
    assert.match(prodMap['Strict-Transport-Security'], /max-age=31536000/);
    assert.match(prodMap['Content-Security-Policy'], /frame-ancestors 'none'/);
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});
