"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { analyserSauvegarde, confirmerRestauration, type RestaurationState } from "@/lib/actions-restauration";
import { TABLES_EXCLUES } from "@/lib/sauvegarde";

const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const btnGhost = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50";
const input = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";

/**
 * US-15.2 — sauvegarde et restauration en 2 clics.
 *
 * Le fichier est gardé en état React : un `<input type="file">` se vide après
 * chaque envoi, donc un parcours « analyser puis confirmer » qui repasserait
 * par le formulaire obligerait l'utilisateur à re-sélectionner le même fichier.
 * On construit donc le FormData à la main et on appelle les actions
 * directement. Analyser n'écrit jamais ; confirmer exige le mot RESTAURER.
 */
export default function SauvegardePanel() {
  const [fichier, setFichier] = useState<File | null>(null);
  const [analyse, setAnalyse] = useState<RestaurationState>({});
  const [restau, setRestau] = useState<RestaurationState>({});
  const [confirmation, setConfirmation] = useState("");
  const [enAnalyse, startAnalyse] = useTransition();
  const [enRestau, startRestau] = useTransition();

  const donnees = () => {
    const fd = new FormData();
    if (fichier) fd.set("fichier", fichier);
    fd.set("confirmation", confirmation);
    return fd;
  };

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Sauvegarde &amp; restauration</h2>
      <p className="mb-3 text-xs text-slate-500">
        Le fichier JSON contient toutes vos données métier (aucune donnée prisonnière). Réservé au
        propriétaire. À conserver hors de la plateforme, une fois par semaine au minimum.
      </p>

      <Link href="/api/sauvegarde" prefetch={false} className={`${btn} inline-block`}>
        ⬇ Télécharger la sauvegarde complète
      </Link>

      <details className="mt-5 rounded-xl border border-slate-200 p-3" open={!!analyse.analyse}>
        <summary className="cursor-pointer text-sm font-bold text-slate-700">Restaurer une sauvegarde…</summary>

        <div className="mt-3 space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            Fichier de sauvegarde (.json)
            <input type="file" accept="application/json,.json"
              onChange={(e) => {
                setFichier(e.target.files?.[0] ?? null);
                setAnalyse({});
                setRestau({});
                setConfirmation("");
              }}
              className={input} />
          </label>
          {fichier && (
            <p className="text-xs text-slate-500">
              {fichier.name} · {(fichier.size / 1024).toFixed(1)} Ko
            </p>
          )}

          <button type="button" disabled={!fichier || enAnalyse} className={btnGhost}
            onClick={() => startAnalyse(async () => setAnalyse(await analyserSauvegarde({}, donnees())))}>
            {enAnalyse ? "Analyse…" : "1. Analyser le fichier"}
          </button>

          {analyse.erreur && <p role="alert" className="text-sm text-red-700">{analyse.erreur}</p>}

          {analyse.analyse && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <p className="font-bold text-slate-700">Contenu du fichier ({analyse.total} ligne(s)) :</p>
              <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
                {analyse.analyse.filter((a) => a.lignes > 0).map((a) => (
                  <li key={a.table}>{a.table} : {a.lignes}</li>
                ))}
              </ul>
              <p className="mt-2 text-slate-500">
                La restauration <b>ajoute</b> les lignes : elle ne supprime rien. Les lignes déjà
                présentes (même identifiant) sont ignorées.
              </p>
            </div>
          )}

          <div className="space-y-2 border-t border-slate-200 pt-3">
            <label className="block text-xs font-semibold text-slate-600">
              Tapez <b>RESTAURER</b> pour confirmer
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
                placeholder="RESTAURER" className={input} />
            </label>
            <button type="button"
              disabled={!fichier || enRestau || confirmation.trim().toUpperCase() !== "RESTAURER"}
              className={btn}
              onClick={() => startRestau(async () => setRestau(await confirmerRestauration({}, donnees())))}>
              {enRestau ? "Restauration…" : "2. Confirmer la restauration"}
            </button>
          </div>

          {restau.erreur && <p role="alert" className="text-sm text-red-700">{restau.erreur}</p>}
          {restau.succes && <p role="status" className="text-sm text-emerald-700">{restau.succes}</p>}
          {restau.insere && restau.insere.length > 0 && (
            <ul className="text-xs text-slate-500">
              {restau.insere.map((i) => <li key={i.table}>{i.table} : {i.lignes} ligne(s)</li>)}
            </ul>
          )}
        </div>
      </details>

      <p className="mt-3 text-xs text-slate-500">
        Non inclus dans le fichier : {TABLES_EXCLUES.map((e) => e.table).join(", ")} —
        {TABLES_EXCLUES[0]?.raison}. Les comptes de connexion se recréent côté Supabase Auth.
      </p>
    </section>
  );
}
