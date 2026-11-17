"use client";

import { useState } from "react";
import { buildLabelModel, type LabelIngredient, type LabelLot, type LabelProduct } from "@/lib/label-model";

type ProduitRow = LabelProduct & { id: string };

type Props = {
  produits: ProduitRow[];
  recipes: Record<string, LabelIngredient[]>;
  lots: Record<string, LabelLot[]>;
};

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";

/**
 * Étiquette produit (MOD-10 — MVP allergènes, décret exécutif13-378) :
 * ingrédients de la recette active avec allergènes surlignés, allergènes et
 * traces du produit, lot + DLC (proche parmi les lots en stock), impression.
 * Lecture seule : aucune donnée n'est modifiée.
 */
export default function LabelMaker({ produits, recipes, lots }: Props) {
  const [selected, setSelected] = useState(produits[0]?.id ?? "");
  const produit = produits.find((p) => p.id === selected);
  if (!produit) return null;
  const model = buildLabelModel(produit, recipes[produit.id] ?? [], lots[produit.id] ?? []);

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Étiquette produit</h2>
      <p className="mb-3 text-xs text-slate-500">
        Ingrédients de la recette active (ordre de la recette — règle INCO : décroissant),
        allergènes mis en évidence, lot et DLC parmi les lots en stock. MVP « allergènes » :
        les valeurs nutritionnelles (tableau V4) ne sont pas fournies ici. Mention
        « à consommer de préférence » à vérifier avant impression.
      </p>
      <div className="flex flex-wrap items-start gap-4 print:hidden">
        <label className={`${label} min-w-64`}>Produit fini
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className={field}>
            {produits.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.nom}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => window.print()}
          className="mt-5 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white">
          🖨 Imprimer l&apos;étiquette
        </button>
      </div>

      <div className="mt-4 max-w-md rounded-xl border-2 border-dashed border-slate-400 bg-white p-4">
        <h4 className="mb-1 text-base font-black">{model.nom} <span className="text-xs font-bold text-slate-500">({model.code})</span></h4>
        <p className="mb-1 text-sm">
          <b>Ingrédients :</b>{" "}
          {model.sansRecette ? (
            <span className="text-slate-500">recette non renseignée.</span>
          ) : (
            model.ingredientSegments.map((segs, i) => (
              <span key={i}>
                {i > 0 && ", "}
                {segs.map((s, j) => (
                  <span key={j} className={s.allergen ? "font-bold underline" : ""}>{s.text}</span>
                ))}
              </span>
            ))
          )}
        </p>
        <p className="mb-1 text-sm">
          <b>Allergènes :</b>{" "}
          {model.allergenes.length > 0
            ? model.allergenes.map((a, i) => (
                <span key={i}>{i > 0 && ", "}<span className="font-bold underline">{a}</span></span>
              ))
            : "aucun détecté."}
        </p>
        {model.traces.length > 0 && (
          <p className="mb-1 text-sm">Traces éventuelles : {model.traces.join(", ")}</p>
        )}
        <p className="text-sm">
          Lot : <b>{model.lot ?? "—"}</b> · DLC : <b>{model.dlc ?? "—"}</b>
          <br />
          Conservation : selon produit (voir fiche) · À consommer de préférence avant la DLC.
        </p>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Étiquette générée depuis les données du pilote — vérifiez la conformité avant usage
        commercial (décret exécutif13-378 : dénomination, lot, DLC, fabricant, allergènes).
      </p>
    </section>
  );
}
