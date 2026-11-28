# Application des migrations 39 → 42 sur le projet pilote

**Date :** 23 novembre 2026 · **Projet :** `evepzygucfxarpdnflzv` (eu-west-1, Postgres 17)
**État d'avant :** `app_schema_version = 38`. Voir `snapshots/pilote-v38-2026-11-23.md`.

## Pourquoi ce document existe

`scripts/db-push-disabled.mjs` refuse de pousser des migrations vers le pilote, et
`migrations/ETAT-RESTAURATION.md` interdit explicitement d'appliquer quoi que ce soit
sur le pilote **sans procédure de retour arrière validée**. Ce document est cette
procédure. Sans lui, appliquer 39–42 serait une improvisation sur une base vivante.

Le trou qu'il comble : 39 à 42 n'étaient appliquées **nulle part**. L'audit disait
« NF-10 conforme (migration 40) » et « NF-05 fermé (migration 42) » — vrai dans le
dépôt et dans les tests PGlite, faux en base. Une migration jamais appliquée n'est pas
une fonctionnalité, c'est un fichier.

## Ce que les quatre migrations font, et ce qu'elles ne font pas

| # | Objet | Nature |
|---|---|---|
| 39 | Garde-fous tenant (vitrine, sites, restauration), retrait de `client_id` de la projection anonyme | Policies + `revoke` |
| 40 | `journal_audit` + déclencheurs sur ventes, mouvements, clôtures, OF, articles, lots, comptes | Table + triggers |
| 41 | `avoirs` / `retours` + RPC `enregistrer_avoir` | Table + fonction |
| 42 | `demandes_donnees` + export / anonymisation (loi 18-07) | Table + fonctions |

**Aucune ne modifie une ligne de données métier.** Vérifié fichier par fichier : zéro
`DROP TABLE`, zéro `DELETE FROM`, zéro `TRUNCATE`, zéro `ALTER COLUMN ... DROP`. Les
seuls `drop` sont des `drop ... if exists` sur des objets que ces migrations créent
elles-mêmes (idempotence), et 39 révoque des droits accordés par 25–31.

Seule nuance : 39 resserre la vue `anon` de la vitrine. Une application encore en v38
qui s'appuierait sur l'ancienne projection pourrait casser **la vitrine publique** — pas
la caisse, pas la comptabilité. C'est le point de retour le plus probable.

## Procédure de retour arrière

Les quatre migrations sont **additives** : annuler consiste à retirer ce qu'elles ont
ajouté, pas à restaurer des données.

```sql
-- 39 : rétablir la vue anon d'avant (voir 26-vitrine-publique.sql pour le corps exact)
--      et re-gratter ce que 39 a révoqué. En pratique : rejouer 26 → 31.
-- 40 : drop table if exists public.journal_audit cascade;
--      (les déclencheurs tombent avec la table ; vérifier ensuite que
--       patisgest_journaliser n'est plus référencée)
-- 41 : drop function if exists public.enregistrer_avoir(uuid, text, text, numeric);
--      drop table if exists public.avoirs cascade;
-- 42 : drop function if exists public.exporter_donnees_personnelles();
--      drop function if exists public.anonymiser_client(text, text, text);
--      drop table if exists public.demandes_donnees cascade;
-- Puis : update public.app_schema_version set version = 38 where id = 1;
```

**Ce que le retour arrière ne récupère pas** : les lignes de `journal_audit` écrites
entre-temps. C'est voulu — un journal qu'on peut effacer n'est pas un journal. Si
l'annulation est motivée par une panne du journal, il faut le dire dans le rapport :
les événements de la fenêtre sont perdus, et c'est exactement ce que NF-10 reproche.

## Contrôle de non-régression (à faire APRÈS chaque migration)

Les 30 comptages de `snapshots/pilote-v38-2026-11-23.md` doivent rester **identiques**,
à l'exception des tables créées par 40–42. Si un comptage bouge, la migration a touché
des données qu'elle n'aurait pas dû : arrêter et revenir en arrière.

