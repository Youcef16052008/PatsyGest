import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installer, session, fauxClient } from './harness-execution.mjs';

/*
 * `actions-credits.ts` — garde de rôle et cloisonnement par tenant.
 *
 * Ces Server Actions sont exposées au client : `ctx.role` et `ctx.clientId`
 * sont les deux seules barrières côté application (la RLS double, mais ne
 * remplace pas). Rien n'était testé : ni le refus d'un vendeur sur une
 * opération propriétaire, ni le `eq("client_id", …)` sur les écritures.
 */

const {
  loadCreditsCloud,
  createCreditCloud,
  payCreditCloud,
  cancelCreditCloud,
  updateCreditTotalCloud,
} = await import('../src/lib/actions-credits.ts');

const ID = '123e4567-e89b-42d3-a456-426614174000';

/** Rôles et ce qu'ils doivent pouvoir faire, d'après permissions.ts. */
const PEUVENT_COMPTER = ['proprietaire', 'vendeur'];
const INTERDITS_COMPTOIR = ['labo'];
const PROPRIETAIRE_SEUL = ['vendeur', 'labo'];

// ---------------------------------------------------------------------------
// loadCreditsCloud
// ---------------------------------------------------------------------------

test('credits : sans session, aucune lecture de la base', async () => {
  const client = fauxClient({ data: [] });
  installer({ session: null, client });
  const r = await loadCreditsCloud();
  assert.equal(r.ok, false);
  assert.deepEqual(r.credits, []);
  assert.equal(client.appels.length, 0, 'la base a été appelée sans session');
});

test('credits : hors mode supabase, aucune lecture', async () => {
  const client = fauxClient({ data: [] });
  installer({ session: session({ mode: 'pilote-local' }), client });
  const r = await loadCreditsCloud();
  assert.equal(r.ok, false);
  assert.equal(client.appels.filter((a) => a.op === 'from').length, 0);
});

for (const role of INTERDITS_COMPTOIR) {
  test(`credits : rôle ${role} ne lit pas le carnet`, async () => {
    const client = fauxClient({ data: [] });
    installer({ session: session({ role }), client });
    const r = await loadCreditsCloud();
    assert.equal(r.ok, false);
    assert.equal(client.appels.filter((a) => a.op === 'from').length, 0, 'la base a été interrogée');
  });
}

for (const role of PEUVENT_COMPTER) {
  test(`credits : rôle ${role} lit le carnet de SON tenant uniquement`, async () => {
    const client = fauxClient({ data: [] });
    installer({ session: session({ role, clientId: 'tenant-A' }), client });
    const r = await loadCreditsCloud();
    assert.equal(r.ok, true);
    const eq = client.appels.find((a) => a.op === 'eq');
    assert.ok(eq, 'aucun filtre de tenant : la RLS seule serait la barrière');
    assert.deepEqual(eq.args, ['client_id', 'tenant-A']);
    assert.ok(client.appels.some((a) => a.op === 'limit'), 'pas de borne de lecture');
  });
}

test('credits : table absente (42P01) => tableAvailable false, pas une erreur', async () => {
  const client = fauxClient({ error: { code: '42P01', message: 'relation introuvable' } });
  installer({ session: session(), client });
  const r = await loadCreditsCloud();
  assert.equal(r.ok, false);
  assert.equal(r.tableAvailable, false);
});

test('credits : erreur quelconque => tableAvailable true, liste vide', async () => {
  const client = fauxClient({ error: { code: '42501', message: 'permission denied' } });
  installer({ session: session(), client });
  const r = await loadCreditsCloud();
  assert.equal(r.ok, false);
  assert.equal(r.tableAvailable, true);
  assert.deepEqual(r.credits, []);
});

// ---------------------------------------------------------------------------
// createCreditCloud
// ---------------------------------------------------------------------------

test('credits : création refusée sans session ou hors supabase', async () => {
  for (const s of [null, session({ mode: 'pilote-local' })]) {
    const client = fauxClient({ data: [{ id: ID }] });
    installer({ session: s, client });
    const r = await createCreditCloud({ nomDebiteur: 'Ali', typeCompte: 'particulier', montantTotalDa: 1000 });
    assert.equal(r.ok, false);
    assert.equal(client.appels.filter((a) => a.op === 'insert').length, 0);
  }
});

