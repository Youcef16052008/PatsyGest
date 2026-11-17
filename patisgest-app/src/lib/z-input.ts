/**
 * Validation pure du format d'import Z (aperçu côté client).
 * Le format exact est : code;quantité;prix HT — sans en-tête,1 à 100 lignes.
 * La résolution des codes articles et l'import complet sont revérifiés
 * côté serveur par la RPC `importer_z` (ne jamais faire confiance au client).
 */

export type ZLine = { code: string; qty: number; priceHT: number };
export type ZPreview = { lines: ZLine[]; totalHT: number };

const QTY_RE = /^\d+([.,]\d{1,4})?$/;
const PRICE_RE = /^\d+([.,]\d{1,2})?$/;
const CODE_RE = /^[0-9A-Za-z._-]+$/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseZCsv(csv: string): ZPreview {
  const raw = String(csv ?? "");
  if (raw.trim().length < 1 || raw.length > 50_000) {
    throw new Error("Données Z requises (50 000 caractères maximum).");
  }
  const rows = raw.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  if (rows.length < 1) throw new Error("Ajoutez entre 1 et 100 lignes.");
  if (rows.length > 100) throw new Error("Trop de lignes (100 maximum).");

  const lines: ZLine[] = [];
  let totalHT = 0;
  rows.forEach((row, i) => {
    const parts = row.split(";").map((s) => s.trim());
    const n = i + 1;
    if (parts.length !== 3 || !parts[0] || !CODE_RE.test(parts[0])) {
      throw new Error(`Ligne ${n} invalide : utilisez code;quantité;prix HT (sans en-tête).`);
    }
    if (!QTY_RE.test(parts[1]) || !PRICE_RE.test(parts[2])) {
      throw new Error(`Ligne ${n} invalide : utilisez code;quantité;prix HT (sans en-tête).`);
    }
    const qty = Number(parts[1].replace(",", "."));
    const priceHT = Number(parts[2].replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) {
      throw new Error(`Quantité ou prix invalide à la ligne ${n}.`);
    }
    if (!Number.isFinite(priceHT) || priceHT < 0 || priceHT > 1_000_000_000) {
      throw new Error(`Quantité ou prix invalide à la ligne ${n}.`);
    }
    totalHT += round2(qty * priceHT);
    lines.push({ code: parts[0], qty, priceHT });
  });
  return { lines, totalHT: round2(totalHT) };
}
