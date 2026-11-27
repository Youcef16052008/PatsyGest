import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/*
 * H19-12 / H13-03 / H13-05 : bornes réseau explicites.
 *
 * Le faux `fetch` peut ignorer le signal : `Promise.race` doit quand même
 * rendre la main. Le faux RPC peut ne jamais répondre : la promesse partagée
 * doit être libérée pour la requête suivante.
 */

const CLES_ENV = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_SMS_FROM',
  'TWILIO_WHATSAPP_FROM',
  'PATISGEST_SMS_WEBHOOK_URL',
  'PATISGEST_WHATSAPP_WEBHOOK_URL',
  'PATISGEST_WEBHOOK_SECRET',
];

function nettoyerEnv() {
  for (const cle of CLES_ENV) delete process.env[cle];
}

function webhookSms() {
  for (const cle of CLES_ENV) delete process.env[cle];
  process.env.PATISGEST_SMS_WEBHOOK_URL = 'https://webhook.test/sms';
}

const etatRpc = { appels: 0, pend: true, data: null, error: null };

mock.module(new URL('../src/lib/supabase/server.ts', import.meta.url).href, {
  namedExports: {
    createClient: async () => ({
      rpc: () => {
        etatRpc.appels += 1;
        if (etatRpc.pend) return new Promise(() => {});
        return Promise.resolve({ data: etatRpc.data, error: etatRpc.error });
      },
    }),
  },
});

// Imports namespace : la sonde « avant » charge les fichiers HEAD sans casser
// sur des exports absents, puis mesure le blocage réel.
const alertes = await import('../src/lib/notifications-alerte.ts');
const essai = await import('../src/lib/trial-server.ts');
const {
  sendSmsAndWhatsAppAlerts,
  DELAI_ALERTE_RESEAU_MS,
} = alertes;
const {
  lireStatutEssaiPartage,
  reinitialiserStatutEssaiPartage,
} = essai;

const borne = (promesse, ms = 500) => Promise.race([
  promesse,
  new Promise((_, reject) => setTimeout(() => reject(new Error('sonde bloquée')), ms)),
]);

test.after(() => nettoyerEnv());

test('H19-12 : un webhook qui ignore AbortSignal ne bloque pas le cron', async () => {
  webhookSms();
  let signalVu;
  const debut = Date.now();
  const res = await borne(sendSmsAndWhatsAppAlerts(
    { recipients: ['+213555000001'], message: 'Alerte' },
    (_url, init) => {
      signalVu = init?.signal;
      return new Promise(() => {});
    },
    { timeoutMs: 20 },
  ));
  assert.ok(signalVu instanceof AbortSignal, 'AbortSignal non transmis au fournisseur');
  assert.ok(Date.now() - debut < 300, 'le délai de 20 ms n’a pas été appliqué');
  assert.equal(res.statut, 'echec');
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].ok, false);
  assert.match(res.results[0].error ?? '', /Délai réseau dépassé/);
  assert.equal(signalVu.aborted, true);
  assert.equal(DELAI_ALERTE_RESEAU_MS, 10_000);
});

test('H19-12 : un webhook rapide est livré, sans abort', async () => {
  webhookSms();
  let signalVu;
  const res = await sendSmsAndWhatsAppAlerts(
    { recipients: ['+213555000001'], message: 'Alerte' },
    async (_url, init) => {
      signalVu = init?.signal;
      return new Response('ok', { status: 200 });
    },
    { timeoutMs: 1_000 },
  );
  assert.equal(res.statut, 'envoye');
  assert.equal(res.results[0].ok, true);
  assert.equal(signalVu?.aborted, false);
});

test('H13-05 : un RPC sans réponse rend null et libère la promesse partagée', async () => {
  nettoyerEnv();
  etatRpc.appels = 0;
  etatRpc.pend = true;
  reinitialiserStatutEssaiPartage(20);
  const premier = await borne(lireStatutEssaiPartage());
  assert.equal(premier, null);
  assert.equal(etatRpc.appels, 1);
  const second = await borne(lireStatutEssaiPartage());
  assert.equal(second, null);
  assert.equal(etatRpc.appels, 2, 'statutEnVol est resté partagé après le délai');
});

test('H13-05 : une réponse RPC rapide n’est pas affectée par la borne', async () => {
  etatRpc.appels = 0;
  etatRpc.pend = false;
  etatRpc.data = null;
  etatRpc.error = { message: 'RLS' };
  reinitialiserStatutEssaiPartage();
  const statut = await borne(lireStatutEssaiPartage());
  assert.equal(statut, null);
  assert.equal(etatRpc.appels, 1);
});
