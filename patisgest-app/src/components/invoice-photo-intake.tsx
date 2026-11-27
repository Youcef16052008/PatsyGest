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
import { useLocale } from "./locale-provider";

type ReponseOcr = {
  ok?: boolean;
  text?: string;
  code?: string;
  erreur?: string;
};

export default function InvoicePhotoIntake({
  mode,
  canReadCosts = true,
  articles,
  sites,
  onDemoReceiveLines,
}: {
  mode: "demo" | "supabase";
  canReadCosts?: boolean;
  articles: CatalogMatchOption[];
  sites: { id: string; label: string }[];
  onDemoReceiveLines?: (lines: { articleId: string; site: string; numero: string; qte: number; pu: number }[]) => void;
}) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>("");
  const [numeroBon, setNumeroBon] = useState<string>(() => `BON-${new Date().toISOString().slice(5, 10).replace("-", "")}`);
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? "Labo");
  const [lines, setLines] = useState<InvoiceDraftLine[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [ocrPending, setOcrPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const { t } = useLocale();

  function ligneVide(): InvoiceDraftLine | null {
    if (articles.length === 0) return null;
    return {
      id: `line-${Date.now()}`,
      rawText: "",
      designation: articles[0].nom,
      articleId: articles[0].id,
      qte: 1,
      puDa: 0,
      matched: true,
    };
  }

  function messagesErreurOcr(): Record<string, string> {
    return {
      missing: t.invoiceOcrError,
      "bad-format": t.invoiceOcrBadFormat,
      "too-large": t.invoiceOcrTooLarge,
      unauthorized: t.invoiceOcrError,
      "no-text": t.invoiceOcrEmpty,
      "ocr-error": t.invoiceOcrError,
    };
  }

  async function lirePhoto(file: File) {
    setFeedback(null);
    setOcrPending(true);
    try {
      const compressed = await compressImageFileToDataUrl(file, 960, 0.82);
      setPhotoPreview(compressed);
      const blob = await (await fetch(compressed)).blob();
      const formData = new FormData();
      formData.set("image", blob, file.name || "bon-fournisseur.jpg");

      const reponse = await fetch("/api/invoice-ocr", {
        method: "POST",
        body: formData,
        cache: "no-store",
      });
      const donnees = (await reponse.json().catch(() => ({}))) as ReponseOcr;
      if (!reponse.ok || donnees.ok !== true) {
        const code = typeof donnees.code === "string" ? donnees.code : "ocr-error";
        setFeedback({
          kind: "error",
          text: messagesErreurOcr()[code] ?? t.invoiceOcrError,
        });
        return;
      }

      const texte = typeof donnees.text === "string" ? donnees.text : "";
      if (!texte.trim()) {
        setFeedback({ kind: "error", text: t.invoiceOcrEmpty });
        return;
      }
      setRawText(texte);
      const parsed = parseSupplierInvoiceText(texte, articles, { ocr: true });
      if (parsed.length > 0) setLines(parsed);
      setFeedback({
        kind: "success",
        text: t.invoiceOcrSuccess.replace(/\{n\}|\{عدد\}/u, String(parsed.length)),
      });
    } catch {
      setFeedback({ kind: "error", text: t.invoiceOcrError });
    } finally {
      setOcrPending(false);
    }
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoFile(file);
    if (lines.length === 0 && articles.length > 0) {
      const vide = ligneVide();
      if (vide) setLines([vide]);
    }
    await lirePhoto(file);
  }

  function relancerLecture() {
    if (photoFile && !ocrPending) void lirePhoto(photoFile);
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
    setLines((prev) => {
      const vide = ligneVide();
      return vide ? [...prev, { ...vide, id: `line-${Date.now()}-${prev.length}` }] : prev;
    });
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
          <h3>{t.invoiceTitle}</h3>
          <p className="text-xs pg-muted">
            {t.invoiceSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {photoFile && photoPreview && (
            <button
              type="button"
              onClick={relancerLecture}
              disabled={ocrPending}
              className="pg-button pg-button-secondary text-xs"
            >
              {t.invoiceOcrRetry}
            </button>
          )}
          <label className="pg-button cursor-pointer text-xs" aria-busy={ocrPending}>
            {t.invoicePhoto}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={ocrPending}
              onChange={(e) => void onPickPhoto(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      <p className="text-xs pg-muted">{t.invoiceOcrOffline}</p>
      {ocrPending && (
        <div className="pg-notice" data-kind="success" aria-live="polite">
          {t.invoiceOcrReading}
        </div>
      )}

      {feedback && (
        <div className="pg-notice" data-kind={feedback.kind} aria-live="polite">
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
              {t.invoiceRemovePhoto}
            </button>
          </div>
        )}

        <div className="pg-stack">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="pg-field">
              {t.invoiceBon}
              <input value={numeroBon} onChange={(e) => setNumeroBon(e.target.value)} className="pg-input" />
            </label>
            <label className="pg-field">
              {t.invoiceSite}
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
              {t.invoiceSaisie}
              <textarea
                rows={3}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={t.invoicePlaceholder}
                className="pg-input"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={analyzeText} className="pg-button pg-button-secondary text-xs">
                {t.invoicePrefill}
              </button>
              <button type="button" onClick={addEmptyLine} className="pg-button pg-button-secondary text-xs">
                {t.invoiceAddLine}
              </button>
            </div>
          </div>

          {lines.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold pg-muted">
                {t.invoiceCheck}{canReadCosts ? ` · ${t.invoiceTotal} : ${dinars(totalBon, false)}` : ""}
              </div>
              {lines.map((line, idx) => (
                <div
                  key={line.id}
                  className={`grid gap-2 rounded-xl border p-3 ${canReadCosts ? "sm:grid-cols-[1.5fr_90px_110px_auto]" : "sm:grid-cols-[1.5fr_110px_auto]"} items-end`}
                  style={{ background: "var(--pg-subtle)" }}
                >
                  <label className="pg-field">
                    {t.invoiceArticle} ({line.matched ? t.invoiceRecognized : t.invoiceToCheck})
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
                    {t.invoiceQte}
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
                  {canReadCosts && (
                    <label className="pg-field">
                      {t.invoicePu}
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
                  )}
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== idx))}
                    className="pg-button pg-button-secondary text-xs"
                  >
                    {t.invoiceRemove}
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={pending}
                onClick={validateAllIntoStock}
                className="pg-button"
              >
                {pending ? t.invoiceSaving : t.invoiceValidate.replace("{n}", String(lines.length))}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
