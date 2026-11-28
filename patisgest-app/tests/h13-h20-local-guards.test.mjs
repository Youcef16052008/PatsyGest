import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fauxClient } from './harness-execution.mjs';
import { nomsActions, surface } from './inventaire-surface.mjs';
import { construireVitrine, ligneVitrineValide } from '../src/lib/vitrine.ts';
import {
  validerLignesAvoirsComptables,
  validerLignesVentesComptables,
} from '../src/lib/export-comptable-lignes.ts';
import { choisirVersionsActives } from '../src/lib/tomorrow-lab-private-server.ts';

/*
 * H13-H20 / VAGUE 5 / REST — garde-fous locaux vérifiables dans le dépôt.
 *
 * Aucune base externe, aucun déploiement, aucun secret, aucun run CI distant :
 * ces tests ferment localement les DIFFÉRÉ qui n'exigeaient qu'une validation
 * runtime, un test négatif, un pin de version ou une matrice documentaire.
 */

const ROOT = new URL('../../', import.meta.url);
const WORKFLOWS = new URL('../../.github/workflows/', import.meta.url);
const MATRICE = new URL('../../audit/MATRICE-DERIVE-DOCS.md', import.meta.url);
const INVENTAIRE = new URL('./inventaire-surface.json', import.meta.url);

function sequenceStrict(ops, attendu) {
  assert.deepEqual(ops, attendu, `séquence d'appels inattendue : ${ops.join('→')}`);
}

test('H20-05 : un .eq() oublié fait échouer une assertion de séquence', async () => {
  const client = fauxClient({ data: [], error: null });
  await client.from('ventes').select('*').eq('client_id', 'c1').limit(500);
  sequenceStrict(client.appels.map((a) => a.op), ['from', 'select', 'eq', 'limit']);

  const sansEq = fauxClient({ data: [], error: null });
  await sansEq.from('ventes').select('*').limit(500);
  assert.throws(
    () => sequenceStrict(sansEq.appels.map((a) => a.op), ['from', 'select', 'eq', 'limit']),
    /séquence d'appels inattendue/u,
  );
});

test('H20-07 : inventaire recalculé + action synthétique détectée (anti-tautologie)', async () => {
  const courant = JSON.parse(readFileSync(INVENTAIRE, 'utf8'));
  const mesure = await surface();
  assert.deepEqual(mesure, courant, 'la surface recalculée diverge du JSON commité');
  assert.ok(courant.actions && Object.keys(courant.actions).length >= 25);
  const synthétique = nomsActions(`
    "use server";
    export async function actionSynthetique() {}
    export const actionArrow = async () => {};
    export type ActionType = { id: string };
  `);
  assert.ok(synthétique.includes('actionSynthetique'), 'export async function non détecté');
  assert.ok(synthétique.includes('actionArrow'), 'export const/arrow non détecté');
  assert.equal(synthétique.includes('ActionType'), false, 'un type ne doit pas être une action');
});

test('H20-09 : la matrice de dérive documentaire couvre les cinq dérives', () => {
  const doc = readFileSync(MATRICE, 'utf8');
  for (const motif of [
    '87 actions', '01→43', 'Drizzle déjà en place', 'Montants / centimes', 'PWA chiffrée',
    'README.md', 'SECURITE.md', 'AGENTS.md', 'CDC', 'revue/',
  ]) {
    assert.ok(doc.includes(motif), `matrice incomplète : ${motif}`);
  }
});

test('H17-12 : toutes les actions CI épinglent Node 22.22.3', () => {
  const fichiers = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'));
  assert.ok(fichiers.length >= 2);
  let compte = 0;
  for (const fichier of fichiers) {
    const contenu = readFileSync(new URL(fichier, WORKFLOWS), 'utf8');
    for (const ligne of contenu.split('\n')) {
      if (!/node-version:/u.test(ligne)) continue;
      compte += 1;
 assert.match(ligne, /node-version:\s*'22\.22\.3'/u, `${fichier} : ${ligne.trim()}`);
    }
  }
  assert.ok(compte >= 5, `seulement ${compte} pins Node trouvés`);
  assert.equal(ROOT.pathname.endsWith('/'), true);
});

