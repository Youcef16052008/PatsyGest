import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewBloquee, routePubliquePreview } from '../src/lib/preview-guard.ts';

/*
 * `preview-guard.ts` + `next.config.ts` — verrou d'aperçu.
 *
 * Le verrou existe pour éviter qu'un déploiement Vercel *preview* (qui pointe
 * sur la base pilote) serve l'application à de vrais utilisateurs. Deux
 * propriétés doivent tenir ENSEMBLE :
 *
 *   1. un aperçu non isolé est bloqué (503), c'est le but ;
 *   2. une PRODUCTION ne doit jamais être bloquée par un brouillon figé à la
 *      compilation.
 *
 * La seconde était cassée : `next.config.ts` fige
 * `PATISGEST_PREVIEW_BLOCKED = VERCEL_ENV === "preview" ? "1" : "0"` dans le
 * paquet. Promouvoir un build d'aperçu vers la production laissait ce "1"
 * dans le bundle : `VERCEL_ENV` valait alors "production", mais le drapeau
 * figé restait "1" et `previewBloquee` rendait vrai — 503 sur TOUTES les
 * routes, définitivement, y compris le calculateur public.
 */

test('verrou d’aperçu : la décision de base est celle attendue', () => {
  assert.equal(previewBloquee('preview', undefined), true, 'un aperçu doit être bloqué');
  assert.equal(previewBloquee('production', undefined), false, 'une production ne doit pas l’être');
  assert.equal(previewBloquee('development', undefined), false);
  assert.equal(previewBloquee(undefined, undefined), false, 'sans information, ne pas bloquer');
  // Correction : un drapeau figé à "1" NE DOIT PLUS bloquer une production.
  // C'était le défaut : un build d'aperçu promu en production rendait 503
  // sur toutes les routes. L'environnement d'exécution fait foi.
  assert.equal(previewBloquee('production', '1'), false, 'promotion d’aperçu = 503 permanent');
  assert.equal(previewBloquee('production', '0'), false);
  // Le drapeau ne sert plus que si l'environnement est inconnu (hors Vercel).
  assert.equal(previewBloquee(undefined, '1'), true, 'hors Vercel, un drapeau figé doit encore protéger');
  // Toute autre valeur n'est pas un blocage.
  assert.equal(previewBloquee('production', ''), false);
  assert.equal(previewBloquee('production', 'true'), false);
});

test('verrou d’aperçu : une promotion preview -> production ne bloque pas', () => {
  // Scénario mesuré : build sur `preview` (donc drapeau figé à "1"), puis
  // promotion du même build en production.
  const drapeauFigeEnPreview = '1';
  const bloqueApresPromotion = previewBloquee('production', drapeauFigeEnPreview);
  assert.equal(
    bloqueApresPromotion,
    false,
    'une production issue d’une promotion d’aperçu rendrait 503 sur toutes les routes',
  );
});

test('verrou d’aperçu : la production est insensible au drapeau figé', () => {
  // `next.config.ts` fige `PATISGEST_PREVIEW_BLOCKED` à la compilation. Une
  // promotion d'aperçu vers la production laissait ce "1" dans le paquet ;
  // la garde devait donc ignorer le drapeau dès que l'exécution est en
  // production. C'est le comportement de `previewBloquee`, vérifié ci-dessous
  // pour toutes les valeurs possibles du drapeau.
  for (const drapeau of ['1', '0', '', 'true', undefined]) {
    assert.equal(
      previewBloquee('production', drapeau),
      false,
      `production bloquée par un drapeau figé ${JSON.stringify(drapeau)} : 503 sur toutes les routes`,
    );
  }
});

test('verrou d’aperçu : seule l’estimation publique survit au blocage', () => {
  assert.equal(routePubliquePreview('/estimation', 'GET'), true);
  assert.equal(routePubliquePreview('/estimation', 'HEAD'), true);
  // Une action serveur (POST) sur la même page reste bloquée.
  assert.equal(routePubliquePreview('/estimation', 'POST'), false);
  for (const chemin of ['/', '/caisse', '/tableau-de-bord', '/master', '/estimation/x', '/api/export']) {
    assert.equal(routePubliquePreview(chemin, 'GET'), false, `${chemin} ne doit pas être public`);
  }
});
