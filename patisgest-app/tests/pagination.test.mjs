import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lirePages } from '../src/lib/pagination.ts';

for (const limite of [20_000, 50_000]) {
  test(`pagination : cap ${limite - 1}, ${limite} et ${limite + 1} distingue exact et tronqué`, async () => {
    for (const total of [limite - 1, limite, limite + 1]) {
      const source = Array.from({ length: total }, (_, id) => id);
      const offsets = [];
      const resultat = await lirePages(async (offset, taille) => {
        offsets.push([offset, taille]);
        return { data: source.slice(offset, offset + taille), error: null };
      }, limite, 500);

      if (total <= limite) {
        assert.equal(resultat.ok, true);
        assert.equal(resultat.lignes.length, total);
        assert.deepEqual(resultat.lignes, source);
        if (total === limite) {
          assert.deepEqual(offsets.at(-1), [limite, 1], 'une page pleine doit être suivie de la sonde');
        } else {
          assert.ok(offsets.at(-1)[0] < limite, 'une dernière page partielle termine sans sonde');
        }
      } else {
        assert.deepEqual(resultat, { ok: false, raison: 'limite' });
        assert.equal(offsets.at(-1)[0], limite);
        assert.equal(offsets.at(-1)[1], 1);
      }
    }
  });
}

test('pagination : une sonde en erreur ne certifie jamais une lecture complète', async () => {
  const resultat = await lirePages(async (offset) => offset === 10
    ? { data: null, error: new Error('indisponible') }
    : { data: Array.from({ length: 10 }, (_, i) => offset + i), error: null }, 10, 10);
  assert.equal(resultat.ok, false);
  if (!resultat.ok) {
    assert.equal(resultat.raison, 'lecture');
    assert.match(resultat.error.message, /indisponible/);
  }
});

test('pagination : collection vide et page terminale partielle', async () => {
  const vide = await lirePages(async () => ({ data: [], error: null }), 10, 5);
  assert.deepEqual(vide, { ok: true, lignes: [] });

  const partiel = await lirePages(async (offset, taille) => ({
    data: Array.from({ length: Math.max(0, Math.min(taille, 7 - offset)) }, (_, i) => offset + i),
    error: null,
  }), 10, 5);
  assert.deepEqual(partiel, { ok: true, lignes: [0, 1, 2, 3, 4, 5, 6] });
});
