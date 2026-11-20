// Reconstitution explicitement figée pour les tests, pas pour production.
// Les deux séries 24–31 sont distinctes ; ne jamais trier le répertoire entier.
import { readFileSync } from 'node:fs';
const plan = JSON.parse(readFileSync(new URL('../migrations/repetition.json', import.meta.url), 'utf8'));
const sequence = [...plan.historique, ...plan.brouillons_securite].map(x => x.file);
const names = new Set(sequence);
export function migrationSecurite(name) { return names.has(name); }
