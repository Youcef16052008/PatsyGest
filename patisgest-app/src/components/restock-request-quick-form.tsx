"use client";

import { useActionState, useState } from "react";
import { createRestockRequestReal } from "@/lib/actions-planning";
import { type JournalState } from "@/lib/journal-actions-communs";
import { addRestockRequest } from "@/lib/patisgest-store";
import { jourLocal, plusJours } from "@/lib/workspace-data";
import { useOptionalDemoWorkspace } from "./demo-workspace";

type Option = { id: string; label: string };

export default function RestockRequestQuickForm({
  articles,
  sites,
  mode = "supabase",
}: {
  articles: Option[];
  sites: Option[];
  mode?: "demo" | "supabase";
}) {
  const [state, action, pending] = useActionState(createRestockRequestReal, {});
  const [demoMsg, setDemoMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const demoWs = useOptionalDemoWorkspace();
  const tomorrow = plusJours(jourLocal(), 1);

  if (mode === "demo") {
    return (
      <section className="pg-card pg-card-pad pg-stack">
        <div className="pg-card-head">
          <div>
            <h2>Demander un réassort au labo</h2>
            <p>Signalez au laboratoire ce qu’il manque en vitrine pour demain.</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const articleId = String(fd.get("articleId") ?? "");
            const prod = articles.find((a) => a.id === articleId);
            const qte = Number(fd.get("qte"));
            const targetDate = String(fd.get("dateCible") ?? tomorrow);
            const motif = String(fd.get("motif") ?? "").trim();
            if (demoWs?.data) {
              try {
                const next = addRestockRequest(demoWs.data, {
                  targetDate,
                  site: "Boutique",
                  articleId,
                  qty: qte,
                  motif,
                  demandeur: "Vendeur",
                });
                if (!demoWs.save(next)) {
                  setDemoMsg({ kind: "err", text: "Enregistrement local impossible." });
                  return;
                }
              } catch (err) {
                setDemoMsg({ kind: "err", text: err instanceof Error ? err.message : "Demande invalide." });
                return;
              }
            }
            setDemoMsg({
              kind: "ok",
              text: `Demande transmise au labo : ${prod?.label ?? "Produit"} × ${Number.isFinite(qte) ? qte : 1} pour le ${targetDate} ✓`,
            });
            form.reset();
          }}
          className="grid gap-3 sm:grid-cols-4"
        >
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
            Produit à réassortir
            <select name="articleId" required className="pg-input mt-1 w-full">
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Quantité souhaitée
            <input name="qte" type="number" min={1} step="1" defaultValue={12} required className="pg-input mt-1 w-full" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Pour le
            <input name="dateCible" type="date" defaultValue={tomorrow} required className="pg-input mt-1 w-full" />
          </label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-3">
            Motif / précision (facultatif)
            <input name="motif" maxLength={120} placeholder="Vitrine presque vide" className="pg-input mt-1 w-full" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="pg-button w-full">
              Demander au labo
            </button>
          </div>
        </form>
        {demoMsg && (
          <p role="status" className={`text-sm font-semibold ${demoMsg.kind === "err" ? "text-red-700" : "text-emerald-700"}`}>
            {demoMsg.text}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="pg-card pg-card-pad pg-stack">
      <div className="pg-card-head">
        <div>
          <h2>Demander un réassort au labo</h2>
          <p>Transmettez au laboratoire les quantités à préparer pour votre boutique.</p>
        </div>
      </div>
      <form action={action} className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs font-semibold text-slate-700">
          Boutique
          <select name="siteId" required className="pg-input mt-1 w-full" defaultValue={sites[0]?.id ?? ""}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
          Produit fini
          <select name="articleId" required className="pg-input mt-1 w-full">
            {articles.length === 0 && <option value="">Aucun produit</option>}
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Quantité souhaitée
          <input name="qte" type="number" min={1} step="1" defaultValue={12} required className="pg-input mt-1 w-full" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Pour le
          <input name="dateCible" type="date" defaultValue={tomorrow} required className="pg-input mt-1 w-full" />
        </label>
        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
          Motif (facultatif)
          <input name="motif" maxLength={120} placeholder="Rupture prévue cet après-midi" className="pg-input mt-1 w-full" />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending || articles.length === 0 || sites.length === 0}
            className="pg-button w-full"
          >
            {pending ? "Envoi…" : "Demander au labo"}
          </button>
        </div>
      </form>
      {(state as JournalState).erreur && (
        <p role="alert" className="text-sm font-semibold text-red-700">{(state as JournalState).erreur}</p>
      )}
      {(state as JournalState).succes && (
        <p role="status" className="text-sm font-semibold text-emerald-700">{(state as JournalState).succes}</p>
      )}
    </section>
  );
}
