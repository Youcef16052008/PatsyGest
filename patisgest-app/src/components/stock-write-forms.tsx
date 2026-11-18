"use client";

import { useActionState } from "react";
import { Disclosure } from "./workspace-ui";
import { createArticle, receiveLot } from "@/lib/actions-stock";

type Option = { id: string; label: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";

/** Formulaires d'écriture réels (Supabase + RLS) — affichés uniquement aux rôles autorisés. */
export default function StockWriteForms({
  articles,
  sites,
  fournisseurs,
}: {
  articles: Option[];
  sites: Option[];
  fournisseurs: Option[];
}) {
  const [artState, artAction, artPending] = useActionState(createArticle, {});
  const [recState, recAction, recPending] = useActionState(receiveLot, {});

  return (
    <div className="pg-stack">
      <Disclosure title="Nouvel article" description="Créer un produit fini ou un ingrédient." icon="plus">
        <form action={artAction} className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Nom de l’article<input name="nom" required maxLength={120} placeholder="Mille-feuille" className={field} /></label>
          <label className={label}>Code article<input name="code" required maxLength={40} placeholder="PF-002" className={field} /></label>
          <label className={label}>Type<select name="niveau" defaultValue="produit" className={field}><option value="matiere">Matière première</option><option value="produit">Produit fini</option></select></label>
          <label className={label}>Unité<input name="unite" required maxLength={20} defaultValue="pcs" className={field} /></label>
          <label className={label}>Seuil d&apos;alerte<input name="seuil" type="number" min={0} step="any" defaultValue={0} className={field} /></label>
          <label className={label}>Prix de vente HT (DA)<input name="pv_ht" type="number" min={0} step="0.01" defaultValue={0} className={field} /></label>
          <label className={label}>TVA %<input name="tva" type="number" min={0} max={100} step="0.01" defaultValue={19} className={field} /></label>
          <label className={label}>Allergènes (séparés par des virgules)<input name="allergenes" maxLength={500} placeholder="gluten, œufs" className={field} /></label>
          <label className={label}>Traces (séparées par des virgules)<input name="traces" maxLength={500} placeholder="fruits à coque" className={field} /></label>
          <div className="sm:col-span-2">
            {artState.erreur && <p role="alert" className="mb-2 text-sm text-red-700">{artState.erreur}</p>}
            {artState.succes && <p role="status" className="mb-2 text-sm text-emerald-700">{artState.succes}</p>}
            <button disabled={artPending} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {artPending ? "Création…" : "Créer l'article"}
            </button>
          </div>
        </form>
      </Disclosure>

      <Disclosure title="Réceptionner un lot" description="Enregistrer l’arrivée d’un article et sa quantité." icon="box">
        <form action={recAction} className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Article<select name="articleId" required className={field}>
            {articles.length === 0 && <option value="">— créez d&apos;abord un article —</option>}
            {articles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select></label>
          <label className={label}>Quantité<input name="qte" type="number" min={0.0001} step="any" required className={field} /></label>
          <label className={label}>Site<select name="siteId" required className={field}>
            {sites.length === 0 && <option value="">Aucun site configuré</option>}
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select></label>
          <label className={label}>Numéro de lot<input name="numero" required maxLength={80} placeholder="LOT-301" className={field} /></label>
          <label className={label}>Prix unitaire HT<input name="pu" type="number" min={0} step="0.01" required className={field} /></label>
          <label className={label}>Date limite de consommation (facultative)<input name="dlc" type="date" className={field} /></label>
          <label className={label}>Fournisseur (optionnel)<select name="fournisseurId" className={field}>
            <option value="">—</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select></label>
          <label className={label}>Référence (optionnel)<input name="ref" maxLength={80} className={field} /></label>
          <div className="sm:col-span-2">
            {recState.erreur && <p role="alert" className="mb-2 text-sm text-red-700">{recState.erreur}</p>}
            {recState.succes && <p role="status" className="mb-2 text-sm text-emerald-700">{recState.succes}</p>}
            <button disabled={recPending || articles.length === 0 || sites.length === 0} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {recPending ? "Réception…" : "Réceptionner"}
            </button>
          </div>
        </form>
      </Disclosure>
    </div>
  );
}
