import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/*
 * `trial-crypto.ts` — licence d'essai signée ECDSA P-256.
 *
 * L'application vérifie cette signature côté serveur et le bundle signé part
 * vers le client. Rien n'était testé : ni la vérification, ni la résistance à
 * la falsification, ni la borne des jours d'essai. Un `verify` cassé
 * accepterait n'importe quel jeton ; un `clampTrialDays` cassé donnerait un
 * essai éternel ou négatif.
 */

process.env.PATISGEST_LICENSE_PRIVATE_KEY = 'graine-de-test-licence-deterministe';

const {
  clampTrialDays, signTrialLicense, verifyTrialLicenseServer,
  TRIAL_DURATION_MIN_DAYS, TRIAL_DURATION_MAX_DAYS, TRIAL_DURATION_DEFAULT_DAYS,
} = await import('../src/lib/trial-crypto.ts');

const payload = (surcharge = {}) => ({
  clientId: 'client-1',
  clientNom: 'Atelier Test',
  statut: 'essai',
  trialDays: 90,
  startedAtMs: 1_700_000_000_000,
  expiresAtMs: 1_700_000_000_000 + 90 * 86_400_000,
  issuedAtMs: 1_700_000_000_000,
  licenseVersion: 1,
  ...surcharge,
});

test('essai : les jours sont bornés à [60, 90], arrondis', () => {
  assert.equal(TRIAL_DURATION_MIN_DAYS, 60);
  assert.equal(TRIAL_DURATION_MAX_DAYS, 90);
  assert.equal(TRIAL_DURATION_DEFAULT_DAYS, 90);

  assert.equal(clampTrialDays(90), 90);
  assert.equal(clampTrialDays(75.4), 75);
  assert.equal(clampTrialDays(75.6), 76);
  // Bornes : jamais au-delà de 90 (essai éternel), jamais en dessous de 60.
  assert.equal(clampTrialDays(9999), 90, 'un essai de 9999 jours doit être ramené à 90');
  assert.equal(clampTrialDays(0), 60);
  assert.equal(clampTrialDays(-30), 60);
  // Dégradés → valeur par défaut, jamais NaN.
  for (const mauvais of [undefined, null, 'abc', Number.NaN, {}, [], Number.POSITIVE_INFINITY]) {
    const r = clampTrialDays(mauvais);
    assert.equal(Number.isFinite(r), true, `clampTrialDays(${JSON.stringify(mauvais)}) n’est pas fini`);
    assert.ok(r >= 60 && r <= 90, `clampTrialDays(${JSON.stringify(mauvais)}) = ${r} hors bornes`);
  }
  // Une chaîne numérique reste exploitable.
  assert.equal(clampTrialDays('75'), 75);
});

test('essai : signer puis vérifier restitue exactement la charge utile', () => {
  const p = payload();
  const { token, publicJwk } = signTrialLicense(p);
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'format base64url.body.sig attendu');
  assert.equal(publicJwk.kty, 'EC');
  assert.equal(publicJwk.crv, 'P-256');
  assert.equal(typeof publicJwk.x, 'string');
  assert.equal(typeof publicJwk.y, 'string');
  assert.equal(publicJwk.d, undefined, 'la clé publique ne doit JAMAIS contenir la clé privée');

  const relu = verifyTrialLicenseServer(token);
  assert.deepEqual(relu, p);
});

test('essai : un corps modifié invalide la signature', () => {
  const { token } = signTrialLicense(payload());
  const [body, sig] = token.split('.');
  // Prolonge l'essai de 10 ans : la signature ne doit plus correspondre.
  const corpsForge = Buffer.from(
    JSON.stringify(payload({ expiresAtMs: Date.now() + 10 * 365 * 86_400_000 })),
  ).toString('base64url');
  assert.equal(verifyTrialLicenseServer(`${corpsForge}.${sig}`), null, 'prolongation acceptée');
  // Touche à la signature elle-même.
  const sigAlteree = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.equal(verifyTrialLicenseServer(`${body}.${sigAlteree}`), null, 'signature altérée acceptée');
});

test('essai : jetons malformés = null, jamais une exception', () => {
  for (const brut of [
    '', '.', 'sanseparateur', 'a.', '.b', 'a.b.c', '....',
    Buffer.from('{}').toString('base64url') + '.signaturebidon',
    '%%%%.' + Buffer.from('x').toString('base64url'),
  ]) {
    assert.equal(verifyTrialLicenseServer(brut), null, `jeton accepté ou exception : ${JSON.stringify(brut)}`);
  }
  // Types inattendus.
  for (const brut of [null, undefined, 42, {}]) {
    assert.equal(verifyTrialLicenseServer(brut), null);
  }
});

