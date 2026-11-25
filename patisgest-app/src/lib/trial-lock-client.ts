"use client";

export type TrialLockReason = "expired" | "clock_rollback" | "suspended";

export interface TrialLicensePayloadClient {
  clientId: string;
  clientNom: string;
  statut: "essai" | "paye" | "suspendu";
  trialDays: number;
  startedAtMs: number;
  expiresAtMs: number;
  issuedAtMs: number;
  licenseVersion: number;
}

export interface TrialAnchorRecord {
  scopeId: string;
  firstSeenMs: number;
  lastSeenMs: number;
  trialDays: number;
  expiresAtMs: number;
  licenseVersion: number;
  statut: "essai" | "paye" | "suspendu";
  lockedPermanent: boolean;
  lockReason: TrialLockReason | null;
  clientNom: string;
  token: string | null;
  publicJwk: JsonWebKey | null;
}

export interface ServerLicenseBundle {
  token: string;
  publicJwk: JsonWebKey;
  payload: TrialLicensePayloadClient;
}

const DAY_MS = 86_400_000;
export const CLOCK_ROLLBACK_TOLERANCE_MS = 15 * 60_000;
const LS_PREFIX = "patisgest.trial_anchor.v1.";
const DEVICE_BOOT_KEY = "patisgest.device_boot.v1";
const IDB_NAME = "patisgest_licence_db";
const IDB_STORE = "anchors";
const CACHE_NAME = "patisgest-licence-v1";

function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 90;
  return Math.min(90, Math.max(60, Math.round(days)));
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function verifyTrialLicenseWebCrypto(
  token: string,
  publicJwk: JsonWebKey,
): Promise<TrialLicensePayloadClient | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const sigBytes = base64UrlToBytes(sig);
    const bodyBytes = new TextEncoder().encode(body);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sigBytes.buffer as ArrayBuffer,
      bodyBytes,
    );
    if (!ok) return null;
    const decoded = new TextDecoder().decode(base64UrlToBytes(body));
    const payload = JSON.parse(decoded) as TrialLicensePayloadClient;
    if (!payload || typeof payload.clientId !== "string" || typeof payload.expiresAtMs !== "number") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function createInitialAnchor(
  scopeId: string,
  nowMs: number = Date.now(),
  trialDays: number = 90,
  clientNom: string = "Votre établissement",
): TrialAnchorRecord {
  const days = clampDays(trialDays);
  return {
    scopeId,
    firstSeenMs: nowMs,
    lastSeenMs: nowMs,
    trialDays: days,
    expiresAtMs: nowMs + days * DAY_MS,
    licenseVersion: 1,
    statut: "essai",
    lockedPermanent: false,
    lockReason: null,
    clientNom,
    token: null,
    publicJwk: null,
  };
}

/**
 * Fusionne plusieurs copies de l'ancre (localStorage, IndexedDB, CacheStorage)
 * en conservant toujours l'état le plus strict afin qu'aucune suppression
 * partielle d'un stockage navigateur ne puisse réinitialiser l'essai.
 */
export function mergeAnchorsStrictest(records: (TrialAnchorRecord | null | undefined)[]): TrialAnchorRecord | null {
  const valid = records.filter((r): r is TrialAnchorRecord => Boolean(r && typeof r.firstSeenMs === "number"));
  if (valid.length === 0) return null;

  // Trier par version de licence décroissante pour repérer si un jeton plus récent (ex: paye) existe.
  const sortedByVersion = [...valid].sort((a, b) => b.licenseVersion - a.licenseVersion);
  const newest = sortedByVersion[0];
  const anyPaidSameOrHigher = valid.find(
    (r) => r.statut === "paye" && r.licenseVersion >= newest.licenseVersion,
  );

  const firstSeenMs = Math.min(...valid.map((r) => r.firstSeenMs));
  const lastSeenMs = Math.max(...valid.map((r) => r.lastSeenMs));
  const lockedRecord = valid.find((r) => r.lockedPermanent);
  const pinnedJwk = valid.find((r) => r.publicJwk)?.publicJwk ?? null;

  if (anyPaidSameOrHigher && !valid.some((r) => r.lockReason === "suspended" && r.licenseVersion >= anyPaidSameOrHigher.licenseVersion)) {
    return {
      ...anyPaidSameOrHigher,
      firstSeenMs,
      lastSeenMs,
      lockedPermanent: false,
      lockReason: null,
      publicJwk: anyPaidSameOrHigher.publicJwk ?? pinnedJwk,
    };
  }

  // En mode essai, prendre la date d'expiration la plus restrictive à version égale.
  const sameVer = valid.filter((r) => r.licenseVersion === newest.licenseVersion);
  const minExpiresAt = Math.min(...sameVer.map((r) => r.expiresAtMs));
  const anyRollback = valid.find((r) => r.lockReason === "clock_rollback");
  const anySuspended = sameVer.find((r) => r.statut === "suspendu" || r.lockReason === "suspended");

  return {
    ...newest,
    firstSeenMs,
    lastSeenMs,
    expiresAtMs: minExpiresAt,
    publicJwk: newest.publicJwk ?? pinnedJwk,
    lockedPermanent: Boolean(anyRollback || anySuspended || lockedRecord),
    lockReason: anySuspended
      ? "suspended"
      : anyRollback
        ? "clock_rollback"
        : lockedRecord?.lockReason ?? null,
  };
}

