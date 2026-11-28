"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADVANCED_MODE_COOKIE } from "@/lib/appearance";

export default function AdvancedModeToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const router = useRouter();

  function toggle(next: boolean) {
    document.cookie = `${ADVANCED_MODE_COOKIE}=${next ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setEnabled(next);
    router.refresh();
  }

  return (
    <div className="pg-segment" role="group" aria-label="Niveau de navigation">
      <button type="button" aria-pressed={!enabled} onClick={() => toggle(false)}>
        Simple (6 onglets)
      </button>
      <button type="button" aria-pressed={enabled} onClick={() => toggle(true)}>
        Avancé (tout voir)
      </button>
    </div>
  );
}