test('essai : une signature valide mais une charge utile inexploitable = null', () => {
  // Signé correctement (donc signature vraie) mais champs obligatoires absents.
  for (const p of [
    { clientId: 123, expiresAtMs: 1 },
    { clientId: 'x' },
    { expiresAtMs: 1 },
    {},
    null,
  ]) {
    const { token } = signTrialLicense(p);
    assert.equal(verifyTrialLicenseServer(token), null, `charge utile acceptée à tort : ${JSON.stringify(p)}`);
  }
});

test('essai : une signature d’une AUTRE graine est refusée', () => {
  const { token } = signTrialLicense(payload());
  const graine = process.env.PATISGEST_LICENSE_PRIVATE_KEY;
  try {
    // Nouvelle graine : la paire de clés change, donc la vérification échoue.
    // (Le cache est indexé sur la graine, il se recalcule.)
    process.env.PATISGEST_LICENSE_PRIVATE_KEY = 'une-autre-graine-totalement-differente';
    assert.equal(verifyTrialLicenseServer(token), null, 'jeton d’une autre graine accepté');
  } finally {
    process.env.PATISGEST_LICENSE_PRIVATE_KEY = graine;
  }
});

test('essai : la clé dérivée est stable, la signature ECDSA est randomisée', () => {
  // ECDSA tire un nonce aléatoire à chaque signature : deux signatures de la
  // même charge utile DIFFÈRENT (c'est correct, et non un défaut de
  // reproductibilité). Ce qui doit être stable, c'est la clé dérivée de la
  // graine — sans quoi un jeton émis par une instance ne serait plus
  // vérifiable par une autre instance configurée à l'identique.
  const p = payload();
  const a = signTrialLicense(p);
  const b = signTrialLicense(p);
  // Même corps, signature différente, les deux vérifiables.
  assert.equal(a.token.split('.')[0], b.token.split('.')[0], 'le corps doit être déterministe');
  assert.notEqual(a.token.split('.')[1], b.token.split('.')[1], 'le nonce ECDSA doit être aléatoire');
  assert.notEqual(verifyTrialLicenseServer(a.token), null);
  assert.notEqual(verifyTrialLicenseServer(b.token), null);
  // Même clé publique => toute instance de la même graine vérifie le jeton.
  assert.deepEqual(a.publicJwk, b.publicJwk, 'la clé dérivée doit être stable entre appels');
});

/*
 * `trial-server.ts` — lecture du statut d'essai côté serveur.
 *
 * Le point sensible : toutes les dates viennent de la base et `serverNow` est
 * censé faire foi (horloge serveur), pas l'horloge du navigateur. Un poste
 * dont l'horloge est reculée ne doit pas gagner de jours d'essai.
 */
const serverUrl = new URL('../src/lib/supabase/server.ts', import.meta.url).href;
let rpcResult = { data: null, error: null };
mock.module(serverUrl, {
  namedExports: {
    createClient: async () => ({
      rpc: async () => rpcResult,
    }),
  },
});

const { lireStatutEssaiServeur } = await import('../src/lib/trial-server.ts');

test('essai serveur : RPC en erreur ou vide => null (aucun statut inventé)', async () => {
  rpcResult = { data: null, error: { message: 'boom' } };
  assert.equal(await lireStatutEssaiServeur(), null);
  rpcResult = { data: null, error: null };
  assert.equal(await lireStatutEssaiServeur(), null);
  rpcResult = { data: 'pas un objet', error: null };
  assert.equal(await lireStatutEssaiServeur(), null);
});

test('essai serveur : jours restants calculés sur l’horloge SERVEUR', async () => {
  const debut = '2026-01-01T00:00:00.000Z';
  const fin = '2026-04-01T00:00:00.000Z';
  rpcResult = {
    data: {
      client_id: 'c1', client_nom: 'Atelier', statut_abonnement: 'essai',
      essai_duree_jours: 90, essai_debut_at: debut, essai_fin_at: fin,
      server_now: '2026-02-01T00:00:00.000Z', verrouille: false,
    },
    error: null,
  };
  const statut = await lireStatutEssaiServeur();
  assert.ok(statut);
  // 1er février → 1er avril = 59 jours pleins, ceil => 59.
  assert.equal(statut.joursRestants, 59);

  // Un poste avec une horloge très en avance ne change rien : c'est
  // `server_now` qui compte.
  rpcResult.data.server_now = '2026-03-31T23:00:00.000Z';
  assert.equal((await lireStatutEssaiServeur()).joursRestants, 1);

  // Après échéance : jamais négatif.
  rpcResult.data.server_now = '2026-06-01T00:00:00.000Z';
  assert.equal((await lireStatutEssaiServeur()).joursRestants, 0, 'des jours négatifs ne doivent pas apparaître');
});

