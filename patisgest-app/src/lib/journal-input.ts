/**
 * Validation pure des saisies journaux (clôture, qualité, planning, cakes).
 * Aucune dépendance serveur : testable unitairement, utilisée par les
 * server actions qui ne doivent jamais faire confiance au navigateur.
 */

import { parseCashDrawerDeclaration, type CashDrawerDeclaration } from "./reconciliation.ts";
import { dateIsoValide, jourLocal } from "./workspace-data.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown, label: string, max: number, min = 1): string {
  const s = String(value ?? "").trim();
  if (s.length < min || s.length > max) {
    throw new Error(`${label} : ${min === 0 ? "au plus " : ""}${max} caractères maximum${min > 0 ? ` (minimum ${min})` : ""}.`);
  }
  return s;
}

function num(value: unknown, label: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} : valeur attendue entre ${min} et ${max}.`);
  return n;
}

function int(value: unknown, label: string, min: number, max: number): number {
  const n = num(value, label, min, max);
  if (!Number.isInteger(n)) throw new Error(`${label} : valeur entière attendue.`);
  return n;
}

function uuid(value: unknown, label: string): string {
  const s = String(value ?? "").trim();
  if (!UUID_RE.test(s)) throw new Error(`${label} : identifiant invalide.`);
  return s;
}

function day(value: unknown, label: string, opts: { notFuture?: boolean; min?: string; maintenant?: Date } = {}): string {
  const s = String(value ?? "").trim();
  if (!dateIsoValide(s)) {
    throw new Error(`${label} : date invalide (format AAAA-MM-JJ).`);
  }
  const today = jourLocal(opts.maintenant);
  if (opts.notFuture && s > today) throw new Error(`${label} ne peut pas être dans le futur.`);
  if (opts.min && s < opts.min) throw new Error(`${label} invalide.`);
  return s;
}

function qty(value: unknown, label: string): number {
  const n = num(value, label, 0, 1_000_000_000);
  if (Math.round(n * 10_000) / 10_000 !== n) throw new Error(`${label} : quatre décimales maximum.`);
  return n;
}

function bool(value: unknown, label: string): boolean {
  if (value === true || value === "true" || value === "on") return true;
  if (value === false || value === "false" || value === null || value === undefined || value === "") return false;
  throw new Error(`${label} : valeur booléenne attendue.`);
}

// ---------------------------------------------------------------- clôture

export type ClosingLineInput = {
  articleId: string;
  produit: number;
  vendu: number;
  reporte: number;
  jete: number;
  casse: number;
  offert: number;
};

export type ClosingInput = {
  date: string;
  siteId: string;
  revise: boolean;
  lignes: ClosingLineInput[];
  caisseBilan: CashDrawerDeclaration | null;
};

const CLOSING_FLOWS = ["produit", "vendu", "reporte", "jete", "casse", "offert"] as const;

export function parseClosingInput(formData: FormData, maintenant?: Date): ClosingInput {
  const date = day(formData.get("date"), "Date", { notFuture: true, maintenant });
  const siteId = uuid(formData.get("siteId"), "Site");
  const revise = bool(formData.get("revise"), "Correction");
  const count = int(formData.get("lineCount"), "Nombre de lignes", 1, 100);
  const lignes: ClosingLineInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const articleId = uuid(formData.get(`line${i}_article`), `Article ligne ${i + 1}`);
    if (seen.has(articleId)) throw new Error("Produit en double.");
    seen.add(articleId);
    const line: Record<string, unknown> = { articleId };
    for (const flow of CLOSING_FLOWS) line[flow] = qty(formData.get(`line${i}_${flow}`), `${flow} ligne ${i + 1}`);
    lignes.push(line as unknown as ClosingLineInput);
  }
  const caisseBilan = parseCashDrawerDeclaration({
    fondInitial: formData.get("fondInitial"),
    sortiesEspeces: formData.get("sortiesEspeces"),
    especesComptees: formData.get("especesComptees"),
    motifSortie: formData.get("motifSortie"),
  });
  return { date, siteId, revise, lignes, caisseBilan };
}

export type RestockRequestInput = {
  dateCible: string;
  siteId: string;
  articleId: string;
  qte: number;
  motif: string;
  demandeur: string;
};

export function parseRestockRequestInput(formData: FormData): RestockRequestInput {
  const qte = qty(formData.get("qte"), "Quantité demandée");
  if (qte < 0.0001 || qte > 100_000_000) {
    throw new Error("Quantité demandée : entre 0,0001 et 100 000 000.");
  }
  return {
    dateCible: day(formData.get("dateCible"), "Date cible", { min: "2000-01-01" }),
    siteId: uuid(formData.get("siteId"), "Boutique"),
    articleId: uuid(formData.get("articleId"), "Produit"),
    qte,
    motif: str(formData.get("motif"), "Motif / précision", 200, 0),
    demandeur: str(formData.get("demandeur"), "Demandeur", 80, 0),
  };
}

// --------------------------------------------------------------- qualité

export type TemperatureInput = {
  date: string;
  frigoId: string;
  frigoNom: string;
  seuilMax: number;
  temperature: number;
  agent: string | null;
};

export function parseTemperatureInput(formData: FormData): TemperatureInput {
  const agent = String(formData.get("agent") ?? "").trim();
  return {
    date: day(formData.get("date"), "Date", { notFuture: true }),
    frigoId: str(formData.get("frigoId"), "Identifiant frigo", 40, 0),
    frigoNom: str(formData.get("frigoNom"), "Équipement", 80),
    seuilMax: num(formData.get("seuilMax"), "Seuil max", -100, 200),
    temperature: num(formData.get("temperature"), "Température", -100, 200),
    agent: agent === "" ? null : str(agent, "Agent", 80),
  };
}

export type CleaningInput = {
  date: string;
  zone: string;
  fait: boolean;
  agent: string | null;
};

export function parseCleaningInput(formData: FormData): CleaningInput {
  const agent = String(formData.get("agent") ?? "").trim();
  return {
    date: day(formData.get("date"), "Date", { notFuture: true }),
    zone: str(formData.get("zone"), "Zone", 80),
    fait: bool(formData.get("fait"), "Fait"),
    agent: agent === "" ? null : str(agent, "Agent", 80),
  };
}

export type NcInput = {
  date: string;
  type: string;
  description: string;
  lotNumero: string | null;
  action: string | null;
};

export function parseNcInput(formData: FormData): NcInput {
  const lot = String(formData.get("lotNumero") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  return {
    date: day(formData.get("date"), "Date", { notFuture: true }),
    type: str(formData.get("type"), "Type", 80),
    description: str(formData.get("description"), "Description", 500),
    lotNumero: lot === "" ? null : str(lot, "N° de lot", 80),
    action: action === "" ? null : str(action, "Action", 500),
  };
}

export type NcUpdateInput = { id: string; statut: "ouverte" | "cloturee"; action: string | null };

export function parseNcUpdateInput(formData: FormData): NcUpdateInput {
  const statut = String(formData.get("statut") ?? "");
  if (statut !== "ouverte" && statut !== "cloturee") throw new Error("Statut invalide.");
  const action = String(formData.get("action") ?? "").trim();
  return {
    id: uuid(formData.get("id"), "Non-conformité"),
    statut,
    action: action === "" ? null : str(action, "Action corrective", 500),
  };
}

// ------------------------------------------------------------- planning

export type TaskInput = {
  date: string;
  tache: string;
  ofNumero: string | null;
  dureeMin: number;
  responsable: string | null;
};

export function parseTaskInput(formData: FormData): TaskInput {
  const of = String(formData.get("ofNumero") ?? "").trim();
  const resp = String(formData.get("responsable") ?? "").trim();
  return {
    date: day(formData.get("date"), "Date"),
    tache: str(formData.get("tache"), "Tâche", 100),
    ofNumero: of === "" ? null : str(of, "Numéro d'OF", 80),
    dureeMin: int(formData.get("dureeMin"), "Durée", 0, 100_000),
    responsable: resp === "" ? null : str(resp, "Responsable", 100),
  };
}

export type TaskToggleInput = { id: string; fait: boolean };

export function parseTaskToggleInput(formData: FormData): TaskToggleInput {
  return {
    id: uuid(formData.get("id"), "Tâche"),
    fait: bool(formData.get("fait"), "Fait"),
  };
}

// --------------------------------------------------------------- cakes

export type CakeOptionInput = { name: string; cout: number; minutes: number };

export type CakeInput = {
  clientNom: string;
  telephone: string | null;
  dateEvent: string;
  nbParts: number;
  prixHt: number;
  options: CakeOptionInput[];
  notes: string | null;
  cgv: boolean;
};

export function parseCakeInput(formData: FormData): CakeInput {
  const tel = String(formData.get("telephone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const count = int(formData.get("optionCount"), "Nombre d'options", 0, 50);
  const options: CakeOptionInput[] = [];
  for (let i = 0; i < count; i++) {
    const name = String(formData.get(`opt${i}_name`) ?? "").trim();
    if (name === "") throw new Error(`Option ${i + 1} : nom requis.`);
    options.push({
      name: str(name, `Option ${i + 1}`, 100),
      cout: num(formData.get(`opt${i}_cout`), `Coût option ${i + 1}`, 0, 1_000_000_000),
      minutes: int(formData.get(`opt${i}_minutes`), `Durée option ${i + 1}`, 0, 100_000),
    });
  }
  return {
    clientNom: str(formData.get("clientNom"), "Client", 100),
    telephone: tel === "" ? null : str(tel, "Téléphone", 40),
    dateEvent: day(formData.get("dateEvent"), "Date d'événement", { min: "2000-01-04" }),
    nbParts: int(formData.get("nbParts"), "Parts", 1, 10_000),
    prixHt: num(formData.get("prixHt"), "Prix HT", 0.01, 100_000_000_000),
    options,
    notes: notes === "" ? null : str(notes, "Notes", 500),
    cgv: bool(formData.get("cgv"), "CGV"),
  };
}

export function parseCakeProductionInput(formData: FormData) {
  const qteFabrication = num(formData.get("qteFabrication"), "Quantité à fabriquer", 0.001, 100_000_000);
  if (Math.round(qteFabrication * 1000) / 1000 !== qteFabrication) throw new Error("Quantité : trois décimales maximum.");
  return { versionId: uuid(formData.get("versionId"), "Recette"), siteId: uuid(formData.get("siteId"), "Site"), qteFabrication };
}

export type CakeActionInput = { id: string; transition: string; montant: number | null };

const CAKE_TRANSITIONS = ["payer", "confirme", "produit", "livre", "annule"];

export function parseCakeActionInput(formData: FormData): CakeActionInput {
  const transition = String(formData.get("transition") ?? "");
  if (!CAKE_TRANSITIONS.includes(transition)) throw new Error("Transition invalide.");
  const raw = String(formData.get("montant") ?? "").trim();
  let montant: number | null = null;
  if (transition === "payer") {
    montant = num(raw, "Montant", 0.01, 100_000_000_000);
  }
  return { id: uuid(formData.get("id"), "Devis"), transition, montant };
}
