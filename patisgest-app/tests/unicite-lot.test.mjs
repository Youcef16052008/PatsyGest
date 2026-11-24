// RI-04 — identité du lot.
//
// La question ouverte (« faut-il `unique (client_id, numero)` ? ») avait deux
// réponses possibles et aucune tranchée. Ce test verrouille la décision, y
// compris **pourquoi la réponse évidente était fausse** :
//
//   * un lot transféré conserve son numéro sur le site d'arrivée (migration 08,
//     exigence MOD-11 : sans ça la chaîne de traçabilité se coupe) ;
//   * une contrainte `(client_id, numero)` casserait donc tout transfert ;
//   * deux réceptions du même numéro au même endroit, elles, doivent être
//     refusées — c'est l'erreur qui double le stock en silence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';

const racine = new URL('../supabase/', import.meta.url);
const sql = (f) => readFileSync(new URL(cheminMigration(f), racine), 'utf8');

test('RI-04 : la contrainte d’unicité ne couvre que les réceptions directes', () => {
  const m = sql('43-unicite-lot.sql');
  assert.match(
    m,
    /create unique index if not exists lots_reception_unique[\s\S]*?where ref is null or ref not like 'TR-%'/,
    'la clé doit être partielle : sans le `where`, le miroir de transfert est refusé',
  );
  for (const col of ['client_id', 'article_id', 'site_id', 'numero']) {
    assert.match(m, new RegExp(`\\(${['client_id', 'article_id', 'site_id', 'numero'].join(', ')}\\)`),
      'les quatre colonnes doivent former la clé');
    break;
  }
  assert.match(m, /\(client_id, article_id, site_id, numero\)/);
});

test('RI-04 : le transfert écrit bien un miroir portant le même numéro', () => {
  // Si quelqu'un « corrige » le transfert pour générer un nouveau numéro, la
  // traçabilité amont (MOD-11) est perdue et le test doit tomber. Ce test
  // documente le lien de cause à effet entre la migration 08 et la 43.
  const t = sql('08-transferts.sql');
  assert.match(t, /insert into public\.lots/, 'le transfert doit créer un lot miroir');
  assert.match(
    t,
    /values\s*\(\s*v_client,\s*p_article_id,\s*p_to_site_id,\s*v_lot\.fournisseur_id,\s*v_lot\.numero,/,
    'le miroir doit reprendre le numéro du lot d’origine',
  );
  assert.match(t, /'TR-'/, 'le transfert doit marquer sa référence, ce qui l’exempte de la clé');
});

test('RI-04 : les réceptions directes n’utilisent pas le préfixe exempté', () => {
  // Si `receptionner_lot` ou `recevoir_commande` écrivaient un `ref` en TR-,
  // ils échapperaient au contrôle et le doublon de stock redeviendrait possible.
  for (const f of ['05-ecritures-articles-lots.sql', '10-achats-commandes.sql']) {
    const m = sql(f);
    const insertions = m.match(/insert into public\.lots[\s\S]{0,600}/g) ?? [];
    assert.ok(insertions.length > 0, `${f} doit réceptionner des lots`);
    for (const bloc of insertions) {
      assert.doesNotMatch(bloc, /'TR-/, `${f} ne doit pas marquer une réception comme un transfert`);
    }
  }
});

test('RI-04 : la migration est dans la chaîne de déploiement, après 42', () => {
  const chaine = chaineDeploiement();
  const i43 = chaine.indexOf('43-unicite-lot.sql');
  const i42 = chaine.indexOf('42-donnees-personnelles.sql');
  assert.ok(i43 > -1, '43 doit être dans la chaîne');
  assert.ok(i42 > -1 && i43 > i42, '43 doit venir après 42');
});

test('RI-04 : la migration refuse de contraindre une base déjà incohérente', () => {
  const m = sql('43-unicite-lot.sql');
  assert.match(m, /having count\(\*\) > 1/, 'elle doit détecter les doublons existants');
  assert.match(
    m,
    /raise exception 'Migration 43 refusee/,
    'elle doit s’arrêter avec un message lisible plutôt que sur un 23505 obscur',
  );
});
