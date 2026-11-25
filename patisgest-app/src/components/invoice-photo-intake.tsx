"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { receiveLot } from "@/lib/actions-stock";
import {
  parseSupplierInvoiceText,
  type CatalogMatchOption,
  type InvoiceDraftLine,
} from "@/lib/invoice-photo-parser";
import { compressImageFileToDataUrl } from "@/lib/pastry-visuals";
import { dinars } from "@/lib/workspace-data";

export default function InvoicePhotoIntake({
  mode,
  articles,
  sites,
  onDemoReceiveLines,
}: {
  mode: "demo" | "supabase";
  articles: CatalogMatchOption[];
  sites: { id: string; label: string }[];
  onDemoReceiveLines?: (lines: { articleId: string; site: string; numero: string; qte: number; pu: number }[]) => void;
}) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>("");
  const [numeroBon, setNumeroBon] = useState<string>(() => `BON-${new Date().toISOString().slice(5, 10).replace("-", "")}`);
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? "Labo");
  const [lines, setLines] = useState<InvoiceDraftLine[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    try {
      const compressed = await compressImageFileToDataUrl(file, 960, 0.82);
      setPhotoPreview(compressed);
      if (lines.length === 0 && articles.length > 0) {
        setLines([
          {
            id: `line-${Date.now()}`,
            rawText: "",
            designation: articles[0].nom,
            articleId: articles[0].id,
            qte: 1,
            puDa: 0,
            matched: true,
          },
        ]);
      }
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Photo illisible." });
    }
  }

  function analyzeText() {
    setFeedback(null);
    if (!rawText.trim()) {
      setFeedback({ kind: "error", text: "Collez ou tapez d’abord les lignes du bon (ex: Farine 25 95)." });
      return;
    }
    const parsed = parseSupplierInvoiceText(rawText, articles);
    setLines(parsed);
  }

  function addEmptyLine() {
    if (articles.length === 0) return;
    setLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length}`,
        rawText: "",
        designation: articles[0].nom,
        articleId: articles[0].id,
        qte: 1,
        puDa: 0,
        matched: true,
      },
    ]);
  }

  function validateAllIntoStock() {
    setFeedback(null);
    const valid = lines.filter((l) => l.articleId && l.qte > 0 && l.puDa >= 0);
    if (valid.length === 0) {
      setFeedback({ kind: "error", text: "Ajoutez au moins une ligne valide avant de confirmer l’entrée en stock." });
      return;
    }
    const cleanRef = numeroBon.trim() || `BON-${Date.now()}`;

    if (mode === "demo") {
      onDemoReceiveLines?.(
        valid.map((l, idx) => ({
          articleId: l.articleId,
          site: siteId,
          numero: valid.length > 1 ? `${cleanRef}-${idx + 1}` : cleanRef,
          qte: l.qte,
          pu: l.puDa,
        })),
      );
      setLines([]);
      setRawText("");
      setFeedback({
        kind: "success",
        text: `${valid.length} ligne(s) validée(s) et entrée(s) en stock !`,
      });
      return;
    }

    startTransition(async () => {
      let okCount = 0;
      for (let i = 0; i < valid.length; i++) {
        const l = valid[i];
        const fd = new FormData();
        fd.set("articleId", l.articleId);
        fd.set("siteId", siteId);
        fd.set("numero", valid.length > 1 ? `${cleanRef}-${i + 1}` : cleanRef);
        fd.set("qte", String(l.qte));
        fd.set("pu", String(l.puDa));
        const res = await receiveLot({}, fd);
        if (res.erreur) {
          setFeedback({
            kind: "error",
            text: `Erreur sur ligne ${i + 1} (${okCount} enregistrée(s)) : ${res.erreur}`,
          });
          return;
        }
        okCount++;
      }
      setLines([]);
      setRawText("");
      setFeedback({
        kind: "success",
        text: `${okCount} article(s) validé(s) et ajouté(s) au stock Supabase ✓`,
      });
    });
  }

  const totalBon = lines.reduce((s, l) => s + l.qte * l.puDa, 0);

  return (
    <section className="pg-card pg-card-pad pg-stack">
      <div className="pg-card-head">
        <div>
          <h3>Facture / Bon fournisseur par photo (Saisie rapide)</h3>
          <p className="text-xs pg-muted">
            Photographiez le bon papier du grossiste pour l’avoir sous les yeux, collez ou saisissez vos lignes, puis validez l’entrée en stock.
          </p>
        </div>
        <label className="pg-button cursor-pointer text-xs">
          📷 Photographier un bon
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void onPickPhoto(e.target.files?.[0])}
          />
        </label>
      </div>

      {feedback && (
        <div className="pg-notice" data-kind={feedback.kind}>
          {feedback.text}
        </div>
      )}

      <div className={photoPreview ? "grid gap-4 lg:grid-cols-[320px_1fr]" : "space-y-4"}>
        {photoPreview && (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-xl border bg-white">
              <Image
                src={photoPreview}
                alt="Bon fournisseur photographié"
                width={640}
                height={800}
                className="max-h-96 w-full object-contain"
                unoptimized
              />
            </div>
            <button
              type="button"
              onClick={() => setPhotoPreview(null)}
              className="pg-button pg-button-secondary w-full text-xs"
            >
              Retirer la photo
            </button>
          </div>
        )}

        <div className="pg-stack">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="pg-field">
              N° Bon / Facture
              <input value={numeroBon} onChange={(e) => setNumeroBon(e.target.value)} className="pg-input" />
            </label>
            <label className="pg-field">
              Site de réception
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="pg-input">
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <label className="pg-field">
              Saisie / dictée rapide (1 ligne = Produit + Qté + Prix unitaire DA)
              <textarea
                rows={3}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={"Exemple :\nFarine 25 95\nBeurre 10 950\nAmandes 5 1900"}
                className="pg-input"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={analyzeText} className="pg-button pg-button-secondary text-xs">
                Pré-remplir les lignes →
              </button>
              <button type="button" onClick={addEmptyLine} className="pg-button pg-button-secondary text-xs">
                + Ajouter une ligne manuelle
              </button>
            </div>
          </div>

          {lines.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold pg-muted">
                Vérification humaine obligatoire avant mise en stock · Total estimé : {dinars(totalBon, false)}
              </div>
              {lines.map((line, idx) => (
                <div
                  key={line.id}
                  className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1.5fr_90px_110px_auto] items-end"
                  style={{ background: "var(--pg-subtle)" }}
                >
                  <label className="pg-field">
                    Article ({line.matched ? "reconnu ✓" : "à vérifier"})
                    <select
                      value={line.articleId}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, j) => (j === idx ? { ...x, articleId: e.target.value } : x)),
                        )
                      }
                      className="pg-input"
                    >
                      {articles.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nom} ({a.unite})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="pg-field">
                    Quantité
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      value={line.qte}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, j) => (j === idx ? { ...x, qte: Number(e.target.value) || 0 } : x)),
                        )
                      }
                      className="pg-input"
                    />
                  </label>
                  <label className="pg-field">
                    Prix unit. (DA)
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={line.puDa}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, j) => (j === idx ? { ...x, puDa: Number(e.target.value) || 0 } : x)),
                        )
                      }
                      className="pg-input"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== idx))}
                    className="pg-button pg-button-secondary text-xs"
                  >
                    Retirer
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={pending}
                onClick={validateAllIntoStock}
                className="pg-button"
              >
                {pending ? "Enregistrement…" : `Valider & entrer ${lines.length} ligne(s) en stock ✓`}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
