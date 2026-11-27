// Reconstitution explicitement figée pour les tests, pas pour production.
// Les brouillons 101–128 sont distincts de la série main 24–31.
// Ne jamais trier le répertoire entier pour déployer en production.
import { readFileSync } from 'node:fs';
const plan = JSON.parse(readFileSync(new URL('../migrations/repetition.json', import.meta.url), 'utf8'));
const sequence = [...plan.historique, ...plan.brouillons_securite].map(x => x.file);
// Un tri lexical mélangerait les 101–127 avec les 10–19 : suivre le manifeste.
export function migrationsRepetition() { return [...sequence]; }

// F-12 : les brouillons vivent dans supabase/brouillons/. Un seul point de résolution.
const brouillonsSet = new Set(plan.brouillons_securite.map(x => x.file));
/** Chemin relatif à supabase/ : 'brouillons/…' pour les brouillons, '' sinon. */
export function cheminMigration(file) { return (brouillonsSet.has(file) ? 'brouillons/' : '') + file; }
/** Liste de tous les .sql du dossier supabase, brouillons inclus (chemins relatifs à supabase/). */
export function tousLesSql(readdirSync) {
  return [...readdirSync('supabase').filter(f => f.endsWith('.sql')), ...readdirSync('supabase/brouillons').filter(f => f.endsWith('.sql')).map(f => 'brouillons/' + f)];
}

/**
 * Chaîne de déploiement principale : historique 01–23 puis série main 24–57 (hors seed).
 * Les brouillons 101–128 n'en font pas partie (statut « pas un ordre de déploiement »).
 */
export function chaineDeploiement() {
  const mains = plan.main_hors_serie.map(x => x.file).sort();
  return [...plan.historique.map(x => x.file), ...mains];
}
