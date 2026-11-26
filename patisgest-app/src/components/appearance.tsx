"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  APPEARANCE_COOKIE,
  DESIGNS,
  modeActif,
  writeAppearance,
  type Appearance,
  type ColorMode,
  type Design,
} from "@/lib/appearance";
import { Icon } from "./workspace-icons";

type AppearanceContextValue = {
  design: Design;
  mode: ColorMode;
  modes: Record<Design, ColorMode>;
  selectDesign: (id: Design) => void;
  selectMode: (mode: ColorMode) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ initial, children }: { initial: Appearance; children: ReactNode }) {
  const [value, setValue] = useState<Appearance>(initial);

  function persist(next: Appearance) {
    document.documentElement.dataset.design = next.design;
    document.documentElement.dataset.mode = modeActif(next);
    document.cookie = `${APPEARANCE_COOKIE}=${writeAppearance(next)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setValue(next);
  }

  const mode = modeActif(value);

  return (
    <AppearanceContext.Provider
      value={{
        design: value.design,
        mode,
        modes: value.modes,
        selectDesign: (id) => persist({ design: id, modes: value.modes }),
        selectMode: (nextMode) => persist({ design: value.design, modes: { ...value.modes, [value.design]: nextMode } }),
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("AppearanceProvider manquant");
  return context;
}

export function QuickColorMode() {
  const { mode, selectMode } = useAppearance();
  return (
    <button
      className="pg-icon-button"
      type="button"
      aria-label="Mode sombre"
      title={mode === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      aria-pressed={mode === "dark"}
      onClick={() => selectMode(mode === "dark" ? "light" : "dark")}
    >
      <Icon name={mode === "dark" ? "sun" : "moon"} size={18} />
    </button>
  );
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

/**
 * Les cinq designs, en aperçu cliquable. Chaque vignette est un mini-écran
 * dessiné en CSS (barre de navigation + contenu), teinté par les variables
 * propres au design : on voit le style, pas seulement son nom.
 */
export function DesignPicker() {
  const { design, modes, selectDesign } = useAppearance();
  return (
    <ul className="pg-design-grid" role="radiogroup" aria-label="Design de l’application">
      {DESIGNS.map((d) => {
        const active = d.id === design;
        return (
          <li key={d.id}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Design ${d.name}`}
              className="pg-design-card"
              data-design-preview={d.id}
              data-active={active ? "true" : "false"}
              onClick={() => selectDesign(d.id)}
            >
              <span className="pg-design-shot" aria-hidden="true">
                <span className="pg-design-shot-bar" />
                <span className="pg-design-shot-body">
                  <span className="pg-design-shot-side" />
                  <span className="pg-design-shot-main">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
              </span>
              <span className="pg-design-copy">
                <span className="pg-design-title">
                  <b>{d.name}</b>
                  {active ? (
                    <span className="pg-badge" data-tone="success"><Icon name="check" size={13} /> Actif</span>
                  ) : (
                    <span className="pg-badge">{modes[d.id] === "dark" ? "Sombre" : "Clair"}</span>
                  )}
                </span>
                <small>{d.description}</small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Raccourci d'en-tête : un bouton qui déroule les cinq designs sans quitter
 * l'écran où l'on travaille. La page Paramètres reste l'endroit où l'on
 * explique le choix.
 */
export function QuickDesignMenu() {
  const { design, modes, selectDesign } = useAppearance();
  return (
    <details className="pg-appearance">
      <summary className="pg-appearance-trigger" title="Changer le design de l’application">
        <Icon name="palette" size={17} />
        <span className="pg-appearance-label">Apparence</span>
      </summary>
      <div className="pg-more-links pg-appearance-links" role="radiogroup" aria-label="Design de l’application">
        {DESIGNS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={d.id === design}
            className="pg-nav-link pg-appearance-option"
            data-active={d.id === design ? "true" : "false"}
            onClick={() => selectDesign(d.id)}
          >
            <Icon name={d.icon} size={17} />
            <span>{d.name}</span>
            <small>{modes[d.id] === "dark" ? "sombre" : "clair"}</small>
          </button>
        ))}
      </div>
    </details>
  );
}

/** Bloc complet utilisé sur la page Paramètres : designs + thème + raccourci. */
export function AppearanceSettings() {
  const { design } = useAppearance();
  const nom = DESIGNS.find((d) => d.id === design)?.name ?? design;
  return (
    <div className="pg-stack">
      <div className="pg-card-head">
        <div>
          <h2>Design de l’application</h2>
          <p>
            Cinq interfaces au choix. Le choix est conservé sur cet appareil et s’applique à tous les écrans,
            y compris le tableau de bord et la caisse.
          </p>
        </div>
        <span className="pg-badge"><Icon name="palette" size={14} /> {nom}</span>
      </div>
      <DesignPicker />
      <div className="pg-card-head border-t pt-4 mt-4 mb-0">
        <div>
          <h2>Thème clair / sombre</h2>
          <p>
            Chaque design mémorise son propre mode : l’atelier peut rester clair sur le bureau et la caisse
            passer en sombre sur la tablette du comptoir.
          </p>
        </div>
        <ThemeModeControl />
      </div>
    </div>
  );
}
