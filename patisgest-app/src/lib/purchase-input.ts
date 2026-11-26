/**
 * Validation pure des saisies achats (bons de commande multi-lignes,
 * réceptions). Aucune dépendance serveur : testable unitairement.
 */

import { dateIsoValide, jourLocal } from "./workspace-data.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function uuid(value: unknown, label: string): string {
  const s = String(value ?? "").trim();
  if (!UUID_RE.test(s)) throw new Error(`${label} : identifiant invalide.`);
  return s;
}

function num(value: unknown, label: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} : valeur attendue entre ${min} et ${max}.`);
  return n;
}

function text(value: unknown, label: string, max: number, min = 1): string {
  const s = String(value ?? "").trim();
  if (s.length < min || s.length > max) throw new Error(`${label} : ${max} caractères maximum.`);
  return s;
}

export type CommandeLineInput = { articleId: string; qte: number; pu: number };
export type CommandeInput = { fournisseurId: string; lignes: CommandeLineInput[]; notes: string | null };

export function parseCommandeInput(formData: FormData): CommandeInput {
  const fournisseurId = uuid(formData.get("fournisseurId"), "Fournisseur");
  const count = Number(formData.get("lineCount"));
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Nombre de lignes invalide (1 à 100).");
  }
  const lignes: CommandeLineInput[] = [];
  for (let i = 0; i < count; i++) {
    lignes.push({
      articleId: uuid(formData.get(`line${i}_article`), `Article ligne ${i + 1}`),
      qte: num(formData.get(`line${i}_qte`), `Quantité ligne ${i + 1}`, 0.0001, 100_000_000),
      pu: num(formData.get(`line${i}_pu`), `Prix ligne ${i + 1}`, 0, 100_000_000),
    });
  }
  const notes = String(formData.get("notes") ?? "").trim();
  return { fournisseurId, lignes, notes: notes === "" ? null : text(notes, "Notes", 500) };
}

export type ReceptionLineInput = { index: number; qte: number; numero: string; dlc: string };
export type ReceptionInput = { commandeId: string; siteId: string; receptions: ReceptionLineInput[] };

export function parseReceptionLinesInput(formData: FormData, maintenant?: Date): ReceptionInput {
  const commandeId = uuid(formData.get("commandeId"), "Commande");
  const siteId = uuid(formData.get("siteId"), "Site");
  const count = Number(formData.get("receptionCount"));
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Nombre de réceptions invalide (1 à 100).");
  }
  const today = jourLocal(maintenant);
  const receptions: ReceptionLineInput[] = [];
  for (let i = 0; i < count; i++) {
    const index = Number(formData.get(`rec${i}_index`));
    if (!Number.isInteger(index) || index < 0) throw new Error("Ligne de commande invalide.");
    const dlc = String(formData.get(`rec${i}_dlc`) ?? "").trim();
    if (!dateIsoValide(dlc) || dlc < today) {
      throw new Error(`DLC ligne ${i + 1} : date invalide (aujourd'hui ou plus tard).`);
    }
    receptions.push({
      index,
      qte: num(formData.get(`rec${i}_qte`), `Quantité ligne ${i + 1}`, 0.0001, 100_000_000),
      numero: text(formData.get(`rec${i}_numero`), `N° de lot ligne ${i + 1}`, 80),
      dlc,
    });
  }
  return { commandeId, siteId, receptions };
}
