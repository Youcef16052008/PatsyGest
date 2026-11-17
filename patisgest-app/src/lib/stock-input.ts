/**
 * Validation pure des saisies stocks (articles, réceptions).
 * Aucune dépendance serveur : testable unitairement, utilisée par les server actions
 * qui ne doivent jamais faire confiance aux données du navigateur.
 */

export type ArticleInput = {
  code: string;
  nom: string;
  niveau: "matiere" | "produit";
  unite: string;
  seuil: number;
  pv_ht: number;
  tva: number;
  allergenes: string[];
  traces: string[];
};

export type ReceptionInput = {
  articleId: string;
  siteId: string;
  numero: string;
  qte: number;
  pu: number;
  dlc: string | null;
  fournisseurId: string | null;
  ref: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, label: string, max: number, min = 1): string {
  const s = String(value ?? "").trim();
  if (s.length < min || s.length > max) throw new Error(`${label} : ${min === 0 ? "au plus " : ""}${max} caractères maximum${min > 0 ? ` (minimum ${min})` : ""}.`);
  return s;
}

function number(value: unknown, label: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} : valeur attendue entre ${min} et ${max}.`);
  return n;
}

function uuid(value: unknown, label: string): string {
  const s = String(value ?? "").trim();
  if (!UUID_RE.test(s)) throw new Error(`${label} : identifiant invalide.`);
  return s;
}

function optionalUuid(value: unknown, label: string): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : uuid(s, label);
}

function date(value: unknown, label: string): string | null {
  const s = String(value ?? "").trim();
  if (s === "") return null;
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) {
    throw new Error(`${label} : date invalide (format AAAA-MM-JJ).`);
  }
  return s;
}

function list(value: unknown, label: string): string[] {
  const raw = String(value ?? "");
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (items.length > 10) throw new Error(`${label} : 10 entrées maximum.`);
  for (const item of items) {
    if (item.length > 40) throw new Error(`${label} : chaque entrée fait 40 caractères maximum.`);
  }
  return [...new Set(items.map((s) => s.toLowerCase()))];
}

export function parseArticleInput(formData: FormData): ArticleInput {
  const niveau = String(formData.get("niveau") ?? "").trim();
  if (niveau !== "matiere" && niveau !== "produit") throw new Error("Niveau : choisir matière ou produit.");
  return {
    code: text(formData.get("code"), "Code article", 40),
    nom: text(formData.get("nom"), "Nom", 120),
    niveau,
    unite: text(formData.get("unite"), "Unité", 20),
    seuil: number(formData.get("seuil"), "Seuil", 0, 1_000_000),
    pv_ht: number(formData.get("pv_ht"), "Prix de vente HT", 0, 10_000_000),
    tva: number(formData.get("tva"), "TVA", 0, 100),
    allergenes: list(formData.get("allergenes"), "Allergènes"),
    traces: list(formData.get("traces"), "Traces"),
  };
}

function futureDate(value: FormDataEntryValue | null, label: string): string {
  const s = String(value ?? "").trim();
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) {
    throw new Error(`${label} : date invalide (format AAAA-MM-JJ).`);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (s < today) throw new Error(`${label} doit être aujourd'hui ou plus tard.`);
  return s;
}

export type OfCreateInput = {
  versionId: string;
  siteId: string;
  qtePrevue: number;
  datePrevue: string;
};

export function parseOfCreateInput(formData: FormData): OfCreateInput {
  return {
    versionId: uuid(formData.get("versionId"), "Version"),
    siteId: uuid(formData.get("siteId"), "Site"),
    qtePrevue: number(formData.get("qtePrevue"), "Quantité prévue", 0.0001, 100_000_000),
    datePrevue: futureDate(formData.get("datePrevue"), "Date prévue"),
  };
}

export type OfFinishInput = {
  ofId: string;
  qte: number;
  numeroLot: string;
  dlc: string;
};

export function parseOfFinishInput(formData: FormData): OfFinishInput {
  return {
    ofId: uuid(formData.get("ofId"), "OF"),
    qte: number(formData.get("qte"), "Quantité réalisée", 0.0001, 100_000_000),
    numeroLot: text(formData.get("numeroLot"), "N° de lot", 80),
    dlc: futureDate(formData.get("dlc"), "DLC"),
  };
}

export type SaleInput = {
  articleId: string;
  siteId: string;
  qte: number;
};

export function parseSaleInput(formData: FormData): SaleInput {
  return {
    articleId: uuid(formData.get("articleId"), "Article"),
    siteId: uuid(formData.get("siteId"), "Site"),
    qte: number(formData.get("qte"), "Quantité", 0.0001, 100_000_000),
  };
}

export function parseReceptionInput(formData: FormData): ReceptionInput {
  return {
    articleId: uuid(formData.get("articleId"), "Article"),
    siteId: uuid(formData.get("siteId"), "Site"),
    numero: text(formData.get("numero"), "Numéro de lot", 80),
    qte: number(formData.get("qte"), "Quantité", 0.0001, 100_000_000),
    pu: number(formData.get("pu"), "Prix unitaire", 0, 100_000_000),
    dlc: date(formData.get("dlc"), "DLC"),
    fournisseurId: optionalUuid(formData.get("fournisseurId"), "Fournisseur"),
    ref: (() => { const s = String(formData.get("ref") ?? "").trim(); return s === "" ? null : text(s, "Référence", 80); })(),
  };
}
