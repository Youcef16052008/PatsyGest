"use client";

import { useState, useTransition, type FormEvent } from "react";
import { validerComptageTiroir } from "@/lib/actions-journaux";
import { dinars, jourLocal } from "@/lib/workspace-data";

type SiteOption = { id: string; label: string };

const DENOMINATIONS = [2000, 1000, 500, 200, 100, 50, 20, 10] as const;

export default function SellerBlindClosing({
  sites,
  mode,
  today = jourLocal(),
}: {
  sites: SiteOption[];
  mode: "demo" | "supabase";
  today?: string;
}) {
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [fondInitial, setFondInitial] = useState("0");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [manualTotal, setManualTotal] = useState("");
  const [useBreakdown, setUseBreakdown] = useState(true);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const breakdownSum = DENOMINATIONS.reduce(
    (sum, billet) => sum + billet * Math.max(0, Math.floor(Number(counts[billet]) || 0)),
    0,
  );
  const countedDa = useBreakdown
    ? breakdownSum
    : Math.max(0, Math.round((Number(manualTotal) || 0) * 100) / 100);
  const fondDa = Math.max(0, Math.round((Number(fondInitial) || 0) * 100) / 100);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    if (!siteId) {
      setNotice({ kind: "error", text: "Choisissez votre boutique avant de valider." });
      return;
    }
    if (countedDa < 0 || !Number.isFinite(countedDa)) {
      setNotice({ kind: "error", text: "Saisissez un montant compté valide." });
      return;
    }

    if (mode === "demo") {
      try {
        window.localStorage.setItem(
          `patisgest.vendeur_comptage.${today}.${siteId}`,
          JSON.stringify({
            date: today,
            siteId,
            fondInitial: fondDa,
            especesComptees: countedDa,
            note: note.trim(),
            savedAt: new Date().toISOString(),
          }),
        );
      } catch {
        /* ignore storage quota */
      }
      setDone(true);
      setNotice({
        kind: "success",
        text: "Comptage de fin de journée enregistré et transmis au propriétaire ✓",
      });
      return;
    }

    startTransition(async () => {
      const res = await validerComptageTiroir({
        date: today,
        siteId,
        fondInitial: fondDa,
        especesComptees: countedDa,
        note: note.trim(),
      });
      if (res.ok) {
        setDone(true);
        setNotice({
          kind: "success",
          text: res.succes ?? "Comptage de fin de journée enregistré et transmis au propriétaire ✓",
        });
      } else {
        setNotice({
          kind: "error",
          text: res.erreur ?? "Impossible d’enregistrer le comptage. Réessayez.",
        });
      }
    });
  }

  return (
    <section className="pg-card pg-card-pad pg-stack">
      <div className="pg-card-head">
        <div>
          <h2>Compter ma caisse en fin de journée</h2>
          <p>
            Comptez les billets et pièces présents dans votre tiroir. Le rapprochement complet reste réservé au propriétaire.
          </p>
        </div>
        <span className="pg-badge" data-tone={done ? "success" : "planned"}>
          {done ? "Comptage envoyé ✓" : `Date : ${today}`}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="pg-stack">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            Boutique
            <select
              className="pg-input mt-1 w-full"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              required
            >
              {sites.length === 0 && <option value="">Aucune boutique attribuée</option>}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Fond de caisse de départ (DA)
            <input
              type="number"
              min={0}
              step="1"
              className="pg-input mt-1 w-full"
              value={fondInitial}
              onChange={(e) => setFondInitial(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={useBreakdown ? "pg-button" : "pg-button pg-button-secondary"}
            onClick={() => setUseBreakdown(true)}
          >
            Compter par billets &amp; pièces
          </button>
          <button
            type="button"
            className={!useBreakdown ? "pg-button" : "pg-button pg-button-secondary"}
            onClick={() => setUseBreakdown(false)}
          >
            Saisir le total directement
          </button>
        </div>

        {useBreakdown ? (
          <div className="grid gap-2 sm:grid-cols-4">
            {DENOMINATIONS.map((billet) => (
              <label
                key={billet}
                className="flex items-center justify-between gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-bold text-slate-800">{billet} DA</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="0"
                  aria-label={`Nombre de billets ou pièces de ${billet} DA`}
                  className="pg-input w-20 text-right"
                  value={counts[billet] ?? ""}
                  onChange={(e) =>
                    setCounts((prev) => ({ ...prev, [billet]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        ) : (
          <label className="block max-w-sm text-xs font-semibold text-slate-700">
            Total des espèces comptées dans le tiroir (DA)
            <input
              type="number"
              min={0}
              step="1"
              required
              placeholder="Ex : 24500"
              className="pg-input mt-1 w-full"
              value={manualTotal}
              onChange={(e) => setManualTotal(e.target.value)}
            />
          </label>
        )}

        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
          style={{ background: "var(--pg-tint)" }}
        >
          <div>
            <span className="text-xs font-bold pg-muted block">Total compté dans mon tiroir</span>
            <strong className="text-xl">{dinars(countedDa, false)}</strong>
          </div>
          <label className="min-w-60 flex-1 text-xs font-semibold text-slate-700">
            Remarque éventuelle (facultatif)
            <input
              type="text"
              maxLength={200}
              placeholder="Ex : Monnaie laissée pour demain matin"
              className="pg-input mt-1 w-full"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        {notice && (
          <p
            role={notice.kind === "error" ? "alert" : "status"}
            className={`text-sm font-semibold ${notice.kind === "error" ? "text-red-700" : "text-emerald-700"}`}
          >
            {notice.text}
          </p>
        )}

        <div>
          <button type="submit" disabled={pending || !siteId} className="pg-button">
            {pending ? "Enregistrement…" : "Valider mon comptage de fin de journée"}
          </button>
        </div>
      </form>
    </section>
  );
}
