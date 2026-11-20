/**
 * Service worker PâtisGest — exigence NF-02 / H2 du cahier des charges :
 * « la caisse reste utilisable sans internet ».
 *
 * Sans service worker, une tablette qui perd le réseau à 15 h ne peut pas
 * ouvrir l'écran de caisse : ni l'interface, ni les fichiers JS ne sont
 * disponibles. La file de ventes (sale-queue) conservait déjà les ventes,
 * mais il fallait d'abord réussir à afficher l'écran.
 *
 * Périmètre volontairement étroit :
 *   • navigations  → réseau d'abord (3 s max), cache en secours ;
 *   • assets       → cache d'abord, rafraîchissement en arrière-plan ;
 *   • tout le reste (server actions, API, RSC) → réseau, jamais de cache
 *     silencieux : une vente ne doit jamais sembler réussie depuis un cache.
 *
 * Ce fichier est du JS pur, non compilé : il doit rester lisible et sans
 * dépendance. Il est servi depuis /sw.js à la racine (portée maximale).
 */

const VERSION = "v1";
const CACHE_SHELL = `patisgest-shell-${VERSION}`;
const CACHE_ASSETS = `patisgest-assets-${VERSION}`;

/** Écrans utilisables hors ligne (décision D5 du CDC). */
const ECRANS_HORS_LIGNE = ["/caisse", "/tableau-de-bord", "/connexion"];

/** Assets critiques : icônes et polices, pour un écran lisible sans réseau. */
const ASSETS_CRITIQUES = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/appearance/manrope.woff2",
  "/appearance/fraunces.woff2",
];

const DELAI_RESEAU_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(CACHE_SHELL);
      // Chaque écran est mis en cache indépendamment : si /caisse échoue
      // (session expirée → 307), les autres doivent quand même être gardés.
      await Promise.all(
        ECRANS_HORS_LIGNE.map(async (url) => {
          try {
            const reponse = await fetch(url, { credentials: "same-origin" });
            if (reponse.ok) await shell.put(url, reponse.clone());
          } catch {
            /* premier chargement hors ligne : rien à faire */
          }
        }),
      );
      const assets = await caches.open(CACHE_ASSETS);
      await Promise.all(
        ASSETS_CRITIQUES.map(async (url) => {
          try {
            const reponse = await fetch(url);
            if (reponse.ok) await assets.put(url, reponse.clone());
          } catch {
            /* ignoré : non bloquant pour l'installation */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge des caches d'anciennes versions (sinon ils s'accumulent).
      const noms = await caches.keys();
      await Promise.all(
        noms
          .filter((n) => n.startsWith("patisgest-") && n !== CACHE_SHELL && n !== CACHE_ASSETS)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/** Réseau d'abord, avec délai maximal : un réseau lent ne doit pas bloquer la caisse. */
async function reseauPuisCache(request, nomCache) {
  const cache = await caches.open(nomCache);
  try {
    const reponse = await course(
      fetch(request),
      new Promise((_, rejeter) =>
        setTimeout(() => rejeter(new Error("délai réseau")), DELAI_RESEAU_MS),
      ),
    );
    // On ne met en cache que les réponses complètes et réussies : jamais une
    // redirection (session expirée) ni une erreur serveur.
    if (reponse.ok && reponse.type === "basic") {
      cache.put(request, reponse.clone());
    }
    return reponse;
  } catch {
    const enCache = await cache.match(request, { ignoreSearch: false });
    if (enCache) return enCache;
    // Dernier recours : le shell de l'écran demandé, sans les paramètres.
    const sansParams = await cache.match(new URL(request.url).pathname);
    if (sansParams) return sansParams;
    throw new Error("hors ligne et rien en cache");
  }
}

function course(promesse, delai) {
  return Promise.race([promesse, delai]);
}

/** Cache d'abord + revalidation en arrière-plan (assets immuables). */
async function cachePuisReseau(request, nomCache) {
  const cache = await caches.open(nomCache);
  const enCache = await cache.match(request);
  const reseau = fetch(request)
    .then((reponse) => {
      if (reponse.ok) cache.put(request, reponse.clone());
      return reponse;
    })
    .catch(() => null);
  if (enCache) return enCache;
  const reponse = await reseau;
  if (reponse) return reponse;
  throw new Error("asset indisponible");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Jamais de cache sur les server actions, l'API et les routes internes :
  // une vente doit toujours être vérifiée par le serveur.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) return;

  if (request.mode === "navigate") {
    event.respondWith(reseauPuisCache(request, CACHE_SHELL));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/appearance/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cachePuisReseau(request, CACHE_ASSETS));
  }
});
