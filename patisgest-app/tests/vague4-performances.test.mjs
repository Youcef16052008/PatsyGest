import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dashboardInsights,
  productVelocity,
} from '../src/lib/dashboard-insights.ts';

/*
 * H14-01 / H14-02 : les deux anciens `lots.filter()` par article rendaient le
 * calcul O(A×L). On instrumente les GETTERS et `Array.prototype.includes` pour
 * mesurer le nombre réel de lectures, sans mesurer une latence dépendante du CPU.
 */

const A = 120;
const L = 400;
const today = '2026-11-26';

function article(i) {
  return {
    id: `a${i}`,
    nom: `Article ${i}`,
    unite: 'kg',
    niveau: 'produit',
    seuil: 10,
  };
}

function jeuxInstrumentes() {
  let lecturesArticleId = 0;
  let lecturesIncludes = 0;
  const articles = Array.from({ length: A }, (_, i) => article(i));
  const lots = Array.from({ length: L }, (_, i) => ({
    get articleId() {
      lecturesArticleId += 1;
      return `a${i % A}`;
    },
    siteId: `s${i % 7}`,
    qte: 2,
    qteRest: 2,
    bloque: false,
    dlc: null,
    statut: 'disponible',
  }));
  const shopIds = Array.from({ length: 50 }, (_, i) => `s${i}`);
  const proxyShops = new Proxy(shopIds, {
    get(cible, prop, receveur) {
      if (prop === 'includes') {
        return (...args) => {
          lecturesIncludes += 1;
          return Reflect.apply(Array.prototype.includes, cible, args);
        };
      }
      return Reflect.get(cible, prop, receveur);
    },
  });
  const series = Array.from({ length: 14 }, (_, i) => ({
    day: new Date(Date.parse(today) - (13 - i) * 86_400_000).toISOString().slice(0, 10),
    ttc: 100 + i,
  }));
  const sales = articles.map((a) => ({
    date: today,
    lignes: [{ articleId: a.id, qty: 3 }],
  }));
  return {
    articles,
    lots,
    shopIds: proxyShops,
    series,
    sales,
    compteurs: () => ({ lecturesArticleId, lecturesIncludes }),
  };
}

test('H14-01 : dashboardInsights groupe les lots en un passage', () => {
  const jeu = jeuxInstrumentes();
  const avant = jeu.compteurs();
  const resultat = dashboardInsights(jeu.series, jeu.articles, jeu.lots, today);
  const apres = jeu.compteurs();
  const lectures = apres.lecturesArticleId - avant.lecturesArticleId;
  assert.equal(resultat.shortages?.length, A);
  assert.ok(
    lectures < jeu.articles.length * jeu.lots.length / 10,
    `O(A×L) toujours présent : ${lectures} lectures pour A=${A}, L=${L}`,
  );
  assert.ok(lectures <= jeu.lots.length + jeu.articles.length * 2);
});

test('H14-02 : productVelocity ne refait pas de balayage complet par article', () => {
  const jeu = jeuxInstrumentes();
  const avant = jeu.compteurs();
  const resultat = productVelocity(jeu.sales, jeu.articles, jeu.lots, today, jeu.shopIds);
  const apres = jeu.compteurs();
  assert.equal(resultat?.length, A);
  assert.equal(apres.lecturesIncludes - avant.lecturesIncludes, 0, 'Set(shopIds) non utilisé');
  assert.ok(
    apres.lecturesArticleId - avant.lecturesArticleId <= jeu.lots.length + jeu.articles.length * 2,
    'groupement des lots non appliqué',
  );
});
