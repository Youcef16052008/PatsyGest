import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
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
  | "too-many-requests"
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

/** Vérifie la signature binaire réelle (octets magiques) contre le MIME déclaré. */
export function validerOctetsImageOcr(
  octets: Uint8Array,
  mime: string,
): ValidationImageOcr {
  if (!octets || octets.length === 0) {
    return { ok: false, code: "bad-format", status: 415, erreur: "Photo illisible." };
  }
  if (octets.length > TAILLE_IMAGE_OCR_MAX) {
    return { ok: false, code: "too-large", status: 413, erreur: "Photo trop volumineuse." };
  }
  const png =
    octets.length >= 8 &&
    octets[0] === 0x89 && octets[1] === 0x50 && octets[2] === 0x4e && octets[3] === 0x47 &&
    octets[4] === 0x0d && octets[5] === 0x0a && octets[6] === 0x1a && octets[7] === 0x0a;
  const jpeg =
    octets.length >= 3 &&
    octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff;
  const webp =
    octets.length >= 12 &&
    octets[0] === 0x52 && octets[1] === 0x49 && octets[2] === 0x46 && octets[3] === 0x46 &&
    octets[8] === 0x57 && octets[9] === 0x45 && octets[10] === 0x42 && octets[11] === 0x50;

  const valide =
    (mime === "image/png" && png) ||
    (mime === "image/jpeg" && jpeg) ||
    (mime === "image/webp" && webp);

  if (!valide) {
    return { ok: false, code: "bad-format", status: 415, erreur: "Signature binaire d’image invalide." };
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

function trouverModule(racine: string, ...segments: string[]): string {
  const local = path.join(racine, "node_modules", ...segments);
  if (existsSync(local)) return local;
  const hoisted = path.resolve(racine, "..", "node_modules", ...segments);
  if (existsSync(hoisted)) return hoisted;
  return local;
}

function trouverCoreTesseract(racine: string, workerPath: string): string {
  const direct = trouverModule(racine, "tesseract.js-core");
  if (existsSync(direct)) return direct;
  if (existsSync(workerPath)) {
    try {
      const req = createRequire(realpathSync(workerPath));
      return path.dirname(req.resolve("tesseract.js-core/package.json"));
    } catch {
      // Fallback below
    }
  }
  return direct;
}

export async function recognizeInvoiceImage(image: Buffer): Promise<ResultatOcr> {
  const racine = racineAppli();
  const langPath = path.join(racine, "public", "tessdata");
  const workerPath = trouverModule(
    racine,
    "tesseract.js",
    "src",
    "worker-script",
    "node",
    "index.js",
  );
  const corePath = trouverCoreTesseract(racine, workerPath);

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