/**
 * Évaluation pure de l'ancre avec horloge monotone et détection de recul d'horloge.
 */
export function evaluateTrialAnchor(
  anchor: TrialAnchorRecord,
  nowMs: number = Date.now(),
  perfDeltaMs: number = 0,
): { anchor: TrialAnchorRecord; locked: boolean; daysRemaining: number } {
  const next: TrialAnchorRecord = { ...anchor };

  // Si un recul d'horloge significatif (> 15 min) est détecté alors que le compte
  // n'est pas déjà payé, verrouiller définitivement contre le contournement offline.
  if (next.statut !== "paye" && nowMs < next.lastSeenMs - CLOCK_ROLLBACK_TOLERANCE_MS) {
    next.lockedPermanent = true;
    next.lockReason = "clock_rollback";
  }

  const monotonicCandidate = Math.max(nowMs, next.lastSeenMs + Math.max(0, perfDeltaMs));
  next.lastSeenMs = Math.max(next.lastSeenMs, monotonicCandidate);

  if (next.statut === "suspendu") {
    next.lockedPermanent = true;
    next.lockReason = "suspended";
  } else if (next.statut === "paye") {
    // Un compte marqué payé avec licence valide reste actif (sauf si révoqué serveur).
    next.lockedPermanent = false;
    next.lockReason = null;
  } else if (next.lastSeenMs >= next.expiresAtMs) {
    next.lockedPermanent = true;
    if (!next.lockReason) next.lockReason = "expired";
  }

  const remainingMs = Math.max(0, next.expiresAtMs - next.lastSeenMs);
  const daysRemaining = next.statut === "paye" ? 999 : Math.ceil(remainingMs / DAY_MS);

  return {
    anchor: next,
    locked: next.lockedPermanent,
    daysRemaining,
  };
}

function readFromLocalStorage(key: string): TrialAnchorRecord | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as TrialAnchorRecord;
  } catch {
    return null;
  }
}

function writeToLocalStorage(key: string, record: TrialAnchorRecord): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(record));
  } catch {
    /* quota or private mode */
  }
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readFromIdb(key: string): Promise<TrialAnchorRecord | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as TrialAnchorRecord) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeToIdb(key: string, record: TrialAnchorRecord): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(record, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function readFromCacheStorage(key: string): Promise<TrialAnchorRecord | null> {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(`/_patisgest_anchor/${encodeURIComponent(key)}`);
    if (!res) return null;
    return (await res.json()) as TrialAnchorRecord;
  } catch {
    return null;
  }
}

async function writeToCacheStorage(key: string, record: TrialAnchorRecord): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      `/_patisgest_anchor/${encodeURIComponent(key)}`,
      new Response(JSON.stringify(record), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }),
    );
  } catch {
    /* ignore */
  }
}

export async function readAnchorAllStores(scopeId: string): Promise<TrialAnchorRecord | null> {
  const lsKey = `${LS_PREFIX}${scopeId}`;
  const [ls, idb, cs] = await Promise.all([
    Promise.resolve(readFromLocalStorage(lsKey)),
    readFromIdb(scopeId),
    readFromCacheStorage(scopeId),
  ]);
  return mergeAnchorsStrictest([ls, idb, cs]);
}

