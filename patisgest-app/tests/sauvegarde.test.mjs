import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMAT_SAUVEGARDE, VERSION_FORMAT, ORDRE_RESTAURATION, TABLES_EXCLUES,
  empreinte, canonique, construireSauvegarde, validerSauvegarde,
  resumeSauvegarde, totalLignes, nomFichierSauvegarde,
} from '../src/lib/sauvegarde.ts';

/**
 * US-15.2 / CA-15 — volet automatisable : « sauvegarde → restauration sur base
 * vide = données identiques ». On vérifie ici le contrat du fichier (format,
 * ordre, empreinte) ; le second volet de CA-15 (onboarding < 1 h) est humain.
 */

const tables = [
  { table: 'articles', lignes: [{ code: 'MP-FAR', nom: 'Farine T55' }, { code: 'MP-SUC', nom: 'Sucre' }] },
  { table: 'clients', lignes: [{ id: 'c1', nom: 'El Yasmine' }] },
  { table: 'sites', lignes: [{ id: 's1', nom: 'Labo' }, { id: 's2', nom: 'Boutique' }] },
];

test('sauvegarde : ordre de restauration topologique (clients avant ses dépendants)', () => {
  assert.equal(ORDRE_RESTAURATION[0], 'clients');
  const iClients = ORDRE_RESTAURATION.indexOf('clients');
  for (const t of ['sites', 'articles', 'lots', 'mouvements', 'ventes']) {
    assert.ok(ORDRE_RESTAURATION.indexOf(t) > iClients, `${t} doit venir après clients`);
  }
  // recette_familles avant recette_versions, versions avant OF.
  assert.ok(ORDRE_RESTAURATION.indexOf('recette_familles') < ORDRE_RESTAURATION.indexOf('recette_versions'));
  assert.ok(ORDRE_RESTAURATION.indexOf('recette_versions') < ORDRE_RESTAURATION.indexOf('ordres_fabrication'));
  // lots avant mouvements (un mouvement référence un lot).
  assert.ok(ORDRE_RESTAURATION.indexOf('lots') < ORDRE_RESTAURATION.indexOf('mouvements'));
});

test('sauvegarde : aucune table en double dans l’ordre de restauration', () => {
  assert.equal(new Set(ORDRE_RESTAURATION).size, ORDRE_RESTAURATION.length);
});

test('sauvegarde : l’empreinte est stable et sensible à un octet près', () => {
  assert.equal(empreinte('abc'), empreinte('abc'));
  assert.notEqual(empreinte('abc'), empreinte('abd'));
  assert.match(empreinte('abc'), /^[0-9a-f]{8}$/);
});

test('sauvegarde : sérialisation canonique indépendante de l’ordre des clés', () => {
  assert.equal(canonique({ a: 1, b: 2 }), canonique({ b: 2, a: 1 }));
  assert.equal(canonique({ a: [1, 2] }), '{"a":[1,2]}');
  assert.equal(canonique(null), 'null');
});

test('sauvegarde : construction — format, version et tri des tables', () => {
  const s = construireSauvegarde('c1', 'El Yasmine', tables, new Date('2026-11-17T10:00:00Z'));
  assert.equal(s.format, FORMAT_SAUVEGARDE);
  assert.equal(s.version, VERSION_FORMAT);
  assert.equal(s.genere_le, '2026-11-17T10:00:00.000Z');
  // L'appelant a fourni articles en premier : la sortie doit suivre l'ordre de restauration.
  assert.deepEqual(s.tables.map((t) => t.table), ['clients', 'sites', 'articles']);
  assert.equal(totalLignes(s), 5);
});

test('sauvegarde : les tables exclues sont documentées dans le fichier (pas de silence)', () => {
  const s = construireSauvegarde('c1', 'X', tables);
  assert.equal(s.exclues.length, TABLES_EXCLUES.length);
  assert.ok(s.exclues.some((e) => e.table === 'utilisateurs'));
  assert.ok(s.exclues.every((e) => e.raison.length > 10), 'chaque exclusion doit être expliquée');
});

