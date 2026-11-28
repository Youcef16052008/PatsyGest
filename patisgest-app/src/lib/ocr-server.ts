import { existsSync } from "node:fs";
import path from "node:path";
import { createWorker, OEM } from "tesseract.js";

/**
 * OCR serveur des bons fournisseurs. Les modèles et le noyau WASM sont figés
 * dans le dépôt ; aucun appel réseau n'est fait par Tesseract au moment de la
 * reconnaissance. La route ne persiste ni l'image ni le texte brut.
 */

export const TAILLE_IMAGE_OCR_MAX = 4_000_000;
export const TYPES_IMAGE_OCR = ["image/png", "image/jpeg", "image/webp"] as const;

export type CodeErreurOcr =
  | "missing"
  | "bad-format"
  | "too-large"
  | "unauthorized"
  | "no-text"
  | "ocr-error";

export type ValidationImageOcr =
  | { ok: true }
  | { ok: false; code: CodeErreurOcr; status: number; erreur: string };

export type ResultatOcr = {
  text: string;
  confidence: number;
  engine: "tesseract.js";
  languages: ["fra", "eng"];
  offline: true;
};

export function validerImageOcr(
  fichier: { type?: string; size?: number } | null | undefined,
): ValidationImageOcr {
  if (!fichier) {
    return { ok: false, code: "missing", status: 400, erreur: "Photo manquante." };
  }
  if (!fichier.type || !TYPES_IMAGE_OCR.includes(fichier.type as (typeof TYPES_IMAGE_OCR)[number])) {
    return { ok: false, code: "bad-format", status: 415, erreur: "Format de photo non pris en charge." };
  }
  if (!Number.isFinite(fichier.size) || (fichier.size ?? 0) <= 0) {
    return { ok: false, code: "bad-format", status: 415, erreur: "Photo illisible." };
  }
  if ((fichier.size ?? 0) > TAILLE_IMAGE_OCR_MAX) {
    return { ok: false, code: "too-large", status: 413, erreur: "Photo trop volumineuse." };
  }
  return { ok: true };
}

/** Trouve la racine applicative même si le process démarre depuis le dépôt. */
function racineAppli(): string {
  const candidats = [
    process.cwd(),
    path.resolve(process.cwd(), "patisgest-app"),
    path.resolve(process.cwd(), "..", "patisgest-app"),
  ];
  for (const racine of candidats) {
    if (existsSync(path.join(racine, "public", "tessdata", "fra.traineddata"))) return racine;
  }
  return process.cwd();
}

export async function recognizeInvoiceImage(image: Buffer): Promise<ResultatOcr> {
  const racine = racineAppli();
  const langPath = path.join(racine, "public", "tessdata");
  const corePath = path.join(racine, "node_modules", "tesseract.js-core");
  const workerPath = path.join(
    racine,
    "node_modules",
    "tesseract.js",
    "src",
    "worker-script",
    "node",
    "index.js",
  );

  if (
    !existsSync(path.join(langPath, "fra.traineddata")) ||
    !existsSync(path.join(langPath, "eng.traineddata")) ||
    !existsSync(corePath) ||
    !existsSync(workerPath)
  ) {
    throw new Error("Ressources OCR absentes du runtime serveur.");
  }

  const worker = await createWorker(["fra", "eng"], OEM.LSTM_ONLY, {
    langPath,
    corePath,
    workerPath,
    cachePath: langPath,
    cacheMethod: "readOnly",
    gzip: false,
    workerBlobURL: false,
    logger: () => {},
  });

  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const resultat = await worker.recognize(image, {}, { text: true });
    const donnees = resultat.data as { text?: string; confidence?: number };
    return {
      text: typeof donnees.text === "string" ? donnees.text : "",
      confidence: Number.isFinite(donnees.confidence) ? Number(donnees.confidence) : 0,
      engine: "tesseract.js",
      languages: ["fra", "eng"],
      offline: true,
    };
  } finally {
    await worker.terminate();
  }
}