Contrôles complémentaires :

| Contrôle | Attendu |
|---|---|
| `select version from app_schema_version` | 42 à la fin |
| `select count(*) from journal_audit` | 0 juste après 40 (aucune écriture encore) |
| ventes | **8**, inchangé |
| articles / lots / clients / utilisateurs | **17 / 13 / 1 / 3**, inchangés |
| une vente encaissée après 40 | crée exactement 1 ligne dans `journal_audit` |
| `has_function_privilege('anon','exporter_donnees_personnelles()','execute')` | `false` |

## Ce que cette application ne prouve pas

Elle ne prouve **pas** que la base est restaurable (NF-09, reporté à 15 clients), et
elle ne remplace pas la preuve que l'application en v42 fonctionne : il faudra ouvrir
la caisse, encaisser, et vérifier que le journal s'est bien rempli — sur l'application
déployée, pas sur la base seule.

---

## Journal d'application — 23 novembre 2026 (réel, pas prévu)

Chaque migration a été appliquée **seule**, vérifiée, puis la suivante. Aucun lot
groupé : si la 41 casse, on veut savoir que c'est la 41.

| # | Résultat | Contrôle après application |
|---|---|---|
| 39 | ✅ appliquée | 30 comptages de données inchangés · `vitrine_catalogue` recréée sans `client_id` · prévol D7 branché dans `patisgest_restaurer_sauvegarde_interne` (vérifié : `position(...) > 0`) |
| 40 | ✅ appliquée, `version = 40` | 8 déclencheurs créés (`audit_` × 7 + `journal_audit_immuable`) · un `update` réel sur `articles` a produit **1 ligne** `articles.update` · un `update` sur `journal_audit` a été **refusé** par PostgreSQL (`42501`) |
| 41 | ✅ appliquée, `version = 41` | avoir réel créé en tant que propriétaire (`destruction`, 1 unité) → **1 ligne d'avoir + 1 trace d'audit**, puis `rollback` · quantité de 999 refusée : `P0001 Quantite d'avoir superieure a la quantite vendue` |
| 42 | ✅ appliquée, `version = 42` | `anon` : `false` sur `exporter_donnees_personnelles`, `anonymiser_client`, `enregistrer_avoir`, `patisgest_journaliser`, et sur la lecture de `journal_audit` / `avoirs` / `demandes_donnees` · anonymisation réelle de `DEV-001` : nom → `Client anonymise (TEST-QA-001)`, téléphone `null`, **8 ventes conservées**, 1 trace d'audit · export : 3 comptes, nom du client présent |

### Un bug réel, trouvé parce qu'on a appliqué pour de vrai

`exporter_donnees_personnelles()` construisait sa référence avec
`'EXP-' || to_char(now(), 'YYMMDDHH24MISS')` et une contrainte `unique (client_id, reference)`.
`now()` est **figé pour toute la transaction** : deux exports dans la même transaction
produisaient la même référence, et le second échouait sur `23505 duplicate key`.

Les tests PGlite ne l'ont jamais vu parce qu'ils n'appellent la fonction qu'une fois par
transaction. Il a fallu le faire deux fois de suite sur la vraie base pour le déclencher.

**Corrigé** : suffixe aléatoire (`substr(md5(gen_random_uuid()::text), 1, 6)`) + `on conflict
do nothing`. **Test ajouté** (« deux exports de suite n'entrent pas en collision de
référence ») et **vérifié dans les deux sens** : le test échoue avec l'ancien code, passe
avec le nouveau.

C'est l'argument le plus solide pour appliquer les migrations au pilote plutôt que de les
laisser en fichiers : un bug qui ne se déclenche qu'au deuxième appel dans la même
transaction ne se voit pas dans un test qui n'appelle qu'une fois.

