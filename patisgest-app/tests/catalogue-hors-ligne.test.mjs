// NF-02 / D5 — ouverture hors-ligne de la caisse.
//
// Le CDC autorise la caisse hors-ligne (D5) et le service worker refuse, à
// raison, de mettre en cache du HTML authentifié : sur une tablette partagée,
// le HTML d'un compte serait lisible après changement de compte.
//
// La conception retenue est donc une **coquille hors-ligne** : une page
// publique, sans aucune donnée personnelle, qui lit le catalogue mis en cache
// par CE compte et n'accepte de le servir que si l'identité correspond.
//
// Les risques que ces tests verrouillent :
//   1. servir le catalogue d'un compte A à un compte B (fuite) ;
//   2. servir un catalogue périmé comme s'il était à jour (prix faux encaissé) ;
//   3. prétendre la caisse disponible hors-ligne alors qu'aucun cache n'existe.
//      Un vendeur qui découvre l'indisponibilité AU MOMENT de la panne réseau
//      est pire qu'un vendeur qui le sait la veille.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cataloguePourIdentite,
  identiteCourante,
  FRAICHEUR_MAX_JOURS,
} from '../src/lib/catalogue-cache.ts';

const CATALOGUE = {
  version: 1,
  enregistreLe: '2026-11-23T08:00:00.000Z',
  clientNom: 'Pâtisserie ELA',
  articles: [{ id: 'a1', label: 'Mille-feuille', prixHT: '900' }],
  sites: [{ id: 's1', label: 'Boutique' }],
  identite: { nom: 'Pâtisserie ELA', adresse: null, telephone: null, nif: null, nis: null, rc: null },
};

/** Storage minimal qui imite le localStorage sans DOM. */
function stockage(donnees = {}) {
  const map = new Map(Object.entries(donnees));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    _map: map,
  };
}

const MAINTENANT = Date.parse('2026-11-23T09:00:00.000Z');

test('D5 : la coquille retrouve le catalogue du compte courant il y a 1 h', () => {
  const s = stockage({
    'patisgest.catalogue.v1': JSON.stringify(CATALOGUE),
    'patisgest.session.v1': JSON.stringify({ clientId: 'c1', authUserId: 'u1' }),
  });
  const r = cataloguePourIdentite(s, 'c1', MAINTENANT);
  assert.equal(r.ok, true);
  assert.equal(r.catalogue.clientNom, 'Pâtisserie ELA');
});

test('D5 : le catalogue d’un AUTRE compte n’est jamais servi', () => {
  const s = stockage({
    'patisgest.catalogue.v1': JSON.stringify({ ...CATALOGUE, clientId: 'c1' }),
    'patisgest.session.v1': JSON.stringify({ clientId: 'c1', authUserId: 'u1' }),
  });
  // Le compte B se connecte sur la même tablette et tente d'ouvrir hors-ligne.
  const r = cataloguePourIdentite(s, 'c2', MAINTENANT);
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'autre-compte', 'le cache appartient à c1, pas à c2');
});

test('D5 : sans identité enregistrée, on ne sert rien', () => {
  const s = stockage({ 'patisgest.catalogue.v1': JSON.stringify(CATALOGUE) });
  const r = cataloguePourIdentite(s, 'c1', MAINTENANT);
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'sans-identite');
});

test('D5 : un catalogue périmé est refusé, avec son âge pour l’expliquer', () => {
  const vieux = { ...CATALOGUE, enregistreLe: '2026-10-01T08:00:00.000Z' };
  const s = stockage({
    'patisgest.catalogue.v1': JSON.stringify(vieux),
    'patisgest.session.v1': JSON.stringify({ clientId: 'c1', authUserId: 'u1' }),
  });
  const r = cataloguePourIdentite(s, 'c1', MAINTENANT);
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'perime');
  assert.ok(r.ageJours > FRAICHEUR_MAX_JOURS);
});

test('D5 : un catalogue corrompu ne plante pas l’écran de secours', () => {
  const s = stockage({
    'patisgest.catalogue.v1': '{ pas du json',
    'patisgest.session.v1': JSON.stringify({ clientId: 'c1', authUserId: 'u1' }),
  });
  const r = cataloguePourIdentite(s, 'c1', MAINTENANT);
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'illisible');
});

test('D5 : aucun cache du tout est un cas normal, pas une erreur', () => {
  // Identité présente (l'utilisateur s'est connecté ici) mais aucun catalogue
  // enregistré : c'est le premier jour d'usage, pas une panne.
  const s = stockage({
    'patisgest.session.v1': JSON.stringify({ clientId: 'c1', authUserId: 'u1' }),
  });
  const r = cataloguePourIdentite(s, 'c1', MAINTENANT);
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'absent');
});

test('D5 : l’identité courante est relue sans exposer d’autres comptes', () => {
  const s = stockage({
    'patisgest.session.v1': JSON.stringify({ clientId: 'c1', authUserId: 'u1' }),
  });
  assert.deepEqual(identiteCourante(s), { clientId: 'c1', authUserId: 'u1' });
  assert.equal(identiteCourante(stockage()), null);
});

test('D5 : l’identité illisible ne fait pas croire à une session valide', () => {
  const s = stockage({ 'patisgest.session.v1': 'null' });
  assert.equal(identiteCourante(s), null);
});
