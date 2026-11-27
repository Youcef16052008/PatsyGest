"use client";

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
import { sauverPhotoArticleCloud } from "@/lib/actions-photos";
import {
  compressImageFileToDataUrl,
  defaultPastryVisual,
  PRODUCT_PHOTOS_KEY_PREFIX,
  sanitizeProductPhotosSnapshot,
  saveProductPhotoLocal,
} from "@/lib/pastry-visuals";
import { sanitizeImageDataUrl, sanitizePhotoSource } from "@/lib/recipe-photo";

export default function ProductPhotoPicker({
  mode,
  scopeKey,
  products,
}: {
  mode: "demo" | "supabase";
  scopeKey: string;
  products: { id: string; nom: string; photo?: string | null }[];
}) {
  const [selectedId, setSelectedId] = useState<string>(products[0]?.id ?? "");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const photosSnapshot = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("patisgest-product-photos", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("patisgest-product-photos", cb);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(`${PRODUCT_PHOTOS_KEY_PREFIX}${scopeKey}`) ?? "{}";
      } catch {
        return "{}";
      }
    },
    () => "{}",
  );

  const customMap = sanitizeProductPhotosSnapshot(photosSnapshot);

  if (products.length === 0) return null;

  const active = products.find((p) => p.id === selectedId) ?? products[0];
  const previewSrc =
    customMap[active.id] ??
    sanitizePhotoSource(active.photo) ??
    defaultPastryVisual(active.nom);

  async function onFileSelected(file: File | undefined) {
    if (!file || !active) return;
    setBusy(true);
    setStatus("");
    try {
      const compressed = await compressImageFileToDataUrl(file, 480, 0.78);
      const image = sanitizeImageDataUrl(compressed);
      if (!image) throw new Error("Photo invalide : choisissez une image JPEG, PNG ou WebP.");
      saveProductPhotoLocal(scopeKey, active.id, image);
      if (mode === "supabase") {
        const res = await sauverPhotoArticleCloud(active.id, image);
        setStatus(
          res.ok
            ? `Photo de « ${active.nom} » enregistrée dans le cloud ✓`
            : `Photo sauvegardée sur cet appareil (${res.erreur ?? "cloud indisponible"}).`,
        );
      } else {
        setStatus(`Photo de « ${active.nom} » mise à jour ✓`);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Impossible de lire la photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pg-card pg-card-pad pg-stack">
      <div className="pg-card-head">
        <div>
          <h3>Photos du catalogue Pâtisserie (Caméra / Galerie)</h3>
          <p className="text-xs pg-muted">
            Chaque produit a déjà un visuel algérien par défaut en caisse. Ajoutez vos vraies photos depuis le téléphone en 2 secondes.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[200px_1fr] items-center">
        <div className="overflow-hidden rounded-xl border bg-white" style={{ maxWidth: 200 }}>
          <Image
            src={previewSrc}
            alt={active.nom}
            width={240}
            height={150}
            className="h-32 w-full object-cover"
            unoptimized
          />
        </div>
        <div className="space-y-3">
          <label className="pg-field">
            Choisir le produit à illustrer
            <select
              value={active.id}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setStatus("");
              }}
              className="pg-input"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} {customMap[p.id] ? "📷" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="pg-button cursor-pointer text-xs">
              {busy ? "Compression…" : "Prendre / choisir une photo"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy}
                className="sr-only"
                onChange={(e) => void onFileSelected(e.target.files?.[0])}
              />
            </label>
            {customMap[active.id] && (
              <button
                type="button"
                onClick={() => {
                  saveProductPhotoLocal(scopeKey, active.id, null);
                  setStatus(`Visuel par défaut rétabli pour « ${active.nom} ».`);
                }}
                className="pg-button pg-button-secondary text-xs"
              >
                Rétablir visuel par défaut
              </button>
            )}
          </div>
          {status && <p role="status" className="text-xs font-semibold text-emerald-700">{status}</p>}
        </div>
      </div>
    </section>
  );
}