### Non-régression finale

Après les quatre migrations, les 20 comptages de données contrôlés sont **identiques** à
l'instantané d'avant (`articles` 17, `lots` 13, `ventes` 8, `clients` 1, `utilisateurs` 3,
`cakes` 3, `sous_domaines_reserves` 19, etc.). Les seules tables nouvelles sont vides :
`journal_audit` 0, `avoirs` 0, `demandes_donnees` 0.

### Ce que ce journal ne prouve toujours pas

- **La restauration** (NF-09) : rien n'a été restauré. Le prévol D7 est *branché*, il n'a
  jamais été *exécuté* faute de test de restauration. C'est cohérent avec le report à 15
  clients, mais ça veut dire que le prévol lui-même n'est pas éprouvé.
- **L'application déployée** : la base est en v42 ; l'application Vercel doit être
  redéployée pour que les nouvelles actions serveur (`actions-donnees.ts`) existent en
  production. Une base migrée avec un front en retard est un état mixte, pas un état fini.
- **Les données de démonstration** : `DEV-001` est resté intact (le test a été annulé).

---

## Effet de bord trouvé en production, et corrigé

Appliquée telle quelle, la migration 39 **cassait une fonctionnalité livrée**.

`39` faisait `revoke update on public.clients from authenticated` pour empêcher un
tenant de modifier son `offre` (état de facturation). Mais `actions-etablissement.ts`
met à jour `nom, adresse, telephone, nif, nis, rc` sur `clients` depuis l'écran
Paramètres — et c'est précisément ce qui alimente les **mentions légales des tickets**
(NIF/NIS/RC, exigence NF-06). Après application, enregistrer l'identité de
l'établissement aurait échoué, et les tickets auraient perdu leurs mentions.

**La révocation était trop large.** Elle protégeait un champ (`offre`) en cassant
six autres.

Corrigé dans le fichier de migration **et** en base : `revoke update` sur la table,
puis `grant update (nom, adresse, telephone, nif, nis, rc)` — colonne par colonne.
Vérifié :

| Contrôle | Résultat |
|---|---|
| `has_column_privilege('authenticated','clients','nom','update')` | `true` ✅ |
| `…'nif'`, `…'rc'` | `true` ✅ |
| `has_column_privilege('authenticated','clients','offre','update')` | **`false`** ✅ (le but est atteint) |
| `has_column_privilege('anon','clients','nom','update')` | `false` ✅ |
| Écriture réelle endossée propriétaire | acceptée ✅ |

**Ce que ça dit du processus, et pourquoi ce n'est pas anodin.** Ce bug n'était
visible ni dans les tests PGlite (qui exercent les RPC, pas les GRANT par colonne),
ni dans `tsc`, ni dans le lint. Il n'apparaît qu'en comparant les GRANT aux appels
réels de l'application, sur une base où les deux existent. C'est la raison pour
laquelle les migrations restaient « appliquées nulle part » : personne ne les avait
confrontées à l'application qui les utilise.

### Contrôle des autres effets de bord de 39

| Écriture applicative | Table | Effet de 39 | Verdict |
|---|---|---|---|
| `actions-sites.ts` insert/update `nom, type, adresse` | `sites` | `grant insert (client_id, nom, type, adresse)` / `grant update (nom, type, adresse)` | ✅ compatible |
| `actions-etablissement.ts` update `nom, adresse, telephone, nif, nis, rc` | `clients` | corrigé ci-dessus | ✅ réparé |
| `vitrine.ts` lecture `cle_nom, nom, description, …` | `vitrine_catalogue` | vue recréée sans `client_id`, colonnes identiques à celles lues | ✅ compatible (vérifié en base : 12 colonnes, aucune `client_id`) |
| vitrine publique en `anon` | `vitrine_catalogue` | `grant select to anon, authenticated` | ✅ lisible (0 ligne : rien n'est publié sur ce projet) |