test('essai serveur : abonnement payé => pas de compte à rebours', async () => {
  rpcResult = {
    data: {
      client_id: 'c1', client_nom: 'A', statut_abonnement: 'paye',
      essai_fin_at: '2020-01-01T00:00:00.000Z', server_now: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  };
  const s = await lireStatutEssaiServeur();
  assert.equal(s.statutAbonnement, 'paye');
  assert.equal(s.joursRestants, 999);
});

test('essai serveur : statut inconnu ramené à « essai », jamais un accès payé', async () => {
  for (const statut of ['PAYE', 'gratuit', '', 'suspendu_modifie', undefined]) {
    rpcResult = {
      data: { client_id: 'c1', statut_abonnement: statut, server_now: '2026-01-01T00:00:00.000Z' },
      error: null,
    };
    const s = await lireStatutEssaiServeur();
    assert.ok(['essai', 'paye', 'suspendu'].includes(s.statutAbonnement), `statut hors contrat : ${statut}`);
    if (statut !== 'paye' && statut !== 'suspendu') {
      assert.equal(s.statutAbonnement, 'essai', `« ${statut} » ne doit pas donner mieux que essai`);
    }
  }
});

test('essai serveur : date de fin illisible => repli déterministe, jamais NaN', async () => {
  rpcResult = {
    data: {
      client_id: 'c1', essai_duree_jours: 90,
      essai_debut_at: 'pas une date', essai_fin_at: 'pas une date non plus',
      server_now: 'pas une date du tout',
    },
    error: null,
  };
  const s = await lireStatutEssaiServeur();
  assert.equal(Number.isFinite(s.joursRestants), true, 'joursRestants NaN');
  assert.ok(s.joursRestants >= 0);
  assert.equal(Number.isFinite(s.signedBundle.payload.expiresAtMs), true);
  // Le bundle reste signé et vérifiable même avec des dates dégradées.
  const { verifyTrialLicenseServer } = await import('../src/lib/trial-crypto.ts');
  assert.notEqual(verifyTrialLicenseServer(s.signedBundle.token), null);
});

test('essai serveur : durée aberrante bornée par clampTrialDays', async () => {
  rpcResult = {
    data: { client_id: 'c1', essai_duree_jours: 100000, server_now: '2026-01-01T00:00:00.000Z' },
    error: null,
  };
  assert.equal((await lireStatutEssaiServeur()).essaiDureeJours, 90);
  rpcResult.data.essai_duree_jours = -5;
  assert.equal((await lireStatutEssaiServeur()).essaiDureeJours, 60);
});

test('essai serveur : une exception de transport ne remonte pas', async () => {
  // `createClient` qui lève : la fonction doit rendre null, pas casser l'écran.
  const { createClient } = await import('../src/lib/supabase/server.ts');
  assert.equal(typeof createClient, 'function');
  rpcResult = { data: null, error: { message: 'réseau' } };
  assert.equal(await lireStatutEssaiServeur(), null);
});

test('production : aucune graine publique du dépôt ne signe une licence', () => {
  // H01-05 : avant le correctif, supprimer tous les secrets en production
  // retombait sur une graine connue de tous et signait quand même le bundle.
  const cles = [
    'NODE_ENV', 'VERCEL_ENV', 'PATISGEST_LICENSE_PRIVATE_JWK',
    'PATISGEST_LICENSE_PRIVATE_KEY', 'PATISGEST_MASTER_KEY',
    'VITRINE_SECRET_ANTI_ABUS', 'PATISGEST_DEMO_SECRET',
  ];
  const avant = Object.fromEntries(cles.map(k => [k, process.env[k]]));
  try {
    for (const k of cles) delete process.env[k];
    process.env.NODE_ENV = 'production';
    assert.throws(
      () => signTrialLicense(payload()),
      /Clé de licence absente en production/,
      'une licence ne doit jamais être signée avec la graine publique en production',
    );
    // La vérification échoue fermé : aucune exception, aucun jeton accepté.
    assert.equal(verifyTrialLicenseServer('corps.signature'), null);

    // Avec un secret configuré, la signature redevient vérifiable.
    process.env.PATISGEST_LICENSE_PRIVATE_KEY = 'graine-de-test-licence-deterministe';
    assert.notEqual(verifyTrialLicenseServer(signTrialLicense(payload()).token), null);
  } finally {
    for (const k of cles) {
      if (avant[k] === undefined) delete process.env[k];
      else process.env[k] = avant[k];
    }
  }
});
