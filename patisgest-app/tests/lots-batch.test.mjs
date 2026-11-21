import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocsIdentifiants, lireLotsPourArticles } from '../src/lib/lots-batch.ts';

// Faux client : enregistre chaque requête pour compter les allers-retours.
function fauxClient(lignes, { erreur = null } = {}) {
  const appels = [];
  const client = {
    from: () => ({
      select: () => {
        const q = { filtres: {}, ins: null, page: null };
        const b = {
          eq(c, v) { q.filtres[c] = v; return b; },
          in(c, v) { q.ins = [c, v]; return b; },
          gt(c, v) { q.filtres[`>${c}`] = v; return b; },
          order() { return b; },
          range(a, z) {
            appels.push({ ...q, a, z });
            if (erreur) return Promise.resolve({ data: null, error: { message: erreur } });
            const ids = new Set(q.ins[1]);
            const filtrees = lignes.filter((l) => ids.has(l.article_id));
            return Promise.resolve({ data: filtrees.slice(a, z + 1), error: null });
          },
        };
        return b;
      },
    }),
  };
  return { client, appels };
}

test('lots : un bloc `in()` pour tous les articles (pas une requête par article)', async () => {
  const ids = Array.from({ length: 50 }, (_, i) => `art-${i}`);
  const lignes = ids.map((id, i) => ({ id: `lot-${i}`, article_id: id, qte_rest: 5, pu: 1, dlc: null, date_reception: '2026-01-01', congele: false, bloque: false }));
  const { client, appels } = fauxClient(lignes);
  const { lots, erreur } = await lireLotsPourArticles(client, 'c1', ids);
  assert.equal(erreur, null);
  assert.equal(appels.length, 1, 'un seul aller-retour pour 50 ingrédients');
  assert.equal(lots.size, 50);
});

test('lots : aucune troncature silencieuse au-delà de 300 lots par article', async () => {
  const lignes = Array.from({ length: 1234 }, (_, i) => ({ id: `lot-${String(i).padStart(5, '0')}`, article_id: 'art-1', qte_rest: 1, pu: 1, dlc: null, date_reception: '2026-01-01', congele: false, bloque: false }));
  const { client } = fauxClient(lignes);
  const { lots } = await lireLotsPourArticles(client, 'c1', ['art-1'], { page: 500 });
  assert.equal(lots.get('art-1').length, 1234);
});

test('lots : une erreur de lecture remonte, elle n’est pas lue comme « aucun lot »', async () => {
  const { client } = fauxClient([], { erreur: 'timeout' });
  const { erreur } = await lireLotsPourArticles(client, 'c1', ['art-1']);
  assert.equal(erreur, 'timeout');
});

test('lots : découpage des identifiants distincts en blocs bornés', () => {
  assert.deepEqual(blocsIdentifiants(['a', 'a', '', 'b', 'c'], 2), [['a', 'b'], ['c']]);
});
