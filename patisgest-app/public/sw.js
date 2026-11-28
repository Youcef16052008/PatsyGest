/**
 * Service worker conservateur : les pages authentifiées, RSC et API ne sont
 * jamais mises en cache. Le cache de HTML d'un compte serait lisible après
 * changement de compte sur un appareil partagé.
 *
 * NF-02 / D5 — la seule exception est la **coquille hors-ligne** `/hors-ligne`.
 * Ce n'est pas une entorse : son HTML ne contient aucune donnée client. Elle
 * est publique, rendue sans requête serveur, et tout ce qu'elle personnalise
 * est lu côté navigateur après vérification que le catalogue appartient au
 * compte connecté sur cet appareil (voir `catalogue-cache.ts`).
 *
 * Sans elle, on ne pouvait pas *rouvrir* l'application sans réseau : les
 * tickets partaient bien au retour du réseau, mais le vendeur ne pouvait plus
 * rien encaisser entre-temps, ce qui ne satisfait pas H2/NF-02.
 */
// Nouvelle version : effacer aussi les anciennes réponses HTML mises en cache
// par erreur sous une URL d'asset (p. ex. police sur un sous-domaine boutique).
const VERSION = "v4-coquille-hors-ligne";
const CACHE_ASSETS = `patisgest-assets-${VERSION}`;
/** Cache de la coquille : une seule page, sans donnée personnelle. */
const CACHE_COQUILLE = `patisgest-coquille-${VERSION}`;
const COQUILLE = "/hors-ligne";

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
  // On précache la coquille à l'installation : si le réseau tombe avant le
  // premier usage, l'écran de secours existe déjà. Un échec ici ne doit pas
  // empêcher le service worker de s'installer — la coquille sera réessayée
  // à la première visite en ligne.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_COQUILLE);
      await cache.add(new Request(COQUILLE, { cache: "reload" }));
    } catch {
      /* réseau absent à l'installation : le fetch handler réessaiera */
    }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("patisgest-") && name !== CACHE_ASSETS && name !== CACHE_COQUILLE) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // --- navigation : uniquement la coquille, jamais une autre page.
  if (request.mode === "navigate") {
    if (url.origin !== self.location.origin) return;

    // Cas courant : le vendeur rouvre /caisse hors-ligne. On ne met PAS cette
    // page en cache (données d'un compte). En revanche, plutôt que de le laisser
    // sur l'écran d'erreur du navigateur, on lui sert la coquille : elle lui dit
    // où il en est et ce qui reste possible. Le réseau d'abord, sinon coquille.
    if (url.pathname !== COQUILLE) {
      event.respondWith((async () => {
        try {
          return await fetch(request);
        } catch {
          try {
            const cache = await caches.open(CACHE_COQUILLE);
            const cached = await cache.match(COQUILLE);
            if (cached) return cached;
          } catch {
            /* cache indisponible : on tombe sur la réponse d'excuse */
          }
          return new Response(
            "<!doctype html><meta charset=utf-8><title>Hors-ligne</title>" +
            "<body style='font-family:system-ui;padding:2rem;line-height:1.5'>" +
            "<h1>Pas de réseau</h1><p>Rouvrez l'application dès que la connexion revient.</p></body>",
            { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }
      })());
      return;
    }

    event.respondWith((async () => {
      // Réseau d'abord : en ligne, on veut la version fraîche (nouvelles
      // versions de l'app, nouveau service worker). Hors ligne, le cache prend
      // le relais — c'est tout l'intérêt de la page.
      try {
        const response = await fetch(request);
        // Le cache de la coquille est un confort : son échec ne doit pas
        // empêcher de servir la page quand le réseau est là.
        try {
          if (response.ok && response.type === "basic") {
            const cache = await caches.open(CACHE_COQUILLE);
            await cache.put(COQUILLE, response.clone());
          }
        } catch {
          /* quota plein, mode privé : on continue sans réserve */
        }
        return response;
      } catch {
        let cached;
        try {
          const cache = await caches.open(CACHE_COQUILLE);
          cached = await cache.match(COQUILLE);
        } catch {
          cached = undefined;
        }
        if (cached) return cached;
        // Ni réseau ni cache : une réponse honnête, pas une page blanche.
        return new Response(
          "<!doctype html><meta charset=utf-8><title>Hors-ligne</title>" +
          "<body style='font-family:system-ui;padding:2rem;line-height:1.5'>" +
          "<h1>Pas de réseau</h1><p>Cet appareil n'a pas encore conservé les données de la caisse. " +
          "Rouvrez l'application dès que la connexion revient.</p></body>",
          { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;
  // Seuls les assets locaux non personnalisés sont mis en cache : pas de HTML,
  // JSON, RSC, server actions ou réponses API.
  if (!url.pathname.startsWith("/_next/static/") && !url.pathname.startsWith("/appearance/") && !url.pathname.startsWith("/icons/")) return;
  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(CACHE_ASSETS);
      const cached = await cache.match(request);
      if (cached) return cached;
    } catch {
      /* cache indisponible (quota plein, mode privé) : on sert depuis le réseau */
    }
    const response = await fetch(request);
    if (cache && contenuAssetValide(url.pathname, response)) {
      try {
        await cache.put(request, response.clone());
      } catch {
        /* quota plein : la réponse réseau reste servie intacte */
      }
    }
    return response;
  })());
});
