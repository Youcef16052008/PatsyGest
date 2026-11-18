import Link from "next/link";
import { lienGuide, type ProgressionOnboarding } from "@/lib/onboarding";

export default function OnboardingPanel({ progression }: { progression: ProgressionOnboarding }) {
  const { prochaine, faites, total, etapes } = progression;
  if (!prochaine) return null;

  return (
    <section aria-labelledby="onboarding-titre"
      className="pg-home-guide relative isolate overflow-hidden rounded-3xl p-5 shadow-sm sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -top-36 -right-28 -z-10 size-80 rounded-full border-[26px] border-current/10 ring-1 ring-current/10" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="onboarding-titre" className="text-xs font-bold uppercase tracking-[.17em] text-violet-800">Premiers pas</h2>
        <output aria-label={`${faites} étapes terminées sur ${total}`} className="rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold tabular-nums">
          {faites} / {total}
        </output>
      </div>
      <h3 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{prochaine.titre}</h3>
      <p className="mt-1 text-sm text-violet-800">{prochaine.consigne}</p>
      <div className="mt-4 flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-violet-800 sm:px-4">
        {prochaine.visuel.map((mot, i) => (
          <span key={mot} className="inline-flex items-center gap-2">
            {i === 0 ? <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v4m0 12v4M2 12h4m12 0h4m-6-4 3-3M5 19l3-3M5 5l3 3m8 8 3 3"/></svg> : <span className="text-violet-600">→</span>}
            {mot}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-2">
        <Link href={lienGuide(prochaine)} prefetch={false}
          className="pg-button">
          Me guider <span aria-hidden="true">→</span>
        </Link>
        <details className="group max-w-full">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-violet-800 hover:underline [&::-webkit-details-marker]:hidden">
            Voir les {total} étapes <span aria-hidden="true" className="text-violet-600 group-open:rotate-180">⌄</span>
          </summary>
          <ol className="mt-1 grid gap-x-6 gap-y-2 border-t border-violet-200 py-3 sm:grid-cols-2">
            {etapes.map((etape) => (
              <li key={etape.cle} aria-current={etape.cle === prochaine.cle ? "step" : undefined} className="flex items-center gap-2 text-xs">
                <span aria-label={etape.fait ? "Terminée" : undefined} className={`grid size-5 shrink-0 place-items-center rounded-full font-bold ${etape.fait ? "bg-emerald-100 text-emerald-900" : "bg-violet-100 text-violet-800"}`}>{etape.fait ? "✓" : etape.numero}</span>
                <span>{etape.titre}</span>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
}
