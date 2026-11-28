#!/usr/bin/env node
/**
 * Audit B.2 automatisé :
 *   1. Mesures Chromium réelles (TTFB, FCP, DOMContentLoaded, Load, erreurs console/réseau)
 *      sur desktop (1280×800) et mobile (360×780) en FR (LTR) et AR (RTL).
 *   2. Vérifications d'accessibilité DOM (lang, dir, <main>, <h1>, noms accessibles, <img> alt,
 *      absence de débordement horizontal sur mobile).
 *   3. Test de charge léger en lecture seule (GET /api/health et GET /estimation) :
 *      min / p50 / p95 / max et taux d'erreur.
 */
import { createHmac } from "node:crypto";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function percentile(valeurs, p) {
  if (!Array.isArray(valeurs) || valeurs.length === 0) return 0;
  const trie = [...valeurs].sort((a, b) => a - b);
  const idx = Math.min(trie.length - 1, Math.max(0, Math.ceil((p / 100) * trie.length) - 1));
  return Math.round(trie[idx]);
}

export function resumerLatences(dureesMs, statuts) {
  const total = dureesMs.length;
  const erreurs = statuts.filter((s) => s !== 200).length;
  return {
    total,
    ok200: total - erreurs,
    erreurs,
    tauxErreurPct: total > 0 ? Number(((erreurs / total) * 100).toFixed(2)) : 0,
    minMs: total > 0 ? Math.round(Math.min(...dureesMs)) : 0,
    p50Ms: percentile(dureesMs, 50),
    p95Ms: percentile(dureesMs, 95),
    maxMs: total > 0 ? Math.round(Math.max(...dureesMs)) : 0,
  };
}

export async function mesurerChargeHttp({
  cible,
  total = 50,
  concurrence = 5,
  fetchImpl = globalThis.fetch,
}) {
  const nbTotal = Math.max(1, Number(total) || 1);
  const nbConc = Math.max(1, Math.min(nbTotal, Number(concurrence) || 1));
  const durees = [];
  const statuts = [];
  let index = 0;
  const debutGlobal = performance.now();

  async function worker() {
    while (true) {
      const courant = index;
      index += 1;
      if (courant >= nbTotal) break;
      const debut = performance.now();
      try {
        const res = await fetchImpl(cible, {
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
        await res.arrayBuffer();
        durees.push(performance.now() - debut);
        statuts.push(res.status);
      } catch {
        durees.push(performance.now() - debut);
        statuts.push(0);
      }
    }
  }

  await Promise.all(Array.from({ length: nbConc }, () => worker()));
  const totalMs = Math.max(1, Math.round(performance.now() - debutGlobal));
  const resume = resumerLatences(durees, statuts);
  return {
    cible,
    concurrence: nbConc,
    totalMs,
    reqParSec: Number(((nbTotal * 1000) / totalMs).toFixed(1)),
    ...resume,
  };
}

export function signerCookieDemo(email, secret) {
  const payload = Buffer.from(
    JSON.stringify({ email, expires: Date.now() + 3_600_000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

/** Fonction pure injectée dans `page.evaluate()` et testable séparément via un DOM mocké. */
export function analyserAccessibiliteSnapshot(snap) {
  const problemes = [];
  if (!snap.lang) problemes.push("html[lang] absent");
  if (snap.expectedDir && snap.dir !== snap.expectedDir) {
    problemes.push(`html[dir]=${snap.dir || "absent"} (attendu ${snap.expectedDir})`);
  }
  if (!snap.hasMain) problemes.push("<main> absent");
  if (!snap.hasH1) problemes.push("<h1> absent");
  if (snap.unlabeledControls > 0) {
    problemes.push(`${snap.unlabeledControls} contrôle(s) visible(s) sans nom accessible`);
  }
  if (snap.brokenImages > 0) {
    problemes.push(`${snap.brokenImages} image(s) cassée(s) ou sans alt`);
  }
  if (snap.horizontalOverflowPx > 2) {
    problemes.push(`débordement horizontal +${snap.horizontalOverflowPx}px`);
  }
  return problemes;
}

async function auditerPageChromium(browser, { baseUrl, path, label, viewport, cookies = [], expectedLang, expectedDir }) {
  const parsed = new globalThis.URL(baseUrl);
  const context = await browser.newContext({
    viewport,
    locale: expectedLang === "ar" ? "ar-DZ" : "fr-DZ",
  });
  if (cookies.length > 0) {
    await context.addCookies(
      cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: parsed.hostname,
        path: "/",
      })),
    );
  }
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 180));
  });
  page.on("pageerror", (err) => {
    pageErrors.push((err instanceof Error ? err.message : String(err)).slice(0, 180));
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon.ico")) {
      badResponses.push(`${res.status()} ${new globalThis.URL(res.url()).pathname}`);
    }
  });

  try {
    const cible = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const response = await page.goto(cible, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("h1", { timeout: 15_000 }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);
    const httpStatus = response ? response.status() : 0;

    // Laisser les effets B.2 (AutoTr / hydration) stabiliser le DOM sur démo locale.
    await page.waitForTimeout(350);

    const metriques = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paints = performance.getEntriesByType("paint");
      const fcp = paints.find((p) => p.name === "first-contentful-paint");
      const visible = (el) => {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
      };
      const controls = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")];
      let unlabeledControls = 0;
      for (const el of controls) {
        if (!visible(el)) continue;
        const text = (el.innerText || el.textContent || "").trim();
        const aria = (el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || "").trim();
        const ariaBy = el.getAttribute("aria-labelledby");
        const id = el.getAttribute("id");
        const labelFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        const enclosingLabel = el.closest("label");
        if (!text && !aria && !ariaBy && !labelFor && !enclosingLabel) {
          unlabeledControls += 1;
        }
      }
      const imgs = [...document.querySelectorAll("img")];
      let brokenImages = 0;
      for (const img of imgs) {
        if (!visible(img)) continue;
        const alt = img.getAttribute("alt");
        if (alt === null || !img.complete || img.naturalWidth === 0) {
          brokenImages += 1;
        }
      }
      return {
        ttfbMs: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        loadMs: nav ? Math.round(nav.loadEventEnd) : null,
        fcpMs: fcp ? Math.round(fcp.startTime) : null,
        lang: document.documentElement.getAttribute("lang") ?? "",
        dir: document.documentElement.getAttribute("dir") ?? "",
        hasMain: Boolean(document.querySelector("main")),
        hasH1: Boolean(document.querySelector("h1") && document.querySelector("h1").textContent?.trim()),
        unlabeledControls,
        brokenImages,
        horizontalOverflowPx: Math.max(
          0,
          Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
        ),
        hasArabicText: /[\u0600-\u06FF]/u.test(document.body?.innerText ?? ""),
      };
    });

    const a11yProblemes = analyserAccessibiliteSnapshot({
      ...metriques,
      expectedDir,
    });
    if (expectedLang && metriques.lang !== expectedLang) {
      a11yProblemes.push(`lang=${metriques.lang} (attendu ${expectedLang})`);
    }
    if (expectedLang === "ar" && !metriques.hasArabicText) {
      a11yProblemes.push("aucun texte arabe visible en mode AR");
    }

    const ok =
      httpStatus === 200 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      badResponses.length === 0 &&
      a11yProblemes.length === 0;

    return {
      label,
      path,
      viewport: `${viewport.width}x${viewport.height}`,
      locale: expectedLang,
      httpStatus,
      ttfbMs: metriques.ttfbMs,
      fcpMs: metriques.fcpMs,
      domContentLoadedMs: metriques.domContentLoadedMs,
      loadMs: metriques.loadMs,
      overflowPx: metriques.horizontalOverflowPx,
      ok,
      consoleErrors,
      pageErrors,
      badResponses,
      a11yProblemes,
    };
  } finally {
    await context.close();
  }
}

