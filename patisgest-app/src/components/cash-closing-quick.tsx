"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { validerComptageTiroir } from "@/lib/actions-journaux";
import { whatsappDailyClosingUrl } from "@/lib/whatsapp";
import { dinars } from "@/lib/workspace-data";

export default function CashClosingQuickWidget({
  today,
  shop = "Pâtisserie",
  mode = "demo",
  siteId = "",
  expectedCashDa,
  cardDa,
  transferDa,
  totalVentesDa,
  resteEncaisserDa = 0,
  tickets,
  alreadyClosed,
  ownerPhoneDefault = "",
}: {
  today: string;
  shop?: string;
  mode?: "demo" | "supabase";
  siteId?: string;
  expectedCashDa: number;
  cardDa: number;
  transferDa: number;
  totalVentesDa?: number;
  resteEncaisserDa?: number;
  tickets: number;
  alreadyClosed: boolean;
  ownerPhoneDefault?: string;
}) {
  const [fondInitial, setFondInitial] = useState<string>("0");
  const [especesComptees, setEspecesComptees] = useState<string>("");
  const [ownerPhone, setOwnerPhone] = useState<string>(ownerPhoneDefault);
  const [closedState, setClosedState] = useState(alreadyClosed);
  const [savedNotice, setSavedNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const fond = Math.max(0, Number(fondInitial) || 0);
  const totalAttenduTiroir = Math.round((fond + expectedCashDa) * 100) / 100;
  const hasCount = especesComptees.trim() !== "" && Number.isFinite(Number(especesComptees));
  const comptees = hasCount ? Number(especesComptees) : 0;
  const ecart = Math.round((comptees - totalAttenduTiroir) * 100) / 100;

  const totalDay = totalVentesDa ?? Math.round((expectedCashDa + cardDa + transferDa) * 100) / 100;
  const waSummaryUrl = whatsappDailyClosingUrl({
    phone: ownerPhone,
    shop,
    date: today,
    totalVentesDa: totalDay,
    especesAttenduesDa: totalAttenduTiroir,
    especesCompteesDa: hasCount ? comptees : totalAttenduTiroir,
    ecartDa: hasCount ? ecart : 0,
    tickets,
    resteEncaisserDa,
  });

  function saveQuickCheck() {
    setSavedNotice(null);
    try {
      window.localStorage.setItem(
        `patisgest.caisse_soir.${today}`,
        JSON.stringify({ fond, comptees, expectedCashDa, ecart, savedAt: new Date().toISOString() }),
      );
    } catch {
      /* ignore localStorage quota */
    }

    if (mode !== "supabase" || !siteId) {
      setClosedState(true);
      setSavedNotice({ kind: "success", text: "Vérification enregistrée pour ce soir." });
      return;
    }

    startTransition(async () => {
      const res = await validerComptageTiroir({
        date: today,
        siteId,
        fondInitial: fond,
        especesComptees: comptees,
        attendu: expectedCashDa,
      });
      if (res.ok) {
        setClosedState(true);
        setSavedNotice({ kind: "success", text: res.succes ?? "Clôture du tiroir enregistrée ✓" });
      } else {
        setSavedNotice({ kind: "error", text: res.erreur ?? "Impossible d’enregistrer sur le serveur." });
      }
    });
  }

  return (
    <section className="pg-card pg-card-pad pg-stack">
      <div className="pg-card-head">
        <div>
          <h2>Fermeture de caisse du jour</h2>
          <p>Espèces attendues vs espèces comptées dans le tiroir</p>
        </div>
        <span className="pg-badge" data-tone={closedState ? "success" : "planned"}>
          {closedState ? "Clôture validée ✓" : `${tickets} ticket${tickets > 1 ? "s" : ""} aujourd’hui`}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-3" style={{ background: "var(--pg-subtle)" }}>
          <span className="text-xs font-bold pg-muted block">Espèces attendues (ventes)</span>
          <strong className="text-lg">{dinars(expectedCashDa, false)}</strong>
        </div>
        <div className="rounded-xl border p-3" style={{ background: "var(--pg-subtle)" }}>
          <span className="text-xs font-bold pg-muted block">Carte / CIB &amp; BaridiMob</span>
          <strong className="text-lg">{dinars(cardDa + transferDa, false)}</strong>
        </div>
        <div className="rounded-xl border p-3" style={{ background: "var(--pg-tint)" }}>
          <span className="text-xs font-bold pg-muted block">Total attendu dans le tiroir</span>
          <strong className="text-lg">{dinars(totalAttenduTiroir, false)}</strong>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 items-end">
        <label className="pg-field">
          Fond de caisse du matin (DA)
          <input
            type="number"
            min={0}
            step="any"
            className="pg-input"
            value={fondInitial}
            onChange={(e) => {
              setFondInitial(e.target.value);
              setSavedNotice(null);
            }}
          />
        </label>
        <label className="pg-field">
          Espèces comptées ce soir (DA)
          <input
            type="number"
            min={0}
            step="any"
            placeholder="Ex : 24500"
            className="pg-input"
            value={especesComptees}
            onChange={(e) => {
              setEspecesComptees(e.target.value);
              setSavedNotice(null);
            }}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hasCount || pending}
            onClick={saveQuickCheck}
            className="pg-button"
          >
            {pending ? "Validation…" : "Valider le comptage"}
          </button>
          <Link href="/cloture" className="pg-text-link text-xs">
            Bilan détaillé →
          </Link>
        </div>
      </div>

      {hasCount && (
        <div
          className="pg-notice"
          data-kind={Math.abs(ecart) < 1 ? "success" : ecart > 0 ? "warning" : "error"}
        >
          {Math.abs(ecart) < 1 ? (
            <strong>Caisse juste ✓ — Aucun écart entre les ventes et le tiroir.</strong>
          ) : (
            <strong>
              Écart constaté : {ecart > 0 ? `+${dinars(ecart, false)}` : dinars(ecart, false)} (
              {ecart > 0 ? "surplus" : "manque"} dans le tiroir).
            </strong>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
        <label className="pg-field min-w-52 flex-1 max-w-xs">
          WhatsApp du patron (bilan du soir)
          <input
            type="tel"
            className="pg-input"
            placeholder="0550 00 00 00"
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.target.value)}
          />
        </label>
        {waSummaryUrl && (
          <a
            href={waSummaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pg-button pg-button-secondary text-xs"
          >
            Envoyer le bilan du soir sur WhatsApp →
          </a>
        )}
      </div>

      {savedNotice && (
        <div className="pg-notice" data-kind={savedNotice.kind}>
          {savedNotice.text}
        </div>
      )}
    </section>
  );
}
