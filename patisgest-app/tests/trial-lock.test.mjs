import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

/*
 * Verrou d'essai — Hybrid (a+).
 *
 * Avant ce lot, le verrou n'existait QUE dans l'interface : `(app)/layout.tsx`
 * masquait les enfants, mais aucune Server Action ne vérifiait l'état. Un
 * client dont l'essai était échu pouvait donc encore vendre, encaisser et
 * écrire en base en appelant l'action directement.
 *
 * Le garde est placé dans `getSessionContext()` : les 87 actions exportées
 * appellent déjà cette fonction et savent déjà traiter un `null`, donc elles
 * échouent fermées sans être modifiées.
 *
 * Ces tests exercent le VRAI `auth.ts` et le VRAI `trial-server.ts` : seul le
 * client Supabase est remplacé. Un faux `getSessionContext` ne prouverait rien.
 */

/*
 * Depuis l'arrivée du mode « tout gratuit » (licence-mode.ts), l'essai est
 * ÉTEINT par défaut : `modeGratuit()` est vrai tant que
 * `PATISGEST_MODE_GRATUIT` n'est pas explicitement désactivé. Or ce fichier
 * teste précisément le verrou d'essai : il doit donc rouvrir l'abonnement.
 *
 * `essaiActif()` = !modeGratuit() et lit `NEXT_PUBLIC_PATISGEST_MODE_GRATUIT`
 * (seule variable disponible côté serveur comme côté navigateur).
 */
process.env.NEXT_PUBLIC_PATISGEST_MODE_GRATUIT = "0";

const serverUrl = new URL("../src/lib/supabase/server.ts", import.meta.url).href;

/** État mutable lu par le faux client à chaque appel. */
let etat = {
  user: null,
  utilisateur: null,
  rpcData: null,
  rpcErreur: null,
  rpcLeve: false,
  appels: [],
};

const fauxClient = {
  auth: {
    async getUser() {
      etat.appels.push({ op: "auth.getUser" });
      return { data: { user: etat.user } };
    },
  },
  from(table) {
    etat.appels.push({ op: "from", table });
    const b = {
      select() { return b; },
      eq() { return b; },
      single: async () => ({ data: etat.utilisateur, error: null }),
    };
    return b;
  },
  rpc(nom) {
    etat.appels.push({ op: "rpc", nom });
    // `rpcLeve` simule une exception réelle (sérialisation, panne réseau au
    // milieu de la réponse) — distincte d'une réponse `{ error }`.
    if (etat.rpcLeve) return Promise.reject(new Error("réseau coupé"));
    if (etat.rpcErreur) return Promise.resolve({ data: null, error: etat.rpcErreur });
    return Promise.resolve({ data: etat.rpcData, error: null });
  },
};

mock.module(serverUrl, { namedExports: { createClient: async () => fauxClient } });

// Imports APRÈS l'installation du faux client.
const { getSessionContext, getSessionContextDetaille } = await import("../src/lib/auth.ts");
const { reinitialiserStatutEssaiPartage } = await import("../src/lib/trial-server.ts");

function rpcEssai(verrouille) {
  return {
    client_id: "11111111-1111-4111-8111-111111111111",
    client_nom: "Atelier Test",
    statut_abonnement: verrouille ? "essai" : "paye",
    essai_duree_jours: 90,
    essai_debut_at: "2026-01-01T00:00:00.000Z",
    essai_fin_at: "2026-04-01T00:00:00.000Z",
    paye_at: null,
    license_version: 1,
    server_now: "2026-11-26T00:00:00.000Z",
    verrouille,
    utilisateur_telephone: null,
  };
}

function sessionSaine() {
  etat.user = { id: "auth-1", email: "test@example.test" };
  etat.utilisateur = {
    id: "ut-1",
    nom: "Test",
    client_id: "11111111-1111-4111-8111-111111111111",
    role: "proprietaire",
    clients: { nom: "Atelier Test" },
  };
}

beforeEach(() => {
  etat = { user: null, utilisateur: null, rpcData: null, rpcErreur: null, rpcLeve: false, appels: [] };
  reinitialiserStatutEssaiPartage();
});

// --- Le cœur du verrou ------------------------------------------------------

test("verrou : essai échu ⇒ getSessionContext() renvoie null (échec fermé)", async () => {
  sessionSaine();
  etat.rpcData = rpcEssai(true);

  assert.equal(await getSessionContext(), null);
});

test("verrou : essai échu + allowLocked ⇒ session restituée (écran de verrou)", async () => {
  sessionSaine();
  etat.rpcData = rpcEssai(true);

  const ctx = await getSessionContext({ allowLocked: true });
  assert.ok(ctx);
  assert.equal(ctx.clientId, "11111111-1111-4111-8111-111111111111");
  assert.equal(ctx.role, "proprietaire");
});

test("verrou : essai actif ⇒ session restituée", async () => {
  sessionSaine();
  etat.rpcData = rpcEssai(false);

  const ctx = await getSessionContext();
  assert.ok(ctx);
  assert.equal(ctx.mode, "supabase");
});

test("verrou : la raison distingue « verrouillé » de « pas de session »", async () => {
  sessionSaine();
  etat.rpcData = rpcEssai(true);

  const verrouille = await getSessionContextDetaille();
  assert.equal(verrouille.ctx, null);
  assert.equal(verrouille.raison, "essai-verrouille");

  // Sans session du tout, la raison doit rester distincte : c'est elle qui
  // décide entre `/connexion` et l'écran de verrouillage.
  etat.user = null;
  const vide = await getSessionContextDetaille();
  assert.equal(vide.ctx, null);
  assert.equal(vide.raison, "aucune-session");
});

