"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { demanderCommande, type CommandeState } from "@/app/(vitrine)/vitrine/[slug]/commander/actions";
import { jourLocal, plusJours } from "@/lib/workspace-data";

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";

export type ArticleCommande = {
  cleNom: string;
  nom: string;
  prix: string;
};

/**
 * Formulaire de commande du visiteur.
 *
 * La clé d'idempotence est tirée UNE fois au montage et conservée pour la
 * durée de la page : un double clic, un retour arrière ou une coupure
 * réseau renvoient la même demande au lieu d'en créer une seconde. Si le
 * visiteur modifie sa quantité puis renvoie, c'est toujours la même clé —
 * et donc la même demande : c'est voulu, une demande se corrige par
 * téléphone, elle ne se duplique pas.
 */
export default function VitrineCommande({
  sousDomaine,
  articles,
}: {
  sousDomaine: string;
  articles: ArticleCommande[];
}) {
  const [state, action, pending] = useActionState(demanderCommande, {} as CommandeState);
  const idRef = useId();
  const [cle] = useState(() => {
    // `crypto.randomUUID` n'existe pas partout en contexte non sécurisé ;
    // on retombe sur un identifiant construit, toujours >= 8 caractères.
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `${Date.now().toString(36)}-${idRef}`;
  });

  const aujourdhui = useMemo(() => jourLocal(), []);
  const max = useMemo(() => plusJours(jourLocal(), 365), []);

  if (state.succes) {
    return (
      <section className="mt-8 rounded-xl border border-emerald-300 bg-emerald-50 p-5">
        <h2 className="text-lg font-bold text-emerald-900">Demande envoyée</h2>
        <p className="mt-1 text-sm text-emerald-900">{state.succes}</p>
        <p className="mt-2 text-sm text-emerald-800">
          Aucun paiement n’est demandé en ligne : la boutique vous rappelle pour confirmer.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 p-5">
      <h2 className="text-lg font-bold">Commander</h2>
      <p className="mt-1 text-sm text-slate-600">
        Laissez vos coordonnées : la boutique vous rappelle pour confirmer le prix et la date.
        Aucun paiement n’est demandé en ligne.
      </p>

      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="sousDomaine" value={sousDomaine} />
        <input type="hidden" name="cleNavigateur" value={cle} />

        <label className={`${label} sm:col-span-2`}>
          Pâtisserie souhaitée
          <select name="cleRecette" required className={field} defaultValue={articles[0]?.cleNom ?? ""}>
            {articles.map((a) => (
              <option key={a.cleNom} value={a.cleNom}>
                {a.nom} — {a.prix}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          Votre nom
          <input name="nom" required minLength={2} maxLength={100} autoComplete="name" className={field} />
        </label>
        <label className={label}>
          Téléphone
          <input
            name="telephone"
            required
            minLength={6}
            maxLength={40}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0555 12 34 56"
            className={field}
          />
        </label>
        <label className={label}>
          Date souhaitée
          <input name="dateEvent" type="date" required min={aujourdhui} max={max} className={field} />
        </label>
        <label className={label}>
          Nombre de parts
          <input name="nbParts" type="number" required min={1} max={10000} defaultValue={8} className={field} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Précisions (allergies, décor, retrait…)
          <textarea name="note" maxLength={500} rows={3} className={field} />
        </label>

        <div className="sm:col-span-2">
          <button
            disabled={pending}
            className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {pending ? "Envoi…" : "Envoyer la demande"}
          </button>
          {state.erreur && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {state.erreur}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
