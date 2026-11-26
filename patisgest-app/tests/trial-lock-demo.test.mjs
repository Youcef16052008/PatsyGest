import { test, mock } from "node:test";
import assert from "node:assert/strict";

/*
 * Verrou d'essai — mode démonstration (`pilote-local`).
 *
 * Exigence : une démo locale ne dépend d'AUCUNE base. Elle ne doit donc jamais
 * appeler la RPC `lire_statut_essai_client`, ni lire la table `utilisateurs`.
 *
 * Ce fichier est SÉPARÉ de `trial-lock.test.mjs` pour deux raisons
 * techniques, pas par goût de la fragmentation :
 *  1. le hook de résolution (`register-hooks.mjs`) redirige `next/headers` vers
 *     `tests/mocks/next-stubs.mjs` ; pour fournir un cookie de session, il faut
 *     remplacer CE module, et il doit l'être avant tout import qui l'instancie ;
 *  2. les variables d'environnement de démo (`NODE_ENV=development`,
 *     `PATISGEST_DEMO_MODE`, `PATISGEST_DEMO_SECRET`) doivent être posées avant
 *     le chargement de `auth.ts`.
 */

process.env.NODE_ENV = "development";
process.env.PATISGEST_DEMO_MODE = "true";
// Essai « ouvert » : le verrou ne doit jamais s'appliquer en démo, mais on se
// place dans la configuration où il POURRAIT s'appliquer (abonnement actif).
process.env.NEXT_PUBLIC_PATISGEST_MODE_GRATUIT = "0";
const SECRET = "0123456789abcdef0123456789abcdef";
process.env.PATISGEST_DEMO_SECRET = SECRET;

const { createHmac } = await import("node:crypto");
const { PILOT_ACCOUNTS } = await import("../src/lib/pilot-accounts.ts");
const { comptePilotePropre } = await import("../src/lib/pilot-account.ts");

const EMAIL_PILOTE = "amina@patisserie.dz";
const compte = comptePilotePropre(PILOT_ACCOUNTS, EMAIL_PILOTE);
assert.ok(compte, "compte pilote introuvable — le test ne prouverait rien");

const payload = Buffer.from(
  JSON.stringify({ email: compte.email, expires: Date.now() + 3_600_000 }),
).toString("base64url");
const signature = createHmac("sha256", SECRET).update(payload).digest("hex");

// Remplace le module de stubs AVANT le premier import de `auth.ts`.
const stubsUrl = new URL("../tests/mocks/next-stubs.mjs", import.meta.url).href;
mock.module(stubsUrl, {
  namedExports: {
    revalidatePath() {},
    redirect() {
      throw new Error("redirect");
    },
    NextResponse: {},
    cookies: async () => ({
      get: (nom) =>
        nom === "patisgest_pilot_session" ? { value: `${payload}.${signature}` } : undefined,
      getAll: () => [],
      set: () => {},
    }),
  },
});

/** Client Supabase espion : tout appel est enregistré. */
const appels = [];
const fauxClient = {
  auth: {
    async getUser() {
      appels.push("auth.getUser");
      return { data: { user: null } };
    },
  },
  from(table) {
    appels.push(`from:${table}`);
    const b = { select: () => b, eq: () => b, single: async () => ({ data: null, error: null }) };
    return b;
  },
  rpc(nom) {
    appels.push(`rpc:${nom}`);
    return Promise.resolve({ data: null, error: null });
  },
};
mock.module(new URL("../src/lib/supabase/server.ts", import.meta.url).href, {
  namedExports: { createClient: async () => fauxClient },
});

const { getSessionContext, demoEnabled } = await import("../src/lib/auth.ts");

test("démo : demoEnabled() vrai avec les variables posées", () => {
  assert.equal(demoEnabled(), true);
});

test("démo : la session pilote-local est reconnue", async () => {
  const ctx = await getSessionContext();

  assert.ok(ctx, "la session de démonstration doit être reconnue");
  assert.equal(ctx.mode, "pilote-local");
  assert.equal(ctx.nom, compte.nom);
  assert.equal(ctx.role, "proprietaire");
});

test("démo : la moindre RPC de licence ou lecture utilisateurs est absente", async () => {
  appels.length = 0;
  const ctx = await getSessionContext();
  assert.ok(ctx);

  assert.deepEqual(
    appels.filter((a) => a.startsWith("rpc:")),
    [],
    `aucune RPC attendue en démo, obtenu ${JSON.stringify(appels)}`,
  );
  assert.deepEqual(
    appels.filter((a) => a === "from:utilisateurs"),
    [],
    "la démo ne doit pas lire la table utilisateurs",
  );
});

test("démo : allowLocked est sans objet et ne casse rien", async () => {
  const ctx = await getSessionContext({ allowLocked: true });
  assert.ok(ctx);
  assert.equal(ctx.mode, "pilote-local");
});
