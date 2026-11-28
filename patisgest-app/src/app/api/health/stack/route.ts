import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Sonde de certification de la pile HÉBERGÉE. Protégée par le secret CRON déjà
 * configuré : elle ne révèle ni clé, ni jeton, ni corps de réponse Supabase,
 * seulement des statuts et des booléens. Un 200 signifie que l'application de
 * production a pu joindre Auth, PostgREST et Storage avec ses variables
 * existantes ; ce n'est pas une sonde publique.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTETE_NO_STORE = { "Cache-Control": "no-store" };

type ReponseSonde = { status: number; json: unknown };

type Controle = {
  ok: boolean;
  status: number;
  detail?: string | number | boolean;
};

function secretValide(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || secret.length < 12) return false;
  const auth = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  const candidat = auth.startsWith("Bearer ") ? auth.slice(7).trim() : headerSecret.trim();
  if (!candidat) return false;
  const a = Buffer.from(candidat, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function sonder(url: string, headers: Record<string, string>): Promise<ReponseSonde> {
  try {
    const reponse = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const brut = await reponse.text();
    let json: unknown = null;
    try {
      json = JSON.parse(brut);
    } catch {
      json = null;
    }
    return { status: reponse.status, json };
  } catch {
    return { status: 0, json: null };
  }
}

function objet(json: unknown): Record<string, unknown> {
  return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
}

async function handle(request: Request) {
  if (!secretValide(request)) {
    return NextResponse.json(
      { ok: false, erreur: "Non autorisé." },
      { status: 401, headers: ENTETE_NO_STORE },
    );
  }

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!base || !anon || !service) {
    return NextResponse.json(
      { ok: false, checks: { configuration: { ok: false, status: 0 } } },
      { status: 503, headers: ENTETE_NO_STORE },
    );
  }

  const auth = await sonder(`${base}/auth/v1/health`, {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    Accept: "application/json",
  });

  const postgrest = await sonder(
    `${base}/rest/v1/app_schema_version?select=version&id=eq.1`,
    {
      apikey: service,
      Authorization: `Bearer ${service}`,
      Accept: "application/json",
    },
  );
  const lignesPostgrest = Array.isArray(postgrest.json) ? postgrest.json : [];
  const premiereLigne = objet(lignesPostgrest[0]);
  const version = Number(premiereLigne.version);

  const storage = await sonder(`${base}/storage/v1/bucket/patsygest-ocr`, {
    apikey: service,
    Authorization: `Bearer ${service}`,
    Accept: "application/json",
  });
  const bucket = objet(storage.json);

  const checks: Record<string, Controle> = {
    application: { ok: true, status: 200 },
    auth: { ok: auth.status === 200, status: auth.status },
    postgrest: {
      ok: postgrest.status === 200 && Number.isFinite(version) && version >= 57,
      status: postgrest.status,
      detail: Number.isFinite(version) ? version : "version-inconnue",
    },
    storage: {
      ok:
        storage.status === 200 &&
        bucket.id === "patsygest-ocr" &&
        bucket.public === false,
      status: storage.status,
      detail: bucket.public === false ? "prive" : "non-prive",
    },
  };

  const ok = Object.values(checks).every((controle) => controle.ok);
  return NextResponse.json(
    {
      ok,
      service: "patisgest",
      scope: "production-hosted",
      checks,
      ts: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: ENTETE_NO_STORE },
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
