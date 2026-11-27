#!/usr/bin/env node
/**
 * Reconstruit de façon déterministe la chaîne SQL 01→57 appliquée au pilote et
 * ses 12 fragments. Aucun seed 02, aucun BEGIN/COMMIT : les fichiers sont
 * exécutés par un EXECUTE PL/pgSQL unique côté Supabase.
 *
 *   node scripts/construire-chaine-sql.mjs           # écrit les artefacts
 *   node scripts/construire-chaine-sql.mjs --check   # vérifie sans écrire
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const APP_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SQL_DIR = new URL("../supabase/", import.meta.url);
const AUDIT_SQL = new URL("../../audit/sql/", import.meta.url);
const CHAINE = new URL("chain-01-57.sql", AUDIT_SQL);
const META = new URL("chain-01-57.meta.json", AUDIT_SQL);
const CHUNKS = new URL("chunks/", AUDIT_SQL);
const VERIFICATION = process.argv.includes("--check");

const fichiers = readdirSync(SQL_DIR)
  .filter((nom) => /^\d+-.+\.sql$/u.test(nom) && nom !== "02-seed-pilote.sql")
  .sort((a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]));

const morceaux = [];
for (let i = 0; i < fichiers.length; i++) {
  if (i > 0) morceaux.push("");
  morceaux.push(`-- ===== ${fichiers[i]} =====`);
  const contenu = readFileSync(new URL(fichiers[i], SQL_DIR), "utf8")
    .replace(/^\s*(?:begin|commit)\s*;\s*$/gim, "")
    .replace(
      "create extension if not exists pgcrypto;",
      "create extension if not exists pgcrypto with schema extensions;",
    );
  morceaux.push(contenu.replace(/\n+$/u, ""));
}
const chaine = `${morceaux.join("\n")}\n`;
const octets = Buffer.from(chaine, "utf8");

/** 12 coupes sur des fins de ligne : jamais au milieu d'un caractère UTF-8. */
const lignes = chaine.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
const frontieres = [0];
let curseur = 0;
for (const ligne of lignes) {
  curseur += Buffer.byteLength(ligne, "utf8");
  frontieres.push(curseur);
}
const total = octets.length;
const coupes = [0];
for (let i = 1; i < 12; i++) {
  const cible = Math.round((total * i) / 12);
  const trouve = frontieres.find((offset) => offset >= cible) ?? total;
  coupes.push(Math.min(Math.max(trouve, coupes.at(-1) + 1), total - (12 - i)));
}
coupes.push(total);

const fragments = [];
for (let i = 0; i < 12; i++) {
  fragments.push(octets.subarray(coupes[i], coupes[i + 1]));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
function md5(buffer) {
  return createHash("md5").update(buffer).digest("hex");
}

const meta = {
  fichiers: fichiers.length,
  marqueurs: (chaine.match(/^-- ===== /gmu) ?? []).length,
  bytes: total,
  parts: 12,
  sha256: sha256(octets),
  md5: md5(octets),
  chunks: fragments.map((fragment, index) => ({
    part: index + 1,
    file: `chunks/part-${String(index + 1).padStart(2, "0")}.sql`,
    bytes: fragment.length,
    sha256: sha256(fragment),
  })),
};
const metaTexte = `${JSON.stringify(meta, null, 2)}\n`;

if (VERIFICATION) {
  const chaineExistante = readFileSync(CHAINE);
  if (!chaineExistante.equals(octets)) throw new Error("audit/sql/chain-01-57.sql divergente");
  const metaExistante = readFileSync(META, "utf8");
  if (metaExistante !== metaTexte) throw new Error("audit/sql/chain-01-57.meta.json divergent");
  for (let i = 0; i < 12; i++) {
    const nom = `part-${String(i + 1).padStart(2, "0")}.sql`;
    if (!readFileSync(new URL(nom, CHUNKS)).equals(fragments[i])) {
      throw new Error(`audit/sql/chunks/${nom} divergent`);
    }
  }
  console.log(`[chaine-sql] CHECK OK files=${meta.fichiers} bytes=${total} sha256=${meta.sha256} md5=${meta.md5}`);
} else {
  mkdirSync(CHUNKS, { recursive: true });
  writeFileSync(CHAINE, octets);
  writeFileSync(META, metaTexte);
  for (let i = 0; i < 12; i++) {
    const nom = `part-${String(i + 1).padStart(2, "0")}.sql`;
    writeFileSync(new URL(nom, CHUNKS), fragments[i]);
  }
  console.log(`[chaine-sql] WRITE OK files=${meta.fichiers} bytes=${total} sha256=${meta.sha256} md5=${meta.md5}`);
}
