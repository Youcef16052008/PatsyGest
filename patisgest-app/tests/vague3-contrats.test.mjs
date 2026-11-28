// VAGUE 3 — contrats, validation, sérialisation, pagination et exports.
// Les preuves de routes utilisent un faux client Supabase : pas de navigateur,
// ni de PostgreSQL réel, ni de serveur Next dans ces tests ciblés.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lirePages } from '../src/lib/pagination.ts';
import { dateCommandeVitrineValide, jourLocal, plusJours } from '../src/lib/workspace-data.ts';
import { parseZCsv } from '../src/lib/z-input.ts';
import { parseClosingInput } from '../src/lib/journal-input.ts';
import { parseTransferInput } from '../src/lib/stock-input.ts';
import { cellule, CSV_BOM } from '../src/lib/csv.ts';
import { parseSupplierInvoiceText } from '../src/lib/invoice-photo-parser.ts';

const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ------------------------------------------------------------- pagination

test('H09-01 : une page courte avec des lignes cachées ne certifie jamais un export complet', async () => {
  const source = [0, 1, 2];
  const r = await lirePages(async (offset, limite) => {
    if (offset === 0) return { data: source.slice(0, 2), error: null };
    return { data: source.slice(offset, offset + limite), error: null };
  }, 10, 5);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.raison, 'lecture');
});

test('H09-01 : une page qui dépasse la taille demandée est refusée', async () => {
  const r = await lirePages(async () => ({ data: [0, 1, 2, 3, 4, 5], error: null }), 10, 5);
  assert.equal(r.ok, false);
});

test('H09-02/H09-03 : range(0,2) inclusif interprété comme 3 lignes est détecté', async () => {
  const source = [0, 1, 2, 3];
  const r = await lirePages(
    async (offset, quantite) => ({ data: source.slice(offset, offset + quantite + 1), error: null }),
    4, 2,
  );
  assert.equal(r.ok, false);
  const sonde = await lirePages(async () => ({ data: ['déjà incluse'], error: null }), 0, 1);
  assert.equal(sonde.ok, false);
  if (!sonde.ok) assert.equal(sonde.raison, 'limite');
});

test('H09-02 : une page finale exactement pleine sonde la ligne suivante', async () => {
  let sondes = 0;
  const source = [0, 1];
  const r = await lirePages(async (offset, quantite) => {
    if (offset >= 2) sondes++;
    return { data: source.slice(offset, offset + quantite), error: null };
  }, 4, 2);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.lignes, [0, 1]);
  assert.ok(sondes >= 1, 'une limite atteinte sans sonde ne prouve pas la fin');
});

// ------------------------------------------------------------- entrées

test('H09-04 : import Z serveur réutilise exactement les bornes du parseur', () => {
  assert.match(lire('src/lib/actions-caisse.ts'), /parseZCsv\(csv\)/);
  assert.throws(() => parseZCsv('A;1;1\n'.repeat(101)), /100 maximum/);
  assert.throws(() => parseZCsv('A;1;1'.padEnd(50_001, ' ')), /50 000 caractères maximum/);
});

