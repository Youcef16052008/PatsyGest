import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageCatalogue, FRAICHEUR_MAX_JOURS, lireCatalogue, enregistrerCatalogue, effacerCatalogue,
} from '../src/lib/catalogue-cache.ts';

/**
 * Catalogue de caisse hors-ligne (NF-02). Ce qui est testé ici, c'est la
 * décision de sécurité : accepter un catalogue périmé ferait encaisser au
 * prix de la semaine dernière. Le cache doit donc être refusé au-delà de
 * FRAICHEUR_MAX_JOURS, et jamais planter sur un contenu corrompu.
 */

/** Faux localStorage minimal (le module n'utilise que get/set/removeItem). */
function fauxStockage(initial = {}) {
  const donnees = { ...initial };
  return {
    getItem: (k) => (k in donnees ? donnees[k] : null),
    setItem: (k, v) => { donnees[k] = String(v); },
    removeItem: (k) => { delete donnees[k]; },
    _donnees: donnees,
  };
}

const catalogue = {
  clientNom: 'El Yasmine',
  articles: [{ id: 'a1', label: 'Éclair chocolat', prixHT: 250, tva: 19 }],
  sites: [{ id: 's1', label: 'Boutique', type: 'boutique' }],
  identite: { nom: 'El Yasmine', adresse: null, telephone: null, nif: null, nis: null, rc: null },
};

test('catalogue : âge calculé depuis enregistreLe', () => {
  const c = { version: 1, enregistreLe: '2026-11-19T10:00:00Z', ...catalogue };
  assert.equal(Math.round(ageCatalogue(c, Date.parse('2026-11-19T10:00:00Z'))), 0);
  assert.equal(Math.round(ageCatalogue(c, Date.parse('2026-11-21T10:00:00Z'))), 2);
});

test('catalogue : une date illisible vaut infiniment vieux (donc refusé)', () => {
  const c = { version: 1, enregistreLe: 'pas-une-date', ...catalogue };
  assert.equal(ageCatalogue(c), Number.POSITIVE_INFINITY);
});

test('catalogue : écrit puis relu à l’identique', () => {
  globalThis.window = { localStorage: fauxStockage() };
  enregistrerCatalogue(catalogue);
  const relu = lireCatalogue();
  assert.ok(relu, 'catalogue non relu');
  assert.equal(relu.articles.length, 1);
  assert.equal(relu.articles[0].label, 'Éclair chocolat');
  assert.equal(relu.version, 1);
  delete globalThis.window;
});

test('catalogue : refusé au-delà de la fraîcheur maximale', () => {
  const stockage = fauxStockage();
  globalThis.window = { localStorage: stockage };
  enregistrerCatalogue(catalogue);
  const brut = JSON.parse(stockage.getItem('patisgest.catalogue.v1'));
  const vieux = Date.parse(brut.enregistreLe) + (FRAICHEUR_MAX_JOURS + 1) * 86_400_000;
  assert.equal(lireCatalogue(vieux), null, 'un catalogue périmé doit être refusé');
  const justeAvant = Date.parse(brut.enregistreLe) + (FRAICHEUR_MAX_JOURS - 1) * 86_400_000;
  assert.ok(lireCatalogue(justeAvant), 'un catalogue de 13 j doit rester utilisable');
  delete globalThis.window;
});

test('catalogue : contenu corrompu ou mauvaise version → null, jamais d’exception', () => {
  globalThis.window = { localStorage: fauxStockage({ 'patisgest.catalogue.v1': '{ pas du json' }) };
  assert.equal(lireCatalogue(), null);

  globalThis.window = { localStorage: fauxStockage({ 'patisgest.catalogue.v1': JSON.stringify({ version: 99 }) }) };
  assert.equal(lireCatalogue(), null);

  globalThis.window = {
    localStorage: fauxStockage({
      'patisgest.catalogue.v1': JSON.stringify({ version: 1, enregistreLe: '2026-11-19T10:00:00Z', articles: [{ id: 1 }], sites: [], identite: {} }),
    }),
  };
  assert.equal(lireCatalogue(), null, 'un article sans id texte doit invalider le cache');
  delete globalThis.window;
});

test('catalogue : absence de stockage (SSR, navigation privée) → null sans planter', () => {
  assert.equal(lireCatalogue(), null);
  enregistrerCatalogue(catalogue); // ne doit pas lever
  effacerCatalogue(); // ne doit pas lever
});