// --- Échec ouvert : une panne de base ne doit jamais verrouiller ------------

test("verrou : RPC en erreur ⇒ NON verrouillé (échec ouvert)", async () => {
  sessionSaine();
  etat.rpcErreur = { message: "connexion refusée" };

  const ctx = await getSessionContext();
  assert.ok(ctx, "une panne RPC ne doit pas mettre l'atelier dehors");
});

test("verrou : RPC sans données ⇒ NON verrouillé (échec ouvert)", async () => {
  sessionSaine();
  etat.rpcData = null;

  assert.ok(await getSessionContext());
});

test("verrou : RPC qui lève ⇒ NON verrouillé (échec ouvert)", async () => {
  sessionSaine();
  etat.rpcLeve = true;

  // Le rejet traverse `lireStatutEssaiServeur` (try/catch interne) puis la
  // garde : aucune exception ne doit remonter, et l'atelier reste ouvert.
  await assert.doesNotReject(async () => {
    assert.ok(await getSessionContext());
  });
});

test("verrou : verrouille explicite à false ⇒ jamais bloqué", async () => {
  sessionSaine();
  etat.rpcData = { ...rpcEssai(false), verrouille: false };

  assert.ok(await getSessionContext());
});

// --- Un seul RPC par requête ------------------------------------------------

test("verrou : deux lectures simultanées partagent UN seul RPC", async () => {
  sessionSaine();
  etat.rpcData = rpcEssai(false);

  // Représente le layout et la garde de session demandant le statut dans le
  // même tick. La déduplication en vol doit absorber les deux.
  await Promise.all([getSessionContext(), getSessionContext({ allowLocked: true })]);

  const lectures = etat.appels.filter(
    (a) => a.op === "rpc" && a.nom === "lire_statut_essai_client",
  );
  assert.equal(lectures.length, 1, `attendu 1 lecture, obtenu ${lectures.length}`);
});

/*
 * PORTÉE DE CETTE GARANTIE — à ne pas surinterpréter.
 *
 * `lireStatutEssaiPartage` est enveloppé par `cache()` de React
 * (src/lib/trial-server.ts) : sous le rendu RSC de Next, une seule lecture
 * par requête, même pour des appels SÉQUENTIELS dans le même rendu.
 *
 * Hors rendu React, `cache()` est un simple passe-plat (vérifié : React 19.2.6
 * n'enregistre aucun cache sans dispatcher RSC). Node n'ayant pas de dispatcher,
 * ce test ne peut donc PAS prouver la mémoïsation séquentielle — elle relève du
 * runtime Next et se contrôle par le build + le parcours manuel. Ce que ce
 * fichier prouve, c'est la déduplication concurrente ci-dessus, et le fait que
 * l'absence de cache ne casse rien (aucune exception, lecture refaite).
 */
test("verrou : hors rendu React, l'absence de cache ne lève pas", async () => {
  sessionSaine();
  etat.rpcData = rpcEssai(false);

  await assert.doesNotReject(async () => {
    await getSessionContext();
    await getSessionContext();
    await getSessionContext();
  });
});

// Le mode démo est couvert par tests/trial-lock-demo.test.mjs : il exige un
// graphe de modules vierge (le hook de résolution fige les stubs de `next/headers`
// dès le premier import), donc un fichier de test séparé.

// --- Une action mutante refuse, sans écriture ------------------------------

test("verrou : une Server Action mutante refuse un client verrouillé sans écrire", async () => {
  sessionSaine();
  etat.rpcData = rpcEssai(true);

  /*
   * `createArticle` est choisie parce qu'elle écrit IMMÉDIATEMENT après le
   * contrôle de session (aucun filtre préalable du type `sameSaleSession` qui
   * masquerait le résultat). Un `sellCart` avec un FormData vide rendait
   * « session changée » même sans garde : le test passait à vide.
   */
  const { createArticle } = await import("../src/lib/actions-stock.ts");

  const form = new FormData();
  form.set("code", "ART-1");
  form.set("nom", "Article test");
  form.set("niveau", "1");
  form.set("unite", "kg");
  form.set("seuil", "0");

  const resultat = await createArticle({}, form);

  // Sans la garde, l'action aboutit (ou échoue sur la saisie) et tente une
  // écriture. Avec la garde, `getSessionContext()` vaut null → refus immédiat.
  assert.match(String(resultat.erreur ?? ""), /accès refusé/i, JSON.stringify(resultat));

  // `lire_statut_essai_client` est la LECTURE du verrou lui-même : elle est
  // légitime (et a lieu avant le refus). Toute autre RPC ou écriture, non.
  const LECTURES_LEGITIMES = new Set(["lire_statut_essai_client"]);
  const ecritures = etat.appels.filter(
    (a) => ["insert", "update", "upsert", "delete"].includes(a.op)
      || (a.op === "rpc" && !LECTURES_LEGITIMES.has(a.nom)),
  );
  assert.deepEqual(
    ecritures,
    [],
    `aucune écriture attendue, obtenu ${JSON.stringify(ecritures)}`,
  );
  const lecturesArticles = etat.appels.filter(
    (a) => a.op === "from" && a.table === "articles",
  );
  assert.deepEqual(lecturesArticles, [], "la table articles ne doit jamais être atteinte");
});

test("verrou : l'export reste possible une fois verrouillé (pas de données en otage)", async () => {
  sessionSaine();
  etat.rpcData = rpcEssai(true);

  const ctx = await getSessionContext({ allowLocked: true });
  assert.ok(ctx, "le propriétaire verrouillé doit pouvoir exporter ses données");
});
