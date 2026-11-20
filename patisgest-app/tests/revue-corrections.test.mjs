// Tests permanents des corrections de la revue (F-04, F-06, F-07, F-09, F-10, F-14, F-17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellule } from '../src/lib/csv.ts';
import { computeFefoCost } from '../src/lib/fefo-cost.ts';
import { computeCashReconciliation } from '../src/lib/reconciliation.ts';
import { plusJours, jourLocal } from '../src/lib/workspace-data.ts';

test('F-14 : une cellule commençant par un déclencheur de formule est neutralisée', () => {
  for (const v of ['=1+1', '+SUM(A1)', '-2', '@cmd', '\t=x', '\r=x', '  =x']) {
    const out = cellule(v);
    assert.equal(/^\s*[=+\-@\t\r]/.test(out), false, `non neutralisé : ${JSON.stringify(v)} -> ${JSON.stringify(out)}`);
  }
  assert.equal(cellule('Pâtisserie'), 'Pâtisserie');
});

test('F-09 : plusJours refuse une date qui n’est pas AAAA-MM-JJ valide', () => {
  assert.throws(() => plusJours('pas-une-date', 3));
  assert.throws(() => plusJours('2026-13-45', 3));
});

test('F-17 : FEFO ignore les lots périmés à la date de référence', () => {
  const lots = [
    { id: 'p', qte_rest: 10, pu: 1, dlc: '2026-11-01', bloque: false, congele: false, dlv: null, date_reception: '2026-10-01' },
    { id: 'v', qte_rest: 10, pu: 2, dlc: '2026-12-31', bloque: false, congele: false, dlv: null, date_reception: '2026-10-01' },
  ];
  const r = computeFefoCost(lots, 5, '2026-11-20');
  assert.ok(r, 'un résultat est attendu');
  assert.equal(JSON.stringify(r).includes('"p"'), false, 'le lot périmé ne doit pas être consommé');
});

test('F-10 : les tickets à 0 DA sont comptés à part', () => {
  const sales = [
    { siteId: 's1', date: '2026-11-20', lignes: [{ articleId: 'a', qty: 1 }], totalTTC: 0, source: 'vitrine', modePaiement: 'especes' },
    { siteId: 's1', date: '2026-11-20', lignes: [{ articleId: 'a', qty: 1 }], totalTTC: 500, source: 'vitrine', modePaiement: 'especes' },
  ];
  const cloture = {
    id: 'c1', date: '2026-11-20', siteId: 's1', revision: 1, lignes: [],
    caisseBilan: { fondInitial: 0, sortiesEspeces: 0, especesComptees: 0 },
  };
  const rows = computeCashReconciliation([cloture], sales);
  assert.equal(rows.length, 1);
  const total = rows.reduce((n, r) => n + (r.ticketsZero ?? 0), 0);
  assert.equal(total, 1, 'un ticket à 0 DA doit être compté dans ticketsZero');
});

test('F-04 : le jour métier suit Oran (Africa/Algiers), pas UTC', () => {
  // 23 h 30 UTC = 00 h 30 à Alger le lendemain : le jour métier a déjà changé.
  assert.equal(jourLocal(new Date('2026-11-20T23:30:00Z')), '2026-11-21');
  assert.equal(jourLocal(new Date('2026-11-20T22:30:00Z')), '2026-11-20');
});

test('F-06 : la perte cuisson est bornée à 99,99 %', async () => {
  const { parseVersionInput } = await import('../src/lib/version-input.ts');
  const U = '11111111-1111-4111-8111-111111111111';
  const fd = (perte) => {
    const f = new FormData();
    f.set('lineCount', '1');
    f.set('line0_kind', 'article');
    f.set('line0_q', '1');
    f.set('line0_u', 'kg');
    f.set('line0_ref', U);
    f.set('familleId', U);
    f.set('rendementQte', '1');
    f.set('rendementUnite', 'kg');
    f.set('cuissonPertePct', perte);
    return f;
  };
  assert.throws(() => parseVersionInput(fd('100')), /Perte cuisson/);
  assert.throws(() => parseVersionInput(fd('150')), /Perte cuisson/);
  assert.equal(parseVersionInput(fd('99.99')).cuissonPertePct, 99.99);
});