export function formaterRapportB2({ chromiumResults = [], loadResults = [] }) {
  const lignes = ["## Audit B.2 mesuré (FCP, AR/RTL, Accessibilité, Charge)", ""];
  if (chromiumResults.length > 0) {
    lignes.push("### Mesures Chromium (FCP / TTFB / RTL / A11y)", "");
    lignes.push("| Cible | Viewport | Lang | HTTP | TTFB | FCP | Load | Overflow | État |");
    lignes.push("|---|---|---|---:|---:|---:|---:|---:|---|");
    for (const r of chromiumResults) {
      const notes = [
        ...r.a11yProblemes,
        ...r.consoleErrors.map((e) => `console:${e}`),
        ...r.pageErrors.map((e) => `page:${e}`),
        ...r.badResponses.map((e) => `http:${e}`),
      ].join("; ");
      lignes.push(
        `| ${r.label} | ${r.viewport} | ${r.locale} | ${r.httpStatus} | ${r.ttfbMs ?? "n/a"} ms | ${r.fcpMs ?? "n/a"} ms | ${r.loadMs ?? "n/a"} ms | ${r.overflowPx} px | ${r.ok ? "OK" : `KO (${notes})`} |`,
      );
    }
    lignes.push("");
  }
  if (loadResults.length > 0) {
    lignes.push("### Charge légère en lecture seule", "");
    lignes.push("| URL | Concurrence | Requêtes | OK 200 | Erreurs | p50 | p95 | Max | Débit |");
    lignes.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const l of loadResults) {
      lignes.push(
        `| \`${l.cible}\` | ${l.concurrence} | ${l.total} | ${l.ok200} | ${l.tauxErreurPct}% | ${l.p50Ms} ms | ${l.p95Ms} ms | ${l.maxMs} ms | ${l.reqParSec} req/s |`,
      );
    }
    lignes.push("");
  }
  return lignes.join("\n");
}

