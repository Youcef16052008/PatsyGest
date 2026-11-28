import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formaterResumeSondes,
  notifierAlerteSondes,
  verifierSondes,
} from '../scripts/observabilite-sondes.mjs';

function reponseJson(status, corps, headers = { 'cache-control': 'no-store' }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  };
}

test('observabilité sondes : toutes les sondes vertes (health, gate 401, stack 200, pages publiques)', async () => {
  const fetchMock = async (cible, opts = {}) => {
    const chemin = new URL(cible).pathname;
    if (chemin === '/api/health') return reponseJson(200, { ok: true, service: 'patisgest' });
    if (chemin === '/api/health/stack') {
      if (!opts.headers?.['x-cron-secret']) return reponseJson(401, { ok: false });
      return reponseJson(200, {
        ok: true,
        checks: {
          application: { ok: true, status: 200 },
          auth: { ok: true, status: 200 },
          postgrest: { ok: true, status: 200, detail: 57 },
          storage: { ok: true, status: 200, detail: 'prive' },
        },
      });
    }
    return reponseJson(200, '<html></html>', {});
  };

  const rapport = await verifierSondes({
    baseUrl: 'https://patsy-gest.vercel.app',
    cronSecret: 'secret-ci-de-test-valide-32c',
    expectedSchema: 57,
    fetchImpl: fetchMock,
  });

  assert.equal(rapport.ok, true);
  assert.equal(rapport.failures.length, 0);
  assert.equal(rapport.probes.length, 5);
  const md = formaterResumeSondes(rapport);
  assert.match(md, /PASS/);
  assert.match(md, /schema=57 storage=prive/);
  assert.doesNotMatch(md, /secret-ci-de-test-valide-32c/);
});

test('observabilité sondes : échec si Auth down, schéma < 57 ou /api/health/stack exposée sans secret', async () => {
  const fetchMock = async (cible, opts = {}) => {
    const chemin = new URL(cible).pathname;
    if (chemin === '/api/health') return reponseJson(200, { ok: true });
    if (chemin === '/api/health/stack') {
      if (!opts.headers?.['x-cron-secret']) return reponseJson(200, { ok: true }); // régression grave
      return reponseJson(503, {
        ok: false,
        checks: {
          application: { ok: true, status: 200 },
          auth: { ok: false, status: 503 },
          postgrest: { ok: true, status: 200, detail: 56 },
          storage: { ok: true, status: 200, detail: 'prive' },
        },
      });
    }
    return reponseJson(200, '<html></html>', {});
  };

  const rapport = await verifierSondes({
    baseUrl: 'https://patsy-gest.vercel.app',
    cronSecret: 'secret-ci-de-test-valide-32c',
    expectedSchema: 57,
    fetchImpl: fetchMock,
  });

  assert.equal(rapport.ok, false);
  assert.ok(rapport.failures.some((f) => /non protégée/.test(f)));
  assert.ok(rapport.failures.some((f) => /\/api\/health\/stack en échec/.test(f)));

  let appelWebhook = null;
  const notif = await notifierAlerteSondes({
    rapport,
    webhookUrl: 'https://alerts.example.invalid/hook',
    webhookSecret: 'webhook-secret-1234',
    fetchImpl: async (url, init) => {
      appelWebhook = { url, init };
      return reponseJson(202, { accepted: true });
    },
  });
  assert.equal(notif.sent, true);
  assert.equal(notif.status, 202);
  assert.equal(appelWebhook.init.headers['x-webhook-secret'], 'webhook-secret-1234');
  const payload = JSON.parse(appelWebhook.init.body);
  assert.equal(payload.event, 'observabilite.sonde.echec');
  assert.ok(!JSON.stringify(payload).includes('secret-ci-de-test-valide-32c'));
});