test('F-19 : labo et vendeur sont masqués tant que le schéma n’est pas réconcilié', async () => {
  const { roleDisponible, ROLES_LABO_VENDEUR_ACTIFS } = await import('../src/lib/permissions.ts');
  assert.equal(ROLES_LABO_VENDEUR_ACTIFS, false);
  assert.equal(roleDisponible('proprietaire'), true);
  assert.equal(roleDisponible('labo'), false);
  assert.equal(roleDisponible('vendeur'), false);
});

test('F-06 : perte de cuisson à 100 % → erreur de champ, pas une exception ; 99,9 % → accepté avec avertissement', async () => {
  const { tenterFicheCoutScaled } = await import('../src/lib/cost-sheet.ts');
  const base = { matiereFefo: 100, tauxHoraire: 400, chargesPct: 25, pvHt: 500 };
  const version = (cuissonPct) => ({
    produitId: 'p', code: 'P', nom: 'Produit', rendementQte: 1, moMin: 0, energie: 0,
    emballage: 0, fraisGeneraux: 0, cuissonPct,
  });
  const ko = tenterFicheCoutScaled({ ...base, version: version(100), qte: 1 });
  assert.equal(ko.ok, false);
  assert.equal(ko.champ, 'cuissonPertePct');
  assert.match(ko.message, /Perte cuisson/);

  const ok = tenterFicheCoutScaled({ ...base, version: version(99.9), qte: 1 });
  assert.equal(ok.ok, true);
  assert.equal(ok.avertissements.length, 1);
  assert.equal(ok.fiche.rc02RendementNet, 0.001);
});

test('F-13 : « rien saisi » reste distinct de « 0 compté »', async () => {
  const { parseCashDrawerDeclaration } = await import('../src/lib/reconciliation.ts');
  assert.equal(parseCashDrawerDeclaration({}), null, 'rien saisi : pas de bilan');
  const zero = parseCashDrawerDeclaration({ especesComptees: '0', fondInitial: '500' });
  assert.equal(zero.especesComptees, 0, '0 saisi : zéro explicite');
  assert.equal(zero.fondInitial, 500);
  assert.throws(
    () => parseCashDrawerDeclaration({ fondInitial: '500' }),
    /espèces comptées/,
    'fond saisi sans espèces comptées : refus',
  );
});

test('F-16 : un lot sans prix n’est pas un « stock insuffisant »', async () => {
  const { computeFefoCost } = await import('../src/lib/fefo-cost.ts');
  const lot = (over) => ({ id: 'l', qte_rest: 100, pu: 0, dlc: null, bloque: false, congele: false, dlv: null, date_reception: '2026-10-01', ...over });
  const r = computeFefoCost([lot({ pu: 0 })], 5, '2026-11-20');
  assert.equal(r.cout, 0);
  assert.equal(r.insuffisant, true, 'le coût reste partiel');
  assert.equal(r.insuffisantStock, false, 'le stock est là');
  assert.equal(r.sansPrixConnu, 100);
  // Stock réellement absent : les deux indicateurs sont vrais.
  const vide = computeFefoCost([lot({ qte_rest: 2, pu: 0 })], 5, '2026-11-20');
  assert.equal(vide.insuffisantStock, true);
});

test('B-011 : la sauvegarde CI chiffre avec le coffre GCM, pas avec openssl AES-CBC', async () => {
  const { readFile } = await import('node:fs/promises');
  const yml = await readFile(new URL('../../.github/workflows/sauvegarde-free.yml', import.meta.url), 'utf8');
  const etape = yml.slice(yml.indexOf('Copie partielle chiffrée'), yml.indexOf('Conserver la sauvegarde'));
  assert.ok(etape.includes('coffre-sauvegarde.mjs chiffrer'), 'chiffrement par le coffre attendu');
  assert.ok(etape.includes('coffre-sauvegarde.mjs dechiffrer'), 'relecture authentifiée attendue');
  assert.ok(!etape.includes('aes-256-cbc'), 'plus d’AES-CBC dans la sauvegarde');
  assert.ok(etape.includes('/dev/shm'), 'dump clair hors disque');
});
