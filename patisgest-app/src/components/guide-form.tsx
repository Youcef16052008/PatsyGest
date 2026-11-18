"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

export const champGuide = "mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 focus-visible:border-violet-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-500 sm:text-sm";
export const btnGuide = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-50";

export function LibelleGuide({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 text-sm font-semibold text-slate-700">{label}{children}</label>;
}

type RetourGuide = { erreur?: string; succes?: string; familleId?: string };

export function useActionGuide(action: (prev: RetourGuide, data: FormData) => Promise<RetourGuide>) {
  return useActionState<RetourGuide, FormData>(async (prev, data) => {
    try {
      return await action(prev, data);
    } catch {
      return { erreur: "Pas de réponse. Vérifiez votre connexion avant de réessayer." };
    }
  }, {});
}

type GroupeGuide = { nom: string; titre: string; aide?: string; contenu: ReactNode };
type Champ = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const selecteur = 'input:not([type="hidden"]), select, textarea';

/** Les groupes inactifs restent montés : Retour ne perd aucune saisie. */
export default function FormulaireGuide({ groupes, valider, action, onSubmit, pending = false, erreur, indisponible = false }: {
  groupes: GroupeGuide[];
  valider: string;
  action?: (data: FormData) => void | Promise<void>;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  pending?: boolean;
  erreur?: string;
  indisponible?: boolean;
}) {
  const [actif, setActif] = useState(0);
  const ref = useRef<HTMLFormElement>(null);
  const cible = useRef<Champ | null>(null);
  const dernier = actif === groupes.length - 1;

  useEffect(() => {
    const champInvalide = cible.current;
    cible.current = null;
    if (champInvalide) {
      champInvalide.focus();
      champInvalide.reportValidity();
      return;
    }
    const groupe = ref.current?.querySelector(`[data-groupe="${actif}"]`);
    const champs = groupe?.querySelectorAll<Champ>(selecteur);
    const premier = [...(champs ?? [])].find((champ) => !champ.disabled && champ.getClientRects().length > 0);
    (premier ?? groupe?.querySelector("h2"))?.focus({ preventScroll: true });
  }, [actif]);

  function verifier(groupe?: ParentNode | null) {
    const invalide = [...(groupe?.querySelectorAll<Champ>(selecteur) ?? [])]
      .find((champ) => champ.willValidate && !champ.validity.valid);
    if (!invalide) return true;
    const details = invalide.closest("details");
    if (details) details.open = true;
    const index = Number(invalide.closest<HTMLElement>("[data-groupe]")?.dataset.groupe ?? actif);
    if (index === actif) invalide.reportValidity();
    else {
      cible.current = invalide;
      setActif(index);
    }
    return false;
  }

  function avancer() {
    if (pending || indisponible) return;
    if (verifier(ref.current?.querySelector(`[data-groupe="${actif}"]`))) setActif(actif + 1);
  }

  function soumettre(e: FormEvent<HTMLFormElement>) {
    // Même avec la touche Entrée, seul le dernier groupe peut envoyer les données.
    if (!dernier) {
      e.preventDefault();
      avancer();
    } else if (pending || indisponible || !verifier(e.currentTarget)) {
      e.preventDefault();
    } else {
      onSubmit?.(e);
    }
  }

  return (
    <form ref={ref} action={action} onSubmit={soumettre} noValidate aria-busy={pending}
      className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm sm:p-6">
      {groupes.length > 1 && (
        <ol aria-label="Groupes du formulaire" className="mb-5 flex flex-wrap items-center gap-1.5 text-xs font-semibold sm:gap-2">
          {groupes.map((g, i) => (
            <li key={g.nom} aria-current={i === actif ? "step" : undefined}
              className={`rounded-full px-2.5 py-1.5 ${i === actif ? "bg-violet-100 text-violet-950" : "bg-slate-100 text-slate-600"}`}>
              <span aria-hidden="true">{i < actif ? "✓" : i + 1} · </span>{g.nom}
            </li>
          ))}
        </ol>
      )}
      <fieldset disabled={pending}>
        {groupes.map((g, i) => (
          <div key={g.nom} hidden={i !== actif} data-groupe={i}>
            <h2 tabIndex={-1} className="text-lg font-bold tracking-tight text-slate-900">{g.titre}</h2>
            {g.aide && <p className="mt-1 text-sm text-slate-600">{g.aide}</p>}
            <div className="mt-4">{g.contenu}</div>
          </div>
        ))}
      </fieldset>
      {erreur && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {actif > 0 && (
          <button type="button" onClick={() => setActif(actif - 1)} disabled={pending}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50">Retour</button>
        )}
        {dernier ? (
          <button key="enregistrer" type="submit" disabled={pending || indisponible} className={btnGuide}>
            {pending ? "Enregistrement…" : valider}
          </button>
        ) : (
          <button key="continuer" type="button" onClick={(e) => { e.preventDefault(); avancer(); }}
            disabled={pending || indisponible} className={btnGuide}>
            Continuer <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </form>
  );
}
