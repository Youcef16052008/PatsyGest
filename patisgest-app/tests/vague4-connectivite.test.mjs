import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/*
 * H19-07 / H13-03 / H19-08 : une seule horloge, filtre DB, et confirmation
 * réelle de livraison. Le faux admin PostgREST enregistre les filtres, les
 * insertions d'alertes et les mises à jour `offline_alert_sent_at`.
 */

const etat = {
  lignes: [],
  erreurLecture: null,
  filtreLt: null,
  insertions: [],
  misesAJour: [],
  dispatch: { statut: 'envoye', canaux: ['sms'], results: [{ ok: true }] },
};

mock.module(new URL('../src/lib/notifications-alerte.ts', import.meta.url).href, {
  namedExports: {
    buildOfflineAlertMessage: (p) => `message:${p.disconnectedMinutes}`,
    collectDisconnectAlertRecipients: () => ['+213555000001'],
    sendSmsAndWhatsAppAlerts: async () => etat.dispatch,
  },
});

mock.module(new URL('../src/lib/supabase/admin.ts', import.meta.url).href, {
  namedExports: {
    createAdminClient: () => ({
      from(table) {
        if (table === 'utilisateurs') {
          const lecture = {
            // Compatibilité avec l'ancien balayage : `await chaine.in(...)`
            // lisait `data`/`error` sur l'objet lui-même, sans `.lt()`.
            get data() { return etat.erreurLecture ? null : etat.lignes; },
            get error() { return etat.erreurLecture; },
            select: () => lecture,
            in: () => lecture,
            lt: async (colonne, valeur) => {
              etat.filtreLt = { table, colonne, valeur };
              return etat.erreurLecture
                ? { data: null, error: etat.erreurLecture }
                : { data: etat.lignes, error: null };
            },
            update: (payload) => ({
              eq: async (colonne, valeur) => {
                etat.misesAJour.push({ payload, colonne, valeur });
                return { error: null };
              },
            }),
          };
          return lecture;
        }
        return {
          insert: async (payload) => {
            etat.insertions.push({ table, payload });
            return { error: null };
          },
        };
      },
    }),
  },
});

// Import namespace : la sonde « avant » peut charger le fichier HEAD sans
// échouer à l'import d'un export qui n'existait pas encore.
const cron = await import('../src/lib/connectivite-cron.ts');
const { runOfflineDisconnectAlerts, borneConnectivite } = cron;

function ligneUtilisateur(lastSeenAt, extra = {}) {
  return {
    id: 'u1',
    client_id: 'c1',
    nom: 'Amina',
    email: 'amina@atelier.test',
    role: 'labo',
    telephone: '+213555000001',
    last_seen_at: lastSeenAt,
    offline_alert_sent_at: null,
    offline_alert_count: 0,
    clients: [{ id: 'c1', nom: 'Atelier' }],
    ...extra,
  };
}

function initialiser(dispatch = etat.dispatch) {
  process.env.PATISGEST_OFFLINE_ALERT_MINUTES = '60';
  const ancien = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  etat.lignes = [ligneUtilisateur(ancien)];
  etat.erreurLecture = null;
  etat.filtreLt = null;
  etat.insertions = [];
  etat.misesAJour = [];
  etat.dispatch = dispatch;
}

test('H19-07 : une seule horloge produit une borne DB cohérente', () => {
  const b = borneConnectivite('2026-11-26T12:00:00.000Z', 60);
  assert.equal(b.checkedAtMs, Date.parse('2026-11-26T12:00:00.000Z'));
  assert.equal(b.cutoffMs, Date.parse('2026-11-26T11:00:00.000Z'));
  assert.equal(b.cutoffIso, '2026-11-26T11:00:00.000Z');
});

test('H19-07 : le filtre .lt() est appliqué côté DB, pas seulement en JS', async () => {
  initialiser();
  const res = await runOfflineDisconnectAlerts();
  assert.equal(etat.filtreLt.table, 'utilisateurs');
  assert.equal(etat.filtreLt.colonne, 'last_seen_at');
  assert.match(etat.filtreLt.valeur, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(res.checkedAt, new Date(res.checkedAt).toISOString());
  assert.equal(Date.parse(etat.filtreLt.valeur), Date.parse(res.checkedAt) - 60 * 60_000);
});

test('H13-03 : simulation, partiel et echec ne marquent pas l’alerte envoyée', async () => {
  for (const [statut, results] of [
    ['simulation', [{ ok: true }]],
    ['partiel', [{ ok: true }, { ok: false }]],
    ['echec', [{ ok: false }]],
  ]) {
    initialiser({ statut, canaux: ['sms'], results });
    const res = await runOfflineDisconnectAlerts();
    assert.equal(res.alertsDispatched, 0, `${statut} compté comme envoyé`);
    assert.equal(res.alertsFailed, 1);
    assert.equal(res.ok, false);
    assert.equal(res.disconnectedFound, 1);
    assert.equal(etat.misesAJour.length, 0, `${statut} a écrit offline_alert_sent_at`);
    assert.equal(etat.insertions.length, 1, 'l’échec doit rester tracé');
  }
});

test('H13-03 : seul un statut envoye avec tous les canaux ok confirme la livraison', async () => {
  initialiser({
    statut: 'envoye',
    canaux: ['sms', 'whatsapp'],
    results: [{ ok: true }, { ok: true }],
  });
  const res = await runOfflineDisconnectAlerts();
  assert.equal(res.ok, true);
  assert.equal(res.alertsDispatched, 1);
  assert.equal(res.alertsFailed, 0);
  assert.equal(etat.misesAJour.length, 1);
  assert.equal(etat.misesAJour[0].payload.offline_alert_count, 1);
  assert.equal(etat.misesAJour[0].payload.offline_alert_sent_at, res.checkedAt);
});

test('H19-08 : une ligne jamais vue reste exclue sans faire échouer le balayage', async () => {
  initialiser();
  etat.lignes = [ligneUtilisateur(null)];
  const res = await runOfflineDisconnectAlerts();
  assert.equal(res.ok, true);
  assert.equal(res.disconnectedFound, 0);
  assert.equal(res.alertsFailed, 0);
  assert.equal(etat.insertions.length, 0);
});
