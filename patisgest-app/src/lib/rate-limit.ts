/**
 * Limiteur de débit en mémoire bornée (fenêtre glissante) et sémaphore de
 * concurrence pour protéger les surfaces sensibles (`/master`, inscription
 * publique, OCR Tesseract WASM).
 *
 * En hébergement serverless multi-instances, ce mécanisme constitue une
 * première ligne de défense par instance qui bloque les rafales locales ;
 * il se combine avec les limites d'infrastructure (WAF/edge) et les gardes SQL.
 */

export interface RateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
  maxKeys?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts));
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const maxKeys = Math.max(100, Math.floor(options.maxKeys ?? 5_000));
  const buckets = new Map<string, number[]>();

  function prune(now: number) {
    const cutoff = now - windowMs;
    for (const [k, stamps] of buckets) {
      const kept = stamps.filter((t) => t > cutoff);
      if (kept.length === 0) buckets.delete(k);
      else buckets.set(k, kept);
    }
    while (buckets.size > maxKeys) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
  }

  function check(key: string, now = Date.now()): RateLimitDecision {
    const cutoff = now - windowMs;
    const prev = buckets.get(key) ?? [];
    const recent = prev.filter((t) => t > cutoff);
    if (recent.length >= maxAttempts) {
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1_000, oldest + windowMs - now),
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, maxAttempts - recent.length),
      retryAfterMs: 0,
    };
  }

  function consume(key: string, now = Date.now()): RateLimitDecision {
    if (buckets.size >= maxKeys) prune(now);
    const cutoff = now - windowMs;
    const prev = buckets.get(key) ?? [];
    const recent = prev.filter((t) => t > cutoff);
    if (recent.length >= maxAttempts) {
      const oldest = recent[0] ?? now;
      buckets.set(key, recent);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1_000, oldest + windowMs - now),
      };
    }
    recent.push(now);
    buckets.set(key, recent);
    return {
      allowed: true,
      remaining: Math.max(0, maxAttempts - recent.length),
      retryAfterMs: 0,
    };
  }

  function reset(key: string) {
    buckets.delete(key);
  }

  function clear() {
    buckets.clear();
  }

  return { check, consume, reset, clear };
}

export function createConcurrencySemaphore(maxConcurrent: number) {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  let active = 0;

  return {
    tryAcquire(): (() => void) | null {
      if (active >= limit) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
      };
    },
    inFlight(): number {
      return active;
    },
  };
}

export function extractClientIpFromHeaders(headersLike: { get(name: string): string | null }): string {
  const forwarded = headersLike.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = headersLike.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}
