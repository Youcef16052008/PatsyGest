// NF-06 — ticket thermique 80 mm, mentions légales algériennes (§5).
//
// L'audit est catégorique : « les impressions n'ont jamais été vues sur
// papier ». Ce test ne remplace pas une imprimante — il ne peut pas. Il vérifie
// ce qui est vérifiable dans le code, pour que le test sur papier ne puisse pas
// être gâché par une erreur évitable :
//
//   * la largeur d'impression est bien 80 mm et non « ce que donne le navigateur » ;
//   * aucune taille de police imprimée sous 10 px (une thermique 203 dpi rend
//     un 8 px en bouillie) ;
//   * toutes les mentions légales obligatoires sont présentes quand elles sont
//     renseignées, et signalées quand elles manquent — sans bloquer la vente ;
//   * l'impression n'imprime QUE le ticket, pas la page entière.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { enteteTicket, avertissementsTicket } from '../src/lib/etablissement.ts';

const ticket = await readFile(new URL('../src/components/sale-ticket.tsx', import.meta.url), 'utf8');

test('NF-06 : le ticket s’imprime sur 80 mm, pas sur la largeur de l’écran', () => {
  assert.match(ticket, /width:\s*80mm/, 'la largeur 80 mm doit être fixée à l’impression');
  assert.match(ticket, /w-\[80mm\]/, 'le rendu écran doit aussi être à l’échelle 80 mm');
  // Les marges d'impression doivent être en mm : en px, elles varient selon le
  // pilote et rognent le texte.
  assert.match(ticket, /@page\s*\{\s*margin:\s*4mm/);
});

test('NF-06 : aucune police imprimée sous 10 px', () => {
  const tailles = [...ticket.matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(tailles.length > 0, 'le ticket doit fixer ses tailles explicitement');
  const trop = tailles.filter((n) => n < 10);
  assert.deepEqual(trop, [], `tailles illisibles sur thermique : ${trop.join(', ')} px`);
});

test('NF-06 : l’impression ne sort que le ticket, pas la page', () => {
  // Sans cette règle, on imprime la navigation, les boutons et la page entière.
  assert.match(ticket, /\.no-print\s*\{\s*display:\s*none\s*!important/);
  assert.match(ticket, /@media print/);
  // Et les éléments hors ticket doivent disparaître.
  assert.match(ticket, /body:has\(\.sale-ticket\)[^{]*\{[^}]*display:\s*block/);
});

test('§5 : le ticket porte NIF, NIS et RC quand ils sont renseignés', () => {
  const entete = enteteTicket({
    nom: 'Pâtisserie ELA', adresse: '12 rue Larbi, Oran', telephone: '041 00 00 00',
    nif: '123456789012345', nis: '987654321', rc: '31/00-1234567 B 21',
  });
  const joint = entete.join(' | ');
  assert.match(joint, /NIF 123456789012345/);
  assert.match(joint, /NIS 987654321/);
  assert.match(joint, /RC 31\/00-1234567 B 21/);
  assert.match(joint, /Pâtisserie ELA/);
  assert.match(joint, /12 rue Larbi, Oran/);
});

test('§5 : une mention manquante est signalée, jamais bloquante', () => {
  const manques = avertissementsTicket({ nom: 'Pâtisserie ELA' });
  assert.ok(manques.length > 0, 'les mentions manquantes doivent être signalées');
  assert.ok(
    manques.some((m) => /NIF|NIS|RC/.test(m)),
    `avertissements attendus sur NIF/NIS/RC, reçu : ${manques.join(' / ')}`,
  );
  // Et le ticket lui-même continue d'exister : l'alerte ne remplace pas la vente.
  assert.match(ticket, /no-print mt-1 text-center/, 'l’avertissement est masqué à l’impression');
});

test('§5 : TVA affichée en HT/TVA/TTC, pas seulement le total', () => {
  assert.match(ticket, /Total HT/);
  assert.match(ticket, /TVA/);
  assert.match(ticket, /Total TTC/);
  // La TVA est calculée par différence TTC−HT : c'est ce qui a été encaissé.
  assert.match(ticket, /totalTTC - data\.totalHT/);
});

test('§5 : un ticket de démonstration porte la mention sans valeur fiscale', () => {
  assert.match(ticket, /SANS VALEUR FISCALE/);
  assert.match(ticket, /\{data\.demo &&/);
});
