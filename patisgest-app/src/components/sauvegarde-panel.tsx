"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { analyserSauvegarde, confirmerRestauration, type RestaurationState } from "@/lib/actions-restauration";
import { MAX_OCTETS_SAUVEGARDE, TABLES_EXCLUES } from "@/lib/sauvegarde";

const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const btnGhost = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50";
const input = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm disabled:opacity-50";

type ResultatFichier = { fichier: File; etat: RestaurationState };

function useActionFichier(action: typeof analyserSauvegarde, fichier: File | null, erreurEnvoi: string) {
  const [resultat, soumettre, pending] = useActionState<ResultatFichier | null, FormData>(
    async (_prev, formData) => {
      if (!fichier) return null;
      formData.set("fichier", fichier);
      try {
        return { fichier, etat: await action({}, formData) };
      } catch {
        return { fichier, etat: { erreur: erreurEnvoi } };
      }
    },
    null,
  );
  // Le résultat d'un envoi ne concerne que le fichier effectivement soumis.
  return { etat: resultat?.fichier === fichier ? resultat.etat : null, soumettre, pending };
}

/** US-15.2 — analyser d'abord, réexpédier le même fichier pour confirmer. */
export default function SauvegardePanel() {
  // Sélecteur hors des deux formulaires : React peut les réinitialiser après
  // l'envoi sans effacer le fichier, gardé en mémoire le temps de la page.
  const [fichier, setFichier] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const { etat: analyse, soumettre: analyser, pending: enAnalyse } = useActionFichier(
    analyserSauvegarde, fichier,
    "Impossible d’analyser le fichier. Vérifiez votre connexion et réessayez.",
  );
  const analyseValide = !!analyse?.analyse && !enAnalyse;
  const { etat: restau, soumettre: restaurer, pending: enRestau } = useActionFichier(
    confirmerRestauration, analyseValide ? fichier : null,
    "Pas de réponse à la restauration. Vérifiez votre connexion avant de réessayer ; les lignes déjà présentes ne seront pas dupliquées.",
  );
  const enCours = enAnalyse || enRestau;
  const tropVolumineux = (fichier?.size ?? 0) > MAX_OCTETS_SAUVEGARDE;

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Sauvegarde &amp; restauration</h2>
      <p className="mb-3 text-xs text-slate-500">
        Export JSON partiel réservé au propriétaire. Les comptes, droits et données d’équipe ne sont pas
        restaurés : ce fichier ne remplace pas une sauvegarde complète de la base et d’Auth.
      </p>

      <Link href="/api/sauvegarde" prefetch={false} className={`${btn} inline-block`}>
        ⬇ Télécharger l’export partiel
      </Link>

      <details className="mt-5 rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">Restaurer une sauvegarde…</summary>

        <div className="mt-3 space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            Fichier de sauvegarde (.json)
            <input type="file" accept="application/json,.json" disabled={enCours}
              onChange={(e) => {
                setFichier(e.currentTarget.files?.[0] ?? null);
                setConfirmation("");
              }}
              className={input} />
          </label>
          {fichier && (
            <p className="text-xs text-slate-500">
              {fichier.name} · {(fichier.size / 1024).toFixed(1)} Ko
            </p>
          )}
          {tropVolumineux && <p role="alert" className="text-sm text-red-700">Fichier trop volumineux (4 Mio maximum).</p>}

          <form action={analyser} onSubmit={() => setConfirmation("")}>
            <button type="submit" disabled={!fichier || tropVolumineux || enCours} className={btnGhost}>
              {enAnalyse ? "Analyse…" : "1. Analyser le fichier"}
            </button>
          </form>

          {!enAnalyse && analyse?.erreur && <p role="alert" className="text-sm text-red-700">{analyse.erreur}</p>}
          {analyseValide && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <p role="status" className="font-bold text-slate-700">Contenu du fichier ({analyse?.total} ligne(s)) :</p>
              <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
                {analyse?.analyse?.filter((a) => a.lignes > 0).map((a) => (
                  <li key={a.table}>{a.table} : {a.lignes}</li>
                ))}
              </ul>
              <p className="mt-2 text-slate-500">
                La restauration <b>ajoute</b> les lignes : elle ne supprime rien. Les lignes déjà
                présentes (même identifiant) sont ignorées.
              </p>
            </div>
          )}

          <form action={restaurer} className="space-y-2 border-t border-slate-200 pt-3">
            <label className="block text-xs font-semibold text-slate-600">
              Tapez <b>RESTAURER</b> pour confirmer
              <input name="confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
                placeholder="RESTAURER" disabled={!analyseValide || enCours} className={input} />
            </label>
            {!analyseValide && !enAnalyse && <p className="text-xs text-slate-500">Analysez le fichier avant de confirmer.</p>}
            <button type="submit"
              disabled={!analyseValide || enCours || confirmation.trim().toUpperCase() !== "RESTAURER"}
              className={btn}>
              {enRestau ? "Restauration…" : "2. Confirmer la restauration"}
            </button>
          </form>

          {!enRestau && restau?.erreur && <p role="alert" className="text-sm text-red-700">{restau.erreur}</p>}
          {!enRestau && restau?.succes && <p role="status" className="text-sm text-emerald-700">{restau.succes}</p>}
          {!enRestau && restau?.insere && restau.insere.length > 0 && (
            <ul className="text-xs text-slate-500">
              {restau.insere.map((i) => <li key={i.table}>{i.table} : {i.lignes} ligne(s)</li>)}
            </ul>
          )}
        </div>
      </details>

      <div className="mt-3 text-xs text-slate-500">
        <p>Non inclus dans le fichier :</p>
        <ul>{TABLES_EXCLUES.map((e) => <li key={e.table}>{e.table} : {e.raison}.</li>)}</ul>
      </div>
    </section>
  );
}
