"use client";

import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { APPEARANCE_COOKIE, DESIGNS, writeAppearance, type Appearance, type ColorMode, type Design } from "@/lib/appearance";
import { Icon } from "./workspace-icons";

const AppearanceContext = createContext<{ design: Design; mode: ColorMode; selectDesign: (id: Design) => void; selectMode: (mode: ColorMode) => void } | null>(null);

export function AppearanceProvider({ initial, children }: { initial: Appearance; children: ReactNode }) {
  const [value, setValue] = useState(initial);
  const mode = value.modes[value.design];
  function apply(next: Appearance) {
    document.documentElement.dataset.design = next.design;
    document.documentElement.dataset.mode = next.modes[next.design];
    document.cookie = `${APPEARANCE_COOKIE}=${writeAppearance(next)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setValue(next);
  }
  return <AppearanceContext.Provider value={{
    design: value.design, mode,
    selectDesign: (design) => apply({ ...value, design }),
    selectMode: (mode) => apply({ ...value, modes: { ...value.modes, [value.design]: mode } }),
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

export default function AppearancePicker({ compact = false }: { compact?: boolean }) {
  const { design, mode, selectDesign, selectMode } = useAppearance();
  const popup = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const active = DESIGNS.find((item) => item.id === design)!;
  return <>
    <button className={compact ? "pg-appearance-trigger" : "pg-button pg-button-secondary"} ref={trigger} type="button" aria-haspopup="dialog"
      onClick={() => popup.current?.showModal()}>
      <Icon name="palette" size={18} />
      <span className="pg-appearance-label">{compact ? "Apparence" : "Choisir l’apparence"}</span>
      {compact && <><span className="pg-active-design">{" "}{active.name}</span><Icon name="down" size={14} /></>}
    </button>
    <dialog className="pg-appearance-dialog" ref={popup} aria-labelledby={titleId} onClose={() => trigger.current?.focus()}>
      <div className="pg-dialog-content">
        <div className="pg-dialog-head"><div><p className="pg-kicker">Votre espace de travail</p><h2 id={titleId}>Apparence</h2></div>
          <button className="pg-icon-button" aria-label="Fermer" type="button" onClick={() => popup.current?.close()}><Icon name="close" /></button></div>
        <p className="pg-muted">Choisissez l’interface qui vous aide à travailler. Les modules, les droits et vos données restent les mêmes.</p>
        <div className="pg-design-grid" role="group" aria-label="Interface">
          {DESIGNS.map((item, index) => <button key={item.id} type="button" className="pg-design-choice" aria-pressed={item.id === design} onClick={() => selectDesign(item.id)}>
            <span aria-hidden="true" className={`pg-design-mini pg-mini-${item.id}`}><i/><i/><i/><i/></span>
            <span className="pg-design-choice-copy"><span className="pg-design-name"><small>0{index + 1}</small> {item.name}</span><span>{item.description}</span></span>
            {item.id === design && <span className="pg-design-check"><Icon name="check" size={17}/></span>}
          </button>)}
        </div>
        <div className="pg-design-mode"><div><b>Mode de {active.name}</b><p>Le mode est mémorisé pour chaque interface sur ce navigateur.</p></div>
          <div className="pg-segment" role="group" aria-label="Mode de couleur">
            <button type="button" aria-pressed={mode === "light"} onClick={() => selectMode("light")}><Icon name="sun" size={16}/> Clair</button>
            <button type="button" aria-pressed={mode === "dark"} onClick={() => selectMode("dark")}><Icon name="moon" size={16}/> Sombre</button>
          </div>
        </div>
        <div className="pg-dialog-actions"><button type="button" className="pg-button" onClick={() => popup.current?.close()}>Terminé <Icon name="check" size={16}/></button></div>
      </div>
    </dialog>
  </>;
}
