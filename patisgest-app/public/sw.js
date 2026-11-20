/**
 * Service worker conservateur : les pages authentifiées, RSC et API ne sont
 * jamais mises en cache. Le cache de HTML d'un compte serait lisible après
 * changement de compte sur un appareil partagé. La caisse en ligne et la file
 * de tickets existante restent disponibles ; l'ouverture hors ligne d'une page
 * authentifiée est volontairement désactivée jusqu'à conception isolée.
 */
const VERSION = "v2-static-only";
const CACHE_ASSETS = `patisgest-assets-${VERSION}`;
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
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  })());
});
