"use client";

import { useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import {
  applyCreditPayment,
  creditBalanceDa,
  DEMO_CREDITS_KEY_PREFIX,
  starterDemoCredits,
  sumOpenCreditsDa,
  type CreditAccountType,
  type CreditEntry,
} from "@/lib/credits";
import { cancelCreditCloud, createCreditCloud, payCreditCloud, updateCreditTotalCloud } from "@/lib/actions-credits";
import { whatsappCreditReminderUrl } from "@/lib/whatsapp";
import { dinars } from "@/lib/workspace-data";

export default function CreditsWorkspace({
  mode,
  scopeKey,
  shop,
  today,
  initialCredits = [],
  compact = false,
  canManageAdmin = false,
}: {
  mode: "demo" | "supabase";
  scopeKey: string;
  shop: string;
  today: string;
  initialCredits?: CreditEntry[];
  compact?: boolean;
  canManageAdmin?: boolean;
}) {
  const storageKey = `${DEMO_CREDITS_KEY_PREFIX}${scopeKey}`;
  const [cloudCredits, setCloudCredits] = useState<CreditEntry[]>(initialCredits);
  const demoSnapshot = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("patisgest-credits-updated", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("patisgest-credits-updated", cb);
      };
    },
    () => {
      if (mode !== "demo") return "";
      try {
        return window.localStorage.getItem(storageKey) ?? "__SEED__";
      } catch {
        return "__SEED__";
      }
    },
    () => "",
  );

  const credits: CreditEntry[] =
    mode === "demo"
      ? (() => {
          if (!demoSnapshot) return [];
          if (demoSnapshot === "__SEED__") return starterDemoCredits(today);
          try {
            const parsed = JSON.parse(demoSnapshot);
            return Array.isArray(parsed) ? parsed : starterDemoCredits(today);
          } catch {
            return starterDemoCredits(today);
          }
        })()
      : cloudCredits;

  const [filter, setFilter] = useState<"tous" | "cafe_entreprise" | "particulier">("tous");
  const [showAdd, setShowAdd] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTotal, setEditTotal] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function persistDemo(next: CreditEntry[]) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event("patisgest-credits-updated"));
    } catch {
      /* ignore */
    }
  }

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeedback(null);
    const fd = new FormData(e.currentTarget);
    const nomDebiteur = String(fd.get("nom") ?? "").trim();
    const telephone = String(fd.get("telephone") ?? "").trim();
    const typeCompte = (String(fd.get("typeCompte") ?? "particulier") === "cafe_entreprise"
      ? "cafe_entreprise"
      : "particulier") as CreditAccountType;
    const montantTotalDa = Number(fd.get("montant"));
    const note = String(fd.get("note") ?? "").trim();

    if (!nomDebiteur || !Number.isFinite(montantTotalDa) || montantTotalDa <= 0) {
      setFeedback({ kind: "error", text: "Nom et montant en DA requis." });
      return;
    }

    if (mode === "demo") {
      const entry: CreditEntry = {
        id: crypto.randomUUID(),
        nomDebiteur,
        telephone,
        typeCompte,
        montantTotalDa,
        montantRegleDa: 0,
        dateEcheance: null,
        note,
        statut: "ouvert",
        reglements: [],
        createdAt: new Date().toISOString(),
      };
      persistDemo([entry, ...credits]);
      e.currentTarget.reset();
      setShowAdd(false);
      setFeedback({ kind: "success", text: `Crédit ajouté pour ${nomDebiteur}.` });
      return;
    }

    const form = e.currentTarget;
    startTransition(async () => {
      const res = await createCreditCloud({ nomDebiteur, telephone, typeCompte, montantTotalDa, note });
      if (!res.ok || !res.entry) {
        setFeedback({ kind: "error", text: res.erreur ?? "Enregistrement impossible." });
      } else {
        setCloudCredits([res.entry, ...cloudCredits]);
        form.reset();
        setShowAdd(false);
        setFeedback({ kind: "success", text: `Crédit enregistré pour ${nomDebiteur}.` });
      }
    });
  }

  function handlePay(credit: CreditEntry, amount: number) {
    setFeedback(null);
    if (mode === "demo") {
      try {
        const updated = applyCreditPayment(credit, amount);
        persistDemo(credits.map((c) => (c.id === credit.id ? updated : c)));
        setPayingId(null);
        setPayAmount("");
        setFeedback({ kind: "success", text: `Règlement de ${dinars(amount, false)} enregistré.` });
      } catch (err) {
        setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Erreur de saisie." });
      }
      return;
    }

    startTransition(async () => {
      const res = await payCreditCloud(credit.id, amount);
      if (!res.ok) {
        setFeedback({ kind: "error", text: res.erreur ?? "Règlement impossible." });
      } else {
        const updated = applyCreditPayment(credit, amount);
        setCloudCredits(cloudCredits.map((c) => (c.id === credit.id ? updated : c)));
        setPayingId(null);
        setPayAmount("");
        setFeedback({ kind: "success", text: `Règlement de ${dinars(amount, false)} enregistré.` });
      }
    });
  }

  function handleEditTotal(credit: CreditEntry, newTotal: number) {
    if (!canManageAdmin || !Number.isFinite(newTotal) || newTotal <= 0) return;
    setFeedback(null);
    if (mode === "demo") {
      persistDemo(
        credits.map((c) =>
          c.id === credit.id
            ? {
                ...c,
                montantTotalDa: newTotal,
                statut: newTotal <= c.montantRegleDa ? "solde" : "ouvert",
              }
            : c,
        ),
      );
      setEditingId(null);
      setEditTotal("");
      setFeedback({ kind: "success", text: `Montant mis à jour pour ${credit.nomDebiteur}.` });
      return;
    }
    startTransition(async () => {
      const res = await updateCreditTotalCloud(credit.id, newTotal);
      if (!res.ok) {
        setFeedback({ kind: "error", text: res.erreur ?? "Modification refusée." });
      } else {
        setCloudCredits(
          cloudCredits.map((c) =>
            c.id === credit.id
              ? {
                  ...c,
                  montantTotalDa: newTotal,
                  statut: newTotal <= c.montantRegleDa ? "solde" : "ouvert",
                }
              : c,
          ),
        );
        setEditingId(null);
        setEditTotal("");
        setFeedback({ kind: "success", text: `Montant mis à jour pour ${credit.nomDebiteur}.` });
      }
    });
  }

  function handleCancelCredit(credit: CreditEntry) {
    if (!canManageAdmin) return;
    if (!window.confirm(`Annuler la dette de ${credit.nomDebiteur} ?`)) return;
    setFeedback(null);
    if (mode === "demo") {
      persistDemo(credits.map((c) => (c.id === credit.id ? { ...c, statut: "annule" } : c)));
      setFeedback({ kind: "success", text: `Dette de ${credit.nomDebiteur} annulée.` });
      return;
    }
    startTransition(async () => {
      const res = await cancelCreditCloud(credit.id);
      if (!res.ok) {
        setFeedback({ kind: "error", text: res.erreur ?? "Annulation refusée." });
      } else {
        setCloudCredits(cloudCredits.map((c) => (c.id === credit.id ? { ...c, statut: "annule" } : c)));
        setFeedback({ kind: "success", text: `Dette de ${credit.nomDebiteur} annulée.` });
      }
    });
  }

  const openList = credits
    .filter((c) => c.statut === "ouvert")
    .filter((c) => (filter === "tous" ? true : c.typeCompte === filter));
  const totalOpen = sumOpenCreditsDa(credits);

  return (
    <section id="carnet-credits" className="pg-card pg-card-pad pg-stack">
      <div className="pg-card-head">
        <div>
          <h2>Crédits clients &amp; Cafés (Carnet)</h2>
          <p>
            Total à encaisser : <strong>{dinars(totalOpen, false)}</strong> · habitués, cafés et entreprises
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="pg-button pg-button-secondary text-xs"
          >
            {showAdd ? "Fermer" : "+ Ajouter au carnet"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer les crédits">
        {(
          [
            ["tous", "Tous"],
            ["cafe_entreprise", "Cafés / Entreprises"],
            ["particulier", "Clients réguliers"],
          ] as const
        ).map(([val, lbl]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFilter(val)}
            className="pg-segment-btn"
            data-active={filter === val ? "true" : undefined}
          >
            {lbl}
          </button>
        ))}
      </div>

      {feedback && (
        <div className="pg-notice" data-kind={feedback.kind}>
          {feedback.text}
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-4" style={{ background: "var(--pg-subtle)" }}>
          <label className="pg-field">
            Client ou Café
            <input name="nom" required maxLength={140} placeholder="Ex : Café El Bahdja" className="pg-input" />
          </label>
          <label className="pg-field">
            Téléphone WhatsApp
            <input name="telephone" maxLength={40} placeholder="0550 00 00 00" className="pg-input" />
          </label>
          <label className="pg-field">
            Type
            <select name="typeCompte" className="pg-input">
              <option value="particulier">Client régulier</option>
              <option value="cafe_entreprise">Café / Entreprise</option>
            </select>
          </label>
          <label className="pg-field">
            Montant dû (DA)
            <input name="montant" type="number" min={1} step="any" required placeholder="Ex : 4500" className="pg-input" />
          </label>
          <label className="pg-field sm:col-span-3">
            Note / Détail (optionnel)
            <input name="note" maxLength={300} placeholder="Ex : Plateaux croissants lundi" className="pg-input" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={pending} className="pg-button w-full">
              Enregistrer
            </button>
          </div>
        </form>
      )}

      {openList.length === 0 ? (
        <p className="text-sm pg-muted">Aucun crédit ouvert pour ce filtre.</p>
      ) : (
        <div className="space-y-2">
          {(compact ? openList.slice(0, 5) : openList).map((c) => {
            const reste = creditBalanceDa(c);
            const wa = whatsappCreditReminderUrl({
              phone: c.telephone,
              debiteur: c.nomDebiteur,
              resteDa: reste,
              shop,
              note: c.note,
            });
            return (
              <div key={c.id} className="rounded-xl border p-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm">{c.nomDebiteur}</strong>
                    <span className="ml-2 pg-badge" data-tone={c.typeCompte === "cafe_entreprise" ? "planned" : "neutral"}>
                      {c.typeCompte === "cafe_entreprise" ? "Café / Pro" : "Client"}
                    </span>
                    {c.note && <span className="block text-xs pg-muted">{c.note}</span>}
                  </div>
                  <div className="text-right">
                    <strong className="text-base">{dinars(reste, false)}</strong>
                    <span className="block text-xs pg-muted">sur {dinars(c.montantTotalDa, false)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handlePay(c, reste)}
                    className="pg-button text-xs"
                  >
                    Solder tout
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPayingId(payingId === c.id ? null : c.id);
                      setPayAmount("");
                    }}
                    className="pg-button pg-button-secondary text-xs"
                  >
                    Versement partiel
                  </button>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pg-button pg-button-secondary text-xs"
                    >
                      Relancer WhatsApp
                    </a>
                  )}
                  {canManageAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(editingId === c.id ? null : c.id);
                          setEditTotal(String(c.montantTotalDa));
                        }}
                        className="pg-button pg-button-secondary text-xs"
                      >
                        Modifier montant
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleCancelCredit(c)}
                        className="pg-button pg-button-secondary text-xs text-red-700"
                      >
                        Annuler dette
                      </button>
                    </>
                  )}
                </div>
                {editingId === c.id && canManageAdmin && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      step="any"
                      value={editTotal}
                      onChange={(e) => setEditTotal(e.target.value)}
                      className="pg-input w-40"
                    />
                    <button
                      type="button"
                      disabled={pending || !(Number(editTotal) > 0)}
                      onClick={() => handleEditTotal(c, Number(editTotal))}
                      className="pg-button text-xs"
                    >
                      Enregistrer
                    </button>
                  </div>
                )}
                {payingId === c.id && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={reste}
                      step="any"
                      placeholder={`Max ${reste} DA`}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="pg-input w-40"
                    />
                    <button
                      type="button"
                      disabled={pending || !(Number(payAmount) > 0)}
                      onClick={() => handlePay(c, Number(payAmount))}
                      className="pg-button text-xs"
                    >
                      Encaisser ce montant
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
