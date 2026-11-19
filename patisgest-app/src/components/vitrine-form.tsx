"use client";

import { useActionState } from "react";
import {
  publierVitrine,
  reglerVitrineRecette,
  reserverSousDomaine,
  supprimerRecetteVitrine,
  type VitrineState,
} from "@/lib/actions-vitrine";
import { peutVitrine, type Role } from "@/lib/vitrine-permissions";
import { libellePrix } from "@/lib/vitrine-format";

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const btn2 = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700";

export type SiteVitrine = {
  id: string;
  nom: string;
  sousDomaine: string | null;
  publication: string;
  recettesVisibles: number;
};

export type RecetteVitrine = {
  id: string;
  nom: string;
  nomVitrine: string | null;
  description: string | null;
  photo: string | null;
  visible: boolean;
  ordre: number;
  prixHt: number | null;
  unite: string | null;
  /** Vrai si la recette porte des versions : on ne la supprime pas. */
  aDesVersions: boolean;
};

/**
 * Administration de la vitrine (paramètres → onglet).
 *
 * Les boutons affichés dépendent du rôle, mais ce n'est qu'un confort :
 * la RPC et la RLS refusent de toute façon. `peutVitrine` est le même
 * module que celui testé côté serveur, donc l'écran ne peut pas promettre
 * une action que le serveur rejetterait.
 */
