"use client";

/**
 * MOD-15 — assistant d'onboarding (US-15.3). Affiche la progression réelle
 * et pointe vers le module à ouvrir. Masquable : un pilote déjà installé ne
 * doit pas être dérangé par un tutoriel.
 */

import Link from "next/link";
import type { ProgressionOnboarding } from "@/lib/onboarding";

export default function OnboardingPanel({ progression }: { progression: ProgressionOnboarding }) {
  if (progression.termine) return null;

  return (
    <section className="mt-8 rounded-2xl border border-violet-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-violet-900">🚀 Premiers pas</h2>
        <p className="text-xs font-semibold text-slate-500">
          {progression.faites}/{progression.total} étapes · {progression.pourcentage} %
        </p>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-violet-600 transition-all"
          style={{ width: `${progression.pourcentage}%` }}
        />
      </div>

      {progression.prochaine && (
        <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-700">Prochaine étape</p>
          <p className="mt-1 font-bold text-violet-900">{progression.prochaine.titre}</p>
          <p className="mt-1 text-sm text-slate-600">{progression.prochaine.consigne}</p>
          <Link
            href={`/${progression.prochaine.module}`}
            className="mt-3 inline-block rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white"
          >
            Faire cette étape →
          </Link>
        </div>
      )}

      <ol className="mt-4 grid gap-1 text-sm">
        {progression.etapes.map((e) => (
          <li key={e.cle} className="flex items-start gap-2">
            <span className={e.fait ? "text-emerald-600" : "text-slate-300"}>{e.fait ? "✔" : "○"}</span>
            <span className={e.fait ? "text-slate-400 line-through" : "text-slate-700"}>
              {e.titre}
              {!e.bloquante && !e.fait && <span className="text-xs text-slate-400"> (recommandé)</span>}
            </span>
          </li>
        ))}
      </ol>

      {!progression.pretAVendre && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          Les étapes bloquantes doivent être faites avant la première vente : sans recette active,
          votre coût de revient et votre marge seraient faux.
        </p>
      )}
    </section>
  );
}
