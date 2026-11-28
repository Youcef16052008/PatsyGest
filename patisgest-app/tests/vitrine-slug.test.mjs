import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSlug, normaliserSlug } from '../src/lib/vitrine-slug.ts';

/**
 * W1-A (revue 11/01) — `vitrine/[slug]/page.tsx` appelait
 * `decodeURIComponent(slug)` sans garde. Une URL publique comme
 * `/vitrine/%E0%A4%A` lève un `URIError` DANS un Server Component : le
 * visiteur reçoit une page 500 sur une adresse qu'il peut fabriquer
 * lui-même. `decodeSlug` renvoie `null` et l'appelant fait `notFound()`.
 */

test('slug : une séquence d’échappement invalide renvoie null (jamais URIError)', () => {
  assert.equal(decodeSlug('%E0%A4%A'), null);
  assert.equal(decodeSlug('%'), null);
  assert.equal(decodeSlug('%zz'), null);
  // Ne doit pas lever :
  assert.doesNotThrow(() => decodeSlug('%'));
});

test('slug : décodage normal et casse repliée', () => {
  assert.equal(decodeSlug('elyasmine'), 'elyasmine');
  assert.equal(decodeSlug('ElYasmine'), 'elyasmine');
  assert.equal(decodeSlug('elyasmine%2Ddz'), 'elyasmine-dz');
  assert.equal(decodeSlug('  elyasmine  '), 'elyasmine');
});

test('slug : forme vide ou placeholder « _ » renvoie null (routage par Host)', () => {
  assert.equal(decodeSlug(''), null);
  assert.equal(decodeSlug('   '), null);
  assert.equal(decodeSlug('_'), null);
  assert.equal(decodeSlug(undefined), null);
  assert.equal(decodeSlug(null), null);
});

test('slug : un séparateur encodé ne peut pas fabriquer un chemin', () => {
  // %2F et %2e%2e%2f sont refusés : ce ne sont pas des slugs de boutique.
  assert.equal(decodeSlug('a%2Fb'), null);
  assert.equal(decodeSlug('%2e%2e%2f'), null);
  assert.equal(decodeSlug('..'), null);
  // Le format valide est celui du routeur de domaines (domaines.ts).
  assert.equal(normaliserSlug('a/b'), null);
  assert.equal(normaliserSlug('a..b'), null);
  assert.equal(normaliserSlug('elyasmine'), 'elyasmine');
});

test('slug : longueur bornée (pas de regex linéaire sur 10 000 caractères)', () => {
  assert.equal(decodeSlug('a'.repeat(10000)), null);
  assert.equal(normaliserSlug('a'.repeat(64)), null, 'un slug DNS fait au plus 63 octets');
  assert.equal(normaliserSlug('a'.repeat(63)), 'a'.repeat(63));
});

// ---------------------------------------------------------------------------
// Verrou structurel : la page publique ne doit plus appeler
// `decodeURIComponent` directement, et doit mémoïser sa lecture (une seule
// requête base par visite, pas deux).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(path.join(ROOT, 'src/app/(vitrine)/vitrine/[slug]/page.tsx'), 'utf8');

test('page vitrine : plus aucun decodeURIComponent non gardé', () => {
  assert.equal(
    /decodeURIComponent\s*\(/.test(PAGE),
    false,
    'la page doit passer par decodeSlug (vitrine-slug.ts), jamais décoder en direct',
  );
  assert.match(PAGE, /from "@\/lib\/vitrine-slug"/);
});

test('page vitrine : lecture mémoïsée entre metadata et rendu', () => {
  assert.match(PAGE, /import \{ cache \} from "react"/);
  assert.match(PAGE, /cache\(async \(slug: string\) => lireVitrinePublique\(slug\)\)/);
  const appelsDirects = PAGE.match(/await lireVitrinePublique\(/g) ?? [];
  assert.equal(appelsDirects.length, 0, 'tout appel direct hors cache court-circuite la mémoïsation');
});
