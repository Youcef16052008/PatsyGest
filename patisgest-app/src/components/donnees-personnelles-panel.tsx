"use client";

import { useActionState } from "react";
import { anonymiserCommande, exporterDonnees, type DonneesState } from "@/lib/actions-donnees";
import { Notice } from "./workspace-ui";

/**
 * Loi 18-07 — panneau « Données personnelles » dans Paramètres.
 *
 * Deux droits, deux gestes :
 *   * **accès** : produire un export lisible de ce qui est détenu sur les
 *     clients (nom, téléphone, commandes) ;
 *   * **effacement** : anonymiser une commande, sans détruire l'écriture
 *     comptable correspondante.
 *
 * Le texte explique la différence entre « supprimer » et « anonymiser » plutôt
 * que de la laisser deviner : un utilisateur qui croit avoir « supprimé » et
 * retrouve la vente en comptabilité perdrait confiance dans le produit.
 */

const champ = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";

export default function DonneesPersonnellesPanel({
  commandes,
  migrationActive,
}: {
  commandes: { numero: string; nom: string; date: string }[];
  /** false si la migration 42 n'est pas appliquée : on le dit, on ne plante pas. */
  migrationActive: boolean;
}) {
  const [etatExport, actionExport, exportEnCours] = useActionState<DonneesState, FormData>(
    exporterDonnees,
    {},
  );
  const [etatAnon, actionAnon, anonEnCours] = useActionState<DonneesState, FormData>(
    anonymiserCommande,
    {},
  );

  return (
    <section className="pg-card pg-card-pad">
      <div className="pg-card-head">
        <div>
          <h2>Données personnelles — loi 18-07</h2>
          <p>
            Vos clients peuvent demander ce que vous détenez sur eux et demander à ne plus être
            identifiables. Ces deux gestes sont prévus ici.
          </p>
        </div>
      </div>

      {!migrationActive ? (
        <Notice kind="warning">
          La migration <code>42-donnees-personnelles</code> n’est pas appliquée sur cette base :
          l’export et l’anonymisation ne fonctionneront pas. Appliquez-la avant de promettre ces
          droits à un client.
        </Notice>
      ) : null}

      <div className="mt-4 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-bold">1. Droit d’accès — exporter</h3>
        <p className="mt-1 text-xs text-slate-600">
          Produit un fichier contenant les noms, téléphones et commandes de vos clients. C’est un
          document confidentiel : il contient précisément ce que la loi protège.
        </p>
        <form action={actionExport} className="mt-3">
          <button type="submit" className="pg-button pg-button-secondary" disabled={exportEnCours}>
            {exportEnCours ? "Génération…" : "Exporter les données personnelles"}
          </button>
        </form>
        {etatExport.erreur ? <Notice kind="error">{etatExport.erreur}</Notice> : null}
        {etatExport.succes ? <Notice kind="success">{etatExport.succes}</Notice> : null}
        {etatExport.export ? (
          <div className="mt-2">
            <a
              download={`patisgest-donnees-personnelles-${new Date().toISOString().slice(0, 10)}.json`}
              href={`data:application/json;charset=utf-8,${encodeURIComponent(
                JSON.stringify(etatExport.export, null, 2),
              )}`}
              className="text-sm font-semibold text-violet-800 underline"
            >
              Télécharger le fichier
            </a>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs">
              {JSON.stringify(etatExport.export, null, 2).slice(0, 2000)}
            </pre>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-bold">2. Droit d’effacement — anonymiser une commande</h3>
        <p className="mt-1 text-xs text-slate-600">
          Le nom et le téléphone sont remplacés par une référence. <strong>La commande et la
          vente restent en comptabilité</strong> : la loi impose de conserver les pièces 10 ans,
          et elle demande de ne plus identifier la personne — pas de détruire les écritures.
        </p>
        <form action={actionAnon} className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className={label}>
            Commande
            <input
              name="numero"
              required
              list="commandes-a-anonymiser"
              placeholder="C-001"
              className={champ}
            />
            <datalist id="commandes-a-anonymiser">
              {commandes.map((c) => (
                <option key={c.numero} value={c.numero}>
                  {c.nom} — {c.date}
                </option>
              ))}
            </datalist>
          </label>
          <label className={label}>
            Référence de la demande
            <input name="reference" required minLength={3} placeholder="18-07-2026-01" className={champ} />
          </label>
          <label className={label}>
            Motif
            <input name="motif" required minLength={3} placeholder="Demande du client" className={champ} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" className="pg-button pg-button-secondary" disabled={anonEnCours}>
              {anonEnCours ? "Anonymisation…" : "Anonymiser cette commande"}
            </button>
          </div>
        </form>
        {etatAnon.erreur ? <Notice kind="error">{etatAnon.erreur}</Notice> : null}
        {etatAnon.succes ? <Notice kind="success">{etatAnon.succes}</Notice> : null}
      </div>

      <p className="pg-muted mt-3">
        Chaque export et chaque anonymisation sont enregistrés dans le journal d’audit avec leur
        référence et leur motif. Une anonymisation non tracée serait indistinguable d’une perte de
        données — c’est précisément ce qu’un contrôle chercherait.
      </p>
    </section>
  );
}
