"use client";

import { useState } from "react";
import { createFamilleReal, createVersionReal } from "@/lib/actions-recettes";
import FormulaireGuide, { champGuide, LibelleGuide, useActionGuide } from "./guide-form";

export type OptionGuide = { id: string; label: string };
export type ArticleOptionGuide = OptionGuide & { unite: string };
type Ligne = { article: string; qte: string };
const ligneVide: Ligne = { article: "", qte: "" };
const grille = "grid gap-3 sm:grid-cols-2";

function Options({ liste }: { liste: OptionGuide[] }) {
  return liste.map((o) => <option key={o.id} value={o.id}>{o.label}</option>);
}

function VersionGuide({ familles, ingredients, recente, surNouvelle }: {
  familles: OptionGuide[]; ingredients: ArticleOptionGuide[]; recente: string; surNouvelle?: () => void;
}) {
  const [famille, setFamille] = useState(recente);
  const [qte, setQte] = useState("12");
  const [unite, setUnite] = useState("pcs");
  const [lignes, setLignes] = useState<Ligne[]>([ligneVide]);
  const [couts, setCouts] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionGuide(createVersionReal);
  const changer = (i: number, detail: Partial<Ligne>) => setLignes((avant) => avant.map((l, j) => i === j ? { ...l, ...detail } : l));

  return <FormulaireGuide action={action} pending={pending} erreur={state.erreur} valider="Créer et activer la recette"
    groupes={[
      {
        nom: "Rendement", titre: "Combien de portions préparez-vous ?", aide: "Par exemple, 12 éclairs par fournée.",
        contenu: <div className={grille}>
          <div className="sm:col-span-2"><LibelleGuide label="Recette">
            <select name="familleId" required value={famille} onChange={(e) => setFamille(e.target.value)} className={champGuide}>
              <option value="">Choisir une recette</option><Options liste={familles} />
            </select>
          </LibelleGuide>
            {surNouvelle && <button type="button" onClick={surNouvelle} className="mt-1 min-h-11 text-sm font-semibold text-violet-800 hover:underline">Créer une nouvelle fiche recette</button>}
          </div>
          <LibelleGuide label="Quantité obtenue"><input name="rendementQte" type="number" min="0.0001" max="100000000" step="any" required value={qte} onChange={(e) => setQte(e.target.value)} className={champGuide} /></LibelleGuide>
          <LibelleGuide label="Unité"><input name="rendementUnite" required maxLength={10} value={unite} onChange={(e) => setUnite(e.target.value)} className={champGuide} /></LibelleGuide>
        </div>,
      },
      {
        nom: "Ingrédients", titre: "Ajoutez les ingrédients", aide: "Indiquez les quantités pour toute la fournée.",
        contenu: <div className="space-y-3">
          <input type="hidden" name="lineCount" value={lignes.length} />
          {lignes.map((l, i) => {
            const uniteIngredient = ingredients.find((a) => a.id === l.article)?.unite ?? "";
            return <div key={i} className="grid items-end gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
              <input type="hidden" name={`line${i}_kind`} value="article" />
              <input type="hidden" name={`line${i}_u`} value={uniteIngredient} />
              <LibelleGuide label={`Ingrédient ${i + 1}`}>
                <select name={`line${i}_ref`} required value={l.article} onChange={(e) => changer(i, { article: e.target.value })} className={champGuide}>
                  <option value="">Choisir</option><Options liste={ingredients} />
                </select>
              </LibelleGuide>
              <LibelleGuide label={`Quantité${uniteIngredient ? ` (${uniteIngredient})` : ""}`}><input name={`line${i}_q`} type="number" min="0.0001" max="100000000" step="any" required value={l.qte} onChange={(e) => changer(i, { qte: e.target.value })} className={champGuide} /></LibelleGuide>
              {lignes.length > 1 && <button type="button" aria-label={`Retirer l’ingrédient ${i + 1}`} onClick={() => setLignes(lignes.filter((_, j) => j !== i))}
                className="min-h-11 rounded-xl px-2 text-sm font-semibold text-violet-800 hover:bg-violet-100">Retirer</button>}
            </div>;
          })}
          {lignes.length < 100 && <button type="button" onClick={() => setLignes([...lignes, ligneVide])}
            className="min-h-11 rounded-xl px-3 text-sm font-bold text-violet-800 hover:bg-violet-50">+ Ajouter un ingrédient</button>}
        </div>,
      },
      {
        nom: "Activation", titre: "Activez votre recette", aide: "Elle servira au calcul du coût et à la fabrication.",
        contenu: <div className="space-y-3">
          <input type="hidden" name="active" value="on" />
          <p className="rounded-xl bg-violet-50 p-3 text-sm font-semibold text-violet-950">{qte} {unite} · {lignes.length} ingrédient(s)</p>
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-violet-800">Renseigner les autres coûts (facultatif)</summary>
            <div className={`mt-3 ${grille}`}>
              {([
                ["moMin", "Main-d’œuvre (min)", 1_000_000], ["energie", "Énergie (DA)", 1_000_000],
                ["emballage", "Emballage (DA)", 1_000_000], ["fraisGeneraux", "Frais généraux (DA)", 1_000_000],
                ["cuissonPertePct", "Perte à la cuisson (%)", 100],
              ] as const).map(([name, label, max]) => (
                <LibelleGuide key={name} label={label}><input name={name} type="number" min="0" max={max} step="0.01" value={couts[name] ?? ""} onChange={(e) => setCouts({ ...couts, [name]: e.target.value })} className={champGuide} /></LibelleGuide>
              ))}
            </div>
          </details>
        </div>,
      },
    ]} />;
}

