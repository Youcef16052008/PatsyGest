import test from 'node:test';
import assert from 'node:assert/strict';
import { concepts, modules, init, filtrerArticles, panierRecap, totaux, suiteOF, lireUrl, url } from '../public/model.mjs';
import { studio, workspace } from '../public/views.mjs';

test('les cinq maquettes ont une route propre et couvrent les mêmes écrans', () => {
  assert.equal(new Set(concepts.map(({ id }) => id)).size, 5);
  for (const { id: design } of concepts) {
    for (const { id: vue } of [...modules, { id: 'guide' }]) {
      const route = { design, vue, format: 'mobile' };
      assert.deepEqual(lireUrl(url(route)), route);
      assert.ok(workspace(route, init()).includes(`data-view="${vue}"`));
      assert.match(studio(route, ''), new RegExp(`data-design="${design}" aria-current="true"`));
    }
  }
  assert.deepEqual(lireUrl('?design=inconnu&vue=inconnue&format=autre'), { design: 'atelier', vue: 'ensemble', format: 'bureau' });
});

test('inventaire : tri des alertes et recherche insensible aux accents', () => {
  const { articles } = init();
  assert.deepEqual(filtrerArticles(articles, 'alerte', '').map((a) => a.id), ['beu', 'cre']);
  assert.deepEqual(filtrerArticles(articles, 'alerte', 'CREME').map((a) => a.id), ['cre']);
  assert.deepEqual(filtrerArticles(articles, 'produit', 'MP-'), []);
});

test('caisse : montants HT/TVA/TTC au centime, seuls les produits entrent dans le ticket', () => {
  const { articles } = init();
  const lignes = panierRecap(articles, { croissant: 2, eclair: 1, far: 1 });
  assert.equal(lignes.length, 2);
  assert.deepEqual(totaux(lignes), { ht: 450, tva: 85.5, ttc: 535.5 });
  assert.deepEqual(totaux([]), { ht: 0, tva: 0, ttc: 0 });
});

test('production : progression dans un seul sens', () => {
  assert.equal(suiteOF('planifie'), 'encours');
  assert.equal(suiteOF('encours'), 'termine');
  assert.equal(suiteOF('termine'), undefined);
  assert.equal(suiteOF('imprevu'), undefined);
});

test('chaque session repart de la même fixture, les changements ne persistent pas', () => {
  const a = init();
  a.articles[0].quantite = 0;
  a.ordres[0].stage = 'termine';
  a.guide.fini = true;
  const b = init();
  assert.equal(b.articles[0].quantite, 18.5);
  assert.equal(b.ordres[0].stage, 'planifie');
  assert.equal(b.guide.fini, false);
});

test('les noms locaux sont affichés comme texte dans les tableaux', () => {
  const s = init();
  s.articles[0].nom = 'Farine <T55> & bio';
  const html = workspace({ design: 'atelier', vue: 'stocks', format: 'bureau' }, s);
  assert.match(html, /Farine &lt;T55&gt; &amp; bio/);
  assert.ok(!html.includes('Farine <T55> & bio'));
});
