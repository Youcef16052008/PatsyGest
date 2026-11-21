/**
 * Service worker conservateur : les pages authentifiées, RSC et API ne sont
 * jamais mises en cache. Le cache de HTML d'un compte serait lisible après
 * changement de compte sur un appareil partagé. La caisse en ligne et la file
 * de tickets existante restent disponibles ; l'ouverture hors ligne d'une page
 * authentifiée est volontairement désactivée jusqu'à conception isolée.
 */
// Nouvelle version : effacer aussi les anciennes réponses HTML mises en cache
// par erreur sous une URL d'asset (p. ex. police sur un sous-domaine boutique).
const VERSION = "v3-validated-assets";
const CACHE_ASSETS = `patisgest-assets-${VERSION}`;

function contenuAssetValide(path, response) {
  if (!response.ok || response.type !== "basic" || response.redirected) return false;
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const types = {
    js: ["text/javascript", "application/javascript", "application/x-javascript"],
    css: ["text/css"],
    woff2: ["font/woff2"],
    woff: ["font/woff", "application/font-woff"],
    png: ["image/png"],
    jpg: ["image/jpeg"], jpeg: ["image/jpeg"],
    webp: ["image/webp"], gif: ["image/gif"], svg: ["image/svg+xml"],
  };
  return !!ext && !!types[ext]?.includes(type);
}
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("patisgest-") && name !== CACHE_ASSETS) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode === "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Seuls les assets locaux non personnalisés sont mis en cache : pas de HTML,
  // JSON, RSC, server actions ou réponses API.
  if (!url.pathname.startsWith("/_next/static/") && !url.pathname.startsWith("/appearance/") && !url.pathname.startsWith("/icons/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_ASSETS);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (contenuAssetValide(url.pathname, response)) await cache.put(request, response.clone());
    return response;
  })());
});