export default function RecetteGuide({ familles, produits, ingredients }: {
  familles: OptionGuide[]; produits: OptionGuide[]; ingredients: ArticleOptionGuide[];
}) {
  const [nouvelle, setNouvelle] = useState(familles.length === 0);
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [produit, setProduit] = useState("");
  const [state, action, pending] = useActionGuide(createFamilleReal);
  const recente = state.familleId ?? "";
  const choix = recente && !familles.some((f) => f.id === recente) ? [...familles, { id: recente, label: nom }] : familles;

  if (nouvelle && !recente) {
    return <div className="space-y-2">
      <FormulaireGuide action={action} pending={pending} erreur={state.erreur} valider="Enregistrer la fiche recette"
        groupes={[
          {
            nom: "Nom et code", titre: "Nommez la recette", aide: "Par exemple, « Éclair au chocolat ».",
            contenu: <div className={grille}>
              <LibelleGuide label="Nom"><input name="nom" required maxLength={100} placeholder="Éclair au chocolat" value={nom} onChange={(e) => setNom(e.target.value)} className={champGuide} /></LibelleGuide>
              <LibelleGuide label="Code"><input name="code" required maxLength={20} placeholder="R-ECLAIR" value={code} onChange={(e) => setCode(e.target.value)} className={champGuide} /></LibelleGuide>
            </div>,
          },
          {
            nom: "Produit lié", titre: "Reliez la recette à votre produit",
            contenu: <LibelleGuide label="Produit"><select name="produitId" required value={produit} onChange={(e) => setProduit(e.target.value)} className={champGuide}>
              <option value="">Choisir un produit</option><Options liste={produits} />
            </select></LibelleGuide>,
          },
        ]} />
      {familles.length > 0 && <button type="button" disabled={pending} onClick={() => setNouvelle(false)} className="min-h-11 px-2 text-sm font-semibold text-violet-800 hover:underline">Utiliser une fiche existante</button>}
    </div>;
  }

  return <VersionGuide key={recente || "existante"} familles={choix} ingredients={ingredients}
    recente={recente || (choix.length === 1 ? choix[0].id : "")}
    surNouvelle={recente ? undefined : () => setNouvelle(true)} />;
}
