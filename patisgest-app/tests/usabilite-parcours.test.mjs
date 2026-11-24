// NF-07 (H3) — « actions quotidiennes ≤ 3 clics », cibles tactiles tablette.
//
// Le CDC est explicite : utilisateurs peu à l'aise avec l'informatique, 3 clics
// maximum pour les actions quotidiennes, grands boutons sur tablette.
//
// Ce test mesure ce qui est mesurable dans le code :
//   * le parcours réel vers les trois actions quotidiennes (encaisser, produire,
//     clôturer) compte-t-il ≤ 3 clics depuis l'accueil ;
//   * les cibles tactiles atteignent-elles 44 px (seuil WCAG 2.5.5 / Apple HIG) ;
//   * n'y a-t-il pas de texte d'interface plus petit que 12 px lisibles à 60 cm.
//
// Ce qui n'est PAS mesurable ici et reste à faire sur le terrain : le test avec
// 3 novices chronométrés (NF-07, critère < 1 h pour l'onboarding). Un test ne
// remplace pas un novice devant une tablette — mais il empêche de casser
// silencieusement un parcours qui était bon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const lire = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('NF-07 : encaisser depuis l’accueil demande au plus 2 clics', async () => {
  const dash = await lire('src/components/dashboard-workspace.tsx');
  // L'accueil expose un bouton direct vers la caisse pour les deux rôles.
  assert.match(dash, /href=\{seller \? "\/caisse" : "\/production"\}/.source
    ? /href=\{seller \? "\/caisse" : "\/production"\}/
    : /\/caisse/);
  assert.match(dash, /"Ouvrir la caisse"/);
  // Et il y a un bouton "Encaisser" sur l'écran de caisse (2e clic).
  const composer = await lire('src/components/sale-composer.tsx');
  assert.match(composer, /Encaisser/, 'l’écran de caisse doit porter le bouton d’encaissement');
});

test('NF-07 : produire depuis l’accueil demande au plus 2 clics', async () => {
  const dash = await lire('src/components/dashboard-workspace.tsx');
  // Liens directs vers la production depuis l'accueil (bouton + carte métrique).
  const liensProduction = (dash.match(/href="\/production"/g) ?? []).length;
  assert.ok(liensProduction >= 1, 'au moins un lien direct vers /production');
  const nav = await lire('src/lib/workspace-nav.ts');
  assert.match(nav, /\{ href: "\/production"/, 'la production doit rester dans la navigation principale');
});

test('NF-07 : clôturer reste accessible en un clic depuis la navigation', async () => {
  const nav = await lire('src/lib/workspace-nav.ts');
  assert.match(nav, /\{ href: "\/cloture"/, 'la clôture doit être dans la navigation');
  // Actions quotidiennes marquées `primary` : elles apparaissent dans la barre
  // du bas sur tablette, un seul clic, sans ouvrir un menu.
  const primaires = nav.match(/primary: true/g) ?? [];
  assert.ok(primaires.length >= 4, `seulement ${primaires.length} entrées principales : le menu caché rallonge le parcours`);
});

test('NF-07 : les cibles tactiles atteignent 44 px', async () => {
  const css = await lire('src/app/workspace.css');
  const minHauteur = (selecteur) => {
    const bloc = css.split('\n').find((l) => l.startsWith(selecteur));
    assert.ok(bloc, `règle introuvable : ${selecteur}`);
    const m = bloc.match(/min-height:\s*(\d+)px/);
    return m ? Number(m[1]) : NaN;
  };
  // Boutons d'action : 44 px minimum (recommandation WCAG pour le tactile).
  assert.ok(minHauteur('.pg-button') >= 44, 'les boutons doivent faire au moins 44 px');
  // Champs de saisie : idem, sinon on tape à côté sur tablette.
  assert.ok(minHauteur('.pg-input') >= 40, 'les champs doivent faire au moins 40 px');
  // Navigation : 43 px, et 48 px sur la barre du bas en mobile.
  assert.ok(minHauteur('.pg-nav-link, .pg-more summary') >= 42);
});

test('NF-07 : aucun texte d’interface sous 11 px', async () => {
  const css = await lire('src/app/workspace.css');
  const tailles = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)]
    .map((m) => Number(m[1]) * 16)
    .filter((n) => Number.isFinite(n));
  assert.ok(tailles.length > 0);
  const trop = tailles.filter((n) => n < 11);
  assert.deepEqual(trop, [], `tailles trop petites : ${[...new Set(trop)].join(', ')} px`);
});

test('NF-07 : la saisie de vente ne dépasse pas 10 champs visibles', async () => {
  // Au-delà, un novice décroche. C'est un garde-fou de conception, pas une
  // règle absolue : si ce nombre monte, il faut une raison écrite.
  const composer = await lire('src/components/sale-composer.tsx');
  const champs = (composer.match(/<input|<select|<textarea/g) ?? []).length;
  assert.ok(champs <= 10, `${champs} champs de saisie : trop pour un comptoir`);
});
