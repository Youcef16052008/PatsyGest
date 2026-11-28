import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerChaineActive } from './support/chaine-active.mjs';

/*
 * Le `test.todo('01→43')` était incapable d'échouer : il gardait une suite verte
 * sans jamais appliquer la chaîne réelle. La source de vérité est désormais
 * `migrations/repetition.json` (`historique` + `main_hors_serie`, 01→57), via
 * `chaineDeploiement()`. Le harnais PGlite applique RÉELLEMENT les 56 fichiers
 * de schéma ; les stubs Auth / pgcrypto sont explicites dans `chaine-active.mjs`.
 *
 * `migrations/CHAINE-NON-REJOUABLE.md` reste un relevé HISTORIQUE du 23/11/2026,
 * pas l'état courant. Une migration cassée fait maintenant échouer ce test.
 */

test('les migrations du manifeste 01→58 se rejouent sur PGlite', async () => {
  const resultat = await appliquerChaineActive();
  assert.equal(resultat.files, 57, '57 fichiers de schéma, seed exclu');
  assert.equal(resultat.version, 58, 'app_schema_version doit atteindre 58');
});

test('sonde : une migration cassée fait échouer la chaîne active', async () => {
  await assert.rejects(
    appliquerChaineActive({
      corrompre: (file, sql) => file === '01-socle.sql'
        ? `${sql}\nselect * from patisgest_table_inexistante_sonde;`
        : null,
    }),
    /Migration 01-socle\.sql/,
  );
});
