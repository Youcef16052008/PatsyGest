// Deux séries SQL portent les numéros 24–31. Les migrations de main sont
// exercées séparément en fixtures, avant la série sécurité : le tri lexical du
// répertoire fusionné n'est PAS un ordre de déploiement valide.
const migrationsMain = new Set([
  '24-index-exploitation.sql', '25-domaines-boutiques.sql', '26-vitrine-publique.sql',
  '27-commandes-vitrine.sql', '28-fermeture-anon.sql', '29-fermeture-public-fonctions.sql',
  '30-edition-vitrine-rpc.sql', '31-publication-vitrine.sql',
]);
export function migrationSecurite(name) {
  return /^\d\d-.*\.sql$/.test(name) && !name.startsWith('02-') && !migrationsMain.has(name);
}