export async function writeAnchorAllStores(scopeId: string, record: TrialAnchorRecord): Promise<void> {
  const lsKey = `${LS_PREFIX}${scopeId}`;
  writeToLocalStorage(lsKey, record);
  await Promise.all([writeToIdb(scopeId, record), writeToCacheStorage(scopeId, record)]);
}

/**
 * Synchronise l'ancre locale multi-stockages avec un éventuel jeton signé du serveur.
 * Si le serveur n'est jamais atteint, l'ancre locale initialise un essai de 90 jours
 * dès le premier démarrage sur l'appareil et le verrouille définitivement après expiration
 * ou recul d'horloge.
 */
export async function syncTrialAnchorMultiStore(
  scopeId: string,
  serverBundle: ServerLicenseBundle | null = null,
  nowMs: number = Date.now(),
  perfDeltaMs: number = 0,
): Promise<{ anchor: TrialAnchorRecord; locked: boolean; daysRemaining: number }> {
  const existing = await readAnchorAllStores(scopeId);
  const deviceBoot = await readAnchorAllStores(DEVICE_BOOT_KEY);

  let base = existing ?? createInitialAnchor(scopeId, deviceBoot?.firstSeenMs ?? nowMs, 90);
  if (deviceBoot && deviceBoot.lastSeenMs > base.lastSeenMs) {
    base = { ...base, lastSeenMs: deviceBoot.lastSeenMs };
  }

  if (serverBundle) {
    const trustedJwk = existing?.publicJwk ?? serverBundle.publicJwk;
    const verified = await verifyTrialLicenseWebCrypto(serverBundle.token, trustedJwk);
    if (verified && verified.clientId === scopeId) {
      const serverNewerOrUnlock =
        verified.statut === "paye" ||
        verified.statut === "suspendu" ||
        verified.licenseVersion > base.licenseVersion ||
        !base.lockedPermanent;

      if (serverNewerOrUnlock) {
        base = {
          ...base,
          clientNom: verified.clientNom || base.clientNom,
          trialDays: clampDays(verified.trialDays),
          firstSeenMs: Math.min(base.firstSeenMs, verified.startedAtMs),
          lastSeenMs: Math.max(base.lastSeenMs, verified.issuedAtMs, nowMs),
          expiresAtMs: verified.expiresAtMs,
          licenseVersion: Math.max(base.licenseVersion, verified.licenseVersion),
          statut: verified.statut,
          lockedPermanent: verified.statut === "suspendu" ? true : verified.statut === "paye" ? false : base.lockedPermanent,
          lockReason: verified.statut === "suspendu" ? "suspended" : verified.statut === "paye" ? null : base.lockReason,
          token: serverBundle.token,
          publicJwk: trustedJwk,
        };
        // Si le Master a prolongé la durée d'essai (licenseVersion augmentée et nouvelle échéance future), déverrouiller.
        if (
          verified.statut === "essai" &&
          verified.licenseVersion > (existing?.licenseVersion ?? 0) &&
          verified.expiresAtMs > Math.max(nowMs, base.lastSeenMs)
        ) {
          base.lockedPermanent = false;
          base.lockReason = null;
        }
      }
    }
  }

  const evaluated = evaluateTrialAnchor(base, nowMs, perfDeltaMs);
  await writeAnchorAllStores(scopeId, evaluated.anchor);

  // Maintenir l'ancre globale de l'appareil pour résister aux suppressions de session/scope.
  const nextDeviceBoot: TrialAnchorRecord = {
    ...(deviceBoot ?? createInitialAnchor(DEVICE_BOOT_KEY, evaluated.anchor.firstSeenMs, 90, "Appareil")),
    firstSeenMs: Math.min(deviceBoot?.firstSeenMs ?? evaluated.anchor.firstSeenMs, evaluated.anchor.firstSeenMs),
    lastSeenMs: Math.max(deviceBoot?.lastSeenMs ?? 0, evaluated.anchor.lastSeenMs),
    lockedPermanent: Boolean(deviceBoot?.lockedPermanent || (evaluated.anchor.lockReason === "clock_rollback")),
    lockReason: evaluated.anchor.lockReason === "clock_rollback" ? "clock_rollback" : deviceBoot?.lockReason ?? null,
  };
  await writeAnchorAllStores(DEVICE_BOOT_KEY, nextDeviceBoot);

  return evaluated;
}
