import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateUI } from '../src/lib/i18n.ts';

test('les alertes ne sont pas présentées comme garanties sans fournisseur', () => {
  const form = readFileSync(new URL('../src/components/telephone-alerte-form.tsx', import.meta.url), 'utf8');
  const actions = readFileSync(new URL('../src/lib/actions-licence.ts', import.meta.url), 'utf8');
  assert.match(form, /alertes SMS et WhatsApp ne sont pas garanties/);
  assert.match(form, /fournisseur configuré/);
  assert.doesNotMatch(form, /est automatiquement envoyée/);
  assert.match(actions, /La réception d’alertes dépend de la configuration et n’est pas garantie/);
});

test('les avertissements de disponibilité des alertes sont traduits en arabe', () => {
  const messages = [
    'Les alertes SMS et WhatsApp ne sont pas garanties. Elles nécessitent un fournisseur configuré, une surveillance active et des numéros valides. Vérifiez leur fonctionnement avant de les proposer.',
    'Numéro enregistré. La réception d’alertes dépend de la configuration et n’est pas garantie.',
  ];
  for (const message of messages) {
    const ar = translateUI(message, 'ar');
    assert.match(ar, /[\u0600-\u06ff]/);
    assert.doesNotMatch(ar, /[A-Za-z]/);
  }
});
