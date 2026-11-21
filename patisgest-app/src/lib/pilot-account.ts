/** Recherche d'un compte pilote par clé propre, sans hériter des propriétés d'objet. */
export function comptePilotePropre<T>(
  comptes: Readonly<Record<string, T>>,
  identifiant: string,
): T | null {
  return Object.hasOwn(comptes, identifiant) ? comptes[identifiant] : null;
}
