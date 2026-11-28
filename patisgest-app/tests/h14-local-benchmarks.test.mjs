import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { lirePages } from '../src/lib/pagination.ts';
import { expandRecipeNeeds } from '../src/lib/ingredient-impact.ts';
import { rc01Consommation } from '../src/lib/cost-sheet.ts';
import { computeTomorrowLabPlan } from '../src/lib/tomorrow-lab.ts';

/*
 * H14 — micro-benchmarks locaux et garde-fous de bornes.
 *
 * Ils ne remplacent ni Lighthouse/FCP réel (H14-06), ni un profilage React
 * (H14-05), ni une mesure navigateur de `JSON.parse` (H14-10), ni un passage
 * à minuit en production (H14-04). Ils ferment en revanche la partie pure,
 * reproductible et vérifiable du dépôt : pagination, expansion de recettes,
 * parage RC-01, bornes de lecture et coût synthétique d'un brouillon.
 */

function ms(depart) {
  return performance.now() - depart;
}

test('H14-03 : 20 000 lignes paginées en 40 appels + sonde, sans troncature', async () => {
  const source = Array.from({ length: 20_000 }, (_, i) => ({ id: `l${i}` }));
  let appels = 0;
  const debut = performance.now();
  const lu = await lirePages(
    async (offset, limite) => {
      appels += 1;
      return { data: source.slice(offset, offset + limite), error: null };
    },
    20_000,
    500,
  );
  const duree = ms(debut);
  assert.equal(lu.ok, true);
  assert.equal(lu.lignes.length, 20_000);
  assert.equal(appels, 41, '40 pages + sonde +1 attendues');
  assert.ok(duree < 500, `pagination locale trop lente : ${duree.toFixed(1)} ms`);
  console.log(`[h14] pagination 20k=${duree.toFixed(1)}ms appels=${appels}`);
});

test('H14-08 : 1 000 versions de recette et 5 000 lignes synthétiques', () => {
  const articles = [{ id: 'a', code: 'MP-A', nom: 'Matière', unite: 'kg', niveau: 'matiere' }];
  const versions = Array.from({ length: 1_000 }, (_, i) => ({
    id: `v${i}`,
    familleId: `f${i}`,
    familleCode: `F${i}`,
    familleNom: `Famille ${i}`,
    produitId: `p${i}`,
    pvHt: 0,
    version: 1,
    active: true,
    rendementQte: 1,
    rendementUnite: 'kg',
    cuissonPct: 0,
    moMin: 0,
    tauxHoraire: 0,
    chargesPct: 0,
    emballage: 0,
    energie: 0,
    fraisGeneraux: 0,
    ingredients: Array.from({ length: 5 }, () => ({ articleId: 'a', q: 1, u: 'kg', parage: 5 })),
  }));
  const debut = performance.now();
  const resultat = expandRecipeNeeds({ version: versions[0], allVersions: versions, articles, conversions: [] });
  const duree = ms(debut);
  assert.equal(resultat.missingConversions.length, 0);
  assert.ok(resultat.needs.length > 0);
  assert.ok(duree < 500, `expansion 1 000 versions trop lente : ${duree.toFixed(1)} ms`);
  console.log(`[h14] expansion 1000 versions/5000 lignes=${duree.toFixed(1)}ms besoins=${resultat.needs.length}`);
});

test('H14-07 : RC-01 sur 10 000 lignes et bornes de lecture des courses', () => {
  const debut = performance.now();
  let somme = 0;
  for (let i = 0; i < 10_000; i += 1) somme += rc01Consommation(1 + (i % 7), 8);
  const duree = ms(debut);
  assert.ok(Number.isFinite(somme) && somme > 0);
  assert.ok(duree < 200, `RC-01 10 000 lignes trop lent : ${duree.toFixed(1)} ms`);

  const courses = readFileSync(new URL('../src/lib/courses-server.ts', import.meta.url), 'utf8');
  for (const cle of ['ordres_fabrication', 'lots', 'bons_commande', 'articles']) {
    assert.match(courses, new RegExp(`${cle}:\\s*\\d+`, 'u'), `borne ${cle} absente`);
  }
  const workspace = readFileSync(new URL('../src/lib/workspace-read.ts', import.meta.url), 'utf8');
  assert.match(workspace, /const LIMITE_TOTALE = 20_000;/u);
  console.log(`[h14] RC-01 10000 lignes=${duree.toFixed(1)}ms`);
});

test('H14-04 : 100 dates cibles du plan « Demain au labo »', () => {
  const product = { id: 'p1', code: 'PF-1', nom: 'Produit', unite: 'pcs', seuil: 5, recipe: null };
  const ventes = Array.from({ length: 120 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10),
    siteId: 'boutique',
    source: 'caisse',
    lignes: [{ articleId: 'p1', qty: 2 }],
  }));
  const debut = performance.now();
  let dernier = null;
  for (let i = 0; i < 100; i += 1) {
    const date = new Date(Date.UTC(2026, 10, 27 + i)).toISOString().slice(0, 10);
    dernier = computeTomorrowLabPlan({ targetDate: date, labSiteId: 'labo', products: [product], sales: ventes });
  }
  const duree = ms(debut);
  assert.ok(dernier && Array.isArray(dernier.lignes), 'plan du 100e jour absent');
  assert.ok(duree < 500, `100 plans trop lents : ${duree.toFixed(1)} ms`);
  console.log(`[h14] 100 plans Demain au labo=${duree.toFixed(1)}ms`);
});

test('H14-10 : coût synthétique de reparse d’un brouillon local', () => {
  const brouillon = JSON.stringify({
    lignes: Array.from({ length: 500 }, (_, i) => ({ id: `l${i}`, q: i, prix: i * 1.5, nom: `Ligne ${i}` })),
    notes: 'x'.repeat(20_000),
  });
  const debut = performance.now();
  let dernier = null;
  for (let i = 0; i < 100; i += 1) dernier = JSON.parse(brouillon);
  const duree = ms(debut);
  assert.equal(dernier.lignes.length, 500);
  assert.ok(duree < 500, `JSON.parse 100 × brouillon trop lent : ${duree.toFixed(1)} ms`);
  console.log(`[h14] JSON.parse 100 × ${(brouillon.length / 1024).toFixed(1)} Kio=${duree.toFixed(1)}ms`);
});
