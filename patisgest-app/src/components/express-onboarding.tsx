"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { importerPackPatisserieDz, sauverBoutiqueExpress } from "@/lib/actions-onboarding";
import { PACK_PATISSERIE_DZ } from "@/lib/pack-patisserie-dz";

export default function ExpressOnboarding({
  initialShopName,
  mode,
  onDemoImportPack,
}: {
  initialShopName: string;
  mode: "supabase" | "demo";
  onDemoImportPack?: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [shopName, setShopName] = useState(initialShopName);
  const [phone, setPhone] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function saveStep1() {
    setFeedback(null);
    if (shopName.trim().length < 2) {
      setFeedback({ kind: "error", text: "Entrez le nom de votre pâtisserie." });
      return;
    }
    if (mode === "demo") {
      setStep(2);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("nom", shopName.trim());
      fd.set("telephone", phone.trim());
      const res = await sauverBoutiqueExpress({}, fd);
      if (res.erreur) {
        setFeedback({ kind: "error", text: res.erreur });
      } else {
        setStep(2);
      }
    });
  }

  function importPack() {
    setFeedback(null);
    if (mode === "demo") {
      onDemoImportPack?.();
      setFeedback({
        kind: "success",
        text: `${PACK_PATISSERIE_DZ.length} produits et ingrédients algériens ajoutés !`,
      });
      setStep(3);
      return;
    }
    startTransition(async () => {
      const res = await importerPackPatisserieDz();
      if (res.erreur) {
        setFeedback({ kind: "error", text: res.erreur });
      } else {
        setFeedback({ kind: "success", text: res.succes ?? "Pack importé !" });
        setStep(3);
      }
    });
  }

  const produitsPack = PACK_PATISSERIE_DZ.filter((p) => p.niveau === "produit");

  return (
    <section className="pg-card pg-card-pad pg-stack" aria-label="Démarrage rapide en 2 minutes">
      <div className="pg-card-head">
        <div>
          <span className="pg-kicker">DÉMARRAGE EXPRESS · 2 MINUTES</span>
          <h2>Préparez votre pâtisserie en 3 étapes simples</h2>
          <p>Pas de configuration compliquée : votre caisse peut tourner tout de suite.</p>
        </div>
        <span className="pg-badge" data-tone="planned">
          Étape {step} / 3
        </span>
      </div>

      {feedback && (
        <div className="pg-notice" data-kind={feedback.kind}>
          {feedback.text}
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2 items-end">
          <label className="pg-field">
            Nom de votre pâtisserie
            <input
              type="text"
              className="pg-input"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Ex : Pâtisserie El Bahdja"
            />
          </label>
          <label className="pg-field">
            Téléphone WhatsApp (optionnel)
            <input
              type="tel"
              className="pg-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0550 00 00 00"
            />
          </label>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={saveStep1} className="pg-button">
              {pending ? "Enregistrement…" : "Continuer →"}
            </button>
            <button type="button" onClick={() => setStep(2)} className="pg-button pg-button-secondary">
              Passer cette étape
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="pg-stack">
          <p className="text-sm">
            Voulez-vous démarrer avec le <strong>Pack Pâtisserie Algérienne</strong> prêt à encaisser
            (vous pourrez modifier chaque prix à tout moment) ?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {produitsPack.map((p) => (
              <span key={p.code} className="pg-badge" data-tone="neutral">
                {p.nom} · {p.prixDa} DA
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={importPack} className="pg-button">
              {pending ? "Import en cours…" : "Importer le Pack Pâtisserie DZ en 1 clic"}
            </button>
            <Link href="/stocks" className="pg-button pg-button-secondary">
              Ou créer mes produits à la main
            </Link>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{ background: "var(--pg-subtle)" }}>
          <div>
            <strong className="block">Caisse prête !</strong>
            <span className="text-sm pg-muted">
              Vos produits sont prêts. Vous pouvez encaisser votre première vente ou ajuster vos tarifs.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/caisse" className="pg-button">
              Ouvrir la caisse →
            </Link>
            <Link href="/stocks" className="pg-button pg-button-secondary">
              Ajuster les prix
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
