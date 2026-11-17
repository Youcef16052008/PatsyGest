import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES_EXPORT } from '../src/lib/csv.ts';

/**
 * Sprint 6 — invariants de sécurité automatisables (NF-08, RG-15.2).
 *
 * Ces tests ne remplacent PAS la revue sécurité 25 points du cahier : ils
 * verrouillent les régressions les plus coûteuses (secret commité, droit anon
 * accordé, garde de rôle supprimée). Ils échouent si quelqu'un « simplifie »
 * une protection.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const lire = (p) => (existsSync(path.join(ROOT, p)) ? readFileSync(path.join(ROOT, p), 'utf8') : '');

function fichiersSuivis(dossier, ext) {
  const out = [];
  const parcourir = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (['node_modules', '.next', '.git'].includes(e.name)) continue;
      const r = path.join(rel, e.name);
      if (e.isDirectory()) parcourir(r);
      else if (ext.some((x) => e.name.endsWith(x))) out.push(r);
    }
  };
  parcourir(dossier);
  return out;
}

test('sécu : aucune clé service_role ni secret en clair dans le code source', () => {
  const fichiers = fichiersSuivis('src', ['.ts', '.tsx']);
  assert.ok(fichiers.length > 10, 'sources introuvables');
  for (const f of fichiers) {
    const src = read(f);
    assert.equal(
      /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/.test(src),
      false,
      `Service role key en dur dans ${f}`,
    );
    // Un JWT (eyJ...) complet ne doit jamais être versionné dans src/.
    assert.equal(/eyJhbGciOi[A-Za-z0-9_-]{10,}/.test(src), false, `JWT en dur dans ${f}`);
  }
});

test('sécu : les fichiers .env sont ignorés par Git', () => {
  const gi = lire('../.gitignore');
  assert.ok(gi.length > 0, '.gitignore introuvable');
  assert.ok(/^\.env/m.test(gi), '.gitignore doit couvrir .env*');
});

test('sécu : aucune migration n’accorde de droit d’exécution à anon', () => {
  const dir = 'supabase';
  const migrations = readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.sql'));
  assert.ok(migrations.length >= 17, `migrations manquantes (${migrations.length})`);
  for (const m of migrations) {
    const sql = lire(path.join(dir, m)).toLowerCase();
    // `grant ... to anon` ou `grant ... to public` ouvrirait la RPC à Internet.
    assert.equal(
      /grant\s+execute\s+on\s+function[^;]*\bto\b[^;]*\banon\b/.test(sql),
      false,
      `grant à anon dans ${m}`,
    );
  }
});

test('sécu : la migration 17 (confidentialité des coûts) existe et garde le rôle', () => {
  const sql = lire('supabase/17-confidentialite-couts-rls.sql').toLowerCase();
  assert.ok(sql.length > 0, 'migration 17 absente');
  // Les deux policies de coût doivent filtrer sur le rôle, pas seulement le tenant.
  assert.ok(/create policy select_pc[\s\S]*?patisgest_mon_role\(\)/.test(sql), 'select_pc sans garde de rôle');
  assert.ok(/create policy recette_versions_cost_read[\s\S]*?patisgest_mon_role\(\)/.test(sql), 'recette_versions sans garde de rôle');
  // La RPC SECURITY DEFINER doit elle-même refuser un rôle non autorisé.
  assert.ok(/simuler_recette[\s\S]*?role not in/.test(sql), 'simuler_recette sans garde de rôle');
});

test('sécu : les modules de coût sont gardés par canReadCosts dans le rendu', () => {
  const page = read('src/app/(app)/[module]/page.tsx');
  assert.ok(
    /key==='simulation'\s*&&\s*canReadCosts\(ctx\.role\)/.test(page),
    'le module simulation doit exiger canReadCosts',
  );
  const actionsCouts = read('src/lib/actions-couts.ts');
  assert.ok(/canReadCosts\(ctx\.role\)/.test(actionsCouts), 'ficheCoutReal sans garde de rôle');
  const actionsSimu = read('src/lib/actions-simulation.ts');
  assert.ok(/canReadCosts\(ctx\.role\)/.test(actionsSimu), 'simulerReal sans garde de rôle');
});

test('sécu : la navigation masque les modules de coût au vendeur', () => {
  const layout = read('src/app/(app)/layout.tsx');
  assert.ok(/canReadCosts\(ctx\.role\)/.test(layout), 'navigation sans filtrage par rôle');
  assert.ok(/navCouts/.test(layout), 'les modules de coût doivent être identifiés');
});

test('sécu : les tables de coût sont marquées cout:true pour l’export', () => {
  const couts = TABLES_EXPORT.filter((t) => t.cout).map((t) => t.cle).sort();
  assert.deepEqual(couts, ['couts', 'recettes']);
});

test('sécu : la route d’export vérifie le rôle avant d’interroger la base', () => {
  const route = read('src/app/api/export/route.ts');
  assert.ok(/canReadCosts\(ctx\.role\)/.test(route), 'export sans contrôle de rôle');
  assert.ok(/tableExportable/.test(route), 'export sans liste blanche de tables');
  // La garde doit précéder la requête Supabase.
  const posGarde = route.indexOf('tableExportable');
  const posRequete = route.indexOf('.from(def.table)');
  assert.ok(posGarde > 0 && posRequete > posGarde, 'la garde doit être évaluée avant la requête');
});

test('sécu : les erreurs techniques Postgres ne sont jamais affichées brutes', () => {
  // Règle : `error.message` n'est affichable QUE pour P0001 (nos `raise
  // exception` métier, rédigés en français). Tout autre code passe par
  // messageUtilisateur() qui renvoie un message générique.
  const fichiers = fichiersSuivis('src/lib', ['.ts']).filter(
    (f) => f.includes('actions-') || f.includes('erreurs-db'),
  );
  assert.ok(fichiers.length > 5);
  for (const f of fichiers) {
    if (f.includes('erreurs-db')) continue;
    const src = read(f);
    // Occurrences de error.message : chacune doit être gardée par un test de code P0001.
    const lignes = src.split('\n');
    lignes.forEach((ligne, i) => {
      if (!/error\.message/.test(ligne)) return;
      if (/^\s*(\*|\/\/)/.test(ligne)) return; // commentaire
      const contexte = lignes.slice(Math.max(0, i - 3), i + 1).join('\n');
      assert.ok(
        /P0001/.test(contexte) || /messageUtilisateur/.test(ligne),
        `${f}:${i + 1} affiche error.message sans garde P0001 ni messageUtilisateur`,
      );
    });
  }
});

test('sécu : un seul traducteur d’erreurs, utilisé partout', () => {
  const fichiers = fichiersSuivis('src/lib', ['.ts']).filter((f) => f.includes('actions-'));
  const utilisateurs = fichiers.filter((f) => read(f).includes('messageUtilisateur'));
  assert.ok(utilisateurs.length >= 8, `seulement ${utilisateurs.length} actions utilisent le traducteur`);
  const erreursDb = read('src/lib/erreurs-db.ts');
  assert.ok(/CODE_METIER\s*=\s*"P0001"/.test(erreursDb));
});

// --- US-15.2 : la restauration est un point d'écriture massive -------------
test('sécu : la restauration passe par la RPC, jamais par des INSERT directs', () => {
  const src = read('src/lib/actions-restauration.ts');
  // Un INSERT direct échouerait sur les 11 tables sans policy INSERT.
  assert.ok(/rpc\(\s*["']restaurer_sauvegarde["']/.test(src), 'la restauration doit appeler la RPC dédiée');
  assert.equal(/\.from\([^)]*\)\s*\.insert\(/.test(src), false, 'aucun INSERT direct depuis le client');
  assert.ok(/proprietaire/.test(src), 'la garde de rôle doit être côté serveur aussi');
  assert.ok(/confirmation/.test(src) && /RESTAURER/.test(src), 'confirmation explicite obligatoire');
});

test('sécu : la migration de restauration garde son rôle et ses révocations', () => {
  const sql = read('supabase/18-restauration-sauvegarde.sql');
  assert.ok(/security\s+definer/i.test(sql));
  assert.ok(/set\s+search_path\s*=\s*''/i.test(sql), 'search_path vide : pas de détournement de schéma');
  assert.ok(/role\s+is\s+distinct\s+from\s+'proprietaire'/i.test(sql), 'garde de rôle obligatoire');
  assert.ok(/appartient a un autre etablissement/i.test(sql), 'refus multi-tenant');
  assert.ok(/Ligne etrangere/i.test(sql), 'refus des lignes d’un autre client');
  assert.ok(/revoke all on function[\s\S]*?from public,\s*anon/i.test(sql), 'aucun droit PUBLIC résiduel');
  // La fonction doit couvrir les tables sans policy INSERT.
  for (const t of ['ventes', 'clotures', 'recette_versions', 'ordres_fabrication']) {
    assert.ok(new RegExp(`public\\.${t}\\b`).test(sql), `${t} doit être couverte par la restauration`);
  }
});

test('sécu : une sauvegarde ne contient aucun secret', () => {
  const dump = read('src/lib/sauvegarde.ts');
  assert.equal(/service_role|SERVICE_ROLE|SERVICE_KEY/i.test(dump), false);
  // Le dump exporte les tables métier, pas les comptes Auth.
  assert.ok(/utilisateurs/.test(dump), 'l’exclusion des utilisateurs doit être documentée');
  const route = read('src/app/api/sauvegarde/route.ts');
  assert.ok(/proprietaire/.test(route), 'export complet réservé au propriétaire');
  assert.ok(/no-store/.test(route));
});

test('sécu : aucune route ne filtre `clients` sur client_id (colonne inexistante)', () => {
  // Bug livré : /api/sauvegarde filtrait clients sur client_id -> 500 permanent.
  // `clients` s'isole par `id`. On refuse la récidive dans tout le code.
  const fichiers = [
    ...fichiersSuivis('src/app/api', ['.ts']),
    ...fichiersSuivis('src/lib', ['.ts']),
  ];
  assert.ok(fichiers.length > 10);
  for (const f of fichiers) {
    const src = read(f);
    // Toute occurrence de from("clients") suivie d'un eq("client_id"…) est fautive.
    const fautif = /from\(\s*["']clients["']\s*\)[\s\S]{0,160}?\.eq\(\s*["']client_id["']/.test(src);
    assert.equal(fautif, false, `${f} filtre clients sur client_id (la colonne est id)`);
  }
});

test('sécu : la sauvegarde isole chaque table par sa vraie colonne tenant', () => {
  const route = read('src/app/api/sauvegarde/route.ts');
  assert.ok(/colonneTenant\(/.test(route), 'la route doit utiliser colonneTenant(), pas client_id en dur');
  assert.equal(/\.eq\(\s*["']client_id["']/.test(route), false, 'plus de client_id en dur dans la sauvegarde');
});