for (const role of INTERDITS_COMPTOIR) {
  test(`credits : rôle ${role} ne crée pas de dette`, async () => {
    const client = fauxClient({ data: [{ id: ID }] });
    installer({ session: session({ role }), client });
    const r = await createCreditCloud({ nomDebiteur: 'Ali', typeCompte: 'particulier', montantTotalDa: 1000 });
    assert.equal(r.ok, false);
    assert.match(r.erreur, /comptoir/i);
    assert.equal(client.appels.filter((a) => a.op === 'insert').length, 0);
  });
}

test('credits : création — nom vide, montant nul/négatif/NaN refusés avant la base', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: session({ role: 'vendeur' }), client });
  for (const input of [
    { nomDebiteur: '   ', montantTotalDa: 1000 },
    { nomDebiteur: 'Ali', montantTotalDa: 0 },
    { nomDebiteur: 'Ali', montantTotalDa: -500 },
    { nomDebiteur: 'Ali', montantTotalDa: Number.NaN },
    { nomDebiteur: 'Ali', montantTotalDa: Number.POSITIVE_INFINITY },
  ]) {
    const r = await createCreditCloud({ typeCompte: 'particulier', ...input });
    assert.equal(r.ok, false, `accepté à tort : ${JSON.stringify(input)}`);
  }
  assert.equal(client.appels.filter((a) => a.op === 'insert').length, 0, 'la base a été écrite sur une saisie invalide');
});

test('credits : acompte supérieur au total refusé', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: session({ role: 'vendeur' }), client });
  const r = await createCreditCloud({
    nomDebiteur: 'Ali', typeCompte: 'particulier', montantTotalDa: 1000, montantRegleDa: 1500,
  });
  assert.equal(r.ok, false);
  assert.equal(client.appels.filter((a) => a.op === 'insert').length, 0);
});

test('credits : création — le client_id vient de la SESSION, jamais du client', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: session({ role: 'vendeur', clientId: 'tenant-A' }), client });
  const r = await createCreditCloud({
    nomDebiteur: 'Ali', typeCompte: 'particulier', montantTotalDa: 1000,
  });
  assert.equal(r.ok, true);
  const insert = client.appels.find((a) => a.op === 'insert');
  assert.ok(insert, 'aucune insertion');
  assert.equal(insert.args[0].client_id, 'tenant-A');
});

test('credits : création — statut « solde » si l’acompte couvre le total', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: session({ role: 'vendeur' }), client });
  await createCreditCloud({
    nomDebiteur: 'Ali', typeCompte: 'particulier', montantTotalDa: 1000, montantRegleDa: 1000,
  });
  const insert = client.appels.find((a) => a.op === 'insert');
  assert.equal(insert.args[0].statut, 'solde');
  assert.equal(insert.args[0].montant_regle_da, 1000);
});

test('credits : création — champs texte bornés (nom 140, note 400)', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: session({ role: 'vendeur' }), client });
  await createCreditCloud({
    nomDebiteur: 'N'.repeat(500), note: 'x'.repeat(1000),
    typeCompte: 'particulier', montantTotalDa: 100,
  });
  const insert = client.appels.find((a) => a.op === 'insert');
  assert.equal(insert.args[0].nom_debiteur.length, 140);
  assert.equal(insert.args[0].note.length, 400);
});

// ---------------------------------------------------------------------------
// payCreditCloud — RPC, jamais un update direct
// ---------------------------------------------------------------------------

test('credits : règlement — passe par la RPC transactionnelle, pas par un update', async () => {
  const client = fauxClient({ rpc: () => ({ data: { id: ID }, error: null }) });
  installer({ session: session({ role: 'vendeur' }), client });
  const r = await payCreditCloud(ID, 250, 'espèces');
  assert.equal(r.ok, true);
  const appel = client.appels.find((a) => a.op === 'rpc');
  assert.ok(appel, 'aucune RPC appelée');
  assert.equal(appel.nom, 'enregistrer_reglement_credit');
  assert.deepEqual(appel.args, { p_credit_id: ID, p_montant_da: 250, p_note: 'espèces' });
  // Un update direct contournerait le verrou FOR UPDATE et la garde de statut.
  assert.equal(client.appels.filter((a) => a.op === 'update').length, 0, 'écriture directe au lieu de la RPC');
});

