"use client";

import { useState } from "react";
import { createArticle } from "@/lib/actions-stock";
import FormulaireGuide, { champGuide, LibelleGuide, useActionGuide } from "./guide-form";

export default function ArticleGuide({ niveau }: { niveau: "matiere" | "produit" }) {
  const matiere = niveau === "matiere";
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [unite, setUnite] = useState(matiere ? "kg" : "pcs");
  const [prix, setPrix] = useState("");
  const [tva, setTva] = useState("0");
  const [allergenes, setAllergenes] = useState("");
  const [traces, setTraces] = useState("");
  const [state, action, pending] = useActionGuide(createArticle);
  const mentions = <details className="rounded-xl border border-slate-200 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-violet-800">Options avancées (TVA, allergènes et traces)</summary>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <LibelleGuide label="TVA (%) — 0 par défaut"><input name="tva" type="number" required min="0" max="100" step="0.01" value={tva} onChange={(e) => setTva(e.target.value)} className={champGuide} /></LibelleGuide>
      <LibelleGuide label="Allergènes (séparés par des virgules)"><input name="allergenes" maxLength={500} placeholder="gluten, œufs" value={allergenes} onChange={(e) => setAllergenes(e.target.value)} className={champGuide} /></LibelleGuide>
      <LibelleGuide label="Traces possibles"><input name="traces" maxLength={500} placeholder="lait, fruits à coque" value={traces} onChange={(e) => setTraces(e.target.value)} className={champGuide} /></LibelleGuide>
    </div>
  </details>;

  return <FormulaireGuide action={action} pending={pending} erreur={state.erreur} valider={matiere ? "Créer l’ingrédient" : "Créer le produit"}
    groupes={[
      {
        nom: "Nom et code", titre: matiere ? "Nommez votre ingrédient" : "Nommez votre produit",
        aide: matiere ? "Par exemple, « Farine T55 »." : "Par exemple, « Éclair au chocolat ».",
        contenu: <div className="grid gap-3 sm:grid-cols-2">
          <LibelleGuide label="Nom"><input name="nom" required maxLength={120} placeholder={matiere ? "Farine T55" : "Éclair au chocolat"} value={nom} onChange={(e) => setNom(e.target.value)} className={champGuide} /></LibelleGuide>
          <LibelleGuide label="Code"><input name="code" required maxLength={40} placeholder={matiere ? "MP-FAR" : "PF-ECL"} value={code} onChange={(e) => setCode(e.target.value)} className={champGuide} /></LibelleGuide>
        </div>,
      },
      {
        nom: "Type et unité", titre: "Choisissez une unité",
        aide: matiere ? "Par exemple, le kg pour la farine." : "Par exemple, la pièce pour un éclair.",
        contenu: <div className="grid items-end gap-3 sm:grid-cols-2">
          <LibelleGuide label="Unité">
            <input name="unite" list="unites-guide" required maxLength={10} value={unite} onChange={(e) => setUnite(e.target.value)} className={champGuide} />
          </LibelleGuide>
          <datalist id="unites-guide"><option value="kg" /><option value="g" /><option value="L" /><option value="ml" /><option value="pcs" /></datalist>
          <input type="hidden" name="niveau" value={niveau} />
          <p className="rounded-xl bg-violet-50 px-3 py-3 text-sm font-semibold text-violet-950">Type · {matiere ? "Matière première" : "Produit fini"}</p>
        </div>,
      },
      matiere ? {
        nom: "Enregistrer", titre: "Vérifiez avant de créer",
        contenu: <div className="space-y-3">
          <div className="wrap-anywhere rounded-xl bg-violet-50 p-3 text-sm text-violet-950">
            <b>{nom}</b> · {code} · {unite}
            <p className="mt-1 text-violet-800">Le prix d’achat se renseigne à la réception du lot.</p>
          </div>
          {mentions}
        </div>,
      } : {
        nom: "Prix de vente", titre: "Indiquez le prix de vente",
        aide: "En dinars algériens (prix final client).",
        contenu: <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-1">
            <LibelleGuide label="Prix de vente (DA)"><input name="pv_ht" type="number" required min="0" max="10000000" step="0.01" value={prix} onChange={(e) => setPrix(e.target.value)} className={champGuide} /></LibelleGuide>
          </div>
          {mentions}
        </div>,
      },
    ]} />;
}
