/**
 * MOD-15 — Assistant d'onboarding (US-15.3 : « articles → fournisseurs →
 * recettes → premier OF → première vente, en moins d'une heure »).
 *
 * Pur et testable : on lui passe des **comptes** de données, il dit où en est
 * l'utilisateur et quelle est la prochaine action utile. Objectif explicite :
 * ne jamais afficher une étape déjà satisfaite, et toujours proposer l'étape
 * suivante (le novice ne doit pas se demander « et maintenant ? »).
 *
 * CA-15 « un novice termine l'onboarding en < 1 h » reste un critère HUMAIN :
 * ce module mesure la progression, il ne prouve pas le temps passé.
 */

export type CompteursOnboarding = {
  articles: number;
  matieres: number;
  fournisseurs: number;
  famillesRecette: number;
  versionsActives: number;
  ordresFabrication: number;
  ventes: number;
  lots: number;
};

export const COMPTEURS_VIDES: CompteursOnboarding = {
  articles: 0, matieres: 0, fournisseurs: 0, famillesRecette: 0,
  versionsActives: 0, ordresFabrication: 0, ventes: 0, lots: 0,
};

export type EtapeOnboarding = {
  cle: string;
  titre: string;
  /** Ce qu'il faut faire, en une phrase. */
  consigne: string;
  /** Module à ouvrir pour agir. */
  module: string;
  fait: boolean;
  /** L'étape est-elle indispensable avant la 1re vente ? */
  bloquante: boolean;
};

/**
 * Les 6 étapes de l'assistant, dans l'ordre du cahier (US-15.3).
 * `articles` sert d'amorce : sans article, aucune autre étape n'a de sens.
 */
export function etapesOnboarding(c: CompteursOnboarding): EtapeOnboarding[] {
  const etapes: EtapeOnboarding[] = [
    {
      cle: "matieres",
      titre: "1. Créer vos matières premières",
      consigne: "Farine, beurre, sucre, lait… avec leur unité et leur prix d'achat.",
      module: "stocks",
      fait: c.matieres > 0,
      bloquante: true,
    },
    {
      cle: "produits",
      titre: "2. Créer vos produits finis",
      consigne: "Croissant, millefeuille… ce que vous vendez, avec son prix de vente HT.",
      module: "stocks",
      fait: c.articles - c.matieres > 0,
      bloquante: true,
    },
    {
      cle: "fournisseurs",
      titre: "3. Renseigner vos fournisseurs",
      consigne: "Au moins un fournisseur, pour tracer l'origine des lots.",
      module: "achats",
      fait: c.fournisseurs > 0,
      /* Utile au rappel de lot, mais on ne bloque pas la 1re vente. */
      bloquante: false,
    },
    {
      cle: "recettes",
      titre: "4. Écrire votre première recette",
      consigne: "Une famille + une version active : c'est elle qui calcule votre coût vrai.",
      module: "recettes",
      fait: c.versionsActives > 0,
      bloquante: true,
    },
    {
      cle: "premier-of",
      titre: "5. Lancer un premier ordre de fabrication",
      consigne: "L'OF fige les besoins et consomme les lots en FEFO.",
      module: "production",
      fait: c.ordresFabrication > 0,
      bloquante: false,
    },
    {
      cle: "premiere-vente",
      titre: "6. Encaisser une première vente",
      consigne: "Le ticket sort en 80 mm ; la file hors-ligne protège l'encaissement.",
      module: "caisse",
      fait: c.ventes > 0,
      bloquante: true,
    },
  ];
  return etapes;
}

export type ProgressionOnboarding = {
  etapes: EtapeOnboarding[];
  /** Nombre d'étapes satisfaites. */
  faites: number;
  total: number;
  /** 0..100, arrondi à l'entier. */
  pourcentage: number;
  /** Prochaine étape à réaliser (la 1re non faite), sinon null. */
  prochaine: EtapeOnboarding | null;
  /** Toutes les étapes bloquantes sont-elles faites ? */
  pretAVendre: boolean;
  /** Tout est fait : l'assistant peut être masqué. */
  termine: boolean;
};

export function progressionOnboarding(c: CompteursOnboarding): ProgressionOnboarding {
  const etapes = etapesOnboarding(c);
  const faites = etapes.filter((e) => e.fait).length;
  return {
    etapes,
    faites,
    total: etapes.length,
    pourcentage: Math.round((faites / etapes.length) * 100),
    prochaine: etapes.find((e) => !e.fait) ?? null,
    pretAVendre: etapes.filter((e) => e.bloquante).every((e) => e.fait),
    termine: faites === etapes.length,
  };
}
