// Revue B-008 : identifiant de source. Aucune IP ne doit sortir en clair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceVisiteur } from '../src/lib/vitrine-anti-abus.ts';

const SECRET = 'un-secret-de-test-de-plus-de-trente-deux-caracteres';
const enTetes = (h) => ({ get: (n) => h[n.toLowerCase()] ?? null });

test('B-008 : même IP, même source ; IP différente, source différente', () => {
  const a = sourceVisiteur(enTetes({ 'x-forwarded-for': '198.51.100.7' }), SECRET);
  const b = sourceVisiteur(enTetes({ 'x-forwarded-for': '198.51.100.7' }), SECRET);
  const c = sourceVisiteur(enTetes({ 'x-forwarded-for': '198.51.100.8' }), SECRET);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/, 'format accepté par la migration 38');
});

test('B-008 : l’IP n’apparaît jamais dans l’identifiant', () => {
  const s = sourceVisiteur(enTetes({ 'x-forwarded-for': '198.51.100.7' }), SECRET);
  assert.ok(!s.includes('198.51.100.7'));
});

test('B-008 : première IP de x-forwarded-for, repli sur x-real-ip, puis bac commun', () => {
  const chaine = sourceVisiteur(enTetes({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }), SECRET);
  const seule = sourceVisiteur(enTetes({ 'x-forwarded-for': '198.51.100.7' }), SECRET);
  assert.equal(chaine, seule);
  assert.equal(sourceVisiteur(enTetes({ 'x-real-ip': '198.51.100.7' }), SECRET), seule);
  assert.equal(sourceVisiteur(enTetes({}), SECRET), sourceVisiteur(enTetes({}), SECRET));
});

test('B-008 : sans secret suffisant, pas de vérification par source', () => {
  assert.equal(sourceVisiteur(enTetes({ 'x-forwarded-for': '1.2.3.4' }), undefined), null);
  assert.equal(sourceVisiteur(enTetes({ 'x-forwarded-for': '1.2.3.4' }), 'court'), null);
});
