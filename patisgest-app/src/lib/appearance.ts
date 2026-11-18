export const DESIGNS = [
  { id: "atelier", name: "Atelier", description: "Un accueil chaleureux pour votre maison.", icon: "logo" },
  { id: "pilotage", name: "Pilotage", description: "Les chiffres, les alertes et les priorités du jour.", icon: "trend" },
  { id: "fabrication", name: "Mise en place", description: "Les fournées en colonnes, du planning à la fin.", icon: "layers" },
  { id: "comptoir", name: "Comptoir", description: "Accès direct à la vente et grandes tuiles produits.", icon: "receipt" },
  { id: "essentiel", name: "Essentiel", description: "Une interface allégée et les premiers pas en avant.", icon: "guide" },
] as const;

export type Design = (typeof DESIGNS)[number]["id"];
export type ColorMode = "light" | "dark";
export type Appearance = { design: Design; modes: Record<Design, ColorMode> };
export const APPEARANCE_COOKIE = "patisgest.apparence";

const defaultModes: Appearance["modes"] = { atelier: "light", pilotage: "light", fabrication: "light", comptoir: "light", essentiel: "light" };

export function readAppearance(cookie?: string): Appearance {
  const [chosen, modes, extra] = (cookie ?? "").split(".");
  const design = DESIGNS.find(({ id }) => id === chosen)?.id ?? "atelier";
  const result = { ...defaultModes };
  if (extra === undefined && /^[ld]{5}$/.test(modes ?? "")) {
    DESIGNS.forEach(({ id }, index) => { result[id] = modes[index] === "d" ? "dark" : "light"; });
  }
  return { design, modes: result };
}

export function writeAppearance(value: Appearance): string {
  return `${value.design}.${DESIGNS.map(({ id }) => value.modes[id] === "dark" ? "d" : "l").join("")}`;
}
