/**
 * B.4 — Analyseur de lignes de facture / bon fournisseur (texte saisi, collé ou OCR)
 * avec rapprochement automatique sur les articles du catalogue.
 */

export type CatalogMatchOption = {
  id: string;
  nom: string;
  unite: string;
};

export type InvoiceDraftLine = {
  id: string;
  rawText: string;
  designation: string;
  articleId: string;
  qte: number;
  puDa: number;
  matched: boolean;
};

export type OptionsParseFacture = { ocr?: boolean };

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchCatalogArticle(designation: string, catalog: CatalogMatchOption[]): CatalogMatchOption | null {
  const target = normalizeText(designation);
  if (!target) return null;
  const words = target.split(" ").filter((w) => w.length >= 3);

  let best: { item: CatalogMatchOption; score: number } | null = null;
  for (const item of catalog) {
    const normItem = normalizeText(item.nom);
    if (normItem === target) return item;
    if (normItem.includes(target) || target.includes(normItem)) {
      const score = 100;
      if (!best || score > best.score) best = { item, score };
      continue;
    }
    let hits = 0;
    for (const w of words) {
      if (normItem.includes(w)) hits++;
    }
    if (hits > 0 && (!best || hits > best.score)) {
      best = { item, score: hits };
    }
  }
  return best ? best.item : null;
}

/**
 * En mode OCR, les en-têtes, totaux et mentions administratives ne doivent pas
 * devenir des lignes de stock. La saisie manuelle garde l'ancien comportement :
 * une ligne sans nombre reste éditable par l'utilisateur.
 */
function ligneBruitOcr(rawText: string, nombreDeNombres: number): boolean {
  const libelle = rawText.trim();
  if (!libelle) return true;
  if (/^(?:facture|bon|re[cç]u|ticket|total|sous[- ]?total|tva|timbre|montant|date|client|fournisseur|adresse|t[ée]l[ée]phone)\b/iu.test(libelle)) {
    return true;
  }
  return nombreDeNombres === 0 && /[A-ZÀ-Ÿ]{3}/u.test(libelle);
}

/**
 * Exemples reconnus :
 * - "Farine 25 kg 95"
 * - "Beurre de tourage : 10 x 950"
 * - "Amandes 5kg 1900 DA"
 * - "Sucre ; 15 ; 110"
 */
export function parseSupplierInvoiceText(
  text: string,
  catalog: CatalogMatchOption[],
  options: OptionsParseFacture = {},
): InvoiceDraftLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: InvoiceDraftLine[] = [];
  for (const rawText of lines) {
    const cleaned = rawText
      .replace(/\bda\b/gi, " ")
      .replace(/[x×*;:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const tokens = cleaned.split(" ");
    const numbers: { idx: number; val: number }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].replace(/(kg|g|l|ml|cl|pcs|u)$/i, "").replace(",", ".");
      if (/^\d+(\.\d+)?$/.test(t)) {
        numbers.push({ idx: i, val: Number(t) });
      }
    }
    if (options?.ocr && ligneBruitOcr(rawText, numbers.length)) continue;

    const qte = numbers.length >= 1 && numbers[0].val > 0 ? numbers[0].val : 1;
    const puDa = numbers.length >= 2 && numbers[1].val >= 0 ? numbers[1].val : 0;
    const cutIdx = numbers.length > 0 ? numbers[0].idx : tokens.length;
    const designation = tokens.slice(0, cutIdx).join(" ").trim() || rawText.slice(0, 60);

    const matched = matchCatalogArticle(designation, catalog);
    parsed.push({
      id: `${Date.now()}-${parsed.length}`,
      rawText,
      designation,
      articleId: matched?.id ?? (catalog[0]?.id ?? ""),
      qte,
      puDa,
      matched: Boolean(matched),
    });
  }
  return parsed;
}
