"use client";

import { useActionState } from "react";
import { definirMonTelephone, type LicenceActionState } from "@/lib/actions-licence";

export default function TelephoneAlerteForm({
  initialPhone,
  roleLabel,
}: {
  initialPhone: string | null;
  roleLabel: string;
}) {
  const [state, action, pending] = useActionState(definirMonTelephone, {} as LicenceActionState);

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Alertes coupure Internet (&gt; 1 heure) · {roleLabel}</h2>
      <p className="mb-3 text-xs text-slate-500">
        Si Internet est coupé pendant plus d’une heure sur votre appareil, une alerte SMS et WhatsApp
        est automatiquement envoyée au Master, au laboratoire et au vendeur pour rétablir la connexion.
      </p>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[240px] flex-1 text-xs font-semibold text-slate-600">
          Votre numéro SMS / WhatsApp (ex. 0550123456 ou +213550123456)
          <input
            name="telephone"
            type="tel"
            maxLength={40}
            defaultValue={initialPhone ?? ""}
            placeholder="+213 550 00 00 00"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer mon numéro"}
        </button>
      </form>
      {state.erreur && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.erreur}
        </p>
      )}
      {state.succes && (
        <p role="status" className="mt-2 text-sm text-emerald-700">
          {state.succes}
        </p>
      )}
    </section>
  );
}
