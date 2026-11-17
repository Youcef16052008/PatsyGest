"use client";

/**
 * MOD-15 — panneau d'export CSV (US-15.2). Les tables de coût ne sont listées
 * que pour les rôles qui peuvent les lire ; le serveur refait le contrôle de
 * toute façon (défense en profondeur).
 */

export type TableExportUi = { cle: string; titre: string; cout?: boolean };

export default function ExportPanel({ tables }: { tables: TableExportUi[] }) {
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Exports CSV</h2>
      <p className="mb-3 text-xs text-slate-500">
        Format Excel FR (point-virgule, virgule décimale, BOM UTF-8). Chaque export ne contient
        que les données de votre établissement. Les tables de coût ne sont proposées qu’aux rôles
        propriétaire et laboratoire.
      </p>
      <div className="flex flex-wrap gap-2">
        {tables.map((t) => (
          <a
            key={t.cle}
            href={`/api/export?table=${encodeURIComponent(t.cle)}`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-violet-400 hover:text-violet-800"
          >
            ⬇ {t.titre}
          </a>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Ces exports servent de sauvegarde portable et d’appui pour le comptable.
        Ils ne restaurent pas la base : voir « Sauvegarde / restauration » dans le
        guide du pilote.
      </p>
    </section>
  );
}
