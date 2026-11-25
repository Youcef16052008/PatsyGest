export const DESIGNS = [
  { id: "pilotage", name: "PâtisGest", description: "Interface claire et directe, en mode clair ou sombre.", icon: "logo" },
] as const;

export type Design = (typeof DESIGNS)[number]["id"];
export type ColorMode = "light" | "dark";
export type Appearance = { design: Design; modes: Record<Design, ColorMode> };
export const APPEARANCE_COOKIE = "patisgest.apparence";
export const ADVANCED_MODE_COOKIE = "patisgest.mode_avance";

const LEGACY_INDEX: Record<string, number> = {
  atelier: 0,
  pilotage: 1,
  fabrication: 2,
  comptoir: 3,
  essentiel: 4,
};

export function readAppearance(cookie?: string): Appearance {
  const [chosen, modes, extra] = (cookie ?? "").split(".");
  let mode: ColorMode = "light";
  if (extra === undefined) {
    if (modes === "d" || modes === "l") {
      mode = modes === "d" ? "dark" : "light";
    } else if (/^[ld]{5}$/.test(modes ?? "")) {
      const idx = LEGACY_INDEX[chosen ?? "pilotage"] ?? 1;
      mode = modes![idx] === "d" ? "dark" : "light";
    }
  }
  return { design: "pilotage", modes: { pilotage: mode } };
}

export function writeAppearance(value: Appearance): string {
  return `pilotage.${value.modes.pilotage === "dark" ? "d" : "l"}`;
}

export function readAdvancedMode(cookie?: string): boolean {
  return cookie === "1" || cookie === "true";
}
