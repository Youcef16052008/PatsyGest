import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { essaiActif, modeGratuit, paiementActif } from '../src/lib/licence-mode.ts';
import { sanitizeRecipePhoto } from '../src/lib/recipe-photo.ts';
import { defaultRecipePhoto, RECIPE_PHOTOS } from '../src/lib/pastry-visuals.ts';
import { starterFreeRecipes } from '../src/lib/free-recipes.ts';

test('Licence : l’application est gratuite par défaut, sans essai ni paiement', () => {
  // Sans variable d'environnement, rien ne s'écoule et rien ne se verrouille.
  delete process.env.NEXT_PUBLIC_PATISGEST_MODE_GRATUIT;
  assert.equal(modeGratuit(), true);
  assert.equal(essaiActif(), false);
  assert.equal(paiementActif(), false);

  // L'interrupteur ne se coupe que sur une valeur explicite.
  for (const valeur of ['0', 'false', 'non', 'off', 'abonnement', ' FALSE ']) {
    process.env.NEXT_PUBLIC_PATISGEST_MODE_GRATUIT = valeur;
    assert.equal(modeGratuit(), false, `« ${valeur} » doit réactiver l'abonnement`);
    assert.equal(essaiActif(), true);
    assert.equal(paiementActif(), true);
  }
  for (const valeur of ['1', 'true', 'oui', '']) {
    process.env.NEXT_PUBLIC_PATISGEST_MODE_GRATUIT = valeur;
    assert.equal(modeGratuit(), true, `« ${valeur} » doit rester gratuit`);
  }
  delete process.env.NEXT_PUBLIC_PATISGEST_MODE_GRATUIT;
});

test('Photos de recette : seules les images locales et les data-URL compressées passent', () => {
  assert.equal(sanitizeRecipePhoto('/recettes/baklawa.webp'), '/recettes/baklawa.webp');
  assert.equal(sanitizeRecipePhoto('/recettes/mille-feuille.webp'), '/recettes/mille-feuille.webp');

  // Ce qui est refusé : traversée de dossier, protocole, SVG (script possible),
  // origine externe, valeur non textuelle.
  for (const refusé of [
    '/recettes/../.env',
    '/recettes/baklawa.svg',
    '/recettes/baklawa.webp?x=1',
    'javascript:alert(1)',
    'https://exemple.test/photo.jpg',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/jpeg;base64,',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(sanitizeRecipePhoto(refusé), null, `doit être refusé : ${String(refusé)}`);
  }

  const petite = `data:image/jpeg;base64,${'A'.repeat(64)}`;
  assert.equal(sanitizeRecipePhoto(petite), petite);
  const enorme = `data:image/jpeg;base64,${'A'.repeat(230_000)}`;
  assert.equal(sanitizeRecipePhoto(enorme), null, 'une photo non compressée est refusée');
});

test('Photos de recette : les fichiers livrés existent et restent légers', () => {
  const fichiers = readdirSync('public/recettes').filter((f) => f.endsWith('.webp'));
  assert.ok(fichiers.length >= 7, 'les sept photos de recette doivent être livrées');
  let total = 0;
  for (const f of fichiers) {
    const bytes = statSync(`public/recettes/${f}`).size;
    total += bytes;
    assert.ok(bytes < 110_000, `${f} doit rester sous 110 Ko (${bytes} octets)`);
  }
  assert.ok(total < 600_000, `le jeu complet doit rester sous 600 Ko (${total} octets)`);

  // Aucun PNG/JPG non compressé ne doit être gardé dans le dossier public.
  assert.deepEqual(readdirSync('public/recettes').filter((f) => /\.(png|jpe?g|tiff?|bmp)$/i.test(f)), []);

  // Chaque photo de la galerie est réellement présente sur le disque.
  for (const p of RECIPE_PHOTOS) {
    assert.ok(fichiers.includes(p.src.split('/').pop()), `${p.src} manquant`);
  }
});

test('Photos de recette : déduites du nom, et les recettes de départ en ont une', () => {
  assert.equal(defaultRecipePhoto('Baklawa aux amandes'), '/recettes/baklawa.webp');
  assert.equal(defaultRecipePhoto('ÉCLAIR chocolat'), '/recettes/eclair.webp');
  assert.equal(defaultRecipePhoto('Tartelette citron meringuée'), '/recettes/tarte-citron.webp');
  assert.equal(defaultRecipePhoto('Layer cake anniversaire'), '/recettes/layer-cake.webp');
  assert.equal(defaultRecipePhoto('Pain au chocolat'), '/recettes/pain-chocolat.webp');
  assert.equal(defaultRecipePhoto('Croissant au beurre'), '/recettes/croissant.webp');
  assert.equal(defaultRecipePhoto('Mille-feuille vanille'), '/recettes/mille-feuille.webp');
  assert.equal(defaultRecipePhoto('Spécialité sans photo'), null);
  assert.equal(defaultRecipePhoto(''), null);

  for (const r of starterFreeRecipes()) {
    assert.ok(r.photo, `la recette de départ « ${r.nom} » doit avoir une photo`);
    assert.ok(readFileSync(`public${r.photo}`).length > 0, `${r.photo} illisible`);
  }
});
