import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/*
 * H16-10 : `requireWriter()` puis `getSessionContext()` relisaient la session,
 * et l'assertion `ctx!.clientId` supposait que la seconde lecture réussissait.
 * Le faux contexte expire APRÈS la garde : l'action doit conserver le contexte
 * vérifié et ne faire qu'une seule lecture.
 */

const CTX = {
  clientId: 'c1',
  clientNom: 'Atelier Test',
  nom: 'Amina',
  role: 'proprietaire',
  mode: 'supabase',
};

const etat = {
  appelsSession: 0,
  inserts: [],
  rpc: [],
};

mock.module(new URL('../src/lib/auth.ts', import.meta.url).href, {
  namedExports: {
    getSessionContext: async () => {
      etat.appelsSession += 1;
      // Panne/expiration entre la garde et l'ancien second appel.
      return etat.appelsSession === 1 ? CTX : null;
    },
    canWrite: () => true,
  },
});

mock.module(new URL('../src/lib/supabase/server.ts', import.meta.url).href, {
  namedExports: {
    createClient: async () => ({
      from: (table) => ({
        insert: async (payload) => {
          etat.inserts.push({ table, payload });
          return { error: null };
        },
      }),
      rpc: async (nom, args) => {
        etat.rpc.push({ nom, args });
        return { data: { produit: 'Farine', qte: 2, date_cible: '2026-11-26' }, error: null };
      },
    }),
  },
});

// Import namespace : la sonde « avant » peut charger la garde HEAD sans casser
// sur `requireWriterContexte`, qui n'existait pas encore.
const gardes = await import('../src/lib/journal-actions-communs.ts');
const { requireWriterContexte, requireWriter } = gardes;
const { addTemperature } = await import('../src/lib/actions-haccp.ts');
const { createRestockRequestReal } = await import('../src/lib/actions-planning.ts');

function initialiser() {
  etat.appelsSession = 0;
  etat.inserts = [];
  etat.rpc = [];
}

function aujourdhui() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function temperatureForm() {
  const f = new FormData();
  f.set('date', aujourdhui());
  f.set('frigoId', 'F1');
  f.set('frigoNom', 'Frigo 1');
  f.set('seuilMax', '8');
  f.set('temperature', '4');
  f.set('agent', 'Amina');
  return f;
}

function restockForm() {
  const f = new FormData();
  f.set('dateCible', aujourdhui());
  f.set('siteId', '11111111-1111-4111-8111-111111111111');
  f.set('articleId', '22222222-2222-4222-8222-222222222222');
  f.set('qte', '2');
  f.set('motif', '');
  f.set('demandeur', '');
  return f;
}

test('H16-10 : la garde renvoie le contexte vérifié, pas une seconde lecture', async () => {
  initialiser();
  const garde = await requireWriterContexte();
  assert.equal(garde.denied, null);
  assert.equal(garde.ctx, CTX);
  assert.equal(etat.appelsSession, 1);
  // Compatibilité des actions qui avaient seulement besoin du refus.
  initialiser();
  assert.equal(await requireWriter(), null);
  assert.equal(etat.appelsSession, 1);
});

test('H16-10 : addTemperature écrit avec le clientId de la session vérifiée', async () => {
  initialiser();
  const res = await addTemperature({}, temperatureForm());
  assert.match(res.succes ?? '', /Relevé enregistré/);
  assert.equal(etat.appelsSession, 1);
  assert.equal(etat.inserts.length, 1);
  assert.equal(etat.inserts[0].table, 'releve_temperatures');
  assert.equal(etat.inserts[0].payload.client_id, 'c1');
});

test('H16-10 : createRestockRequestReal conserve le nom du demandeur', async () => {
  initialiser();
  const res = await createRestockRequestReal({}, restockForm());
  assert.match(res.succes ?? '', /Demande transmise/);
  assert.equal(etat.appelsSession, 1);
  assert.equal(etat.rpc.length, 1);
  assert.equal(etat.rpc[0].nom, 'creer_demande_reassort');
  assert.equal(etat.rpc[0].args.p_demandeur, 'Amina');
});
