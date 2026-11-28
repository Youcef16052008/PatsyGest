import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomClientDepuisJointure } from '../src/lib/auth-session.ts';

/**
 * W1-B3 (revue 11/01) — `auth.ts` lisait la jointure `clients ( nom )` via
 * `data.clients as unknown as { nom: string } | null`, c'est-à-dire en
 * supposant un OBJET. PostgREST renvoie en réalité :
 *   • un objet   { nom }      quand la FK est « many-to-one » détectée,
 *   • un TABLEAU [{ nom }]    dans le cas embarqué classique,
 *   • un tableau vide []      si le rattachement manque.
 * Dans les deux derniers cas, `client.nom` était `undefined` (ou
 * `[object Object]` après String()) et le nom affiché tombait sur le
 * libellé générique — silencieusement. Le helper est pur, donc testable.
 */

test('auth : la jointure client est lue en objet, en tableau et en vide', () => {
  assert.equal(nomClientDepuisJointure({ nom: 'Maison Amande' }), 'Maison Amande');
  assert.equal(nomClientDepuisJointure([{ nom: 'Maison Amande' }]), 'Maison Amande');
  assert.equal(nomClientDepuisJointure([]), null);
  assert.equal(nomClientDepuisJointure(null), null);
  assert.equal(nomClientDepuisJointure(undefined), null);
  assert.equal(nomClientDepuisJointure('Maison Amande'), null);
  assert.equal(nomClientDepuisJointure(42), null);
  assert.equal(nomClientDepuisJointure({ nom: '' }), null);
  assert.equal(nomClientDepuisJointure({ nom: '   ' }), null);
  assert.equal(nomClientDepuisJointure({ nom: 12 }), null);
  assert.equal(nomClientDepuisJointure([{ nom: 'A' }, { nom: 'B' }]), null, 'ambiguïté ⇒ pas de valeur inventée');
  assert.equal(nomClientDepuisJointure([{ nom: 'A' }, { nom: 'B' }]), null);
});

test('auth : un nom de client trop long est tronqué, jamais renvoyé brut', () => {
  const long = 'A'.repeat(200);
  const nom = nomClientDepuisJointure({ nom: long });
  assert.ok(nom !== null && nom.length <= 120, `longueur inattendue : ${nom?.length}`);
});
