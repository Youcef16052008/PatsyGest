"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createDemoWorkspace, DEMO_STORAGE_KEY } from "@/lib/demo-workspace";
import { upgradeState, type State } from "@/lib/patisgest-store";

const DemoContext = createContext<{ data: State | null; save: (next: State) => boolean } | null>(null);

export function DemoWorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<State | null>(null);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- lecture du stockage uniquement dans le navigateur */
    try {
      const saved = localStorage.getItem(DEMO_STORAGE_KEY);
      setData(saved ? upgradeState(JSON.parse(saved) as State) : createDemoWorkspace());
    } catch { setData(createDemoWorkspace()); }
    /* eslint-enable react-hooks/set-state-in-effect */
    function update(event: StorageEvent) {
      if (event.key === DEMO_STORAGE_KEY && event.newValue) {
        try { setData(upgradeState(JSON.parse(event.newValue) as State)); } catch { /* données externes invalides */ }
      }
    }
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  const save = useCallback((next: State) => {
    try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next)); setData(next); return true; }
    catch { return false; }
  }, []);
  return <DemoContext.Provider value={{ data, save }}>{children}</DemoContext.Provider>;
}

export function useDemoWorkspace() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("DemoWorkspaceProvider manquant");
  return context;
}

export function useOptionalDemoWorkspace() {
  return useContext(DemoContext);
}
