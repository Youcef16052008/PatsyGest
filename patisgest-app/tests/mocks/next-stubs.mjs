// Stubs des modules Next.js utilisés hors du rendu.
// `next/package.json` n'a pas de map `exports` : Node (ESM pur) ne résout pas
// `next/cache`, `next/headers`, `next/navigation`. Le hook ci-dessous redirige
// ces specifiers vers ce module pendant les tests.
export function revalidatePath() {}
export async function cookies() {
  return { get: () => undefined, getAll: () => [], set: () => {} };
}
export async function headers() {
  return new Headers();
}
export function redirect() {
  throw new Error('redirect');
}

// `NextResponse` doit être constructible : les routes CSV font
// `new NextResponse(csv, init)`, tandis que les routes JSON appellent
// `NextResponse.json(...)`. `ReponseSimulee` garde l'ancienne forme de test.
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

export class NextResponse extends Response {
  static json(corps, init) {
    const entetes = new Headers(init?.headers ?? {});
    if (!entetes.has('content-type')) entetes.set('content-type', 'application/json');
    return new ReponseSimulee(corps, { ...init, headers: entetes });
  }
}