test('H16-05 : une ligne PostgREST malformée ne produit pas de vitrine undefined', () => {
  const valide = {
    cle_nom: 'eclair', nom: 'Éclair', description: null, photo_vitrine: null,
    ordre_vitrine: 1, etablissement: 'Maison Amande', boutique: 'Centre',
    subdomain: 'boutique', prix_ht: 120, tva: 9, unite: 'pcs',
  };
  const invalide = { ...valide, cle_nom: '', nom: '', prix_ht: 'NaN' };
  assert.equal(ligneVitrineValide(valide), true);
  assert.equal(ligneVitrineValide(invalide), false);
  const vitrine = construireVitrine('boutique', [valide, invalide]);
  assert.equal(vitrine.articles.length, 1);
  assert.equal(vitrine.articles[0].nom, 'Éclair');
  assert.ok(!JSON.stringify(vitrine).includes('undefined'));
  const vide = construireVitrine('boutique', [invalide]);
  assert.match(vide.indisponible ?? '', /pas encore publié/u);
});

test('H16-06 : les lignes d’export comptable malformées sont refusées', () => {
  const vente = {
    id: 'v1', numero: 'V-1', date_vente: '2026-11-26',
    total_ht: 1000, total_ttc: 1190, lignes: [{ tva: 19 }],
  };
  const avoir = {
    id: 'a1', numero: 'AV-1', cree_le: '2026-11-26T10:00:00',
    total_ht: 100, total_ttc: 119, tva_pct: 19,
  };
  assert.equal(validerLignesVentesComptables([vente]).ok, true);
  assert.equal(validerLignesAvoirsComptables([avoir]).ok, true);
  assert.equal(validerLignesVentesComptables([{ ...vente, total_ht: 'NaN' }]).ok, false);
  assert.equal(validerLignesVentesComptables([{ ...vente, lignes: 'pas-un-tableau' }]).ok, false);
  assert.equal(validerLignesAvoirsComptables([{ ...avoir, tva_pct: null }]).ok, false);
});

function fichiersSource(dir) {
  const out = [];
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = path.join(dir, entree.name);
    if (entree.isDirectory()) out.push(...fichiersSource(chemin));
    else if (/\.(ts|tsx|js|jsx)$/u.test(entree.name)) out.push(chemin);
  }
  return out;
}

test('H20-06 : le garde server-only est neutralisé uniquement sous test', () => {
  const hooks = readFileSync(new URL('./mocks/register-hooks.mjs', import.meta.url), 'utf8');
  assert.match(hooks, /server-only/u, 'neutralisation server-only absente du harnais');
  const racineSrc = fileURLToPath(new URL('../src/', import.meta.url));
  const clients = fichiersSource(racineSrc).filter((f) => /['"]use client['"]/u.test(readFileSync(f, 'utf8')));
  assert.ok(clients.length > 0, 'aucun composant client trouvé');
  for (const fichier of clients) {
    const source = readFileSync(fichier, 'utf8');
    assert.equal(/from\s+['"]server-only['"]/u.test(source), false, `${fichier} importe server-only côté client`);
  }
  assert.equal(statSync(racineSrc).isDirectory(), true);
});

test('H16-09 : version active de numéro maximal, sans base', () => {
  const v = (id, produitId, numero, active = true) => ({
    id, familleId: 'f', familleCode: 'F', familleNom: 'Famille', produitId,
    pvHt: 0, version: numero, active, rendementQte: 1, rendementUnite: 'kg',
    cuissonPct: 0, moMin: 0, tauxHoraire: 0, chargesPct: 0, emballage: 0,
    energie: 0, fraisGeneraux: 0, ingredients: [],
  });
  const actives = choisirVersionsActives([
    v('v1', 'p1', 1), v('v3', 'p1', 3), v('v2', 'p1', 2),
    v('inactive', 'p1', 9, false), v('sans-produit', null, 9),
  ]);
  assert.equal(actives.get('p1')?.id, 'v3');
  assert.equal(actives.size, 1);
});