test('H09-05 : un champ FormData supplémentaire n’entre pas dans la ligne de clôture', () => {
  const fd = new FormData();
  fd.set('date', jourLocal());
  fd.set('siteId', '22222222-2222-4222-8222-222222222201');
  fd.set('lineCount', '1');
  fd.set('line0_article', '8c7a59fd-bbf2-49bc-a264-81eb85f8a31a');
  for (const flux of ['produit', 'vendu', 'reporte', 'jete', 'casse', 'offert']) fd.set(`line0_${flux}`, '1');
  fd.set('line0_injecte', '{"admin":true}');
  const out = parseClosingInput(fd);
  assert.deepEqual(Object.keys(out.lignes[0]).sort(), [
    'articleId', 'casse', 'jete', 'offert', 'produit', 'reporte', 'vendu',
  ].sort());
  const sql = lire('supabase/21-prix-demain-panier.sql');
  assert.match(sql, /v_enriched := v_enriched \|\| jsonb_build_object\(/);
  assert.match(sql, /'articleId', v_art\.id/);
});

test('H09-09 : la date de commande suit le jour d’Alger et le calendrier réel', () => {
  const maintenant = new Date('2026-11-26T23:30:00.000Z'); // 2026-11-27 à Alger
  assert.equal(dateCommandeVitrineValide('2026-11-27', maintenant), true);
  assert.equal(dateCommandeVitrineValide('2026-11-26', maintenant), false);
  assert.equal(dateCommandeVitrineValide('2026-02-30', maintenant), false);
  assert.equal(dateCommandeVitrineValide(plusJours(jourLocal(maintenant), 365), maintenant), true);
  assert.equal(dateCommandeVitrineValide(plusJours(jourLocal(maintenant), 366), maintenant), false);
});

test('H09-07/H09-08/H09-10/H09-11 : gardes serveur et SQL déjà en place', () => {
  assert.match(lire('src/lib/actions-cakes.ts'), /Number\.isInteger\(nbParts\)/);
  assert.match(lire('supabase/46-credits-clients.sql'), /nom_debiteur text not null check \(char_length\(trim\(nom_debiteur\)\) between 1 and 140\)/);
  assert.match(lire('src/lib/erreurs-db.ts'), /opération impossible pour le moment/);
  const stock = lire('src/lib/stock-input.ts');
  assert.match(stock, /uuid\(formData\.get\("fromSiteId"\)/);
  assert.match(stock, /fromSiteId === toSiteId/);
  assert.match(lire('supabase/08-transferts.sql'), /v_from_client <> v_client/);
  const fd = new FormData();
  fd.set('articleId', '8c7a59fd-bbf2-49bc-a264-81eb85f8a31a');
  fd.set('fromSiteId', '22222222-2222-4222-8222-222222222201');
  fd.set('toSiteId', '22222222-2222-4222-8222-222222222201');
  fd.set('qte', '1');
  assert.throws(() => parseTransferInput(fd), /différents/);
});

test('H12-01/H12-12 : invisibles before formula, ISO dates et décimale FR', () => {
  for (const invisible of ['\u200B', '\u202E', '\u2066', '\u2069', '\uFEFF', '\t', '\r']) {
    const sortie = cellule(`${invisible}=1+1`);
    // CR déclenche en plus l'échappement RFC : la cellule est entre guillemets,
    // mais l'apostrophe neutralisante reste immédiatement avant l'invisible.
    assert.ok(sortie.includes(`'${invisible}=1+1`), JSON.stringify({ invisible, sortie }));
  }
  assert.equal(cellule(new Date('2026-11-17T00:00:00.000Z')), '2026-11-17T00:00:00.000Z');
  assert.equal(cellule(1234.5), '1234,5');
});

test('H12-11 : lecture paginée des avoirs et refus de dépassement dans la route', () => {
  const source = lire('src/app/api/export/comptable/route.ts');
  assert.match(source, /lirePages<\{[\s\S]*numero: string/);
  assert.match(source, /\.order\("id"\)\.range\(offset, offset \+ limite - 1\)/);
  assert.match(source, /avoirsLecture\.raison === "limite"/);
  assert.match(source, /status: 413/);
  assert.match(source, /plus de 20 000 avoirs/i);
  assert.equal(CSV_BOM, '\uFEFF');
});

test('H12-10 : identifiants de lignes de facture uniques dans la même milliseconde', () => {
  const horloge = mock.method(Date, 'now', () => 1_700_000_000_000);
  try {
    const catalogue = [
      { id: 'a1', nom: 'Farine T45', unite: 'kg' },
      { id: 'a2', nom: 'Beurre', unite: 'kg' },
    ];
    const lignes = parseSupplierInvoiceText(
      'Farine 25 kg 95 DA\nBeurre 10 x 950\nLevure 20 x 45',
      catalogue,
    );
    assert.equal(lignes.length, 3);
    assert.equal(new Set(lignes.map((l) => l.id)).size, 3);
  } finally {
    horloge.mock.restore();
  }
});
