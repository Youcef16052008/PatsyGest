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

// `next/server` — suffisant pour tester une route GET sans runtime Next.
class ReponseSimulee {
  constructor(corps, init = {}) {
    this._corps = corps;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers ?? {});
  }
  async json() {
    return typeof this._corps === 'string' ? JSON.parse(this._corps) : this._corps;
  }
  async text() {
    return typeof this._corps === 'string' ? this._corps : JSON.stringify(this._corps);
  }
}
export const NextResponse = {
  json(corps, init) {
    const entetes = new Headers(init?.headers ?? {});
    if (!entetes.has('content-type')) entetes.set('content-type', 'application/json');
    return new ReponseSimulee(corps, { ...init, headers: entetes });
  },
};
