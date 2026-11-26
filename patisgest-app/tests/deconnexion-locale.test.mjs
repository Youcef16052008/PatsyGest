import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oublierDonneesLocalesDeSession } from '../src/lib/deconnexion-locale.ts';

/**
 * W1-C (revue 11/01) — Sur une tablette de boutique partagée, la déconnexion
 * effaçait les cookies mais laissait `patisgest.session.v1` et le catalogue
 * hors-ligne du compte précédent dans le navigateur. `oublierCetAppareil`
 * existait déjà et n'était appelé nulle part.
 *
 * Ce test vérifie le contrat observable : après déconnexion, les deux clés
 * sensibles ne sont plus lisibles.
 */

const CLE_CATALOGUE = 'patisgest.catalogue.v1';
const CLE_IDENTITE = 'patisgest.session.v1';

function fauxStockage(initial = {}) {
  const donnees = { ...initial };
  return {
    getItem: (k) => (k in donnees ? donnees[k] : null),
    setItem: (k, v) => { donnees[k] = String(v); },
    removeItem: (k) => { delete donnees[k]; },
    _donnees: donnees,
  };
}

test('déconnexion : le catalogue et l’identité locales sont effacés', () => {
  const st = fauxStockage({
    [CLE_CATALOGUE]: '{"articles":[]}',
    [CLE_IDENTITE]: '{"clientId":"c1","authUserId":"u1"}',
    'patisgest.lang': 'fr',
  });

  oublierDonneesLocalesDeSession(st);

  assert.equal(st.getItem(CLE_CATALOGUE), null, 'catalogue hors-ligne encore présent');
  assert.equal(st.getItem(CLE_IDENTITE), null, 'identité du compte précédent encore présente');
  // On ne touche pas aux préférences d'affichage (langue, thème).
  assert.equal(st.getItem('patisgest.lang'), 'fr');
});

test('déconnexion : un stockage qui n’implémente pas removeItem est vidé quand même', () => {
  const donnees = { [CLE_CATALOGUE]: 'x', [CLE_IDENTITE]: 'y' };
  const sansRemove = {
    getItem: (k) => (k in donnees ? donnees[k] : null),
    setItem: (k, v) => { donnees[k] = String(v); },
  };

  oublierDonneesLocalesDeSession(sansRemove);

  assert.equal(sansRemove.getItem(CLE_CATALOGUE), '');
  assert.equal(sansRemove.getItem(CLE_IDENTITE), '');
});

test('déconnexion : un stockage qui lève ne bloque pas la déconnexion', () => {
  const casse = {
    getItem: () => null,
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('refusé'); },
  };
  assert.doesNotThrow(() => oublierDonneesLocalesDeSession(casse));
});

test('déconnexion : sans stockage (SSR) rien ne se passe et rien ne lève', () => {
  assert.doesNotThrow(() => oublierDonneesLocalesDeSession(undefined));
});

// ---------------------------------------------------------------------------
// Verrou structurel : aucun `<form action={logout}>` ne doit subsister.
// Un formulaire serveur ne peut pas vider le localStorage ; tout bouton de
// déconnexion doit passer par `ClientLogout` (ou le lock screen, qui appelle
// explicitement le nettoyage).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SOURCES = [
  'src/app/(app)/layout.tsx',
  'src/app/(auth)/rejoindre/page.tsx',
  'src/components/trial-guard-client.tsx',
];

test('déconnexion : plus aucun formulaire serveur ne contourne le nettoyage local', () => {
  for (const f of SOURCES) {
    const src = lire(f);
    assert.equal(
      /<form\s+action=\{logout\}/.test(src),
      false,
      `${f} utilise encore <form action={logout}> : le cache local survivrait`,
    );
  }
  const layout = lire('src/app/(app)/layout.tsx');
  assert.match(layout, /ClientLogout/);
  const guard = lire('src/components/trial-guard-client.tsx');
  assert.match(guard, /oublierDonneesLocalesDeSession\(\)/);
});
