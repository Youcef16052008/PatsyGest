// NF-06 — ticket thermique 80 mm simple style Algérie (§5).
//
// Ce test vérifie ce qui est vérifiable dans le code pour l'impression 80 mm :
//   * la largeur d'impression est bien 80 mm et non « ce que donne le navigateur » ;
//   * aucune taille de police imprimée sous 10 px ;
//   * l'impression n'imprime QUE le ticket, pas la page entière ;
//   * le ticket reste simple et lisible : nom boutique, date/heure, produits & prix, total final (sans HT ni détails fiscaux complexes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { enteteTicket, avertissementsTicket } from '../src/lib/etablissement.ts';

const ticket = await readFile(new URL('../src/components/sale-ticket.tsx', import.meta.url), 'utf8');

test('NF-06 : le ticket s’imprime sur 80 mm, pas sur la largeur de l’écran', () => {
  assert.match(ticket, /width:\s*80mm/, 'la largeur 80 mm doit être fixée à l’impression');
  assert.match(ticket, /w-\[80mm\]/, 'le rendu écran doit aussi être à l’échelle 80 mm');
  assert.match(ticket, /@page\s*\{\s*margin:\s*4mm/);
});

test('NF-06 : aucune police imprimée sous 10 px', () => {
  const tailles = [...ticket.matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(tailles.length > 0, 'le ticket doit fixer ses tailles explicitement');
  const trop = tailles.filter((n) => n < 10);
  assert.deepEqual(trop, [], `tailles illisibles sur thermique : ${trop.join(', ')} px`);
});

test('NF-06 : l’impression ne sort que le ticket, pas la page', () => {
  assert.match(ticket, /\.no-print\s*\{\s*display:\s*none\s*!important/);
  assert.match(ticket, /@media print/);
  assert.match(ticket, /body:has\(\.sale-ticket\)[^{]*\{[^}]*display:\s*block/);
});

test('§5 : le ticket porte NIF, NIS et RC quand ils sont renseignés dans les mentions légales', () => {
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
});

test('Ticket simple algérien : nom boutique, date/heure, produits/prix et TOTAL final sans HT ni TVA', () => {
  assert.doesNotMatch(ticket, /Total HT/, 'le ticket ne doit pas afficher Total HT');
  assert.doesNotMatch(ticket, /TVA incluse/, 'le ticket reste simple sans ligne TVA');
  assert.doesNotMatch(ticket, /Lots :/, 'pas de codes lots techniques sur le ticket client');
  assert.match(ticket, /shopName/);
  assert.match(ticket, /dateStr/);
  assert.match(ticket, /timeStr/);
  assert.match(ticket, /<span>TOTAL<\/span>/);
});

test('§5 : un ticket de démonstration porte la mention sans valeur fiscale', () => {
  assert.match(ticket, /SANS VALEUR FISCALE/);
  assert.match(ticket, /\{data\.demo &&/);
});
