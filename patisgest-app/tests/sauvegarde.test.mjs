import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FORMAT_SAUVEGARDE, VERSION_FORMAT, ORDRE_RESTAURATION, TABLES_EXCLUES,
  empreinte, canonique, construireSauvegarde, validerSauvegarde,
  resumeSauvegarde, totalLignes, nomFichierSauvegarde,
  colonneTenant, TABLE_RACINE, estTableRacine, lireFichierSauvegarde, MAX_OCTETS_SAUVEGARDE,
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

test('RÉGRESSION : une sauvegarde complète, reçue en multipart, peut être analysée et renvoyée', async () => {
  // Fixture synthétique de la taille du cas pilote (22 tables / 58 lignes).
  const clientId = 'test-atelier';
  const comptes = { clients: 1, sites: 2, fournisseurs: 3, articles: 16, lots: 12,
    recette_familles: 2, recette_versions: 2, mouvements: 12, ordres_fabrication: 2, ventes: 6 };
  const donnees = ORDRE_RESTAURATION.map((table) => ({
    table,
    lignes: Array.from({ length: comptes[table] ?? 0 }, (_, i) => ({
      id: `${table}-${i}`, nom: `Élément fictif ${i}`, client_id: clientId,
      ...(table === 'mouvements' ? { commentaire: 'Mouvement fictif. '.repeat(149) } : {}),
    })),
  }));
  const originale = construireSauvegarde(clientId, 'Pâtisserie de test', donnees);
  const fichier = new File([JSON.stringify(originale, null, 2)], 'sauvegarde-test.json', { type: 'application/json' });
  async function envoyer(confirmation) {
    const form = new FormData();
    form.set('fichier', fichier);
    if (confirmation) form.set('confirmation', confirmation);
    const requete = new Request('http://patisgest.test/parametres', { method: 'POST', body: form });
    const recu = await requete.formData();
    return lireFichierSauvegarde(recu.get('fichier'), clientId);
  }
  const analyse = await envoyer();
  assert.ok(analyse.dump, analyse.erreur);
  assert.equal(analyse.dump.tables.length, 23);
  assert.equal(totalLignes(analyse.dump), 58);
  const resume = Object.fromEntries(resumeSauvegarde(analyse.dump).map((a) => [a.table, a.lignes]));
  assert.equal(resume.articles, 16);
  assert.equal(resume.lots, 12);
  assert.deepEqual(await envoyer('RESTAURER'), analyse);
});

test('RÉGRESSION : un fichier absent, illisible ou trop gros donne une erreur explicite', async () => {
  assert.match((await lireFichierSauvegarde(null, 'c1')).erreur, /Choisissez un fichier/);
  assert.match((await lireFichierSauvegarde(new File(['{'], 'tronque.json'), 'c1')).erreur, /Fichier illisible/);
  const volumineux = new File([new Uint8Array(MAX_OCTETS_SAUVEGARDE + 1)], 'lourd.json');
  assert.match((await lireFichierSauvegarde(volumineux, 'c1')).erreur, /trop volumineux/);
});

test('RÉGRESSION : l’upload refuse une empreinte modifiée ou un autre établissement', async () => {
  const fichier = (dump) => new File([JSON.stringify(dump)], 'test.json');
  const dump = construireSauvegarde('c1', 'X', tables);
  assert.match((await lireFichierSauvegarde(fichier(dump), 'c2')).erreur, /autre établissement/);
  assert.match((await lireFichierSauvegarde(fichier({ ...dump, empreinte: 'invalide' }), 'c1')).erreur, /Empreinte invalide/);
});

// Optionnel : valider le fichier pilote original sans ajouter de données métier à Git.
if (process.env.PATISGEST_TEST_SAUVEGARDE) {
  test('RÉGRESSION : la sauvegarde pilote du 17/11/2026 est valide (fichier local)', async () => {
    const json = readFileSync(process.env.PATISGEST_TEST_SAUVEGARDE);
    const { client_id } = JSON.parse(json);
    const lecture = await lireFichierSauvegarde(new File([json], 'pilote.json'), client_id);
    assert.ok(lecture.dump, lecture.erreur);
    assert.equal(lecture.dump.tables.length, 22);
    assert.equal(totalLignes(lecture.dump), 58);
    assert.equal(lecture.dump.empreinte, 'bf2e4173');
  });
}

