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

test('sécu : les URL de coût sont protégées avant tout rendu ou lecture métier', () => {
  const page = read('src/app/(app)/[module]/page.tsx');
  const rendu = page.slice(page.indexOf('export default async function ModulePage'));
  assert.match(page, /const modulesCout\s*=\s*new Set<Module>\(\[\s*'recettes',\s*'simulation'\s*\]\)/);
  const role = rendu.search(/const coutsAutorises\s*=\s*canReadCosts\(ctx\.role\)/);
  const garde = rendu.search(/if\s*\(modulesCout\.has\(key\)\s*&&\s*!coutsAutorises[^\n]+redirect\('\/tableau-de-bord'\)/);
  assert.match(rendu, /ctx\.role === 'labo' && key === 'recettes'/);
  assert.match(rendu, /<LabWorkspace module=\{key\} ctx=\{ctx\}/);
  assert.ok(role >= 0 && role < garde, 'la redirection doit dépendre du rôle de session');
  for (const premier of ['<DemoModule', 'await createClient()', 'supabase.from(']) {
    assert.ok(garde < rendu.indexOf(premier), `garde absente ou après ${premier}`);
  }
});

test('sécu : les listes excluent les tables de coût pour le vendeur et projettent seulement les métadonnées', () => {
  const page = read('src/app/(app)/[module]/page.tsx');
  const projections = page.match(/const tablesCout\s*=\s*\{([^}]+)\}/)?.[1];
  assert.ok(projections, 'liste blanche de colonnes absente');
  const colonnes = Object.fromEntries([...projections.matchAll(/(\w+):\s*'([^']*)'/g)]
    .map((m) => [m[1], m[2].split(',').map((c) => c.trim())]));
  assert.deepEqual(colonnes.recette_familles, ['id', 'code', 'nom', 'produit_id']);
  assert.deepEqual(colonnes.recette_versions, ['id', 'famille_id', 'version', 'active', 'rendement_qte', 'rendement_unite']);
  assert.deepEqual(colonnes.parametres_couts, ['id']);
  assert.match(page, /Object\.hasOwn\(tablesCout,\s*table\)/);
  assert.match(page, /const tables\s*=\s*info\.tables\.filter\(\(\[table\]\)\s*=>\s*coutsAutorises\s*\|\|\s*!estTableCout\(table\)\)/);
  assert.match(page, /Promise\.all\(tables\.map\(/);
  assert.match(page, /const colonnes\s*=\s*estTableCout\(table\)\s*\?\s*tablesCout\[table\]\s*:\s*'\*'/);
  assert.match(page, /ctx\.role==='vendeur'.*table==='lots' \? 'vendeur_lots'.*table==='ordres_fabrication' \? 'vendeur_ordres_fabrication'/);
  assert.match(page, /supabase\.from\(source\)\.select\(colonnes\)/);
  assert.doesNotMatch(page, /supabase\.from\(source\)\s*\.select\(\s*(?:['"]\*['"])?\s*\)/);
});

test('sécu : les lectures spécifiques de recettes sont aussi gardées et sans joker', () => {
  const page = read('src/app/(app)/[module]/page.tsx');
  const branches = [...page.matchAll(/\bif\s*\(key==='([^']+)'([^\n]*)/g)];
  const lectures = [...page.matchAll(/\.from\(\s*['"](recette_familles|recette_versions|parametres_couts)['"]\s*\)/g)];
  for (const lecture of lectures) {
    const avant = page.slice(0, lecture.index);
    const branche = branches.findLast(({ index }) => index < lecture.index);
    assert.ok(
      /coutsAutorises\s*\?\s*supabase$/.test(avant) || /&&\s*coutsAutorises\b/.test(branche?.[2] ?? ''),
      `lecture de ${lecture[1]} sans garde dans ${branche?.[1] ?? 'ModulePage'}`,
    );
    const select = page.slice(lecture.index + lecture[0].length).match(/^\s*\.select\(\s*(['"])([^'"]+)\1/);
    assert.ok(select && !select[2].includes('*'), `liste de colonnes attendue pour ${lecture[1]}`);
    assert.doesNotMatch(select[2], /\b(mo_min|energie|emballage|frais_generaux|cuisson_perte_pct)\b/);
  }
});

test('sécu : le mode guidé ne lit les recettes que pour un rôle autorisé', () => {
  const page = read('src/app/(app)/[module]/page.tsx');
  assert.match(page, /const cleGuide\s*=\s*coutsAutorises && canWrite\(ctx\.role\) \? etapePourModule/);
  const dashboard = read('src/app/(app)/tableau-de-bord/page.tsx');
  assert.match(dashboard, /const coutsAutorises\s*=\s*canReadCosts\(ctx\.role\)/);
  assert.match(dashboard, /const afficheOnboarding\s*=\s*ctx.mode === 'supabase' && coutsAutorises && canWrite\(ctx\.role\)/);
  assert.match(dashboard, /afficheOnboarding \? compterGuide\(ctx, db\) : null/);
  for (const f of ['src/components/module-guide.tsx', 'src/lib/onboarding-server.ts']) {
    const source = read(f);
    const garde = source.search(/if\s*\(ctx.mode !== "supabase" \|\| !canReadCosts\(ctx\.role\) \|\| !canWrite\(ctx\.role\)\) return null/);
    const lecture = source.search(/\.from\("recette_(?:familles|versions)"\)/);
    assert.ok(garde >= 0 && lecture > garde, `${f} lit les recettes sans contrôle préalable`);
    assert.doesNotMatch(source, /\.select\(\s*["']\*["']/);
  }
});

test('sécu : la création d’un fournisseur est bornée au tenant et au rôle', () => {
  const action = read('src/lib/actions-achats.ts');
  assert.match(action, /if\s*\(!ctx \|\| ctx.mode !== "supabase"\)/);
  const role = action.indexOf('if (!canWrite(ctx.role))');
  const insert = action.indexOf('.from("fournisseurs").insert({ client_id: ctx.clientId, nom })');
  assert.ok(role >= 0 && insert > role);
  const sql = read('supabase/20-creation-fournisseur.sql');
  assert.match(sql, /for insert to authenticated with check\s*\(\s*client_id = public\.patisgest_mon_client\(\)\s+and public\.patisgest_mon_role\(\) in \('proprietaire', 'labo'\)/i);
  assert.match(sql, /revoke insert on public\.fournisseurs from public, anon, authenticated/i);
  assert.match(sql, /grant insert \(client_id, nom\) on public\.fournisseurs to authenticated/i);
  assert.doesNotMatch(sql, /for (?:all|update|delete)/i);
});

test('sécu : la RLS des familles de recette remplace la lecture par tenant seul', () => {
  const sql = read('supabase/19-confidentialite-familles-recettes.sql');
  assert.match(sql, /drop policy if exists recette_familles_tenant_read on public\.recette_familles/i);
  assert.match(sql, /create policy recette_familles_cost_read on public\.recette_familles\s+for select to authenticated using\s*\(\s*client_id\s*=\s*public\.patisgest_mon_client\(\)\s+and public\.patisgest_mon_role\(\) in \('proprietaire', 'labo'\)/i);
});

test('sécu : les actions de coût vérifient le rôle', () => {
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

// --- Revue sécurité 25 points (REVUE-SECURITE-25.md) -----------------------
test('sécu : toute migration révoque PUBLIC avant de donner un droit', () => {
  // Un `grant execute` sans `revoke` préalable laisse le droit PUBLIC hérité
  // (=X) : anon peut alors appeler une fonction SECURITY DEFINER. C'est
  // exactement le trou corrigé en migration 17 pour rls_auto_enable().
  const migrations = fichiersSuivis('supabase', ['.sql']);
  assert.ok(migrations.length >= 18, `seulement ${migrations.length} migrations`);
  for (const f of migrations) {
    const src = read(f);
    const grants = src.match(/grant\s+execute\s+on\s+function[^;]*;/gi) ?? [];
    for (const g of grants) {
      assert.ok(
        /revoke\s+(all|execute)\s+on\s+function/i.test(src),
        `${f} donne un droit d'exécution sans révoquer PUBLIC d'abord`,
      );
      assert.equal(/to\s+(public|anon)\b/i.test(g), false, `${f} : ${g.slice(0, 60)}… donne le droit à anon/PUBLIC`);
    }
  }
});

test('sécu : la restauration est SECURITY DEFINER mais gardée', () => {
  const sql = read('supabase/18-restauration-sauvegarde.sql');
  // SECURITY DEFINER contourne la RLS : la garde doit être dans le corps.
  assert.ok(/security\s+definer/i.test(sql));
  assert.ok(/select u\.client_id, u\.role[\s\S]{0,200}where u\.auth_user_id = v_auth/i.test(sql),
    'la fonction doit résoudre le rôle depuis auth.uid()');
  assert.ok(/set\s+search_path\s*=\s*''/i.test(sql), 'search_path vide contre le détournement de schéma');
});

test('sécu : inventaire et production projettent les quantités sans coûts ni snapshots pour le vendeur', () => {
  const queries = read('src/lib/workspace-read.ts');
  assert.match(queries, /role === "vendeur" \? "vendeur_lots" : "lots"/);
  const lots = queries.match(/\.from\(source\)\.select\("([^"]+)"\)/)?.[1];
  assert.ok(lots?.includes('qte_rest'));
  assert.doesNotMatch(lots, /\bpu\b|\*/);
  assert.match(queries, /titre:snapshot->>recette/);
  assert.doesNotMatch(queries, /cout_reel|besoins|consommations/);
  const prod = read('src/components/production-workspace.tsx');
  assert.match(prod, /const canEdit = canWrite\(ctx\.role\)/);
  assert.match(prod, /canEdit && !labo \? db\.from\("recette_versions"\)/);
  assert.match(prod, /db\.from\("labo_recette_versions"\)/);
  const stocks = read('src/components/stock-workspace.tsx');
  assert.match(stocks, /peutEcrire && canReadCosts\(ctx\.role\)\s*\? db\.from\("recette_familles"\)/);
});

test('sécu : migration 21 protège historique_prix et bons_commande du vendeur et garde lireDemainAuLabo', () => {
  const m21 = read('supabase/21-prix-demain-panier.sql');
  assert.match(m21, /create policy historique_prix_cout_read on public\.historique_prix[\s\S]{0,200}\('proprietaire',\s*'labo'\)/i);
  assert.match(m21, /create policy bons_commande_cout_read on public\.bons_commande[\s\S]{0,200}\('proprietaire',\s*'labo'\)/i);
  assert.match(m21, /alter table public\.demandes_reassort enable row level security/i);
  assert.match(m21, /create or replace function public\.vendre_panier/i);
  assert.match(m21, /p_ticket/i);

  // lireDemainAuLabo retourne avant toute lecture de recettes/OF si !canReadCosts(role)
  const tomorrow = read('src/lib/tomorrow-lab-server.ts');
  const guardIdx = tomorrow.indexOf('if (!canReadCosts(role))');
  const recipeIdx = tomorrow.indexOf('.from("recette_versions")');
  assert.ok(guardIdx > 0 && recipeIdx > guardIdx, 'la garde canReadCosts doit précéder toute lecture de recettes');
});
