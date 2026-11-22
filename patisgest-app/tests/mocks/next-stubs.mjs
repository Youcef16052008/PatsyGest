// Stubs des modules Next.js utilisés hors du rendu.
// `next/package.json` n'a pas de map `exports` : Node (ESM pur) ne résout pas
// `next/cache`, `next/headers`, `next/navigation`. Le hook ci-dessous redirige
// ces specifiers vers ce module pendant les tests.
export function revalidatePath() {}
export async function cookies() {
  return { get: () => undefined, getAll: () => [], set: () => {} };
}
export function redirect() {
  throw new Error('redirect');
}
