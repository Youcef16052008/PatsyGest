"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { APPEARANCE_COOKIE, writeAppearance, type Appearance, type ColorMode, type Design } from "@/lib/appearance";
import { Icon } from "./workspace-icons";

const AppearanceContext = createContext<{ design: Design; mode: ColorMode; selectDesign: (id: Design) => void; selectMode: (mode: ColorMode) => void } | null>(null);

export function AppearanceProvider({ initial, children }: { initial: Appearance; children: ReactNode }) {
  const [value, setValue] = useState(initial);
  const mode = value.modes.pilotage;
  function apply(next: Appearance) {
    document.documentElement.dataset.design = "pilotage";
    document.documentElement.dataset.mode = next.modes.pilotage;
    document.cookie = `${APPEARANCE_COOKIE}=${writeAppearance(next)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setValue(next);
  }
  return <AppearanceContext.Provider value={{
    design: "pilotage",
    mode,
    selectDesign: () => apply({ design: "pilotage", modes: { pilotage: mode } }),
    selectMode: (nextMode) => apply({ design: "pilotage", modes: { pilotage: nextMode } }),
  }}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("AppearanceProvider manquant");
  return context;
}

export function QuickColorMode() {
  const { mode, selectMode } = useAppearance();
  return <button className="pg-icon-button" type="button" aria-label="Mode sombre" title={mode === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
    aria-pressed={mode === "dark"} onClick={() => selectMode(mode === "dark" ? "light" : "dark")}>
    <Icon name={mode === "dark" ? "sun" : "moon"} size={18} />
  </button>;
}

export function ThemeModeControl() {
  const { mode, selectMode } = useAppearance();
  return (
    <div className="pg-segment" role="group" aria-label="Mode d’affichage">
      <button type="button" aria-pressed={mode === "light"} onClick={() => selectMode("light")}>
        <Icon name="sun" size={16} /> Clair
      </button>
      <button type="button" aria-pressed={mode === "dark"} onClick={() => selectMode("dark")}>
        <Icon name="moon" size={16} /> Sombre
      </button>
    </div>
  );
}
