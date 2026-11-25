"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  syncTrialAnchorMultiStore,
  type ServerLicenseBundle,
  type TrialAnchorRecord,
} from "@/lib/trial-lock-client";
import TrialLockScreen from "./trial-lock-screen";

export default function TrialGuardClient({
  scopeId,
  mode,
  initialBundle = null,
  initialLocked = false,
  masterPhone = null,
  showBanner = true,
  onLogoutAction,
}: {
  scopeId: string;
  mode: "supabase" | "pilote-local" | "hors-ligne";
  initialBundle?: ServerLicenseBundle | null;
  initialLocked?: boolean;
  masterPhone?: string | null;
  showBanner?: boolean;
  onLogoutAction?: () => Promise<void>;
}) {
  const [anchor, setAnchor] = useState<TrialAnchorRecord | null>(null);
  const [locked, setLocked] = useState<boolean>(initialLocked);
  const [daysRemaining, setDaysRemaining] = useState<number>(
    initialBundle?.payload
      ? Math.max(
          0,
          Math.ceil(
            (initialBundle.payload.expiresAtMs - initialBundle.payload.issuedAtMs) / 86_400_000,
          ),
        )
      : 90,
  );
  const lastPerfRef = useRef<number>(0);
  const bundleRef = useRef<ServerLicenseBundle | null>(initialBundle);

  const runSync = useCallback(
    async (bundle: ServerLicenseBundle | null = bundleRef.current) => {
      if (!scopeId) return;
      const nowPerf = typeof performance !== "undefined" ? performance.now() : 0;
      const deltaPerf = lastPerfRef.current > 0 ? Math.max(0, nowPerf - lastPerfRef.current) : 0;
      lastPerfRef.current = nowPerf;
      const res = await syncTrialAnchorMultiStore(scopeId, bundle, Date.now(), deltaPerf);
      setAnchor(res.anchor);
      setLocked(res.locked || initialLocked);
      setDaysRemaining(res.daysRemaining);
    },
    [scopeId, initialLocked],
  );

  useEffect(() => {
    bundleRef.current = initialBundle;
    void runSync(initialBundle);

    const timer = window.setInterval(() => {
      void runSync(null);
    }, 15_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void runSync(null);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [initialBundle, runSync]);

  // Heartbeat de présence en ligne pour la détection de coupure Internet (> 1h).
  useEffect(() => {
    if (mode !== "supabase") return;

    const sendHeartbeat = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const res = await fetch("/api/presence/heartbeat", {
          method: "POST",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok?: boolean;
          signedBundle?: ServerLicenseBundle;
        };
        if (json.signedBundle) {
          bundleRef.current = json.signedBundle;
          await runSync(json.signedBundle);
        }
      } catch {
        /* offline */
      }
    };

    void sendHeartbeat();
    const hbTimer = window.setInterval(() => {
      void sendHeartbeat();
    }, 5 * 60_000);
    window.addEventListener("online", sendHeartbeat);

    return () => {
      window.clearInterval(hbTimer);
      window.removeEventListener("online", sendHeartbeat);
    };
  }, [mode, runSync]);

  const effectiveLocked =
    locked ||
    initialLocked ||
    Boolean(anchor?.lockedPermanent);

  const lockReason =
    anchor?.lockReason ??
    (initialBundle?.payload.statut === "suspendu" ? "suspended" : "expired");

  return (
    <>
      {showBanner && !effectiveLocked && anchor?.statut === "essai" && mode === "supabase" && (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2 text-xs text-violet-950"
          role="status"
        >
          <span>
            <strong>Mode d’essai</strong> · {daysRemaining} jour{daysRemaining > 1 ? "s" : ""} restant
            {daysRemaining > 1 ? "s" : ""} (sur {anchor.trialDays} j).
          </span>
          <span className="text-violet-700">
            Activation définitive via l’administrateur Master.
          </span>
        </div>
      )}

      {effectiveLocked && (
        <TrialLockScreen
          clientNom={anchor?.clientNom ?? initialBundle?.payload.clientNom}
          reason={lockReason}
          expiresAtMs={anchor?.expiresAtMs ?? initialBundle?.payload.expiresAtMs}
          masterPhone={masterPhone}
          onServerBundle={async (bundle) => {
            bundleRef.current = bundle;
            await runSync(bundle);
          }}
          onLogout={onLogoutAction ? () => void onLogoutAction() : undefined}
        />
      )}
    </>
  );
}