export default function VitrineForm({
  role,
  sites,
  recettes,
  domaine,
}: {
  role: Role;
  sites: SiteVitrine[];
  recettes: RecetteVitrine[];
  domaine: string;
}) {
  const [reserveState, reserveAction, reservePending] = useActionState(
    reserverSousDomaine,
    {} as VitrineState,
  );
  const [pubState, pubAction, pubPending] = useActionState(publierVitrine, {} as VitrineState);
  const [regleState, regleAction, reglePending] = useActionState(
    reglerVitrineRecette,
    {} as VitrineState,
  );
  const [supprState, supprAction, supprPending] = useActionState(
    supprimerRecetteVitrine,
    {} as VitrineState,
  );

  const estProprietaire = peutVitrine(role, "publier_vitrine");
  const peutEditer = peutVitrine(role, "modifier_fiche");
  const peutSupprimer = peutVitrine(role, "supprimer_recette");

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Vitrine publique</h2>
      <p className="mb-4 text-xs text-slate-500">
        Le site que voient vos clients. Les commandes reçues arrivent en « demande » dans
        Cake Design : un vendeur les accepte (elles deviennent un devis à chiffrer) ou les
        refuse. Aucun paiement ne circule sur la vitrine.
      </p>

      {/* ------------------------------------------------ boutiques */}
      {sites.map((site) => {
        const enLigne = site.publication === "publiee";
        const adresse = site.sousDomaine ? `${site.sousDomaine}.${domaine}` : null;
        return (
          <div key={site.id} className="mb-4 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <b>{site.nom}</b>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  enLigne ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {enLigne ? "en ligne" : "hors ligne"}
              </span>
              <span className="text-xs text-slate-500">
                {site.recettesVisibles} recette{site.recettesVisibles > 1 ? "s" : ""} publiée
                {site.recettesVisibles > 1 ? "s" : ""}
              </span>
            </div>

            {adresse ? (
              <p className="mt-2 text-sm">
                Adresse publique :{" "}
                <a className="font-mono text-violet-800 underline" href={`/vitrine/${site.sousDomaine}`}>
                  {adresse}
                </a>
              </p>
            ) : (
              <p className="mt-2 text-sm text-amber-800">
                Aucune adresse réservée : la vitrine ne peut pas être mise en ligne.
              </p>
            )}

            {estProprietaire && (
              <form action={reserveAction} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="siteId" value={site.id} />
                <label className={`${label} max-w-64`}>
                  {adresse ? "Changer le sous-domaine" : "Réserver un sous-domaine"}
                  <div className="flex items-center gap-1">
                    <input
                      name="sousDomaine"
                      required
                      minLength={3}
                      maxLength={63}
                      pattern="[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
                      placeholder="ma-boutique"
                      defaultValue={site.sousDomaine ?? ""}
                      className={field}
                    />
                    <span className="whitespace-nowrap text-xs text-slate-500">.{domaine}</span>
                  </div>
                </label>
                <button disabled={reservePending} className={btn2}>
                  {reservePending ? "…" : "Réserver"}
                </button>
              </form>
            )}

            {estProprietaire && (
              <form action={pubAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="siteId" value={site.id} />
                <input type="hidden" name="publication" value={enLigne ? "aucune" : "publiee"} />
                <button
                  disabled={pubPending}
                  className={enLigne ? btn2 : btn}
                >
                  {pubPending ? "…" : enLigne ? "Retirer du public" : "Mettre en ligne"}
                </button>
              </form>
            )}
          </div>
        );
      })}

      {reserveState.erreur && <p role="alert" className="text-sm text-red-700">{reserveState.erreur}</p>}
      {reserveState.succes && <p role="status" className="text-sm text-emerald-700">{reserveState.succes}</p>}
      {pubState.erreur && <p role="alert" className="text-sm text-red-700">{pubState.erreur}</p>}
      {pubState.succes && <p role="status" className="text-sm text-emerald-700">{pubState.succes}</p>}

      {/* ------------------------------------------------ recettes */}
      <h3 className="mt-6 border-t border-slate-200 pt-4 font-bold">Recettes de la vitrine</h3>
      <p className="mb-3 text-xs text-slate-500">
        Dédoublonnage par nom : deux recettes qui portent le même nom ne s’affichent qu’une
        fois chez le client. {peutEditer ? "" : "Votre rôle ne permet pas de modifier cette liste."}
      </p>

      <ul className="space-y-2">
        {recettes.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <b>{r.nomVitrine ?? r.nom}</b>
              <span className="text-slate-500">{libellePrix({ prixHt: r.prixHt, unite: r.unite })}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  r.visible ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {r.visible ? "publiée" : "masquée"}
              </span>
              {r.photo ? <span className="text-xs text-slate-500">photo ✓</span> : null}
            </div>

            {peutEditer && (
              <form action={regleAction} className="mt-2 grid gap-2 sm:grid-cols-4">
                <input type="hidden" name="familleId" value={r.id} />
                <label className={label}>
                  Nom affiché
                  <input
                    name="nomVitrine"
                    maxLength={80}
                    defaultValue={r.nomVitrine ?? ""}
                    placeholder={r.nom}
                    className={field}
                  />
                </label>
                <label className={label}>
                  Description
                  <input
                    name="description"
                    maxLength={400}
                    defaultValue={r.description ?? ""}
                    className={field}
                  />
                </label>
                <label className={label}>
                  Ordre
                  <input name="ordre" type="number" min={0} max={9999} defaultValue={r.ordre} className={field} />
                </label>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                    <input type="checkbox" name="visible" defaultChecked={r.visible} />
                    Publiée
                  </label>
                  <button disabled={reglePending} className={btn2}>
                    {reglePending ? "…" : "Enregistrer"}
                  </button>
                </div>
              </form>
            )}

            {peutSupprimer && !r.aDesVersions && (
              <form action={supprAction} className="mt-2">
                <input type="hidden" name="familleId" value={r.id} />
                <button disabled={supprPending} className="text-xs font-bold text-red-700 underline">
                  {supprPending ? "…" : "Supprimer définitivement cette recette"}
                </button>
              </form>
            )}
            {r.aDesVersions && (
              <p className="mt-2 text-xs text-slate-500">
                Recette utilisée en production : dépubliez-la plutôt que de la supprimer
                (elle porte la traçabilité des lots).
              </p>
            )}
          </li>
        ))}
        {recettes.length === 0 && (
          <li className="text-sm text-slate-500">Aucune recette dans le catalogue.</li>
        )}
      </ul>

      {regleState.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{regleState.erreur}</p>}
      {regleState.succes && <p role="status" className="mt-2 text-sm text-emerald-700">{regleState.succes}</p>}
      {supprState.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{supprState.erreur}</p>}
      {supprState.succes && <p role="status" className="mt-2 text-sm text-emerald-700">{supprState.succes}</p>}
    </section>
  );
}
