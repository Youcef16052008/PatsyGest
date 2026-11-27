import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));
const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');
const lireBytes = (chemin) => readFileSync(new URL(chemin, import.meta.url));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const certification = lire('../../.github/workflows/certification-production.yml');
const rollback = lire('../../.github/workflows/rollback-chaud.yml');
const runbook = lire('../../audit/RUNBOOK-ROLLBACK.md');
const config = lire('../next.config.ts');
const composant = lire('../src/components/invoice-photo-intake.tsx');
const parseur = lire('../src/lib/invoice-photo-parser.ts');
const routeOcr = lire('../src/app/api/invoice-ocr/route.ts');
const routePile = lire('../src/app/api/health/stack/route.ts');
const serveurOcr = lire('../src/lib/ocr-server.ts');
const paquet = JSON.parse(lire('../package.json'));
const chaine = lireBytes('../../audit/sql/chain-01-57.sql');
const meta = JSON.parse(lire('../../audit/sql/chain-01-57.meta.json'));

test('VAGUE 6 : la chaîne SQL et ses 12 fragments sont déterministes et sûrs', () => {
  const sortie = execFileSync(process.execPath, ['scripts/construire-chaine-sql.mjs', '--check'], {
    cwd: APP_ROOT,
    encoding: 'utf8',
  });
  assert.match(sortie, /CHECK OK/u);
  assert.equal(meta.fichiers, 56);
  assert.equal(meta.marqueurs, 56);
  assert.equal(meta.parts, 12);
  assert.equal(meta.bytes, chaine.length);
  assert.equal(meta.sha256, sha256(chaine));
  const texteChaine = chaine.toString('utf8');
  assert.equal((texteChaine.match(/^-- ===== /gmu) ?? []).length, 56);
  assert.match(texteChaine, /values \(1, 57\)/u);
  assert.equal(meta.replay_patches, 5, 'correctifs de rejouabilité absents du manifeste');
  assert.match(texteChaine, /ADD COLUMN IF NOT EXISTS revision integer DEFAULT 1/u);
  assert.match(texteChaine, /ADD COLUMN IF NOT EXISTS agent_id uuid/u);
  assert.ok(!texteChaine.includes('revoke execute on function public.creer_of(uuid, uuid, numeric, date)'), 'ACL 4 args non corrigée');
  assert.ok(!texteChaine.includes('drop function if exists public.creer_of(uuid, uuid, numeric, date);'), 'drop 4 args non corrigé');
  assert.ok(!/(^|\n)\s*(?:begin|commit)\s*;/iu.test(texteChaine), 'transaction non retirée');
  for (const motif of [
    /create\s+event\s+trigger/iu,
    /alter\s+system/iu,
    /\bpg_cron\b/iu,
    /\bpg_net\b/iu,
    /\bhttp_post\b/iu,
    /\bdblink\b/iu,
    /(^|\n)\s*\\(i|ir|connect)\b/u,
    /(^|\n)\s*copy\b/iu,
  ]) {
    assert.ok(!motif.test(chaine.toString('utf8')), `motif risqué dans la chaîne : ${motif}`);
  }
  const fragments = meta.chunks.map((chunk) => lireBytes(`../../audit/sql/${chunk.file}`));
  assert.equal(fragments.length, 12);
  assert.equal(fragments.reduce((somme, fragment) => somme + fragment.length, 0), chaine.length);
  assert.equal(Buffer.concat(fragments).equals(chaine), true, 'fragments non concaténables');
  for (let i = 0; i < 12; i++) {
    assert.equal(meta.chunks[i].bytes, fragments[i].length);
    assert.equal(meta.chunks[i].sha256, sha256(fragments[i]));
  }
});

test('VAGUE 6 : le workflow de certification est le seul déclenchement manuel attendu', () => {
  assert.match(certification, /workflow_dispatch:/u);
  assert.match(certification, /test:cert:postgresql/u);
  assert.match(certification, /test:cert:concurrency/u);
  assert.match(certification, /test:cert:hosted/u);
  assert.match(certification, /secrets\.SUPABASE_DB_URL/u);
  assert.match(certification, /secrets\.CRON_SECRET/u);
  assert.ok(!/^\s*(?:push|pull_request|schedule):/mu.test(certification), 'déclenchement automatique interdit');
  assert.ok(!certification.includes('workflow_dispatch') || certification.includes('on:\n  workflow_dispatch:'));
});

test('VAGUE 6 : rollback préparé, jamais exécuté automatiquement', () => {
  assert.match(rollback, /workflow_dispatch:/u);
  assert.match(rollback, /dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3/u);
  assert.match(rollback, /default: true/u);
  assert.match(rollback, /confirm == 'ROLLBACK'/u);
  assert.ok(!/^\s*(?:push|pull_request|schedule):/mu.test(rollback), 'rollback automatique interdit');
  assert.match(runbook, /dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3/u);
  assert.match(runbook, /NON EXÉCUTÉ/u);
  assert.match(runbook, /project_settings:null/u);
});

test('VAGUE 6 : OCR serveur, tracing, i18n et sonde de pile sont câblés', () => {
  for (const motif of [
    'serverExternalPackages',
    'outputFileTracingIncludes',
    'tesseract.js-core',
    'tesseract.js/src/worker-script',
    'public/tessdata',
  ]) {
    assert.ok(config.includes(motif), `tracing Next absent : ${motif}`);
  }
  assert.match(serveurOcr, /cacheMethod: "readOnly"/u);
  assert.match(serveurOcr, /gzip: false/u);
  assert.match(serveurOcr, /workerBlobURL: false/u);
  assert.match(parseur, /options\?\.ocr/u);
  assert.match(composant, /\/api\/invoice-ocr/u);
  assert.match(composant, /ocr: true/u);
  assert.match(composant, /t\.invoiceOcrReading/u);
  assert.match(routeOcr, /runtime = "nodejs"/u);
  assert.match(routeOcr, /getSessionContext/u);
  assert.match(routeOcr, /recognizeInvoiceImage/u);
  assert.match(routePile, /timingSafeEqual/u);
  assert.match(routePile, /CRON_SECRET/u);
  assert.match(routePile, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.match(routePile, /\/auth\/v1\/health/u);
  assert.match(routePile, /\/rest\/v1\//u);
  assert.match(routePile, /\/storage\/v1\//u);
  assert.ok(!/console\.log\(/u.test(routePile), 'sonde de pile ne doit pas journaliser');
  for (const script of [
    'test:cert:ocr',
    'test:cert:postgresql',
    'test:cert:concurrency',
    'test:cert:hosted',
    'test:cert:production',
    'build:chain',
  ]) {
    assert.ok(paquet.scripts[script], `script npm absent : ${script}`);
  }
});
