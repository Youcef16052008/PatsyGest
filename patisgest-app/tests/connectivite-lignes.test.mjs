import assert from "node:assert/strict";
import test from "node:test";

import { estLigneUtilisateur } from "../src/lib/connectivite-cron.ts";

/*
 * Contexte mesuré : `runOfflineDisconnectAlerts` lisait la réponse PostgREST
 * via `users as unknown as Row[]`. Une ligne nulle levait
 * « Cannot read properties of null (reading 'client_id') » et faisait échouer
 * TOUT le balayage — les comptes sains cessaient d'être surveillés.
 *
 * La garde étroite `estLigneUtilisateur` remplace ce cast : elle ne laisse
 * passer que les lignes réellement exploitables.
 */

const ligneValide = () => ({
  id: "u-1",
  client_id: "c-1",
  nom: "Yacine",
  email: "yacine@exemple.dz",
  role: "proprietaire",
  telephone: "+213555000000",
  last_seen_at: "2026-11-26T08:00:00.000Z",
  offline_alert_sent_at: null,
  offline_alert_count: null,
  clients: { id: "c-1", nom: "Pâtisserie El Yasmine" },
});

test("garde : accepte une ligne PostgREST complète", () => {
  assert.equal(estLigneUtilisateur(ligneValide()), true);
});

test("garde : accepte les jointure rendues en tableau (forme PostgREST réelle)", () => {
  const ligne = { ...ligneValide(), clients: [{ id: "c-1", nom: "Pâtisserie" }] };
  assert.equal(estLigneUtilisateur(ligne), true);
});

test("garde : accepte les champs nullables à null et la jointure absente", () => {
  const ligne = {
    ...ligneValide(),
    nom: null,
    telephone: null,
    last_seen_at: null,
    clients: null,
  };
  assert.equal(estLigneUtilisateur(ligne), true);
});

test("garde : refuse null et undefined (cause du plantage d'origine)", () => {
  assert.equal(estLigneUtilisateur(null), false);
  assert.equal(estLigneUtilisateur(undefined), false);
});

test("garde : refuse une ligne privée de client_id", () => {
  // C'est exactement le cas qui faisait lever `r.client_id` plus loin.
  const { client_id, ...sansClientId } = ligneValide();
  assert.equal(client_id, "c-1");
  assert.equal(estLigneUtilisateur(sansClientId), false);
});

test("garde : refuse un client_id vide", () => {
  assert.equal(estLigneUtilisateur({ ...ligneValide(), client_id: "" }), false);
});

test("garde : refuse un rôle hors du domaine connu", () => {
  assert.equal(estLigneUtilisateur({ ...ligneValide(), role: "admin" }), false);
  assert.equal(estLigneUtilisateur({ ...ligneValide(), role: null }), false);
});

test("garde : refuse les types scalaires et les tableaux", () => {
  for (const brut of ["texte", 42, true, [], ["ligne"]]) {
    assert.equal(estLigneUtilisateur(brut), false, `devrait refuser ${JSON.stringify(brut)}`);
  }
});

test("garde : refuse un champ texte de type incohérent", () => {
  assert.equal(estLigneUtilisateur({ ...ligneValide(), email: 12 }), false);
  assert.equal(estLigneUtilisateur({ ...ligneValide(), last_seen_at: 1690000000000 }), false);
});

test("garde : refuse un compteur d'alertes non numérique", () => {
  assert.equal(estLigneUtilisateur({ ...ligneValide(), offline_alert_count: "3" }), false);
  assert.equal(estLigneUtilisateur({ ...ligneValide(), offline_alert_count: 3 }), true);
});

test("garde : un lot mixte ne laisse passer que les lignes saines", () => {
  const lot = [
    ligneValide(),
    null,
    { id: "u-2" },
    { ...ligneValide(), id: "u-3", client_id: "c-2" },
    "bruit",
  ];
  const retenues = lot.filter(estLigneUtilisateur);
  assert.equal(retenues.length, 2);
  assert.deepEqual(retenues.map((r) => r.id), ["u-1", "u-3"]);
});

test("garde : déréférencer le lot filtré ne lève jamais", () => {
  // Reproduit la boucle réelle de `runOfflineDisconnectAlerts`.
  const lot = [ligneValide(), null, undefined, { id: "x" }];
  assert.doesNotThrow(() => {
    for (const r of lot.filter(estLigneUtilisateur)) {
      void r.client_id.toUpperCase();
      void r.role;
    }
  });
});

test("garde : le nom d'établissement est lu dans les deux formes de jointure", () => {
  // Deuxième bug mesuré : `u.clients?.nom` rendait « Établissement » quand
  // PostgREST renvoyait la jointure en TABLEAU — donc dans toutes les alertes
  // de ce cas. La normalisation doit couvrir les deux.
  const nomDe = (ligne) => {
    const jointure = Array.isArray(ligne.clients) ? ligne.clients[0] : ligne.clients;
    return jointure?.nom ?? "Établissement";
  };
  assert.equal(nomDe({ ...ligneValide(), clients: { id: "c", nom: "Objet" } }), "Objet");
  assert.equal(nomDe({ ...ligneValide(), clients: [{ id: "c", nom: "Tableau" }] }), "Tableau");
  assert.equal(nomDe({ ...ligneValide(), clients: null }), "Établissement");
  assert.equal(nomDe({ ...ligneValide(), clients: [] }), "Établissement");
});
