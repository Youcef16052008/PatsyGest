"use client";

import { useActionState, useState, type FormEvent } from "react";
import { sauverEtablissement, type EtablissementState } from "@/lib/actions-etablissement";
import { LIBELLES_LEGAUX, enteteTicket, avertissementsTicket, type Etablissement } from "@/lib/etablissement";

const DEMO_ETABLISSEMENT_KEY = "patisgest.demo_etablissement.v1";
const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

/**
 * US-15.1 — identité de l'établissement (NIF, NIS, RC) : ces mentions sont
 * obligatoires sur le ticket (§5). Un aperçu montre exactement ce qui sera
 * imprimé, et les manques sont annoncés avant l'enregistrement.
 */
export default function EtablissementForm({
  etablissement,
  mode = "supabase",
}: {
  etablissement: Etablissement;
  mode?: "demo" | "supabase";
}) {
  const [state, action, pending] = useActionState(sauverEtablissement, {} as EtablissementState);
  const [demoLocal, setDemoLocal] = useState<Etablissement>(() => {
    if (mode !== "demo" || typeof window === "undefined") return etablissement;
    try {
      const raw = window.localStorage.getItem(DEMO_ETABLISSEMENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Etablissement>;
        return {
          nom: parsed.nom?.trim() || etablissement.nom,
          adresse: parsed.adresse ?? etablissement.adresse,
          telephone: parsed.telephone ?? etablissement.telephone,
          nif: parsed.nif ?? etablissement.nif,
          nis: parsed.nis ?? etablissement.nis,
          rc: parsed.rc ?? etablissement.rc,
        };
      }
    } catch {
      /* ignore */
    }
    return etablissement;
  });
  const [demoState, setDemoState] = useState<EtablissementState>({});

  const courant = mode === "demo" ? demoLocal : etablissement;
  const avertissements = avertissementsTicket(courant);
  const apercu = enteteTicket(courant);
  const displayState = mode === "demo" ? demoState : state;

  function onDemoSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nom = String(fd.get("nom") ?? "").trim();
    const adresse = String(fd.get("adresse") ?? "").trim();
    const telephone = String(fd.get("telephone") ?? "").trim();
    const nif = String(fd.get("nif") ?? "").trim();
    const nis = String(fd.get("nis") ?? "").trim();
    const rc = String(fd.get("rc") ?? "").trim();
    if (!nom) {
      setDemoState({ erreur: "Nom de l’établissement requis." });
      return;
    }
    const next: Etablissement = {
      nom,
      adresse: adresse || null,
      telephone: telephone || null,
      nif: nif || null,
      nis: nis || null,
      rc: rc || null,
    };
    try {
      window.localStorage.setItem(DEMO_ETABLISSEMENT_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("patisgest-demo-etablissement"));
      setDemoLocal(next);
      setDemoState({ succes: "Identité enregistrée localement pour vos tickets de démonstration." });
    } catch {
      setDemoState({ erreur: "Enregistrement local impossible." });
    }
  }

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Identité de l’établissement</h2>
      <p className="mb-3 text-xs text-slate-500">
        Mentions obligatoires sur le ticket et la facture (§5 du cahier des charges) : NIF, NIS,
        RC, adresse. Réservé au propriétaire.
      </p>

      {avertissements.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          <b>Ticket non conforme tant que ces points ne sont pas réglés :</b>
          <ul className="mt-1 list-disc pl-5">
            {avertissements.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
          <p className="mt-2">L’encaissement n’est pas bloqué : le ticket sort avec les mentions disponibles.</p>
        </div>
      )}

      <form
        action={mode === "demo" ? undefined : action}
        onSubmit={mode === "demo" ? onDemoSubmit : undefined}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className={`${label} sm:col-span-2`}>Nom de l’établissement
          <input name="nom" required maxLength={100} defaultValue={courant.nom} className={field} />
        </label>
        <label className={`${label} sm:col-span-2`}>Adresse (exigée par le décret 13-378)
          <input name="adresse" required maxLength={200} defaultValue={courant.adresse ?? ""} className={field} />
        </label>
        <label className={label}>Téléphone
          <input name="telephone" maxLength={40} defaultValue={courant.telephone ?? ""} className={field} />
        </label>
        <label className={label}>{LIBELLES_LEGAUX.nif}
          <input name="nif" required inputMode="numeric" placeholder="15 chiffres" defaultValue={courant.nif ?? ""} className={field} />
        </label>
        <label className={label}>{LIBELLES_LEGAUX.nis}
          <input name="nis" required inputMode="numeric" placeholder="15 chiffres" defaultValue={courant.nis ?? ""} className={field} />
        </label>
        <label className={label}>{LIBELLES_LEGAUX.rc}
          <input name="rc" required maxLength={40} placeholder="31/00-123456B26" defaultValue={courant.rc ?? ""} className={field} />
        </label>
        <div className="sm:col-span-2">
          <button disabled={pending} className={btn}>{pending ? "Enregistrement…" : "Enregistrer l’identité"}</button>
          {displayState.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{displayState.erreur}</p>}
          {displayState.succes && <p role="status" className="mt-2 text-sm text-emerald-700">{displayState.succes}</p>}
        </div>
      </form>

      <div className="mt-5 max-w-xs rounded-lg border border-dashed border-slate-400 bg-white p-3 font-mono text-[11px]">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Aperçu en-tête ticket</p>
        {apercu.map((l, i) => <div key={i} className={i === 0 ? "text-center font-bold" : "text-center"}>{l}</div>)}
      </div>
    </section>
  );
}
