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
    if (
      specifier === 'next/cache' ||
      specifier === 'next/headers' ||
      specifier === 'next/navigation' ||
      // `next/server` n'est pas résolvable hors bundler non plus : les tests
      // de routes (ex. /api/health) l'importent pour `NextResponse`.
      specifier === 'next/server'
    ) {
      return { url: stubs, shortCircuit: true };
    }
    // `server-only` est une garde de bundler (elle n'existe que pour faire
    // échouer un import côté client). Dans un test Node, elle n'a pas de paquet
    // installé : on la neutralise explicitement plutôt que d'installer une
    // dépendance factice qui masquerait un vrai import client par erreur.
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default undefined;', shortCircuit: true };
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
