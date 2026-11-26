import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

/*
 * `master-auth.ts` — accès « master » (super-admin) : HMAC-SHA256 du cookie,
 * porte de longueur de clé (>= 16), comparaison à temps constant, expiration.
 *
 * Rien de tout cela n'était couvert. Une régression sur la vérification de
 * signature donnerait un accès super-admin forgeable avec un cookie fabriqué
 * à la main — c'est le point le plus sensible du dépôt.
 */

// Le hook de résolution redirige `next/headers` vers ce fichier : on le
// remplace pour piloter le contenu du cookie pendant les tests.
const stubsUrl = new URL('./mocks/next-stubs.mjs', import.meta.url).href;
let cookieValue;
mock.module(stubsUrl, {
  namedExports: {
    revalidatePath() {},
    async cookies() {
      return {
        get: (nom) => (cookieValue === undefined ? undefined : { name: nom, value: cookieValue }),
        getAll: () => [],
        set() {},
        delete() {},
      };
    },
    redirect() {
      const e = new Error('redirect');
      e.digest = 'NEXT_REDIRECT';
      throw e;
    },
  },
});

const CLÉ = 'clef-de-test-suffisamment-longue';
const EMAIL = 'patron@patisgest.test';

process.env.PATISGEST_MASTER_EMAIL = EMAIL;
process.env.PATISGEST_MASTER_KEY = CLÉ;

const {
  isMasterConfigured,
  verifyMasterCredentials,
  getMasterSession,
  MASTER_COOKIE_NAME,
} = await import('../src/lib/master-auth.ts');

/** Fabrique un cookie au format attendu : base64url(JSON).hmac-hex. */
function forger(payload, cle = CLÉ, signatureFournie) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signatureFournie ?? createHmac('sha256', cle).update(body).digest('hex');
  return `${body}.${sig}`;
}

test('master : la clé doit faire au moins 16 caractères', () => {
  const initiale = process.env.PATISGEST_MASTER_KEY;
  try {
    process.env.PATISGEST_MASTER_KEY = 'x'.repeat(15);
    assert.equal(isMasterConfigured(), false, '15 caractères ne doivent pas suffire');
    assert.equal(verifyMasterCredentials(EMAIL, 'x'.repeat(15)), false);

    process.env.PATISGEST_MASTER_KEY = 'x'.repeat(16);
    assert.equal(isMasterConfigured(), true, '16 caractères doivent suffire');
  } finally {
    process.env.PATISGEST_MASTER_KEY = initiale;
  }
});

test('master : e-mail absent ou trop court = non configuré', () => {
  const initial = process.env.PATISGEST_MASTER_EMAIL;
  try {
    process.env.PATISGEST_MASTER_EMAIL = 'ab';
    assert.equal(isMasterConfigured(), false);
    process.env.PATISGEST_MASTER_EMAIL = '   ';
    assert.equal(isMasterConfigured(), false);
  } finally {
    process.env.PATISGEST_MASTER_EMAIL = initial;
  }
});

test('master : identifiants exacts acceptés, casse et espaces normalisés', () => {
  assert.equal(verifyMasterCredentials(EMAIL, CLÉ), true);
  assert.equal(verifyMasterCredentials(`  ${EMAIL.toUpperCase()}  `, CLÉ), true);
  assert.equal(verifyMasterCredentials(EMAIL, 'mauvaise-clef'), false);
  assert.equal(verifyMasterCredentials('autre@example.test', CLÉ), false);
  // Les deux doivent être justes : un bon e-mail ne doit pas suffire.
  assert.equal(verifyMasterCredentials(EMAIL, ''), false);
  assert.equal(verifyMasterCredentials('', CLÉ), false);
});

test('master : clé vide ou non configurée refuse tout, jamais un accès implicite', () => {
  const initiale = process.env.PATISGEST_MASTER_KEY;
  try {
    process.env.PATISGEST_MASTER_KEY = '';
    assert.equal(isMasterConfigured(), false);
    assert.equal(verifyMasterCredentials(EMAIL, ''), false, 'clé vide == clé vide ne doit pas passer');
    cookieValue = forger({ email: EMAIL, expires: Date.now() + 3600_000 }, '');
    return getMasterSession().then((s) => assert.equal(s, null));
  } finally {
    process.env.PATISGEST_MASTER_KEY = initiale;
  }
});

