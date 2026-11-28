"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { importerPackPatisserieDz, sauverBoutiqueExpress } from "@/lib/actions-onboarding";
import {
  filterPackByActivityAndVat,
  type StarterDzActivity,
  type StarterVatRegime,
} from "@/lib/pack-patisserie-dz";

export default function ExpressOnboarding({
  initialShopName,
  mode,
  onDemoImportPack,
}: {
  initialShopName: string;
  mode: "supabase" | "demo";
  onDemoImportPack?: (activity: StarterDzActivity, tvaRegime: StarterVatRegime) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [shopName, setShopName] = useState(initialShopName);
  const [phone, setPhone] = useState("");
  const [activity, setActivity] = useState<StarterDzActivity>("mixte");
  const [tvaRegime, setTvaRegime] = useState<StarterVatRegime>("ifu_0");
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function saveStep1() {
    setFeedback(null);
    if (shopName.trim().length < 2) {
      setFeedback({ kind: "error", text: "Entrez le nom de votre boutique." });
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
      onDemoImportPack?.(activity, tvaRegime);
      setFeedback({
        kind: "success",
        text: `${selectedPack.length} produits et ingrédients ajoutés !`,
      });
      setStep(3);
      return;
    }
    startTransition(async () => {
      const res = await importerPackPatisserieDz(activity, tvaRegime);
      if (res.erreur) {
        setFeedback({ kind: "error", text: res.erreur });
      } else {
        setFeedback({ kind: "success", text: res.succes ?? "Pack importé !" });
        setStep(3);
      }
    });
  }

  const selectedPack = filterPackByActivityAndVat(activity, tvaRegime);
  const produitsPack = selectedPack.filter((p) => p.niveau === "produit");

  return (
    <section className="pg-card pg-card-pad pg-stack" aria-label="Démarrage rapide en 2 minutes">
      <div className="pg-card-head">
        <div>
          <span className="pg-kicker">DÉMARRAGE EXPRESS · 2 MINUTES</span>
          <h2>Préparez votre boutique en 3 étapes simples</h2>
          <p>Adapté aux boulangeries, viennoiseries, pâtisseries et cake shops algériens.</p>
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
            Nom de votre boutique
            <input
              type="text"
              className="pg-input"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Ex : Boulangerie-Pâtisserie El Bahdja"
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="pg-field">
              Votre activité
              <select
                className="pg-input"
                value={activity}
                onChange={(e) => setActivity(e.target.value as StarterDzActivity)}
              >
                <option value="mixte">Tout : Boulangerie + Viennoiserie + Pâtisserie + Cake</option>
                <option value="boulangerie">Boulangerie &amp; Viennoiserie</option>
                <option value="patisserie">Pâtisserie &amp; Orientale</option>
                <option value="cake_shop">Cake Shop &amp; Gâteaux sur mesure</option>
              </select>
            </label>
            <label className="pg-field">
              Régime TVA (Algérie · LF 2026)
              <select
                className="pg-input"
                value={tvaRegime}
                onChange={(e) => setTvaRegime(e.target.value as StarterVatRegime)}
              >
                <option value="ifu_0">Artisan IFU — 0 % TVA (prix direct en DA)</option>
                <option value="reel_dz">Régime Réel — TVA Algérie (0 % pain / 9 % / 19 %)</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {produitsPack.map((p) => (
              <span key={p.code} className="pg-badge" data-tone="neutral">
                {p.nom} · {p.prixDa} DA{tvaRegime === "reel_dz" ? ` (TVA ${p.tva}%)` : ""}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={importPack} className="pg-button">
              {pending ? "Import en cours…" : "Importer ce pack en 1 clic"}
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
