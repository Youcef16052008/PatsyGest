// Harness de test d'exécution : session et client Supabase factices.
//
// Les actions importent `next/*`, non résolvable en Node pur (le paquet `next`
// n'a pas de map `exports`) : le hook `tests/mocks/register-hooks.mjs` fournit
// des stubs. Ce module remplace ensuite `getSessionContext` et `createClient`
// pour exécuter les actions avec une session et un client factices, et savoir
// si la base a été appelée ou non.
import { mock } from 'node:test';
import * as permissions from '../src/lib/permissions.ts';

const authUrl = new URL('../src/lib/auth.ts', import.meta.url).href;
const serverUrl = new URL('../src/lib/supabase/server.ts', import.meta.url).href;

/** Contexte de session factice. */
export function session({
  role = 'proprietaire',
  clientId = '11111111-1111-4111-8111-111111111111',
  mode = 'supabase',
} = {}) {
  return {
    authUserId: 'auth-1',
    email: 'test@example.test',
    nom: 'Test',
    utilisateurId: 'ut-1',
    clientId,
    clientNom: 'Atelier Test',
    role,
    mode,
  };
}

let etat = { session: null, client: null };

// Enregistrés une fois : les actions lisent l'état courant au moment de l'appel.
mock.module(authUrl, {
  // `namedExports` : supporté par Node 22 (CI) comme par Node 26 (local) ;
  // `exports` est plus récent mais absent de Node 22.
  namedExports: {
    ...permissions,
    getSessionContext: async () => etat.session,
  },
});
mock.module(serverUrl, {
  namedExports: { createClient: async () => etat.client },
});

/** Positionne la session et le client du prochain appel. */
export function installer({ session: ctx, client }) {
  etat = { session: ctx, client };
}

/**
 * Faux client Supabase : enregistre chaque appel et résout `{ data, error }`.
 * Tous les builders (select/eq/limit/insert/upsert/…) renvoient le client et
 * sont alorsables, comme la vraie API Supabase JS.
 */
export function fauxClient({ data = null, error = null, rpc: resolue } = {}) {
  const appels = [];
  // Seul le builder de requête est thenable (`await supabase.from(…).select(…)`)
  // ; le client lui-même ne l'est pas, sinon `await createClient()` le déballerait.
  const builder = () => {
    const b = {
      then(fait) {
        return Promise.resolve({ data, error }).then(fait);
      },
    };
    return new Proxy(b, {
      get(cible, prop) {
        if (prop in cible) return cible[prop];
        return (...args) => {
          appels.push({ op: String(prop), args });
          return cible;
        };
      },
    });
  };
  return {
    appels,
    from(table) {
      appels.push({ op: 'from', table });
      return builder();
    },
    rpc(nom, args) {
      appels.push({ op: 'rpc', nom, args });
      if (typeof resolue === 'function') return Promise.resolve(resolue(nom, args));
      return Promise.resolve({ data, error });
    },
  };
}
