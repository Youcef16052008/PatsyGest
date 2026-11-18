/** US-15.3 — ordre, repères et progression du guide. Aucune donnée locale ne coche une étape. */
export const COMPTEURS_VIDES = {
  matieres: 0, produits: 0, fournisseurs: 0, versionsActives: 0, ordresFabrication: 0, ventes: 0,
};
export type CompteursOnboarding = typeof COMPTEURS_VIDES;

const ETAPES = [
  {
    cle: "matieres", titre: "Créez un ingrédient", consigne: "Pour chiffrer vos recettes.",
    module: "stocks", ancre: "formulaire-matieres", compteur: "matieres", bloquante: true,
    visuel: ["Ingrédient", "Recette", "Coût"],
  },
  {
    cle: "produits", titre: "Créez un produit", consigne: "Pour donner un prix à ce que vous vendez.",
    module: "stocks", ancre: "formulaire-produits", compteur: "produits", bloquante: true,
    visuel: ["Produit", "Prix", "Caisse"],
  },
  {
    cle: "fournisseurs", titre: "Ajoutez un fournisseur", consigne: "Pour retrouver l’origine des lots.",
    module: "achats", ancre: "formulaire-fournisseur", compteur: "fournisseurs", bloquante: false,
    visuel: ["Fournisseur", "Lot", "Origine"],
  },
  {
    cle: "recettes", titre: "Écrivez une recette", consigne: "Pour calculer le coût d’une portion.",
    module: "recettes", ancre: "formulaire-recette", compteur: "versionsActives", bloquante: true,
    visuel: ["Recette", "Coût", "Marge"],
  },
  {
    cle: "premier-of", titre: "Planifiez une fabrication", consigne: "Pour savoir quoi préparer et en quelle quantité.",
    module: "production", ancre: "formulaire-fabrication", compteur: "ordresFabrication", bloquante: false,
    visuel: ["Recette", "Quantité", "Fabrication"],
  },
  {
    cle: "premiere-vente", titre: "Encaissez une vente", consigne: "Pour enregistrer la vente et imprimer le ticket.",
    module: "caisse", ancre: "formulaire-vente", compteur: "ventes", bloquante: true,
    visuel: ["Produit", "Vente", "Ticket"],
  },
] as const satisfies readonly {
  cle: string; titre: string; consigne: string; module: string; ancre: string;
  compteur: keyof CompteursOnboarding; bloquante: boolean; visuel: readonly [string, string, string];
}[];

type EtapeGuide = (typeof ETAPES)[number];
export type CleOnboarding = EtapeGuide["cle"];
export type EtapeOnboarding = EtapeGuide & { numero: number; fait: boolean };

export function etapesOnboarding(c: CompteursOnboarding): EtapeOnboarding[] {
  return ETAPES.map((etape, index) => ({ ...etape, numero: index + 1, fait: c[etape.compteur] > 0 }));
}

export type ProgressionOnboarding = {
  etapes: EtapeOnboarding[];
  faites: number;
  total: number;
  prochaine: EtapeOnboarding | null;
};

export function progressionOnboarding(c: CompteursOnboarding): ProgressionOnboarding {
  const etapes = etapesOnboarding(c);
  return {
    etapes,
    faites: etapes.filter((e) => e.fait).length,
    total: etapes.length,
    prochaine: etapes.find((e) => !e.fait) ?? null,
  };
}

export function lienGuide(etape: EtapeGuide): string {
  return `/${etape.module}?guide=${etape.cle}#${etape.ancre}`;
}

/** Une URL ne sélectionne jamais une étape dans un autre module. */
export function etapePourModule(module: string, cle: string | string[] | undefined): CleOnboarding | undefined {
  return ETAPES.find((e) => e.module === module && e.cle === cle)?.cle;
}

/** On peut remettre un fournisseur ou un OF à plus tard, pas sauter une dépendance. */
export function prerequisManquant(p: ProgressionOnboarding, etape: EtapeOnboarding): EtapeOnboarding | undefined {
  return p.etapes.find((e) => e.numero < etape.numero && e.bloquante && !e.fait);
}

export function etapeApres(p: ProgressionOnboarding, etape: EtapeOnboarding, reprendreOubliees = true): EtapeOnboarding | undefined {
  const ouvertes = p.etapes.filter((e) => e.cle !== etape.cle && !e.fait);
  return ouvertes.find((e) => e.numero > etape.numero) ?? (reprendreOubliees ? ouvertes[0] : undefined);
}
