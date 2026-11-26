"use client";

import { useState } from "react";
import { jourLocal } from "@/lib/workspace-data";

/**
 * MOD-15 — panneau d'export CSV (US-15.2) et export comptable (§8.3).
 *
 * Les tables de coût ne sont listées que pour les rôles qui peuvent les lire ;
 * le serveur refait le contrôle de toute façon (défense en profondeur).
 *
 * L'export comptable est mis à part et non noyé dans la liste : ce n'est pas
 * « un CSV de plus ». Il a un format imposé par le CDC, il inclut les avoirs en
 * négatif, et le serveur refuse de le produire s'il ne se réconcilie pas au
 * centime. Le présenter comme les autres exports laisserait croire qu'il sort
 * toujours quelque chose — un refus est ici le comportement correct.
 */

export type TableExportUi = { cle: string; titre: string; cout?: boolean };

/** Mois précédent par défaut : c'est la période que demande un comptable. */
function periodeParDefaut(): { du: string; au: string } {
  const [annee, mois] = jourLocal().split("-").map(Number);
  const premier = new Date(Date.UTC(annee, mois - 2, 1));
  const dernier = new Date(Date.UTC(annee, mois - 1, 0));
  return { du: premier.toISOString().slice(0, 10), au: dernier.toISOString().slice(0, 10) };
}

function ExportComptable() {
  const [periode, setPeriode] = useState(periodeParDefaut);
  const lien = `/api/export/comptable?du=${periode.du}&au=${periode.au}`;
  return (
    <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <h3 className="font-bold text-violet-900">Export comptable</h3>
      <p className="mt-1 text-xs text-violet-800">
        Format attendu par un cabinet : date, pièce, compte auxiliaire, HT, TVA, TTC.
        Les retours et avoirs y figurent en négatif. Le fichier n’est produit que si
        les totaux se réconcilient au centime — sinon le serveur refuse et indique
        les pièces à vérifier.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-violet-900">
          Du
          <input
            type="date"
            value={periode.du}
            onChange={(e) => setPeriode((p) => ({ ...p, du: e.target.value }))}
            className="mt-1 block rounded-lg border border-violet-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-violet-900">
          Au
          <input
            type="date"
            value={periode.au}
            onChange={(e) => setPeriode((p) => ({ ...p, au: e.target.value }))}
            className="mt-1 block rounded-lg border border-violet-300 px-2 py-1 text-sm"
          />
        </label>
        <a
          href={lien}
          className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800"
        >
          ⬇ Télécharger l’export comptable
        </a>
      </div>
      <p className="mt-2 text-xs text-violet-700">
        Période par défaut : le mois précédent. Le rattachement aux comptes
        70x/445x doit être validé par votre comptable — nous ne choisissons pas
        votre plan comptable à votre place.
      </p>
    </div>
  );
}

export default function ExportPanel({ tables }: { tables: TableExportUi[] }) {
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Exports CSV</h2>
      <p className="mb-3 text-xs text-slate-500">
        Format Excel FR (point-virgule, virgule décimale, BOM UTF-8). Chaque export ne contient
        que les données de votre établissement. Les exports bruts sont réservés au propriétaire.
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
      <ExportComptable />
      <p className="mt-3 text-xs text-slate-500">
        Ces exports servent de sauvegarde portable et d’appui pour le comptable.
        Ils ne restaurent pas la base : voir « Sauvegarde / restauration » dans le
        guide du pilote.
      </p>
    </section>
  );
}
