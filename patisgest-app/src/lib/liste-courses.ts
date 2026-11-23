/**
 * MOD-03 / US-03.3 — liste de courses automatique.
 *
 * Règle du cahier des charges : « besoins des OF planifiés − stock − en commande ».
 * Pur et testable (aucune dépendance Next/Supabase), comme `cost-sheet` et
 * `fefo-cost` : l'agrégation qui décide ce qu'un pâtissier achète ne doit pas
 * dépendre d'une page.
 *
 * Ce que ce module ne fait PAS, volontairement :
 *   * aucune conversion d'unité implicite. Si le besoin est en kg et le stock
 *     en L, on ne soustrait pas : les conversions sont explicites et validées
 *     côté serveur (migration 12, `patisgest_convertir`). Inventer une
 *     équivalence ici produirait un achat faux, donc un stock faux, donc une
 *     marge fausse — le contraire de la promesse produit.
 *   * aucune écriture. La liste est une proposition ; le propriétaire décide.
 */

/** Ligne de besoin telle que produite par `patisgest_besoins_de_version`. */
export type BesoinArticle = {
  articleId: string | null;
  code: string | null;
  nom: string;
  qty: number;
  unit: string;
};

/** Stock disponible par article (somme des lots éligibles du site). */
export type StockArticle = {
  articleId: string;
  qteRest: number;
  unit: string;
};

/** Quantité déjà commandée et non encore reçue (BC `commande` ou `partiel`). */
export type EnCommande = { articleId: string; qte: number };

export type StatutLigne = "rupture" | "partiel" | "couvert";

export type LigneCourses = {
  articleId: string;
  nom: string;
  unite: string;
  /** Besoin total, tous OF planifiés confondus. */
  besoin: number;
  /** Stock disponible pris en compte (0 si l'unité ne correspond pas). */
  stock: number;
  /** Quantité déjà en commande prise en compte. */
  enCommande: number;
  /** À acheter = max(0, besoin − stock applicable − en commande applicable). */
  aAcheter: number;
  statut: StatutLigne;
  /** true si le stock existait mais dans une autre unité : rien n'a été déduit. */
  uniteIncoherente: boolean;
};

export type ResultatCourses = {
  /** Toutes les lignes, y compris celles déjà couvertes (pour vérification). */
  lignes: LigneCourses[];
  /** Sous-ensemble à acheter, trié du plus urgent au moins urgent. */
  aAcheter: LigneCourses[];
  /** Nombre de besoins ignorés faute d'identifiant d'article. */
  ignores: number;
};

const nombre = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const arrondi4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Construit la liste de courses.
 *
 * `stock` et `enCommande` sont indexés par `articleId`. Si plusieurs lignes
 * décrivent le même article (deux sites par exemple), l'appelant doit avoir
 * sommé ; sinon la dernière ligne gagne, ce qui sous-estimerait le stock
 * disponible et donc sur-commanderait — jamais l'inverse (on ne casse pas la
 * production par excès de prudence).
 */
export function listeCourses(input: {
  besoins: BesoinArticle[];
  stock: StockArticle[];
  enCommande: EnCommande[];
}): ResultatCourses {
  const stockParArticle = new Map<string, StockArticle>();
  for (const s of input.stock ?? []) {
    if (s?.articleId) stockParArticle.set(s.articleId, s);
  }
  const commandeParArticle = new Map<string, number>();
  for (const c of input.enCommande ?? []) {
    if (!c?.articleId) continue;
    commandeParArticle.set(c.articleId, nombre(commandeParArticle.get(c.articleId)) + nombre(c.qte));
  }

  const agregat = new Map<string, { nom: string; unite: string; besoin: number }>();
  let ignores = 0;
  for (const b of input.besoins ?? []) {
    if (!b?.articleId) {
      // Ligne historique portant un `code` plutôt qu'un id : on ne peut pas
      // rattacher un stock, et on ne devine pas. On compte pour le dire à l'écran.
      ignores += 1;
      continue;
    }
    const unite = b.unit ?? "";
    const qty = nombre(b.qty);
    const existant = agregat.get(b.articleId);
    if (existant) {
      existant.besoin = arrondi4(existant.besoin + qty);
    } else {
      agregat.set(b.articleId, { nom: b.nom ?? "", unite, besoin: arrondi4(qty) });
    }
  }

  const lignes: LigneCourses[] = [];
  for (const [articleId, agg] of agregat) {
    const s = stockParArticle.get(articleId);
    // Une unité différente n'est PAS une quantité : on ne soustrait rien.
    const uniteIncoherente = Boolean(s && s.unit !== agg.unite);
    const stockApplicable = s && !uniteIncoherente ? nombre(s.qteRest) : 0;
    const commandeApplicable = nombre(commandeParArticle.get(articleId));
    const aAcheter = arrondi4(Math.max(0, agg.besoin - stockApplicable - commandeApplicable));
    const statut: StatutLigne =
      aAcheter <= 0 ? "couvert" : stockApplicable <= 0 ? "rupture" : "partiel";
    lignes.push({
      articleId,
      nom: agg.nom,
      unite: agg.unite,
      besoin: agg.besoin,
      stock: arrondi4(stockApplicable),
      enCommande: arrondi4(commandeApplicable),
      aAcheter,
      statut,
      uniteIncoherente,
    });
  }

  // Tri : rupture d'abord, puis quantité à acheter décroissante, puis nom.
  // L'ordre alphabétique seul ferait passer 0,2 kg d'amandes avant 40 kg de farine.
  lignes.sort((a, b) => {
    if (a.statut !== b.statut) {
      const rang = { rupture: 0, partiel: 1, couvert: 2 } as const;
      return rang[a.statut] - rang[b.statut];
    }
    if (b.aAcheter !== a.aAcheter) return b.aAcheter - a.aAcheter;
    return a.nom.localeCompare(b.nom, "fr");
  });

  return {
    lignes,
    aAcheter: lignes.filter((l) => l.aAcheter > 0),
    ignores,
  };
}
