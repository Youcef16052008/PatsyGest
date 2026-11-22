// Hooks de résolution pour les tests d'exécution (Node >= 22.15).
// Enregistré via `node --import ./tests/mocks/register-hooks.mjs`.
//
// Deux besoins :
//  - `next/cache`, `next/headers`, `next/navigation` : le paquet `next` n'a
//    pas de map `exports`, Node ne les résout pas hors du bundler ;
//  - les imports relatifs sans extension (`./auth`) : Node ne ajoute pas `.ts`.
import { registerHooks } from 'node:module';

const stubs = new URL('./next-stubs.mjs', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/cache' || specifier === 'next/headers' || specifier === 'next/navigation') {
      return { url: stubs, shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (erreur) {
      const relatif = specifier.startsWith('./') || specifier.startsWith('../');
      if (relatif && !/\.(ts|tsx|mjs|js|json)$/i.test(specifier)) {
        for (const ext of ['.ts', '.tsx']) {
          try { return nextResolve(specifier + ext, context); } catch { /* essai suivant */ }
        }
      }
      throw erreur;
    }
  },
});
