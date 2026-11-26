import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attendreRafraichissement,
  BUDGET_SESSION_MS,
  EN_TETE_SESSION_PERIMEE,
} from '../src/lib/proxy-session.ts';

/*
 * Attente bornée du rafraîchissement de session (proxy.ts).
 *
 * Défaut d'origine : `Promise.race` avec un délai fixe de 1 200 ms. Or les
 * nouveaux cookies sont écrits PENDANT `getUser()` (via `setAll`) : en
 * abandonnant l'attente, la réponse partait avec les anciens cookies et la
 * rotation était perdue en silence, à chaque requête, sur connexion lente.
 *
 * Ce qui doit être prouvé :
 *   a. un rafraîchissement rapide ou moyen est ATTENDU (cookies préservés) ;
 *   b. un rafraîchissement trop lent ne bloque pas indéfiniment, mais la
 *      réponse est marquée « périmée » — la perte devient observable ;
 *   c. hors ligne (échec immédiat), on n'attend PAS le budget.
 */

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

test('a. rafraîchissement rapide : attendu, jamais marqué périmé', async () => {
  let appele = false;
  const r = await attendreRafraichissement(async () => {
    appele = true;
    await dormir(5);
  });
  assert.equal(appele, true, 'le rafraîchissement doit être déclenché');
  assert.equal(r.issue, 'fini');
  assert.equal(r.perime, false);
});

test('a. rafraîchissement moyen (sous le budget) : attendu jusqu’au bout', async () => {
  // 60 ms sous un budget de 400 ms : la rotation a le temps d'être écrite.
  const r = await attendreRafraichissement(async () => {
    await dormir(60);
  }, { budgetMs: 400 });
  assert.equal(r.issue, 'fini', 'un rafraîchissement sous le budget ne doit pas être abandonné');
  assert.equal(r.perime, false);
  assert.ok(r.dureeMs >= 50, `attendu ~60 ms, mesuré ${r.dureeMs} ms`);
});

test('b. rafraîchissement trop lent : budget respecté ET marqueur périmé', async () => {
  const debut = Date.now();
  const r = await attendreRafraichissement(async () => {
    await dormir(3000); // bien au-delà du budget
  }, { budgetMs: 120 });
  const ecoule = Date.now() - debut;

  assert.equal(r.issue, 'budget');
  assert.equal(r.perime, true, 'une rotation encore en vol DOIT être signalée');
  // On ne doit pas attendre les 3 s : le budget borne l'attente.
  assert.ok(ecoule < 1500, `la réponse a attendu ${ecoule} ms malgré un budget de 120 ms`);
});

test('b. le marqueur porte un nom stable (contrat avec l’en-tête HTTP)', () => {
  assert.equal(EN_TETE_SESSION_PERIMEE, 'x-patisgest-session-stale');
  assert.equal(BUDGET_SESSION_MS, 2500);
});

test('c. hors ligne : échec immédiat, sans consommer le budget', async () => {
  const debut = Date.now();
  const r = await attendreRafraichissement(async () => {
    throw new Error('fetch failed'); // cas réel : réseau coupé
  }, { budgetMs: 2000 });
  const ecoule = Date.now() - debut;

  assert.equal(r.issue, 'echec', 'un rejet doit être traduit en échec, pas en budget');
  assert.equal(r.perime, false, 'aucune rotation en attente après un échec');
  assert.ok(ecoule < 300, `un échec ne doit pas attendre le budget (mesuré ${ecoule} ms)`);
});

test('c. un échec synchrone est traité comme un échec', async () => {
  const r = await attendreRafraichissement(() => {
    throw new Error('throw synchrone');
  }, { budgetMs: 2000 });
  assert.equal(r.issue, 'echec');
  assert.equal(r.perime, false);
});

test('aucune promesse rejetée non gérée ne subsiste', async () => {
  // Surveille les rejets non gérés : si `rafraichir` rejette APRÈS le budget,
  // la promesse perdue ne doit pas faire tomber le processus.
  const vus = [];
  const surRejet = (raison) => vus.push(raison);
  process.on('unhandledRejection', surRejet);
  try {
    const r = await attendreRafraichissement(async () => {
      await dormir(200);
      throw new Error('échec tardif, après le budget');
    }, { budgetMs: 30 });
    assert.equal(r.issue, 'budget');
    // Laisser l'échec tardif se produire.
    await dormir(300);
    assert.deepEqual(vus.map(String), [], 'un rejet tardif non géré s’est échappé');
  } finally {
    process.off('unhandledRejection', surRejet);
  }
});

test('le budget est annulé quand le rafraîchissement aboutit (pas de fuite)', async () => {
  // Si le minuteur n'était pas annulé, le processus resterait vivant après le
  // test ; on mesure indirectement en vérifiant qu'une exécution rapide rend
  // la main sans délai.
  const debut = Date.now();
  await attendreRafraichissement(async () => {}, { budgetMs: 5000 });
  assert.ok(Date.now() - debut < 200, 'un succès immédiat ne doit pas attendre le budget');
});
