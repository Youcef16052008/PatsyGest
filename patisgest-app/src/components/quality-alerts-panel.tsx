import type { AlerteQualite } from "@/lib/quality-alerts";

const STYLE: Record<AlerteQualite["niveau"], { bg: string; badge: string; label: string }> = {
  critique: { bg: "border-red-200 bg-red-50", badge: "bg-red-700", label: "Critique" },
  alerte: { bg: "border-amber-200 bg-amber-50", badge: "bg-amber-600", label: "Alerte" },
  attention: { bg: "border-slate-200 bg-slate-50", badge: "bg-slate-500", label: "À surveiller" },
};

/** Panneau de rappels qualité (HACCP) : températures, nettoyages, NC, DLC, planning. */
export default function QualityAlertsPanel({ alerts }: { alerts: AlerteQualite[] }) {
  if (alerts.length === 0) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="font-bold text-emerald-800">Rappels qualité — tout est vert</h2>
        <p className="text-sm text-emerald-700">
          Aucun relevé dépassé, aucun nettoyage ni tâche en retard, aucune DLC proche, aucune
          non-conformité ouverte.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Rappels qualité — {alerts.length}</h2>
      <p className="mb-3 text-xs text-slate-500">
        Températures hors seuil, relevés manquants, nettoyages et tâches en retard,
        non-conformités ouvertes, DLC expirées ou à7 jours.
      </p>
      <ul className="space-y-2">
        {alerts.map((a) => {
          const s = STYLE[a.niveau];
          return (
            <li key={a.cle} className={`rounded-lg border p-3 ${s.bg}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${s.badge}`}>{s.label}</span>
                <span className="text-sm font-bold">{a.titre}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-600">{a.detail}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
