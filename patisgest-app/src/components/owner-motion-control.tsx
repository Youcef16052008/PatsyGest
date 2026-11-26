"use client";

import { useState } from "react";

/** Laisser chacun arrêter les animations décoratives sans bloquer les actions. */
export default function OwnerMotionControl() {
  const [paused, setPaused] = useState(false);
  return <button
    type="button"
    className="pg-owner-motion-control"
    aria-label="Mettre en pause les animations décoratives"
    aria-pressed={paused}
    onClick={(event) => {
      const next = !paused;
      const header = event.currentTarget.closest(".pg-owner-heading");
      if (header) header.setAttribute("data-motion-paused", String(next));
      setPaused(next);
    }}
  >
    <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
    {paused ? "Reprendre l’animation" : "Pause animation"}
  </button>;
}
