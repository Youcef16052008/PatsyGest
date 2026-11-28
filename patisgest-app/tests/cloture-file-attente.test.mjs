import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * W2-D4 — Clôture et file locale.
 *
 * Le scénario : coupure réseau en fin de service. `sale-form.tsx` conserve le
 * ticket dans localStorage (`sale-queue.ts`) avec un UUID d'idempotence, et
 * l'écran de vente prévient « non confirmée ». Mais l'écran de CLÔTURE ne lit
 * jamais cette file : le caissier compte un tiroir qui contient l'argent de
 * ventes non synchronisées, déclare un chiffre, et le rapprochement du
 * lendemain tombe sur un écart inexplicable — alors que la cause est connue
 * de l'appareil au moment du comptage.
 *
 * Correctif minimal : la clôture lit la file et refuse d'enregistrer tant
 * qu'il reste des tickets non synchronisés sur cet appareil.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const cloture = lire('src/components/cloture-form.tsx');
const rapide = lire('src/components/cash-closing-quick.tsx');
const file = lire('src/lib/sale-queue.ts');

test('la file locale expose une lecture sûre utilisable par la clôture', () => {
  // Lecture stricte : une entrée corrompue ne doit pas lever, sinon la clôture
  // serait bloquée par un JSON illisible.
  assert.match(file, /export function readQueueStrict/, 'readQueueStrict manquante');
  const corps = file.slice(file.indexOf('export function readQueueStrict'));
  assert.match(
    corps.slice(0, 900),
    /catch/,
    'readQueueStrict ne protège pas contre un JSON corrompu',
  );
});

for (const [nom, source] of [['cloture-form.tsx', cloture], ['cash-closing-quick.tsx', rapide]]) {
  test(`${nom} : signale les ventes non synchronisées avant d'enregistrer`, () => {
    assert.match(
      source,
      /sale-queue|readQueueStrict|createSaleQueueStore|patisgest\.saleQueue/,
      `${nom} ignore totalement la file locale : une clôture peut être enregistrée alors que des ventes ne sont pas remontées`,
    );
  });
}

test('VAGUE 3 : clôture bloque aussi une file illisible et utilise un snapshot stable', () => {
  for (const [nom, source] of [['cloture-form.tsx', cloture], ['cash-closing-quick.tsx', rapide]]) {
    assert.match(source, /snapshotAttenteClotureNavigateur/, `${nom} : snapshot React instable`);
    assert.match(source, /attente\.illisible/, `${nom} : une file corrompue laisse le bouton actif`);
  }
  assert.match(file, /categorieCleFileVente/, 'la reconnaissance des clés v1/v2 doit être partagée');
});