test('sauvegarde : un fichier valide passe la validation', () => {
  const s = construireSauvegarde('c1', 'X', tables);
  const v = validerSauvegarde(JSON.parse(JSON.stringify(s)));
  assert.equal(v.ok, true, JSON.stringify(v.problemes));
  assert.deepEqual(v.problemes, []);
});

test('sauvegarde : un fichier tronqué est refusé (empreinte)', () => {
  const s = construireSauvegarde('c1', 'X', tables);
  const abime = JSON.parse(JSON.stringify(s));
  abime.tables = abime.tables.map((t) =>
    t.table === 'articles' ? { ...t, lignes: t.lignes.slice(0, 1) } : t);
  const v = validerSauvegarde(abime);
  assert.equal(v.ok, false);
  assert.ok(v.problemes.some((p) => p.champ === 'empreinte'));
});

test('sauvegarde : refus d’un format étranger et d’une version future', () => {
  const s = construireSauvegarde('c1', 'X', tables);
  const autre = validerSauvegarde({ ...s, format: 'autre-app' });
  assert.equal(autre.ok, false);
  assert.ok(autre.problemes.some((p) => p.champ === 'format'));

  const futur = validerSauvegarde({ ...s, version: VERSION_FORMAT + 1 });
  assert.equal(futur.ok, false);
  assert.ok(futur.problemes.some((p) => p.champ === 'version'));
  assert.ok(/Mettez l'application à jour/.test(futur.problemes.find((p) => p.champ === 'version').message));
});

test('sauvegarde : refus d’une table inconnue (schéma différent)', () => {
  const s = construireSauvegarde('c1', 'X', tables);
  const etendu = { ...s, tables: [...s.tables, { table: 'table_du_futur', lignes: [] }] };
  const v = validerSauvegarde(etendu);
  assert.equal(v.ok, false);
  assert.ok(v.problemes.some((p) => /Table inconnue/.test(p.message)));
});

test('sauvegarde : refus d’une table en double et d’un client_id absent', () => {
  const s = construireSauvegarde('c1', 'X', tables);
  const double = { ...s, tables: [...s.tables, s.tables[0]] };
  assert.equal(validerSauvegarde(double).ok, false);
  const sansClient = { ...s, client_id: '' };
  assert.equal(validerSauvegarde(sansClient).ok, false);
});

test('sauvegarde : fichier non JSON ou vide refusé proprement', () => {
  assert.equal(validerSauvegarde(null).ok, false);
  assert.ok(/illisible/.test(validerSauvegarde(null).problemes[0].message));
  assert.equal(validerSauvegarde('texte').ok, false);
});

test('sauvegarde : le résumé annonce ce qui sera restauré, table par table', () => {
  const s = construireSauvegarde('c1', 'X', tables);
  assert.deepEqual(resumeSauvegarde(s), [
    { table: 'clients', lignes: 1 },
    { table: 'sites', lignes: 2 },
    { table: 'articles', lignes: 2 },
  ]);
});

test('sauvegarde : nom de fichier horodaté et sans accent', () => {
  const d = new Date('2026-11-17T10:30:45.123Z');
  assert.equal(
    nomFichierSauvegarde('Pâtisserie El Yasmine', d),
    'patisgest-sauvegarde-patisserie-el-yasmine-2026-11-17T10-30-45.json',
  );
  assert.equal(
    nomFichierSauvegarde('', d),
    'patisgest-sauvegarde-etablissement-2026-11-17T10-30-45.json',
  );
});

test('sauvegarde : aller-retour JSON = données identiques (CA-15, volet automatisable)', () => {
  const s = construireSauvegarde('c1', 'El Yasmine', tables);
  const relu = JSON.parse(JSON.stringify(s));
  assert.equal(validerSauvegarde(relu).ok, true);
  // Le contenu métier ressort strictement identique après transit fichier.
  assert.equal(canonique(relu.tables), canonique(s.tables));
  assert.equal(canonique(relu.tables), canonique(
    [...relu.tables].sort((a, b) => ORDRE_RESTAURATION.indexOf(a.table) - ORDRE_RESTAURATION.indexOf(b.table)),
  ));
});
