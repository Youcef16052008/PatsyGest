import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comptePilotePropre } from '../src/lib/pilot-account.ts';
import { PILOT_ACCOUNTS } from '../src/lib/pilot-accounts.ts';

test('démo pilote : seuls les emails propres de la liste blanche donnent un compte', () => {
  assert.equal(comptePilotePropre(PILOT_ACCOUNTS, 'amina@patisserie.dz').role, 'proprietaire');
  for (const cleHeritee of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(comptePilotePropre(PILOT_ACCOUNTS, cleHeritee), null, cleHeritee);
  }
  assert.equal(comptePilotePropre(PILOT_ACCOUNTS, 'Amina@patisserie.dz'), null);
  assert.equal(comptePilotePropre(PILOT_ACCOUNTS, ' inconnu@example.test '), null);
});
