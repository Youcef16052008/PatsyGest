/**
 * Apparence : cinq design et un thème clair/sombre mémorisé **par design**.
 *
 * Le cookie reste la seule source de vérité côté serveur : la page est rendue
 * avec `data-design` et `data-mode` avant le premier pixel de JavaScript, donc
 * pas de flash clair sur un écran de comptoir réglé en sombre.
 *
 * Format du cookie : `<design>.<cinq lettres l/d>` — une lettre par design,
 * dans l'ordre de `DESIGNS`. L'ancien format `<design>.<l|d>` (un seul mode)
 * reste lu, sinon les appareils déjà réglés perdraient leur choix.
 */

export const DESIGNS = [
  {
    id: "atelier",
    name: "Atelier",
    description: "Photo d’atelier, accueil chaleureux, actions du jour à portée de main.",
    icon: "logo",
  },
  {
    id: "pilotage",
    name: "Pilotage",
    description: "Indicateurs, menu latéral et chiffres lisibles d’un coup d’œil.",
    icon: "trend",
  },
  {
    id: "fabrication",
    name: "Mise en place",
    description: "Production en colonnes : à lancer, en cours, terminées.",
    icon: "layers",
  },
  {
    id: "comptoir",
    name: "Comptoir",
    description: "Caisse tactile, grandes tuiles produits et ticket à droite.",
    icon: "receipt",
  },
  {
    id: "essentiel",
    name: "Essentiel",
    description: "Une action prioritaire, grands boutons : pensé mobile et première semaine.",
    icon: "home",
  },
] as const;

export type Design = (typeof DESIGNS)[number]["id"];
export type ColorMode = "light" | "dark";
export type Appearance = { design: Design; modes: Record<Design, ColorMode> };

export const APPEARANCE_COOKIE = "patisgest.apparence";
export const ADVANCED_MODE_COOKIE = "patisgest.mode_avance";

/** Design proposé quand aucun choix n'a encore été fait. */
export const DESIGN_PAR_DEFAUT: Design = "atelier";

const DESIGN_IDS = DESIGNS.map((d) => d.id) as readonly Design[];

/** Anciens cookies (studio de design) → position dans `DESIGNS`. */
const LEGACY_INDEX: Record<string, number> = {
  atelier: 0,
  pilotage: 1,
  fabrication: 2,
  comptoir: 3,
  essentiel: 4,
};

export function isDesign(value: unknown): value is Design {
  return typeof value === "string" && (DESIGN_IDS as readonly string[]).includes(value);
}

function modesParDefaut(): Record<Design, ColorMode> {
  return DESIGN_IDS.reduce(
    (acc, id) => {
      acc[id] = "light";
      return acc;
    },
    {} as Record<Design, ColorMode>,
  );
}

export function readAppearance(cookie?: string): Appearance {
  const modes = modesParDefaut();
  const [chosen, encoded, ...reste] = (cookie ?? "").split(".");

  // Un design inconnu ne doit jamais casser l'affichage : on retombe sur le défaut.
  const design: Design = isDesign(chosen) ? chosen : DESIGN_PAR_DEFAUT;

  // Un cookie au format inattendu (trois segments ou plus) est ignoré : on
  // préfère le thème par défaut à une valeur bricolée.
  if (reste.length > 0) return { design, modes };

  if (encoded && /^[ld]{5}$/.test(encoded)) {
    DESIGN_IDS.forEach((id, i) => {
      modes[id] = encoded[i] === "d" ? "dark" : "light";
    });
  } else if (encoded === "d" || encoded === "l") {
    // Ancien format : un seul mode pour le design choisi. On l'applique au
    // design courant, et on laisse les autres en clair.
    modes[design] = encoded === "d" ? "dark" : "light";
  }

  return { design, modes };
}

export function writeAppearance(value: Appearance): string {
  const design = isDesign(value.design) ? value.design : DESIGN_PAR_DEFAUT;
  const encoded = DESIGN_IDS.map((id) => (value.modes?.[id] === "dark" ? "d" : "l")).join("");
  return `${design}.${encoded}`;
}

/** Mode à appliquer réellement au rendu, selon le design actif. */
export function modeActif(value: Appearance): ColorMode {
  return value.modes[value.design] ?? "light";
}

export function readAdvancedMode(cookie?: string): boolean {
  return cookie === "1" || cookie === "true";
}
