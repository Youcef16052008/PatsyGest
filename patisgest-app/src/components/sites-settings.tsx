"use client";

import { useActionState } from "react";
import { enregistrerSite } from "@/lib/actions-sites";

export type SiteCompte = { id: string; nom: string; type: string; adresse: string | null };
const field = "pg-input";
function SiteForm({ site }: { site?: SiteCompte }) {
  const [state, action, pending] = useActionState(enregistrerSite, {});
  return <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
    {site && <input type="hidden" name="id" value={site.id}/>}
    <label className="pg-field">Nom<input name="nom" defaultValue={site?.nom ?? ""} maxLength={100} required className={field}/></label>
    <label className="pg-field">Type<select name="type" defaultValue={site?.type ?? "boutique"} className={field} required>
      {site && !["boutique", "laboratoire"].includes(site.type) && <option value="" disabled>Choisir un type valide</option>}
      <option value="boutique">Boutique</option><option value="laboratoire">Laboratoire</option></select></label>
    <label className="pg-field sm:col-span-2">Adresse <span className="font-normal">(facultatif)</span><input name="adresse" defaultValue={site?.adresse ?? ""} maxLength={200} className={field}/></label>
    <button disabled={pending} className="pg-button">{pending ? "Enregistrement…" : site ? "Enregistrer les modifications" : "Ajouter le site"}</button>
    {state.erreur && <p role="alert">{state.erreur}</p>}{state.succes && <p role="status">{state.succes}</p>}
  </form>;
}
export default function SitesSettings({ sites, error }: { sites: SiteCompte[]; error: boolean }) {
  return <section className="pg-card pg-card-pad mt-6"><h2>Boutiques et laboratoires</h2>
    <p>Ajoutez et modifiez les sites de votre établissement. Les sites existants ne sont pas supprimés pour préserver leur historique.</p>
    <p className="pg-help">L’attribution sécurisée des sites aux employés est en cours de développement ; cette liste ne limite pas encore leurs accès.</p>
    {error ? <p role="alert">Liste indisponible : réessayez avant de gérer les sites.</p> : <>
      {sites.length === 0 && <p>Aucun site configuré.</p>}
      {sites.map(site => <details key={site.id} className="mt-3"><summary>{site.nom} · {site.type}</summary><SiteForm site={site}/></details>)}
      <details className="mt-4"><summary>Ajouter une boutique ou un laboratoire</summary><SiteForm/></details>
    </>}
  </section>;
}