for (const role of INTERDITS_COMPTOIR) {
  test(`credits : rôle ${role} ne peut pas encaisser un règlement`, async () => {
    const client = fauxClient({ rpc: () => ({ data: {}, error: null }) });
    installer({ session: session({ role }), client });
    const r = await payCreditCloud(ID, 100);
    assert.equal(r.ok, false);
    assert.equal(client.appels.filter((a) => a.op === 'rpc').length, 0);
  });
}

test('credits : un refus de la RPC remonte un message, pas un succès', async () => {
  const client = fauxClient({ rpc: () => ({ data: null, error: { message: 'Le montant depasse le reste a payer.' } }) });
  installer({ session: session({ role: 'vendeur' }), client });
  const r = await payCreditCloud(ID, 999999);
  assert.equal(r.ok, false);
  assert.ok(r.erreur);
});

// ---------------------------------------------------------------------------
// cancelCreditCloud / updateCreditTotalCloud — propriétaire uniquement
// ---------------------------------------------------------------------------

for (const role of PROPRIETAIRE_SEUL) {
  test(`credits : rôle ${role} ne peut ni annuler ni modifier une dette`, async () => {
    const client = fauxClient({ data: [{ id: ID }] });
    installer({ session: session({ role }), client });
    const a = await cancelCreditCloud(ID);
    const b = await updateCreditTotalCloud(ID, 5000);
    assert.equal(a.ok, false);
    assert.equal(b.ok, false);
    assert.equal(client.appels.filter((x) => x.op === 'update').length, 0, 'écriture effectuée malgré le refus');
  });
}

test('credits : propriétaire — annulation cloisonnée au tenant', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: session({ clientId: 'tenant-A' }), client });
  assert.equal((await cancelCreditCloud(ID)).ok, true);
  const eqs = client.appels.filter((a) => a.op === 'eq');
  assert.deepEqual(eqs.map((e) => e.args), [['id', ID], ['client_id', 'tenant-A']]);
});

test('credits : propriétaire — modification du total cloisonnée au tenant', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: session({ clientId: 'tenant-B' }), client });
  assert.equal((await updateCreditTotalCloud(ID, 2500)).ok, true);
  const eqs = client.appels.filter((a) => a.op === 'eq');
  assert.ok(eqs.some((e) => e.args[0] === 'client_id' && e.args[1] === 'tenant-B'), 'pas de filtre tenant');
});

test('credits : identifiant mal formé refusé avant toute écriture', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: session(), client });
  for (const mauvais of ['', 'abc', '../../etc/passwd', ID + 'x', 'x'.repeat(36)]) {
    assert.equal((await cancelCreditCloud(mauvais)).ok, false, `annulation acceptée pour ${mauvais}`);
    assert.equal((await updateCreditTotalCloud(mauvais, 100)).ok, false, `modification acceptée pour ${mauvais}`);
  }
  assert.equal(client.appels.filter((a) => a.op === 'update').length, 0);
});

test('credits : modification — montant invalide refusé avant la base', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: session(), client });
  for (const mauvais of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal((await updateCreditTotalCloud(ID, mauvais)).ok, false, `montant accepté : ${mauvais}`);
  }
  assert.equal(client.appels.filter((a) => a.op === 'update').length, 0);
});

test('credits : les actions restent gardées même sans session (pas de repli ouvert)', async () => {
  const client = fauxClient({ data: [{ id: ID }] });
  installer({ session: null, client });
  for (const appel of [
    () => createCreditCloud({ nomDebiteur: 'A', typeCompte: 'particulier', montantTotalDa: 10 }),
    () => payCreditCloud(ID, 10),
    () => cancelCreditCloud(ID),
    () => updateCreditTotalCloud(ID, 10),
  ]) {
    assert.equal((await appel()).ok, false);
  }
  assert.equal(client.appels.length, 0, 'la base a été touchée sans session');
});
