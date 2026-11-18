"use client";

import { useState } from "react";
import { createFournisseur } from "@/lib/actions-achats";
import FormulaireGuide, { btnGuide, champGuide, LibelleGuide, useActionGuide } from "./guide-form";

export default function FournisseurForm({ guide = false }: { guide?: boolean }) {
  const [nom, setNom] = useState("");
  const [state, action, pending] = useActionGuide(async (prev, data) => {
    const resultat = await createFournisseur(prev, data);
    if (resultat.succes) setNom("");
    return resultat;
  });
  const champ = <LibelleGuide label="Nom du fournisseur"><input name="nom" required maxLength={120}
    placeholder="Moulins d’Oran" value={nom} onChange={(e) => setNom(e.target.value)} className={champGuide} /></LibelleGuide>;

  if (guide) return <FormulaireGuide action={action} pending={pending} erreur={state.erreur} valider="Ajouter le fournisseur"
    groupes={[{ nom: "Nom du fournisseur", titre: "Indiquez son nom", aide: "Par exemple, « Moulins d’Oran ».", contenu: champ }]} />;

  return (
    <section id="nouveau-fournisseur" className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="font-bold">Nouveau fournisseur</h2>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 grow sm:max-w-sm">{champ}</div>
        <button type="submit" disabled={pending} className={btnGuide}>{pending ? "Enregistrement…" : "Ajouter le fournisseur"}</button>
      </form>
      {state.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="mt-2 text-sm text-emerald-700">{state.succes}</p>}
    </section>
  );
}
