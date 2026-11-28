#!/usr/bin/env node
/**
 * Chantier #6 — Observabilité planifiée des sondes `/api/health` et `/api/health/stack`.
 *
 * Vérifie :
 *   1. `GET /api/health` (200, ok=true, Cache-Control: no-store, latence)
 *   2. `GET /api/health/stack` sans secret (401/503 : jamais ouverte)
 *   3. `GET /api/health/stack` avec `x-cron-secret` (200, ok=true, Auth/PostgREST/Storage, schéma >= attendu, bucket privé)
 *   4. Pages publiques clés (`/connexion`, `/estimation`) (200)
 *
 * En cas d'échec : envoie une alerte webhook optionnelle (sans jamais journaliser de secret)
 * et termine en code de sortie 1 afin que GitHub Actions déclenche la notification d'incident.
 */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TIMEOUT_MS = 15_000;

function objet(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val) ? val : {};
}

async function mesurerRequete(cible, headers = {}, fetchImpl = globalThis.fetch) {
  const debut = performance.now();
  try {
    const res = await fetchImpl(cible, {
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texte = await res.text();
    const dureeMs = Math.round(performance.now() - debut);
    let json = null;
    try {
      json = JSON.parse(texte);
    } catch {
      json = null;
    }
    return {
      status: res.status,
      dureeMs,
      cacheControl: res.headers?.get?.("cache-control") ?? "",
      json,
      erreurReseau: null,
    };
  } catch (err) {
    return {
      status: 0,
      dureeMs: Math.round(performance.now() - debut),
      cacheControl: "",
      json: null,
      erreurReseau: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function verifierSondes({
  baseUrl = "https://patsy-gest.vercel.app",
  cronSecret = "",
  expectedSchema = 57,
  warnMs = 3000,
  skipStack = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const racine = String(baseUrl || "https://patsy-gest.vercel.app").replace(/\/+$/, "");
  const schemaAttendu = Number.isFinite(Number(expectedSchema)) ? Number(expectedSchema) : 57;
  const seuilWarn = Number.isFinite(Number(warnMs)) ? Number(warnMs) : 3000;
  const probes = [];
  const failures = [];
  const warnings = [];

  if (!skipStack && String(cronSecret).length < 12) {
    failures.push("CRON_SECRET absent ou trop court (< 12 caractères).");
  }

  // 1. Sonde process publique
  const health = await mesurerRequete(`${racine}/api/health`, {}, fetchImpl);
  const healthBody = objet(health.json);
  const healthOk = health.status === 200 && healthBody.ok === true;
  const healthNoStore = /no-store/i.test(health.cacheControl);
  if (!healthOk) {
    failures.push(`/api/health en échec (HTTP ${health.status}${health.erreurReseau ? `: ${health.erreurReseau}` : ""})`);
  } else if (!healthNoStore) {
    warnings.push(`/api/health sans Cache-Control: no-store (${health.cacheControl || "absent"})`);
  }
  if (health.dureeMs > seuilWarn) {
    warnings.push(`/api/health lent (${health.dureeMs} ms > ${seuilWarn} ms)`);
  }
  probes.push({
    name: "GET /api/health",
    ok: healthOk,
    status: health.status,
    dureeMs: health.dureeMs,
    detail: healthOk ? `ok=true (${healthBody.service ?? "patisgest"})` : (health.erreurReseau ?? `HTTP ${health.status}`),
  });

  // 2. Contrôle négatif : /api/health/stack ne doit jamais être ouverte sans secret
  const stackUnauth = await mesurerRequete(`${racine}/api/health/stack`, { Accept: "application/json" }, fetchImpl);
  const stackGateOk = stackUnauth.status === 401 || stackUnauth.status === 503;
  if (!stackGateOk) {
    failures.push(`/api/health/stack non protégée sans secret (HTTP ${stackUnauth.status})`);
  }
  probes.push({
    name: "GET /api/health/stack (sans secret)",
    ok: stackGateOk,
    status: stackUnauth.status,
    dureeMs: stackUnauth.dureeMs,
    detail: stackGateOk ? `protégée (HTTP ${stackUnauth.status})` : `EXPOSÉE (HTTP ${stackUnauth.status})`,
  });

  // 3. Sonde pile authentifiée
  if (!skipStack && String(cronSecret).length >= 12) {
    const stack = await mesurerRequete(
      `${racine}/api/health/stack`,
      { "x-cron-secret": cronSecret, Accept: "application/json" },
      fetchImpl,
    );
    const body = objet(stack.json);
    const checks = objet(body.checks);
    const postgrest = objet(checks.postgrest);
    const storage = objet(checks.storage);
    const auth = objet(checks.auth);
    const app = objet(checks.application);
    const version = Number(postgrest.detail);

    const stackOk =
      stack.status === 200 &&
      body.ok === true &&
      app.ok === true &&
      auth.ok === true &&
      postgrest.ok === true &&
      storage.ok === true &&
      Number.isFinite(version) &&
      version >= schemaAttendu &&
      storage.detail === "prive";

    if (!stackOk) {
      const details = ["application", "auth", "postgrest", "storage"]
        .map((k) => `${k}=${objet(checks[k]).ok ? "ok" : `ko(${objet(checks[k]).status ?? "?"})`}`)
        .join(" ");
      failures.push(`/api/health/stack en échec (HTTP ${stack.status} · ${details})`);
    }
    if (stack.dureeMs > seuilWarn) {
      warnings.push(`/api/health/stack lente (${stack.dureeMs} ms > ${seuilWarn} ms)`);
    }
    probes.push({
      name: "GET /api/health/stack (auth)",
      ok: stackOk,
      status: stack.status,
      dureeMs: stack.dureeMs,
      detail: stackOk
        ? `auth=ok postgrest=ok schema=${version} storage=${storage.detail}`
        : (stack.erreurReseau ?? `HTTP ${stack.status} ok=${String(body.ok)}`),
    });
  }

  // 4. Pages publiques critiques
  for (const route of ["/connexion", "/estimation"]) {
    const page = await mesurerRequete(`${racine}${route}`, { Accept: "text/html" }, fetchImpl);
    const pageOk = page.status === 200;
    if (!pageOk) {
      failures.push(`${route} en échec (HTTP ${page.status})`);
    }
    if (page.dureeMs > seuilWarn) {
      warnings.push(`${route} lente (${page.dureeMs} ms > ${seuilWarn} ms)`);
    }
    probes.push({
      name: `GET ${route}`,
      ok: pageOk,
      status: page.status,
      dureeMs: page.dureeMs,
      detail: pageOk ? "HTML 200" : (page.erreurReseau ?? `HTTP ${page.status}`),
    });
  }

  return {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    baseUrl: racine,
    expectedSchema: schemaAttendu,
    probes,
    failures,
    warnings,
  };
}

export function formaterResumeSondes(rapport) {
  const lignes = [
    `## Observabilité sondes PâtisGest — ${rapport.ok ? "OK" : "INCIDENT DÉTECTÉ"}`,
    "",
    `- Cible : \`${rapport.baseUrl}\``,
    `- Vérifié à : \`${rapport.checkedAt}\``,
    `- Statut global : **${rapport.ok ? "PASS" : "FAIL"}**`,
    "",
    "| Sonde | État | HTTP | Latence | Détail |",
    "|---|---|---:|---:|---|",
  ];
  for (const p of rapport.probes) {
    lignes.push(`| ${p.name} | ${p.ok ? "OK" : "ÉCHEC"} | ${p.status} | ${p.dureeMs} ms | ${p.detail} |`);
  }
  if (rapport.warnings.length > 0) {
    lignes.push("", "### Avertissements latence / en-têtes");
    for (const w of rapport.warnings) lignes.push(`- ${w}`);
  }
  if (rapport.failures.length > 0) {
    lignes.push("", "### Échecs détectés");
    for (const f of rapport.failures) lignes.push(`- ${f}`);
  }
  lignes.push("");
  return lignes.join("\n");
}

export async function notifierAlerteSondes({
  rapport,
  webhookUrl = "",
  webhookSecret = "",
  fetchImpl = globalThis.fetch,
}) {
  if (!webhookUrl || rapport.ok) return { sent: false, reason: rapport.ok ? "ok" : "no-webhook" };
  let cible;
  try {
    cible = new globalThis.URL(webhookUrl);
  } catch {
    return { sent: false, reason: "invalid-url" };
  }
  if (cible.protocol !== "https:") return { sent: false, reason: "https-required" };

  const headers = { "Content-Type": "application/json" };
  if (webhookSecret && webhookSecret.length >= 12) {
    headers["Authorization"] = `Bearer ${webhookSecret}`;
    headers["x-webhook-secret"] = webhookSecret;
  }

  const res = await fetchImpl(cible.href, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      service: "patisgest",
      event: "observabilite.sonde.echec",
      checkedAt: rapport.checkedAt,
      baseUrl: rapport.baseUrl,
      failures: rapport.failures,
      warnings: rapport.warnings,
      probes: rapport.probes,
    }),
  });
  return { sent: res.ok, status: res.status };
}

async function principal() {
  const rapport = await verifierSondes({
    baseUrl: process.env.APP_URL || process.env.CERT_BASE_URL || "https://patsy-gest.vercel.app",
    cronSecret: process.env.CRON_SECRET ?? "",
    expectedSchema: Number(process.env.CERT_EXPECTED_SCHEMA_VERSION ?? "57"),
    warnMs: Number(process.env.OBS_WARN_MS ?? "3000"),
    skipStack: process.env.OBS_SKIP_STACK === "1",
  });

  const resume = formaterResumeSondes(rapport);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${resume}\n`, "utf8");
  }

  for (const p of rapport.probes) {
    console.log(`[obs-sondes] ${p.ok ? "OK" : "FAIL"} ${p.name} http=${p.status} ${p.dureeMs}ms (${p.detail})`);
  }
  for (const w of rapport.warnings) {
    console.log(`::warning::${w}`);
  }

  if (!rapport.ok) {
    for (const f of rapport.failures) {
      console.error(`::error::${f}`);
    }
    const webhookUrl = process.env.PATISGEST_ALERT_WEBHOOK_URL || process.env.PATISGEST_WHATSAPP_WEBHOOK_URL || "";
    if (webhookUrl) {
      try {
        const notif = await notifierAlerteSondes({
          rapport,
          webhookUrl,
          webhookSecret: process.env.PATISGEST_WEBHOOK_SECRET ?? "",
        });
        console.log(`[obs-sondes] Alerte webhook sent=${notif.sent} status=${notif.status ?? notif.reason}`);
      } catch (err) {
        console.error(`[obs-sondes] Échec envoi webhook : ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    process.exitCode = 1;
  } else {
    console.log(`[obs-sondes] OK global (${rapport.probes.length} sondes vertes)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
