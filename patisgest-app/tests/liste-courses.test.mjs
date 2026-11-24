// MOD-03 / US-03.3 — liste de courses automatique.
//
// « besoins des OF planifiés − stock − en commande »
//
// Le calcul existe déjà au niveau des besoins d'un OF (RPC
// `patisgest_besoins_de_version`, serveur). Ce qui manquait, c'est l'agrégation
// multi-OF et la soustraction du stock et des commandes en cours : sans elle,
// le propriétaire doit recopier des besoins à la main pour appeler son
// fournisseur, ce qui est exactement ce que le CDC veut supprimer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listeCourses } from '../src/lib/liste-courses.ts';

const besoin = (articleId, nom, qty, unit = 'kg') => ({
  articleId, code: null, nom, qty, unit,
});

const stock = (articleId, qteRest, unit = 'kg') => ({ articleId, qteRest, unit });

test('US-03.3 : les besoins de plusieurs OF sont additionnés par article', () => {
  const r = listeCourses({
    besoins: [besoin('a1', 'Farine', 10), besoin('a1', 'Farine', 5), besoin('a2', 'Beurre', 2)],
    stock: [], enCommande: [],
  });
  assert.deepEqual(
    r.lignes.map((l) => [l.articleId, l.besoin, l.aAcheter]),
    [['a1', 15, 15], ['a2', 2, 2]],
  );
});

test('US-03.3 : le stock disponible est déduit', () => {
  const r = listeCourses({
    besoins: [besoin('a1', 'Farine', 10)],
    stock: [stock('a1', 4)],
    enCommande: [],
  });
  assert.equal(r.lignes[0].aAcheter, 6);
});

test('US-03.3 : les commandes en cours sont déduites aussi', () => {
  const r = listeCourses({
    besoins: [besoin('a1', 'Farine', 10)],
    stock: [stock('a1', 4)],
    enCommande: [{ articleId: 'a1', qte: 3 }],
  });
  assert.equal(r.lignes[0].aAcheter, 3);
});

test('US-03.3 : un article couvert n’est pas listé comme manquant', () => {
  const r = listeCourses({
    besoins: [besoin('a1', 'Farine', 5), besoin('a2', 'Beurre', 2)],
    stock: [stock('a1', 8), stock('a2', 2)],
    enCommande: [],
  });
  const farine = r.lignes.find((l) => l.articleId === 'a1');
  assert.equal(farine.aAcheter, 0, 'on n’achète pas ce qu’on a déjà');
  assert.equal(farine.statut, 'couvert');
  assert.equal(r.aAcheter.length, 0, 'aucune ligne à acheter');
  // Les lignes couvertes restent visibles : le gérant doit pouvoir vérifier.
  assert.equal(r.lignes.length, 2);
});

test('US-03.3 : un stock supérieur au besoin ne produit pas de négatif', () => {
  const r = listeCourses({
    besoins: [besoin('a1', 'Farine', 1)],
    stock: [stock('a1', 50)],
    enCommande: [],
  });
  assert.equal(r.lignes[0].aAcheter, 0);
  assert.ok(Number.isFinite(r.lignes[0].aAcheter));
});

test('US-03.3 : les articles en rupture totale sont signalés comme urgents', () => {
  const r = listeCourses({
    besoins: [besoin('a1', 'Beurre', 10)],
    stock: [stock('a1', 0)],
    enCommande: [],
  });
  assert.equal(r.lignes[0].statut, 'rupture');
});

test('US-03.3 : les lignes sont triées du plus urgent au moins urgent', () => {
  const r = listeCourses({
    besoins: [
      besoin('a1', 'Farine', 10),   // stock 9  -> 1 à acheter
      besoin('a2', 'Beurre', 10),   // stock 0  -> 10 à acheter, rupture
      besoin('a3', 'Sucre', 10),    // stock 2  -> 8 à acheter
    ],
    stock: [stock('a1', 9), stock('a2', 0), stock('a3', 2)],
    enCommande: [],
  });
  assert.deepEqual(r.aAcheter.map((l) => l.nom), ['Beurre', 'Sucre', 'Farine']);
});

test('US-03.3 : des unités incompatibles ne sont jamais soustraites en silence', () => {
  // 10 kg besoin, 4 L en stock : ce n'est pas 6. On ne mélange pas les unités,
  // on le signale et on n'invente pas de conversion (le CDC exige des
  // conversions explicites, migration 12).
  const r = listeCourses({
    besoins: [besoin('a1', 'Lait', 10, 'kg')],
    stock: [stock('a1', 4, 'L')],
    enCommande: [],
  });
  assert.equal(r.lignes[0].aAcheter, 10, 'le stock d’une autre unité n’est pas déduit');
  assert.equal(r.lignes[0].uniteIncoherente, true);
});

test('US-03.3 : un article sans identifiant (ligne en code) est ignoré sans planter', () => {
  // Les anciennes lignes de recette peuvent porter un `code` au lieu d'un
  // articleId. On ne peut pas déduire un stock sans id : on ne l'invente pas.
  const r = listeCourses({
    besoins: [{ articleId: null, code: 'MP-FAR', nom: 'Farine', qty: 5, unit: 'kg' }, besoin('a2', 'Beurre', 1)],
    stock: [], enCommande: [],
  });
  assert.equal(r.lignes.length, 1);
  assert.equal(r.ignores, 1);
});

test('US-03.3 : une liste vide ne produit ni NaN ni erreur', () => {
  const r = listeCourses({ besoins: [], stock: [], enCommande: [] });
  assert.deepEqual(r.lignes, []);
  assert.deepEqual(r.aAcheter, []);
  assert.equal(r.ignores, 0);
});

test('US-03.3 : une quantité non finie n’empoisonne pas la liste', () => {
  const r = listeCourses({
    besoins: [besoin('a1', 'Farine', Number.NaN), besoin('a2', 'Beurre', 2)],
    stock: [stock('a1', 1)],
    enCommande: [],
  });
  const farine = r.lignes.find((l) => l.articleId === 'a1');
  assert.equal(farine.besoin, 0);
  assert.equal(farine.aAcheter, 0);
});
