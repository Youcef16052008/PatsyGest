/**
 * Validation pure des saisies de versions de recette : lignes article ou
 * sous-recette (version figée), rendement, conversions d'unités.
 * La résolution tenant, l'anti-cycle et les conversions sont revérifiés
 * côté serveur par `creer_version`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export type VersionLineInput =
  | { kind: "article"; articleId: string; q: number; u: string; parage: number }
  | { kind: "sub"; subVersionId: string; q: number; u: string };

export type VersionInput = {
  familleId: string;
  rendementQte: number;
  rendementUnite: string;
  lignes: VersionLineInput[];
  notes: string | null;
  moMin: number;
  energie: number;
  emballage: number;
  fraisGeneraux: number;
  cuissonPertePct: number;
  active: boolean;
};

const KINDS = ["article", "sub"];

export function parseVersionInput(formData: FormData): VersionInput {
  const count = Number(formData.get("lineCount"));
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Nombre de lignes invalide (1 à 100).");
  }
  const lignes: VersionLineInput[] = [];
  for (let i = 0; i < count; i++) {
    const kind = String(formData.get(`line${i}_kind`) ?? "");
    if (!KINDS.includes(kind)) throw new Error(`Ligne ${i + 1} : type invalide.`);
    const q = num(formData.get(`line${i}_q`), `Quantité ligne ${i + 1}`, 0.0001, 100_000_000);
    const u = text(formData.get(`line${i}_u`), `Unité ligne ${i + 1}`, 10);
    if (kind === "article") {
      lignes.push({
        kind: "article",
        articleId: uuid(formData.get(`line${i}_ref`), `Article ligne ${i + 1}`),
        q,
        u,
        parage: num(formData.get(`line${i}_parage`) ?? 0, `Parage ligne ${i + 1}`, 0, 1000),
      });
    } else {
      lignes.push({
        kind: "sub",
        subVersionId: uuid(formData.get(`line${i}_ref`), `Sous-recette ligne ${i + 1}`),
        q,
        u,
      });
    }
  }
  const notes = String(formData.get("notes") ?? "").trim();
  return {
    familleId: uuid(formData.get("familleId"), "Famille"),
    rendementQte: num(formData.get("rendementQte"), "Rendement", 0.0001, 100_000_000),
    rendementUnite: text(formData.get("rendementUnite"), "Unité de rendement", 10),
    lignes,
    notes: notes === "" ? null : text(notes, "Notes", 500),
    moMin: num(formData.get("moMin") ?? 0, "MO (min)", 0, 1_000_000),
    energie: num(formData.get("energie") ?? 0, "Énergie", 0, 1_000_000_000),
    emballage: num(formData.get("emballage") ?? 0, "Emballage", 0, 1_000_000_000),
    fraisGeneraux: num(formData.get("fraisGeneraux") ?? 0, "Frais généraux", 0, 1_000_000_000),
    cuissonPertePct: num(formData.get("cuissonPertePct") ?? 0, "Perte cuisson", 0, 99.99),
    active: formData.get("active") === "on",
  };
}
