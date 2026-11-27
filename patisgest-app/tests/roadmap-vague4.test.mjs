import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  LOCALE_COOKIE,
  NAV_LABELS_AR,
  UI_DICT,
  readLocale,
} from '../src/lib/i18n.ts';
import {
  PACK_PATISSERIE_DZ,
  filterPackByActivityAndVat,
} from '../src/lib/pack-patisserie-dz.ts';
import {
  matchCatalogArticle,
  parseSupplierInvoiceText,
} from '../src/lib/invoice-photo-parser.ts';
import { chaineDeploiement } from './migrations-historique.mjs';

/*
 * VAGUE 4 — preuves pures et contrats de câblage.
 * Les tests DB PGlite sont dans `roadmap-vague4-db.test.mjs` ; les parcours
 * SSR/HTTP et navigateur 360 px ont leurs scripts dédiés. Aucun faux client
 * Supabase ni `test.skip` ici.
 */

const lire = (chemin) => readFile(new URL(chemin, import.meta.url), 'utf8');
const ARABE = /[\u0600-\u06FF]/u;

test('B.2 : le cookie FR/AR est strict et le dictionnaire reste symétrique', () => {
  assert.equal(LOCALE_COOKIE, 'patisgest.lang');
  assert.equal(readLocale('ar'), 'ar');
  assert.equal(readLocale('fr'), 'fr');
  assert.equal(readLocale('es'), 'fr');
  assert.equal(readLocale(null), 'fr');
  assert.equal(UI_DICT.fr.dir, 'ltr');
  assert.equal(UI_DICT.ar.dir, 'rtl');
  assert.deepEqual(Object.keys(UI_DICT.fr).sort(), Object.keys(UI_DICT.ar).sort());
  for (const cle of ['kitchenTitle', 'posPay', 'ticketTitle', 'ticketTotal', 'dashOwnerKicker', 'invoiceCheck', 'invoiceValidate']) {
    assert.ok(UI_DICT.fr[cle], `clé FR absente : ${cle}`);
    assert.ok(UI_DICT.ar[cle], `clé AR absente : ${cle}`);
    assert.notEqual(UI_DICT.ar[cle], UI_DICT.fr[cle], `traduction manquante : ${cle}`);
  }
  for (const [href, label] of Object.entries(NAV_LABELS_AR)) {
    assert.match(href, /^\//, `route de navigation invalide : ${href}`);
    assert.match(label, ARABE, `libellé non arabe : ${href}`);
  }
});

test('B.2 : layout, profil, bascule, caisse, ticket et dashboard sont réellement câblés', async () => {
  const layout = await lire('../src/app/layout.tsx');
  assert.match(layout, /lireLangueProfil\(\)/);
  assert.match(layout, /profilLocale \?\? cookieLocale/);
  assert.match(layout, /dir=\{locale === "ar" \? "rtl" : "ltr"\}/);

  const provider = await lire('../src/components/locale-provider.tsx');
  assert.match(provider, /document\.documentElement\.dir/);
  assert.match(provider, /enregistrerLangueUtilisateur/);
  assert.match(provider, /LOCALE_COOKIE/);
  assert.match(provider, /router\.refresh\(\)/);

  const action = await lire('../src/lib/actions-locale.ts');
  assert.match(action, /requireAnyRoleContexte/);
  assert.match(action, /enregistrer_langue_utilisateur/);
  assert.match(action, /ctx\.mode !== "supabase"/);
  assert.match(action, /catch \{/, 'une base non migrée ne doit pas casser le rendu');

  const profil = await lire('../src/lib/locale-profil.ts');
  assert.match(profil, /getSessionContext\(\{ allowLocked: true \}\)/);
  assert.match(profil, /\.from\("utilisateurs"\)/);
  assert.match(profil, /\.eq\("auth_user_id", ctx\.authUserId\)/);
  assert.match(profil, /\.eq\("client_id", ctx\.clientId\)/);

  const ticket = await lire('../src/components/sale-ticket.tsx');
  assert.match(ticket, /useLocale/);
  assert.match(ticket, /t\.ticketTitle/);
  assert.match(ticket, /t\.ticketTotal/);
  assert.match(ticket, /t\.ticketDemo/);

  const dashboard = await lire('../src/components/pilot-dashboard.tsx');
  assert.match(dashboard, /<Tr fr="Ventes du jour" ar=/);
  assert.match(dashboard, /<Tr fr="Alertes stock" ar=/);
  for (const fichier of ['../src/components/kitchen-lab-screen.tsx', '../src/components/sale-composer.tsx', '../src/components/workspace-nav.tsx']) {
    assert.match(await lire(fichier), /useLocale/);
  }
});

test('B.4 : le parseur pré-remplit des lignes sans jamais les enregistrer tout seul', () => {
  const catalogue = [
    { id: 'farine', nom: 'Farine pâtissière / boulangère', unite: 'kg' },
    { id: 'beurre', nom: 'Beurre de tourage / pâtissier', unite: 'kg' },
    { id: 'amandes', nom: 'Amandes blanchies', unite: 'kg' },
  ];
  const lignes = parseSupplierInvoiceText(
    'Farine 25 95\nBeurre de tourage : 10 x 950\nAmandes 5kg 1900 DA',
    catalogue,
  );
  assert.equal(lignes.length, 3);
  assert.deepEqual(lignes.map((l) => l.articleId), ['farine', 'beurre', 'amandes']);
  assert.deepEqual(lignes.map((l) => l.qte), [25, 10, 5]);
  assert.deepEqual(lignes.map((l) => l.puDa), [95, 950, 1900]);
  assert.equal(lignes.every((l) => l.matched), true);
  assert.equal(matchCatalogArticle('Amandes', catalogue)?.id, 'amandes');
  assert.equal(matchCatalogArticle('Ingrédient inconnu', catalogue), null);

  const inconnu = parseSupplierInvoiceText('Ingrédient inconnu 2 300', catalogue);
  assert.equal(inconnu[0].matched, false);
  assert.equal(inconnu[0].articleId, 'farine', 'ligne laissée à corriger par un humain');
});

test('B.4 : photo, validation humaine et entrée en stock explicite sont dans le composant', async () => {
  const composant = await lire('../src/components/invoice-photo-intake.tsx');
  for (const motif of [
    'accept="image/*"',
    'capture="environment"',
    'compressImageFileToDataUrl',
    'photoPreview',
    '<Image',
    'parseSupplierInvoiceText',
    't.invoiceCheck',
    'lines.length > 0',
    'validateAllIntoStock',
    'receiveLot',
    'onDemoReceiveLines',
  ]) {
    assert.ok(composant.includes(motif), `contrat B.4 absent : ${motif}`);
  }
  const sql = await lire('../supabase/49-wave3-wave4.sql');
  assert.match(sql, /facture_photo_url/);
  assert.match(sql, /sauver_photo_article/);
});

test('Migration D : pack DZ, filtres TVA et RPC SQL 57 sont cohérents', async () => {
  assert.equal(PACK_PATISSERIE_DZ.length, 24);
  assert.equal(new Set(PACK_PATISSERIE_DZ.map((x) => x.code)).size, 24);
  assert.equal(filterPackByActivityAndVat('mixte', 'ifu_0').length, 24);
  assert.equal(filterPackByActivityAndVat('boulangerie', 'ifu_0').length, 13);
  assert.equal(filterPackByActivityAndVat('patisserie', 'ifu_0').length, 15);
  assert.equal(filterPackByActivityAndVat('cake_shop', 'ifu_0').length, 10);
  assert.equal(filterPackByActivityAndVat('mixte', 'ifu_0').every((x) => x.tva === 0), true);
  const reel = filterPackByActivityAndVat('mixte', 'reel_dz');
  assert.equal(reel.find((x) => x.code === 'PF-PCM')?.tva, 9);
  assert.equal(reel.find((x) => x.code === 'PF-PCM')?.pvHt, 45.87);
  assert.equal(reel.find((x) => x.code === 'PF-BAG')?.tva, 0);
  assert.equal(reel.find((x) => x.code === 'PF-BAG')?.pvHt, 15);

  const sql = await lire('../supabase/57-onboarding-pack-dz-rpc.sql');
  assert.match(sql, /create or replace function public\.importer_pack_patisserie_dz/);
  assert.match(sql, /security definer/);
  assert.match(sql, /Reserve au proprietaire/);
  assert.match(sql, /on conflict \(client_id, code\) do nothing/);
  assert.match(sql, /values \(1, 57\)/);
  for (const item of PACK_PATISSERIE_DZ) {
    assert.ok(sql.includes(`'${item.code}'`), `code absent de la RPC SQL : ${item.code}`);
  }
  const manifeste = JSON.parse(await lire('../migrations/repetition.json'));
  const entree = manifeste.main_hors_serie.find((x) => x.file === '57-onboarding-pack-dz-rpc.sql');
  assert.ok(entree, 'migration 57 absente du manifeste');
  assert.equal(
    entree.sha256,
    createHash('sha256').update(await readFile(new URL('../supabase/57-onboarding-pack-dz-rpc.sql', import.meta.url))).digest('hex'),
  );
  assert.equal(chaineDeploiement().length, 56);
  assert.equal(chaineDeploiement().at(-1), '57-onboarding-pack-dz-rpc.sql');
});