// --- Régressions trouvées en revue de mon propre travail --------------------

test('RÉGRESSION : `clients` n’a pas de client_id — sa colonne d’isolation est id', () => {
  // Bug livré : la route de sauvegarde filtrait clients sur client_id.
  // PostgREST renvoie alors 400 « column clients.client_id does not exist »,
  // donc la sauvegarde ENTIÈRE échouait en 500 à chaque appel.
  assert.equal(colonneTenant('clients'), 'id');
  assert.equal(colonneTenant('sites'), 'client_id');
  assert.equal(colonneTenant('articles'), 'client_id');
  assert.equal(colonneTenant('ventes'), 'client_id');
  // Toute table de l'ordre de restauration sauf clients s'isole par client_id.
  for (const t of ORDRE_RESTAURATION) {
    const attendu = t === 'clients' ? 'id' : 'client_id';
    assert.equal(colonneTenant(t), attendu, `${t} mal isolée`);
  }
});

test('RÉGRESSION : z_imports porte une FK vers ventes et doit la suivre', () => {
  // Bug livré : z_imports était restauré AVANT ventes.
  // Sur une base où les deux tables ont des lignes, la clé étrangère
  // z_imports.vente_id -> ventes.id faisait échouer la restauration.
  const iVentes = ORDRE_RESTAURATION.indexOf('ventes');
  const iZ = ORDRE_RESTAURATION.indexOf('z_imports');
  assert.ok(iVentes >= 0 && iZ >= 0);
  assert.ok(iVentes < iZ, 'z_imports doit venir APRÈS ventes');
});

test('RÉGRESSION : clients est la racine — on la vérifie, on ne l’insère pas', () => {
  // 21 clés étrangères pointent vers clients.id : sur une base vierge, la
  // ligne client doit préexister, sinon tout échoue par violation de FK.
  assert.equal(TABLE_RACINE, 'clients');
  assert.equal(estTableRacine('clients'), true);
  assert.equal(estTableRacine('sites'), false);
  // La racine reste exportée (elle porte l'identité légale)…
  assert.equal(ORDRE_RESTAURATION.includes('clients'), true);
});

test('RÉGRESSION : l’ordre de restauration respecte toutes les FK du schéma', () => {
  // Relevé de pg_constraint sur la base (42 FK). Les paires parent→enfant
  // ci-dessous sont celles qui peuvent coexister dans un dump.
  const fk = [
    ['clients', 'sites'], ['clients', 'articles'], ['clients', 'ventes'],
    ['clients', 'lots'], ['clients', 'cakes'], ['clients', 'clotures'],
    ['clients', 'z_imports'], ['clients', 'fournisseurs'],
    ['sites', 'lots'], ['sites', 'ventes'], ['sites', 'clotures'],
    ['sites', 'ordres_fabrication'], ['sites', 'z_imports'],
    ['sites', 'transferts'], ['sites', 'mouvements'],
    ['fournisseurs', 'lots'], ['fournisseurs', 'bons_commande'],
    ['fournisseurs', 'historique_prix'],
    ['articles', 'lots'], ['articles', 'mouvements'],
    ['articles', 'historique_prix'], ['articles', 'recette_familles'],
    ['lots', 'mouvements'],
    ['recette_familles', 'recette_versions'], ['recette_familles', 'ordres_fabrication'],
    ['recette_versions', 'ordres_fabrication'],
    ['ventes', 'z_imports'],
  ];
  for (const [parent, enfant] of fk) {
    const ip = ORDRE_RESTAURATION.indexOf(parent);
    const ie = ORDRE_RESTAURATION.indexOf(enfant);
    assert.ok(ip >= 0, `${parent} absent de l'ordre`);
    assert.ok(ie >= 0, `${enfant} absent de l'ordre`);
    assert.ok(ip < ie, `${parent} doit précéder ${enfant} (FK)`);
  }
});