test('master : cookie correct accepté et e-mail renvoyé', async () => {
  cookieValue = forger({ email: EMAIL, expires: Date.now() + 3600_000 });
  const s = await getMasterSession();
  assert.deepEqual(s, { email: EMAIL });
});

test('master : cookie absent, vide ou malformé = refus', async () => {
  cookieValue = undefined;
  assert.equal(await getMasterSession(), null, 'aucun cookie');

  for (const brut of ['', 'sanseparateur', '.', 'abc.', '.def', 'a.b.c']) {
    cookieValue = brut;
    assert.equal(await getMasterSession(), null, `cookie malformé accepté : ${JSON.stringify(brut)}`);
  }
});

test('master : signature altérée ou clé différente = refus (HMAC)', async () => {
  const valide = forger({ email: EMAIL, expires: Date.now() + 3600_000 });
  const [body, sig] = valide.split('.');

  // Un seul caractère modifié dans la signature.
  const sigAlteree = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
  cookieValue = `${body}.${sigAlteree}`;
  assert.equal(await getMasterSession(), null, 'signature altérée acceptée');

  // Signature calculée avec une autre clé.
  cookieValue = forger({ email: EMAIL, expires: Date.now() + 3600_000 }, 'une-autre-clef-tres-longue');
  assert.equal(await getMasterSession(), null, 'signature d’une autre clé acceptée');

  // Signature tronquée.
  cookieValue = `${body}.${sig.slice(0, 32)}`;
  assert.equal(await getMasterSession(), null, 'signature tronquée acceptée');
});

test('master : corps modifié sans re-signer = refus (pas de substitution)', async () => {
  const valide = forger({ email: EMAIL, expires: Date.now() + 3600_000 });
  const sig = valide.split('.')[1];
  // Attaquant : remplace l'e-mail par le sien, garde la signature d'origine.
  const corpsForge = Buffer.from(
    JSON.stringify({ email: 'attaquant@example.test', expires: Date.now() + 3600_000 }),
  ).toString('base64url');
  cookieValue = `${corpsForge}.${sig}`;
  assert.equal(await getMasterSession(), null, 'substitution de corps acceptée');
});

test('master : cookie expiré refusé, cookie encore valide accepté', async () => {
  cookieValue = forger({ email: EMAIL, expires: Date.now() - 1000 });
  assert.equal(await getMasterSession(), null, 'cookie expiré accepté');

  cookieValue = forger({ email: EMAIL, expires: Date.now() + 60_000 });
  assert.notEqual(await getMasterSession(), null, 'cookie encore valide refusé');
});

test('master : e-mail du cookie différent du master configuré = refus', async () => {
  // Signature valide (clé correcte) mais pour un autre compte : le rôle master
  // est lié à l'e-mail, pas seulement à la clé.
  cookieValue = forger({ email: 'autre@example.test', expires: Date.now() + 3600_000 });
  assert.equal(await getMasterSession(), null);
});

test('master : champs manquants ou de mauvais type = refus', async () => {
  for (const payload of [
    {},
    { email: EMAIL },
    { expires: Date.now() + 3600_000 },
    { email: EMAIL, expires: 'bientot' },
    { email: 123, expires: Date.now() + 3600_000 },
  ]) {
    cookieValue = forger(payload);
    assert.equal(await getMasterSession(), null, `payload accepté à tort : ${JSON.stringify(payload)}`);
  }
});

test('master : un cookie JSON non décodable ne lève pas', async () => {
  const corps = Buffer.from('{pas du json', 'utf8').toString('base64url');
  const sig = createHmac('sha256', CLÉ).update(corps).digest('hex');
  cookieValue = `${corps}.${sig}`;
  assert.equal(await getMasterSession(), null);
});

test('master : le nom du cookie est stable (contrat avec le middleware/UI)', () => {
  assert.equal(MASTER_COOKIE_NAME, 'patisgest_master_session');
});
