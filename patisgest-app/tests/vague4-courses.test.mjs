import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/*
 * H15-07 / H14-09 : les quatre `limit()` de la liste de courses serveur
 * tronquaient silencieusement les données. On simule un client PostgREST qui
 * renvoie AUTANT de lignes que demandé : la ligne supplémentaire demandée par
 * le code courant doit être détectée comme un dépassement, pas agrégée.
 */

const etat = {
  limites: {},
  lignes: {},
  erreurs: {},
};

function chaine(table) {
  const b = {
    select: () => b,
    eq: () => b,
    in: () => b,
    gt: () => b,
    or: () => b,
    limit: async (n) => {
      etat.limites[table] = n;
      if (etat.erreurs[table]) return { data: null, error: etat.erreurs[table] };
      const count = etat.lignes[table] ?? 0;
      return {
        data: Array.from({ length: Math.min(n, count) }, (_, i) => ({ i, id: `${table}-${i}` })),
        error: null,
      };
    },
  };
  return b;
}

mock.module(new URL('../src/lib/supabase/server.ts', import.meta.url).href, {
  namedExports: {
    createClient: async () => ({ from: chaine }),
  },
});

const { lireListeCourses } = await import('../src/lib/courses-server.ts');

function initialiser(lignes = {}, erreurs = {}) {
  etat.limites = {};
  etat.lignes = lignes;
  etat.erreurs = erreurs;
}

test('H15-07 : une sonde +1 par table refuse une liste tronquée', async () => {
  initialiser({
    ordres_fabrication: 501,
    lots: 5001,
    bons_commande: 501,
    articles: 5001,
  });
  const res = await lireListeCourses('c1');
  assert.deepEqual(etat.limites, {
    ordres_fabrication: 501,
    lots: 5001,
    bons_commande: 501,
    articles: 5001,
  });
  assert.equal(res.erreur, true);
  assert.equal(res.nbOf, 0);
  assert.deepEqual(res.resultat.lignes, []);
});

test('H15-07 : une seule table au plafond suffit à refuser le calcul', async () => {
  initialiser({
    ordres_fabrication: 2,
    lots: 3,
    bons_commande: 1,
    articles: 5001,
  });
  const res = await lireListeCourses('c1');
  assert.equal(res.erreur, true);
  assert.deepEqual(res.resultat, { lignes: [], aAcheter: [], ignores: 0 });
});

test('H15-07 : une erreur PostgREST reste une erreur, pas une liste vide valide', async () => {
  initialiser({}, { lots: { message: 'RLS' } });
  const res = await lireListeCourses('c1');
  assert.equal(res.erreur, true);
});

test('H14-09 : sous les plafonds, une lecture complète calcule sans erreur', async () => {
  initialiser({
    ordres_fabrication: 2,
    lots: 3,
    bons_commande: 1,
    articles: 4,
  });
  const res = await lireListeCourses('c1');
  assert.equal(res.erreur, false);
  assert.equal(res.nbOf, 2);
});
