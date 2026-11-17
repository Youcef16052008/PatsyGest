import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rc01Consommation, computeFicheCout, rc06Marge } from '../src/lib/cost-sheet.ts';

/**
 * CA-04 / Roadmap S3 :10 recettes de référence, coûts calculés à0,01 DA près.
 * Valeurs attendues calculées à la main (formules RC-01..RC-06 du cahier §4).
 */
const recettes = [
  {
    nom: 'R1 — Croissant simple (MO à charges10 %)',
    input: { matiereFefo: 1500, emballage: 80, moMin: 120, tauxHoraire: 350, chargesPct: 10, energie: 40.5, fraisGeneraux: 150.25, rendementBrut: 40, cuissonPct: 0, pvHt: 450 },
    attendu: { mo: 770, net: 40, total: 2540.75, portion: 63.5188, marge: 386.48, taux: 0.8588 },
  },
  {
    nom: 'R2 — Perte cuisson12 %',
    input: { matiereFefo: 600, emballage: 50, moMin: 0, tauxHoraire: 400, chargesPct: 0, energie: 130, fraisGeneraux: 100, rendementBrut: 100, cuissonPct: 12, pvHt: 150 },
    attendu: { mo: 0, net: 88, total: 880, portion: 10, marge: 140, taux: 0.9333 },
  },
  {
    nom: 'R3 — Mini atelier (aucun hors-œuvre)',
    input: { matiereFefo: 100, emballage: 10, moMin: 0, tauxHoraire: 0, chargesPct: 0, energie: 0, fraisGeneraux: 0, rendementBrut: 10, cuissonPct: 0, pvHt: 30 },
    attendu: { mo: 0, net: 10, total: 110, portion: 11, marge: 19, taux: 0.6333 },
  },
  {
    nom: 'R4 — MO lourde (10 h ×1000 DA, charges100 %)',
    input: { matiereFefo: 5000, emballage: 400, moMin: 600, tauxHoraire: 1000, chargesPct: 100, energie: 300, fraisGeneraux: 800, rendementBrut: 200, cuissonPct: 0, pvHt: 150 },
    attendu: { mo: 20000, net: 200, total: 26500, portion: 132.5, marge: 17.5, taux: 0.1167 },
  },
  {
    nom: 'R5 — Fraisier en cuve (parage8 %)',
    input: { matiereFefo: 0, emballage: 0, moMin: 0, tauxHoraire: 0, chargesPct: 0, energie: 0, fraisGeneraux: 0, rendementBrut: 10, cuissonPct: 0, pvHt: 0 },
    attendu: { mo: 0, net: 10, total: 0, portion: 0, marge: 0, taux: 0, parage: rc01Consommation(10, 8) },
  },
  {
    nom: 'R6 — Cuisson lourde (perte50 %)',
    input: { matiereFefo: 720, emballage: 0, moMin: 60, tauxHoraire: 300, chargesPct: 0, energie: 480, fraisGeneraux: 0, rendementBrut: 120, cuissonPct: 50, pvHt: 100 },
    attendu: { mo: 300, net: 60, total: 1500, portion: 25, marge: 75, taux: 0.75 },
  },
  {
    nom: 'R7 — Dépannage (portion à33,33)',
    input: { matiereFefo: 60, emballage: 20, moMin: 15, tauxHoraire: 160, chargesPct: 0, energie: 5, fraisGeneraux: 15, rendementBrut: 3, cuissonPct: 0, pvHt: 50 },
    attendu: { mo: 40, net: 3, total: 140, portion: 46.6667, marge: 3.33, taux: 0.0666 },
  },
  {
    nom: 'R8 — Charges mi-temps (45 min ×312,50, +20 %)',
    input: { matiereFefo: 200, emballage: 0, moMin: 45, tauxHoraire: 312.5, chargesPct: 20, energie: 0, fraisGeneraux: 0, rendementBrut: 25, cuissonPct: 4, pvHt: 40 },
    attendu: { mo: 281.25, net: 24, total: 481.25, portion: 20.0521, marge: 19.95, taux: 0.4988 },
  },
  {
    nom: 'R9 — Gros lot matière (arrondi centime)',
    input: { matiereFefo: 1000000.01, emballage: 0.99, moMin: 1, tauxHoraire: 60, chargesPct: 0, energie: 0.01, fraisGeneraux: 0, rendementBrut: 1000, cuissonPct: 0.1, pvHt: 1200 },
    attendu: { mo: 1, net: 999, total: 1000002.01, portion: 1001.003, marge: 199, taux: 0.1658 },
  },
  {
    nom: 'R10 — Complet avec cuisson5 % et marge fine',
    input: { matiereFefo: 800, emballage: 60, moMin: 30, tauxHoraire: 600, chargesPct: 20, energie: 25.5, fraisGeneraux: 120.25, rendementBrut: 50, cuissonPct: 5, pvHt: 200 },
    attendu: { mo: 360, net: 47.5, total: 1365.75, portion: 28.7526, marge: 171.25, taux: 0.8563 },
  },
];

for (const r of recettes) {
  test(`RC référence — ${r.nom}`, () => {
    const f = computeFicheCout(r.input);
    assert.equal(f.rc04Mo, r.attendu.mo, 'RC-04 MO');
    assert.equal(f.rc02RendementNet, r.attendu.net, 'RC-02 rendement net');
    assert.equal(f.rc03Total, r.attendu.total, 'RC-03 total');
    assert.equal(f.rc05ParPortion, r.attendu.portion, 'RC-05 portion');
    assert.equal(f.rc06.marge, r.attendu.marge, 'RC-06 marge');
    assert.equal(f.rc06.taux, r.attendu.taux, 'RC-06 taux');
    if (r.attendu.parage !== undefined) assert.equal(r.attendu.parage, 10.8, 'RC-01 parage');
  });
}

test('RC référence — la portion est au centime près (écart max0,005)', () => {
  for (const r of recettes) {
    const f = computeFicheCout(r.input);
    const ecart = Math.abs(f.rc05ParPortion - r.attendu.portion);
    assert.ok(ecart < 0.005, `${r.nom} : écart ${ecart}`);
  }
});

test('RC référence — jamais de TVA dans le coût (RC-05) : pvHt non modifié', () => {
  // Même entrées, PV HT différent : le coût/portion ne bouge pas.
  const base = { matiereFefo: 500, emballage: 50, moMin: 60, tauxHoraire: 400, chargesPct: 0, energie: 40, fraisGeneraux: 100, rendementBrut: 20, cuissonPct: 0 };
  const a = computeFicheCout({ ...base, pvHt: 100 });
  const b = computeFicheCout({ ...base, pvHt: 119 }); // TVA19 % incluse par erreur
  assert.equal(a.rc05ParPortion, b.rc05ParPortion);
  assert.notEqual(a.rc06.marge, b.rc06.marge); // la marge, elle, dépend du PV
});

test('RC-06 marge au centime sur portion arrondie', () => {
  // portion57.5 → marge arrondie au centime depuis un PV HT entier.
  const f = computeFicheCout({
    matiereFefo: 1200, emballage: 100, moMin: 90, tauxHoraire: 400, chargesPct: 25,
    energie: 50, fraisGeneraux: 200, rendementBrut: 40, cuissonPct: 0, pvHt: 500,
  });
  assert.equal(f.rc05ParPortion, 57.5);
  assert.deepEqual(rc06Marge(500, 57.5), { marge: 442.5, taux: 0.885 });
});