async function principal() {
  const localBase = (process.env.B2_LOCAL_BASE ?? "").replace(/\/+$/, "");
  const prodBase = (process.env.B2_PROD_BASE ?? "").replace(/\/+$/, "");
  const demoSecret = process.env.B2_DEMO_SECRET ?? "";
  const runChromium = process.env.B2_SKIP_CHROMIUM !== "1";
  const runLoad = process.env.B2_RUN_LOAD === "1";

  const chromiumResults = [];
  const loadResults = [];

  if (runChromium && (localBase || prodBase)) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      if (localBase) {
        const sessionCookie = demoSecret ? signerCookieDemo("amina@patisserie.dz", demoSecret) : "";
        const cookieFr = [
          ...(sessionCookie ? [{ name: "patisgest_pilot_session", value: sessionCookie }] : []),
          { name: "patisgest.lang", value: "fr" },
        ];
        const cookieAr = [
          ...(sessionCookie ? [{ name: "patisgest_pilot_session", value: sessionCookie }] : []),
          { name: "patisgest.lang", value: "ar" },
        ];

        const casLocal = [
          { path: "/connexion", viewport: { width: 1280, height: 800 }, cookies: [{ name: "patisgest.lang", value: "fr" }], lang: "fr", dir: "ltr" },
          { path: "/estimation", viewport: { width: 360, height: 780 }, cookies: [{ name: "patisgest.lang", value: "fr" }], lang: "fr", dir: "ltr" },
          { path: "/hors-ligne", viewport: { width: 360, height: 780 }, cookies: [{ name: "patisgest.lang", value: "fr" }], lang: "fr", dir: "ltr" },
          { path: "/tableau-de-bord", viewport: { width: 1280, height: 800 }, cookies: cookieFr, lang: "fr", dir: "ltr" },
          { path: "/tableau-de-bord", viewport: { width: 360, height: 780 }, cookies: cookieAr, lang: "ar", dir: "rtl" },
          { path: "/caisse", viewport: { width: 360, height: 780 }, cookies: cookieAr, lang: "ar", dir: "rtl" },
          { path: "/stocks", viewport: { width: 360, height: 780 }, cookies: cookieAr, lang: "ar", dir: "rtl" },
          { path: "/mentions-legales", viewport: { width: 1280, height: 800 }, cookies: cookieFr, lang: "fr", dir: "ltr" },
        ];
        for (const c of casLocal) {
          if (!sessionCookie && ["/tableau-de-bord", "/caisse", "/stocks", "/mentions-legales"].includes(c.path)) continue;
          chromiumResults.push(
            await auditerPageChromium(browser, {
              baseUrl: localBase,
              path: c.path,
              label: `local:${c.path}`,
              viewport: c.viewport,
              cookies: c.cookies,
              expectedLang: c.lang,
              expectedDir: c.dir,
            }),
          );
        }
      }

      if (prodBase) {
        const casProd = [
          { path: "/connexion", viewport: { width: 1280, height: 800 }, lang: "fr", dir: "ltr" },
          { path: "/connexion", viewport: { width: 360, height: 780 }, lang: "fr", dir: "ltr" },
          { path: "/estimation", viewport: { width: 1280, height: 800 }, lang: "fr", dir: "ltr" },
          { path: "/estimation", viewport: { width: 360, height: 780 }, lang: "fr", dir: "ltr" },
          { path: "/hors-ligne", viewport: { width: 360, height: 780 }, lang: "fr", dir: "ltr" },
        ];
        for (const c of casProd) {
          chromiumResults.push(
            await auditerPageChromium(browser, {
              baseUrl: prodBase,
              path: c.path,
              label: `prod:${c.path}`,
              viewport: c.viewport,
              cookies: [],
              expectedLang: c.lang,
              expectedDir: c.dir,
            }),
          );
        }
      }
    } finally {
      await browser.close();
    }
  }

  if (runLoad) {
    const conc = Number(process.env.B2_CONCURRENCY ?? "5");
    const nHealth = Number(process.env.B2_HEALTH_REQUESTS ?? "50");
    const nPage = Number(process.env.B2_PAGE_REQUESTS ?? "20");
    for (const racine of [localBase, prodBase].filter(Boolean)) {
      loadResults.push(await mesurerChargeHttp({ cible: `${racine}/api/health`, total: nHealth, concurrence: conc }));
      loadResults.push(await mesurerChargeHttp({ cible: `${racine}/estimation`, total: nPage, concurrence: Math.min(conc, 4) }));
    }
  }

  const md = formaterRapportB2({ chromiumResults, loadResults });
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`, "utf8");
  }

  const echecsChromium = chromiumResults.filter((r) => !r.ok);
  const echecsLoad = loadResults.filter((l) => l.erreurs > 0);
  if (echecsChromium.length > 0 || echecsLoad.length > 0) {
    console.error(`[b2-audit] Échecs détectés : chromium=${echecsChromium.length}, load=${echecsLoad.length}`);
    process.exitCode = 1;
  } else {
    console.log(`[b2-audit] OK chromium=${chromiumResults.length} load=${loadResults.length}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
