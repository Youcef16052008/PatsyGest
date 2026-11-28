import { createECDH, createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export const TRIAL_DURATION_MIN_DAYS = 60;
export const TRIAL_DURATION_MAX_DAYS = 90;
export const TRIAL_DURATION_DEFAULT_DAYS = 90;

export type SubscriptionStatus = "essai" | "paye" | "suspendu";

export interface TrialLicensePayload {
  clientId: string;
  clientNom: string;
  statut: SubscriptionStatus;
  trialDays: number;
  startedAtMs: number;
  expiresAtMs: number;
  issuedAtMs: number;
  licenseVersion: number;
}

export function clampTrialDays(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return TRIAL_DURATION_DEFAULT_DAYS;
  return Math.min(TRIAL_DURATION_MAX_DAYS, Math.max(TRIAL_DURATION_MIN_DAYS, Math.round(num)));
}

/** Graine de développement, volontairement publique : JAMAIS utilisée en production. */
const DEV_FALLBACK_SEED = "patisgest-ephemeral-dev-seed-change-in-production";

/** Vrai pour un déploiement de production, y compris après promotion d'un build Vercel. */
function environnementProduction(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

/**
 * Une clé de licence signée avec la graine publique du dépôt serait falsifiable
 * par n'importe quel lecteur du code. En production, on échoue donc fermé si
 * aucune clé privée/JWK ni aucun secret serveur n'est configuré. Le repli
 * public reste disponible hors production pour les tests et la démo locale.
 */
function serverSeed(): string {
  const secret =
    process.env.PATISGEST_LICENSE_PRIVATE_KEY ||
    process.env.PATISGEST_MASTER_KEY ||
    process.env.VITRINE_SECRET_ANTI_ABUS ||
    process.env.PATISGEST_DEMO_SECRET;
  if (secret) return secret;
  if (environnementProduction()) {
    throw new Error(
      "Clé de licence absente en production : définir PATISGEST_LICENSE_PRIVATE_JWK ou PATISGEST_LICENSE_PRIVATE_KEY.",
    );
  }
  return DEV_FALLBACK_SEED;
}

type EcJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  d?: string;
};

let cachedKeys: { seedKey: string; privateJwk: EcJwk; publicJwk: EcJwk } | null = null;

function deriveDeterministicP256Jwk(seed: string): { privateJwk: EcJwk; publicJwk: EcJwk } {
  for (let counter = 0; counter < 16; counter++) {
    const d = createHash("sha256").update(`patisgest-p256-v1:${counter}:${seed}`).digest();
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(d);
      const uncompressed = ecdh.getPublicKey();
      if (uncompressed.length === 65 && uncompressed[0] === 0x04) {
        const x = uncompressed.subarray(1, 33).toString("base64url");
        const y = uncompressed.subarray(33, 65).toString("base64url");
        const dB64 = d.toString("base64url");
        const publicJwk: EcJwk = { kty: "EC", crv: "P-256", x, y };
        const privateJwk: EcJwk = { ...publicJwk, d: dB64 };
        return { privateJwk, publicJwk };
      }
    } catch {
      // Retry with next counter if scalar out of curve order.
    }
  }
  throw new Error("Impossible de dériver la clé de licence ECDSA P-256.");
}

export function getLicenseKeyPair(): { privateJwk: EcJwk; publicJwk: EcJwk } {
  const jwkEnv = process.env.PATISGEST_LICENSE_PRIVATE_JWK?.trim();
  const keyTag = jwkEnv ? `jwk:${jwkEnv}` : `seed:${serverSeed()}`;
  if (cachedKeys && cachedKeys.seedKey === keyTag) {
    return { privateJwk: cachedKeys.privateJwk, publicJwk: cachedKeys.publicJwk };
  }
  if (jwkEnv) {
    let parsed: Partial<EcJwk>;
    try {
      parsed = JSON.parse(jwkEnv) as Partial<EcJwk>;
    } catch {
      throw new Error("PATISGEST_LICENSE_PRIVATE_JWK invalide (JSON mal formé).");
    }
    if (
      parsed &&
      parsed.kty === "EC" &&
      parsed.crv === "P-256" &&
      typeof parsed.x === "string" && parsed.x.length > 0 &&
      typeof parsed.y === "string" && parsed.y.length > 0 &&
      typeof parsed.d === "string" && parsed.d.length > 0
    ) {
      const privateJwk: EcJwk = { kty: "EC", crv: "P-256", x: parsed.x, y: parsed.y, d: parsed.d };
      const publicJwk: EcJwk = { kty: "EC", crv: "P-256", x: parsed.x, y: parsed.y };
      cachedKeys = { seedKey: keyTag, privateJwk, publicJwk };
      return { privateJwk, publicJwk };
    }
    throw new Error("PATISGEST_LICENSE_PRIVATE_JWK incomplet (champs EC P-256 x, y, d requis).");
  }
  const derived = deriveDeterministicP256Jwk(serverSeed());
  cachedKeys = { seedKey: keyTag, ...derived };
  return derived;
}

export function signTrialLicense(payload: TrialLicensePayload): { token: string; publicJwk: EcJwk } {
  const { privateJwk, publicJwk } = getLicenseKeyPair();
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const privateKey = createPrivateKey({ key: privateJwk, format: "jwk" });
  const signature = sign("SHA256", Buffer.from(body, "utf8"), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return { token: `${body}.${signature}`, publicJwk };
}

export function verifyTrialLicenseServer(token: string): TrialLicensePayload | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const { publicJwk } = getLicenseKeyPair();
    const publicKey = createPublicKey({ key: publicJwk, format: "jwk" });
    const ok = verify(
      "SHA256",
      Buffer.from(body, "utf8"),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(sig, "base64url"),
    );
    if (!ok) return null;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TrialLicensePayload;
    if (!parsed || typeof parsed.clientId !== "string" || typeof parsed.expiresAtMs !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}
