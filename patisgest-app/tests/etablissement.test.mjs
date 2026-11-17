import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validerNif, validerNis, validerRc, verifierIdentite,
  enteteTicket, avertissementsTicket, LIBELLES_LEGAUX,
} from '../src/lib/etablissement.ts';

/**
 * US-15.1 / §5 mentions obligatoires : NIF, NIS, RC sur le ticket.
 * Avant ce module, le ticket n'affichait que « PâtisGest — Caisse ».
 */

const complet = {
  nom: 'Pâtisserie El Yasmine',
  adresse: 'Rue Emir Abdelkader, Oran',
  telephone: '0550 12 34 56',
  nif: '123456789012345',
  nis: '987654321098765',
  rc: '31/00-123456B26',
};

test('identité : NIF valide à 15 chiffres (espaces tolérés)', () => {
  assert.equal(validerNif('123456789012345').ok, true);
  assert.equal(validerNif('123 456 789 012 345').ok, true);
  assert.equal(validerNif('123-456-789-012-345').ok, true);
});

test('identité : NIF refusé si trop court, non numérique ou vide', () => {
  const court = validerNif('12345');
  assert.equal(court.ok, false);
  assert.ok(/15 chiffres/.test(court.erreur));
  assert.equal(validerNif('12345678901234A').ok, false);
  assert.ok(/chiffres/.test(validerNif('12345678901234A').erreur));
  assert.equal(validerNif('').ok, false);
  assert.equal(validerNif(null).ok, false);
});

test('identité : NIS suit la même règle que le NIF mais nomme le bon champ', () => {
  assert.equal(validerNis('987654321098765').ok, true);
  const e = validerNis('123');
  assert.equal(e.ok, false);
  assert.ok(/NIS/.test(e.erreur), 'le message doit parler du NIS, pas du NIF');
  assert.equal(/NIF/.test(e.erreur), false);
});

test('identité : RC accepté au format algérien wilaya/registre', () => {
  assert.equal(validerRc('31/00-123456B26').ok, true);
  assert.equal(validerRc('16/00-987654').ok, true);
});

test('identité : RC refusé sans numéro, sans séparateur ou hors bornes', () => {
  assert.equal(validerRc('').ok, false);
  assert.equal(validerRc('ABC/DEF').ok, false, 'un RC doit contenir un numéro');
  const sansSep = validerRc('123456789');
  assert.equal(sansSep.ok, false);
  assert.ok(/wilaya\/registre/.test(sansSep.erreur));
  assert.equal(validerRc('12/3').ok, false, 'trop court');
});

test('identité : verifierIdentite — complet quand les 3 sont bons', () => {
  const v = verifierIdentite(complet);
  assert.equal(v.complet, true);
  assert.deepEqual(v.manquants, []);
  assert.deepEqual(v.erreurs, {});
});

test('identité : verifierIdentite liste les manquants dans l’ordre légal', () => {
  const v = verifierIdentite({ nom: 'X', adresse: 'Y', nif: null, nis: '', rc: undefined });
  assert.equal(v.complet, false);
  assert.deepEqual(v.manquants, ['nif', 'nis', 'rc']);
});

test('identité : un identifiant présent mais mal formé est une erreur, pas un manquant', () => {
  const v = verifierIdentite({ ...complet, rc: 'SANS-SEPARATEUR' });
  assert.equal(v.complet, false);
  assert.deepEqual(v.manquants, [], 'le RC est renseigné, donc pas « manquant »');
  assert.ok(v.erreurs.rc, 'mais il doit être signalé comme invalide');
});

test('ticket : l’en-tête reprend nom, adresse, téléphone et les 3 identifiants', () => {
  const l = enteteTicket(complet);
  assert.equal(l[0], 'Pâtisserie El Yasmine');
  assert.equal(l.includes('Rue Emir Abdelkader, Oran'), true);
  assert.equal(l.some((x) => x.startsWith('Tél.')), true);
  assert.equal(l.includes('NIF 123456789012345'), true);
  assert.equal(l.includes('NIS 987654321098765'), true);
  assert.equal(l.includes('RC 31/00-123456B26'), true);
});

test('ticket : un identifiant déjà préfixé n’est pas doublé', () => {
  // Le jeu pilote stocke « NIF 123456789 » : on ne doit pas imprimer « NIF NIF … ».
  const l = enteteTicket({ nom: 'X', adresse: 'Y', nif: 'NIF 123456789', nis: null, rc: null });
  assert.equal(l.includes('NIF 123456789'), true);
  assert.equal(l.some((x) => x.includes('NIF NIF')), false);
});

test('ticket : un identifiant absent n’est jamais inventé sur le ticket', () => {
  const l = enteteTicket({ nom: 'Sans papiers', adresse: null, nif: null, nis: null, rc: null });
  assert.equal(l.length, 1);
  assert.equal(l[0], 'Sans papiers');
});

test('ticket : avertissements explicites quand l’identité est incomplète', () => {
  const a = avertissementsTicket({ nom: 'X', adresse: 'Y', nif: null, nis: null, rc: null });
  assert.equal(a.length, 3);
  assert.ok(a.some((x) => x.includes(LIBELLES_LEGAUX.nif)));
  assert.ok(a.some((x) => x.includes(LIBELLES_LEGAUX.rc)));
});

test('ticket : aucun avertissement quand tout est renseigné', () => {
  assert.deepEqual(avertissementsTicket(complet), []);
});

test('ticket : l’adresse manquante est signalée (décret 13-378)', () => {
  const a = avertissementsTicket({ ...complet, adresse: '  ' });
  assert.equal(a.length, 1);
  assert.ok(/Adresse manquante/.test(a[0]));
});

test('ticket : cas réel du pilote — identifiants préfixés et non conformes', () => {
  // Données seedées : « NIF 123456789 » (9 chiffres), « NIS 987654321 »,
  // « RC 31/00-123456B26 ». Le NIF/NIS ne font pas 15 chiffres : la validation
  // doit le dire sans bloquer l'encaissement.
  const pilote = {
    nom: 'Pâtisserie El Yasmine — Oran', adresse: 'Rue Emir Abdelkader, Oran',
    telephone: '0550 12 34 56', nif: 'NIF 123456789', nis: 'NIS 987654321',
    rc: 'RC 31/00-123456B26',
  };
  const a = avertissementsTicket(pilote);
  assert.equal(a.length, 2, 'NIF et NIS sont trop courts, le RC est valide');
  assert.ok(a.every((x) => /NIF|NIS/.test(x)));
});
