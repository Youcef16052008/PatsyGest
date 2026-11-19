/**
 * Résolution `host → boutique` (prérequis vitrine, cf. migration 25).
 *
 * Module pur, sans accès réseau : c'est la partie qui doit être juste à
 * chaque requête visiteur, donc celle qui se teste. Le branchement vers
 * Next.js (middleware + page vitrine) reste à faire, et doit être livré
 * avec sa propre revue : exposer une page publique, c'est exposer des
 * données à des visiteurs anonymes. Ne jamais réutiliser les lectures
 * internes (elles portent des coûts et des marges).
 *
 * Ce module ne décide JAMAIS d'un accès : il ne fait que classer un hôte.
 */

/** Domaine de service par défaut. Surchargeable par variable d'environnement. */
export const DOMAINE_SERVICE_PAR_DEFAUT = "patisgest.dz";

/** Préfixes qui portent l'application, pas une boutique. */
export const HOTES_APPLICATION = ["app", "admin", "api", "www"] as const;

export type Hote =
  /** Application de gestion (caisse, stocks, pilotage). */
  | { type: "application"; sousDomaine: string | null }
  /** Vitrine d'une boutique, identifiée par son sous-domaine. */
  | { type: "boutique"; sousDomaine: string }
  /** Domaine propre déclaré par un client (offre Pro). */
  | { type: "domaine-client"; hote: string }
  /** Hôte inconnu (IP, localhost, domaine tiers) → 404 honnête. */
  | { type: "inconnu"; hote: string };

/**
 * Normalise un en-tête `Host` : minuscules, sans port, sans point final
 * (un FQDN peut légalement finir par un point — `elyasmine.patisgest.dz.`
 * est le même hôte ; sans cette normalisation il deviendrait « inconnu »).
 */
export function normaliserHote(brut: string | null | undefined): string {
  if (!brut) return "";
  return brut
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

/** Vrai si l'hôte est une adresse IP ou un nom local (dev, santé). */
export function estHoteLocal(hote: string): boolean {
  if (!hote) return true;
  if (hote === "localhost" || hote === "127.0.0.1" || hote === "::1") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hote)) return true;
  if (hote.endsWith(".localhost") || hote.endsWith(".local")) return true;
  // Hôtes de prévisualisation (Vercel, sandbox E2B) : jamais des boutiques.
  if (hote.endsWith(".vercel.app") || hote.endsWith(".e2b.app")) return true;
  return false;
}

/**
 * Classe un hôte.
 *
 * @param hote      en-tête Host brut
 * @param domaine   domaine de service (défaut `patisgest.dz`)
 * @param domainesClients domaines propres déclarés (offre Pro), déjà normalisés
 */
export function resoudreHote(
  hote: string | null | undefined,
  domaine: string = DOMAINE_SERVICE_PAR_DEFAUT,
  domainesClients: readonly string[] = [],
): Hote {
  const h = normaliserHote(hote);
  const service = normaliserHote(domaine);

  if (!h) return { type: "inconnu", hote: "" };
  if (estHoteLocal(h)) return { type: "application", sousDomaine: null };

  // Domaine propre déclaré AVANT le domaine de service : un client peut
  // très bien avoir acheté un domaine qui contient « patisgest ».
  if (domainesClients.some((d) => normaliserHote(d) === h)) {
    return { type: "domaine-client", hote: h };
  }

  if (h === service || h === `www.${service}`) {
    return { type: "application", sousDomaine: null };
  }

  if (h.endsWith(`.${service}`)) {
    const sousDomaine = h.slice(0, -(service.length + 1));
    // Un seul niveau : `a.b.patisgest.dz` n'est pas un sous-domaine valide.
    if (!sousDomaine || sousDomaine.includes(".")) return { type: "inconnu", hote: h };
    if ((HOTES_APPLICATION as readonly string[]).includes(sousDomaine)) {
      return { type: "application", sousDomaine };
    }
    return { type: "boutique", sousDomaine };
  }

  return { type: "inconnu", hote: h };
}

/**
 * Clé de cache de la résolution. Un hôte inconnu n'est PAS mis en cache
 * durablement : sinon un domaine ajouté plus tard resterait bloqué.
 */
export function cleCacheHote(hote: string): string | null {
  const h = normaliserHote(hote);
  if (!h || estHoteLocal(h)) return null;
  return `hote:${h}`;
}

/* ------------------------------------------------------------------ *
 * Décision de routage par hôte (utilisée par le middleware)
 * ------------------------------------------------------------------ */

/** Préfixes de chemin qui restent ceux de l'application, même sur un sous-domaine boutique. */
const CHEMINS_APPLICATION = [
  "/connexion",
  "/deconnexion",
  "/tableau-de-bord",
  "/parametres",
  "/mentions-legales",
  "/api/",
  "/_next/",
  "/icons/",
  "/sw.js",
  "/manifest.webmanifest",
];

export type DecisionRoutage =
  | { type: "laisser" }
  /** Chemin + query à réécrire, sur le MÊME hôte que la requête. */
  | { type: "reecrire"; chemin: string; recherche: string };

/**
 * Si l'hôte appartient à une boutique, toute requête qui ne vise pas déjà
 * la vitrine est réécrite vers `/vitrine/<slug>`. Le préfixe statique
 * `vitrine` évite la collision avec `/[module]` de l'application.
 *
 * Ce qu'on ne fait volontairement PAS :
 *   • pas de redirection (l'URL affichée au visiteur ne change pas) ;
 *   • pas de bascule du propriétaire vers sa vitrine : il garde
 *     `/connexion` et `/tableau-de-bord` pour gérer sa boutique ;
 *   • aucun appel réseau : la décision doit rester instantanée même si
 *     Supabase est injoignable.
 */
export function deciderRoutage(
  hote: string | null | undefined,
  chemin: string,
  recherche: string,
  domaine: string = DOMAINE_SERVICE_PAR_DEFAUT,
): DecisionRoutage {
  const classification = resoudreHote(hote, domaine, []);
  if (classification.type !== "boutique") return { type: "laisser" };

  const slug = classification.sousDomaine;
  const normalise = chemin.startsWith("/") ? chemin : `/${chemin}`;

  // L'application reste accessible sur le sous-domaine de la boutique :
  // le gérant se connecte sur `elyasmine.patisgest.dz/connexion`.
  if (CHEMINS_APPLICATION.some((p) => normalise === p || normalise.startsWith(p))) {
    return { type: "laisser" };
  }

  // Déjà sur la vitrine : ne pas réécrire en boucle.
  if (normalise === `/vitrine/${slug}` || normalise.startsWith(`/vitrine/${slug}/`)) {
    return { type: "laisser" };
  }

  // On renvoie un CHEMIN, pas une URL absolue : une URL absolue portant le
  // nom de la boutique ferait sortir Next par le resolver DNS (mesuré :
  // « getaddrinfo ENOTFOUND elyasmine.patisgest.dz »). Le middleware
  // réécrit sur la même origine avec `request.nextUrl.clone()`.
  return { type: "reecrire", chemin: `/vitrine/${slug}`, recherche: recherche ?? "" };
}
