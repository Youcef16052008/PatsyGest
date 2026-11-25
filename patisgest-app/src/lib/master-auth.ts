import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const MASTER_COOKIE_NAME = "patisgest_master_session";

function masterEmail(): string {
  return (process.env.PATISGEST_MASTER_EMAIL ?? "").trim().toLowerCase();
}

function masterKey(): string {
  return process.env.PATISGEST_MASTER_KEY ?? "";
}

export function isMasterConfigured(): boolean {
  return masterEmail().length >= 3 && masterKey().length >= 16;
}

function safeEqualText(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyMasterCredentials(email: string, key: string): boolean {
  if (!isMasterConfigured()) return false;
  const emailOk = safeEqualText(email.trim().toLowerCase(), masterEmail());
  const keyOk = safeEqualText(key, masterKey());
  return emailOk && keyOk;
}

function signCookiePayload(payload: string): string {
  return createHmac("sha256", masterKey()).update(payload).digest("hex");
}

export async function createMasterSessionCookie(email: string): Promise<void> {
  const payload = Buffer.from(
    JSON.stringify({ email: email.trim().toLowerCase(), expires: Date.now() + 12 * 3600_000 }),
    "utf8",
  ).toString("base64url");
  const signature = signCookiePayload(payload);
  (await cookies()).set(MASTER_COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearMasterSessionCookie(): Promise<void> {
  (await cookies()).delete(MASTER_COOKIE_NAME);
}

export async function getMasterSession(): Promise<{ email: string } | null> {
  if (!isMasterConfigured()) return null;
  const raw = (await cookies()).get(MASTER_COOKIE_NAME)?.value;
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = signCookiePayload(payload);
  if (!safeEqualText(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      expires?: number;
    };
    if (
      parsed &&
      typeof parsed.email === "string" &&
      safeEqualText(parsed.email.toLowerCase(), masterEmail()) &&
      typeof parsed.expires === "number" &&
      parsed.expires > Date.now()
    ) {
      return { email: parsed.email };
    }
  } catch {
    /* invalid cookie */
  }
  return null;
}

export async function requireMasterSession(): Promise<{ email: string }> {
  const session = await getMasterSession();
  if (!session) redirect("/master");
  return session;
}
