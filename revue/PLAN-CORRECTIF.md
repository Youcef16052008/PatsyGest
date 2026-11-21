# Plan de correction — PâtisGest

Source : `revue/REVUE-CODE-PATISGEST.md` (constats F-01 à F-20, analyse des rapports externes en §8).
Branche : `arena/27fe0740-patsygest` (base `2fba72c`).

## Règles de travail

- **Pas d'édition des migrations déjà appliquées au pilote** (`01`–`31`). Leur empreinte SHA-256 est figée dans `migrations/repetition.json` et les fixtures pilote doivent rester identiques à `main`. Toute correction passe par une migration **ajoutée** (`32`, puis suivantes), qui corrige le corps installé avec des gardes strictes (refus si le corps n'est pas celui attendu).
- Chaque correction a : un test qui **échoue avant** le correctif et **passe après**, et `npm test` vert.
- Aucune migration n'est appliquée au pilote automatiquement. L'application d'une migration sur le pilote reste une décision humaine, après relecture.
- Les décisions métier sont signalées explicitement et ne sont pas tranchées seul.

## Phase 1 — Bloquants avant toute mise en production

| # | Constat | Action | Fichiers | Statut |
|---|---|---|---|---|
| 1.1 | **F-03** FEFO inversé | `sortFefo` aligné sur le SQL (`congele asc` : non congelé d'abord). Test de la DLC plus proche d'un lot congelé ajouté. | `src/lib/fefo-cost.ts`, `tests/fefo-cost.test.mjs` | **Fait** |
| 1.2 | **F-01** vente à 0 DA | Panier : ligne à `prixHT ≤ 0` ⇒ `valide=false` (avant : `valide` ignorait le prix) ; message visible au caissier. SQL : `vendre_panier` refuse `pv_ht <= 0` (migration `32`). | `src/lib/pos-cart.ts`, `src/components/sale-composer.tsx`, `supabase/32-…sql`, `tests/pos-cart-prix-nul.test.mjs`, `tests/phase1-rattrapage-db.test.mjs` | **Fait** |
| 1.3 | **F-18** (rapport B-005) migration 27 cassée | Migration `32` remplace la sélection `s.nom` par `s.subdomain` dans le corps installé. Reproduit avant, vérifié après. | `supabase/32-…sql`, `tests/phase1-rattrapage-db.test.mjs` | **Fait** (corps installé ; `27` non modifiée) |
| 1.4 | **F-02** restauration : un doublon fait perdre la table | `on conflict (id) do nothing` + compteurs `insere`/`ignore` par table, contrôle `version = 1`. Test : doublon + nouvelles lignes ⇒ nouvelles lignes insérées. | `supabase/33-restauration-sans-perte.sql`, `tests/phase1-f02-f20-db.test.mjs` | **Fait** (migration `33`, hors fixture pilote, à relire avant application) |
| 1.5 | **F-04** dates UTC | `jourLocal()` avec `Africa/Algiers`, propagé à 9 fichiers `src/**` ; test de minuit. | `src/lib/workspace-data.ts`, composants, `tests/revue-corrections.test.mjs` | **Fait côté application.** RPC `at time zone 'Africa/Algiers'` : **non fait** |
| 1.6 | **F-20** (rapport B-004) coût d'OF partiel compté N fois | Diviseur `v_of.qte_prevue` au lieu de `p_qte`. | `supabase/34-cout-of-partiel.sql`, `tests/phase1-f02-f20-db.test.mjs` | **Fait** (migration `34`). **Décision** : OF déjà valorisés **non recalculés** (choix utilisateur). Les OF concernés restent à lister (requête lecture seule à fournir) |
| 1.7 | **F-19** (rapport B-001) application ↔ schéma | Code labo/vendeur interrogeant des vues absentes du chemin déployable. **Décision** : masquer derrière un drapeau (choix utilisateur). | `src/lib/permissions.ts` (`ROLES_LABO_VENDEUR_ACTIFS = false`), `src/lib/actions-equipe.ts`, `src/lib/actions-rejoindre.ts`, `src/app/(app)/layout.tsx`, `tests/revue-corrections.test.mjs` | **Fait (drapeau).** Conséquence : un compte labo/vendeur existant est bloqué. `app_schema_version` non fait |

### Points à faire valider avant d'aller plus loin

1. **F-03, sens du tri** : le commentaire du code disait « congelé d'abord », mais le SQL réel trie les lots non congelés en premier. J'ai aligné le JS sur le SQL, car c'est ce qui s'exécute en base. Confirmer que c'est bien l'intention métier.
2. **F-01, articles existants à prix 0** : **traité.** 12 articles du pilote ont reçu un prix aléatoire entier dans ]0 ; 50] DA (choix utilisateur). Trace : `revue/donnees-prix-zero-pilote.sql`. 9 de ces 12 sont des matières premières : à corriger à la main si leur prix de vente doit être réel.
3. **Ordre des migrations sur le pilote** : `32` modifie le corps de `vendre_panier`. Le brouillon `128` remplace aussi cette fonction par correspondance de texte ; il devra être **régénéré après `32`**, sinon il échouera (« Corps inattendu »). Même chose pour `127` (sans risque : il ne fait rien si `subdomain` est déjà sélectionné).

## Phase 2 — Avant la prochaine version

| # | Constat | Action |
|---|---|---|
| 2.1 | F-08 | **Traité par garde, pas par droits par défaut.** Mesuré sur PostgreSQL 17.12 réel : `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` ne retire pas PUBLIC des nouvelles fonctions (la fonction reçoit `=X`, même avec un défaut explicite pour `authenticated`). Le filet réel est le test `droits-execution-db.test.mjs`, qui échoue si une fonction de `public` est exécutable par PUBLIC ou anon. |
| 2.2 | F-05 | **Fait** par la migration `33` (contrôle `version = 1` dans l'interne ; compteurs par table). |
| 2.3 | F-06 | **Fait** : borne 99,99 testée. Erreurs de fiche typées : non faites. |
| 2.4 | F-12 | **Non fait.** Les tests et le manifeste d'empreintes référencent les chemins `supabase/NN-*.sql` ; déplacer les brouillons casse ces références. À faire dans un passage dédié, avec la liste ordonnée unique. |
| 2.5 | F-10 | **Partiel** : tickets à 0 DA comptés dans `ticketsZero` (testé). Alerte à l'écran : non faite. |
| 2.6 | — (rapport B-010) | **Fait** : `.github/workflows/ci.yml` (lint, typecheck, tests sur `pull_request` et `main`). Build non inclus (il demande des variables d'environnement, déjà couvertes par `supabase-isole.yml`). Workflow non exécuté localement : à vérifier au premier run GitHub. |
| 2.7 | — (rapport B-011) | Sauvegarde : passer d'AES-CBC non authentifié à AES-GCM ou `age` ; restauration testée. |
| 2.8 | — (rapport B-007/B-008) | Transfert : `client_ref` et RPC transactionnelle ; anti-abus vitrine par source plutôt que compteur global. |
| 2.9 | — (rapport B-002) | Clés étrangères composites `(client_id, …)` après contrôle des données existantes. |

> **F-20, recensement sur le pilote (lecture seule) :** 2 OF au total, 1 `termine`, 0 lot de production rattaché : aucun coût historique à corriger sur le pilote.
>
> **Contrainte de chaîne de `34` :** la migration cible `terminer_of(uuid,numeric,text,date)`. Si `101` (brouillon, hors chemin déployable) était appliquée avant, cette fonction devient un wrapper et la garde de `34` refuse. Ne pas appliquer `101` avant `34` sans revoir `34`. `102` est un brouillon concurrent de `34` : ne pas appliquer les deux.

## Phase 3 — Amélioration ultérieure

F-09 (`plusJours` validé) **fait**, F-07 (`libellePrix` ≤ 0) **fait**, F-14 (regex CSV) **fait**, F-17 (`asOf` obligatoire ; `ingredient-impact` corrigé) **fait**, F-11 (`src/db/`, `drizzle-orm`, `drizzle-kit`, `postgres`, scripts `db:*` retirés) **fait**. Restent : F-13 (tiroir `{}` vs `'0'`), F-16 (séparer `insuffisantStock` / `insuffisantCout`), F-15 (filtre de période à l'export).

## Phase 4 — Optionnel

N+1 de la fiche de coût (480 → 1 requête), suite Playwright minimale sur les 4 parcours, lint textuel de `securite.test.mjs` remplacé par des tests d'exécution, `error.tsx` par segment.

## Hors périmètre de ce dépôt (ops / prototype)

DNS `*.patisgest.dz` et version déployée sur Vercel (à vérifier via le connecteur, non fait), migration Electron 33 → version supportée (`patisgest-desktop`, fin de support 28/04/2025), prototype HTML (`esc()`, import de sauvegarde, export CSV), test de restauration complète sur base représentative.

## Critère de sortie de la Phase 1

- Tous les tests de la Phase 1 passent, et `npm test` reste vert.
- F-01, F-02, F-03, F-04, F-18, F-19, F-20 sont soit corrigés et testés, soit ont une décision métier documentée.
- Les migrations `32` et suivantes sont relues avant application sur le pilote, et `128` est régénéré si nécessaire.

## État après la suite (Phases 2 à 4)

Ce tableau fait foi. Il remplace les statuts ci-dessus lorsqu'ils diffèrent.

| Constat | Statut | Détail |
|---|---|---|
| F-04 (SQL) | **Fait** (migration `36`, à relire avant le pilote) | `current_date` → date `Africa/Algiers` dans les fonctions publiques et les défauts de colonnes. Refus si une vue contient `current_date` (non traitées). Test PGlite sur la chaîne 01→36. Le comportement à minuit est prouvé par la définition, pas par une horloge simulée. |
| F-06 | **Fait** | `tenterFicheCoutScaled` : perte 100 % = erreur de champ ; ≥ 99 % = avertissement (`RC-02-cuisson`). |
| F-10 | **Fait** | Tickets à 0 DA comptés (`ticketsZero`) et signalés par une alerte `role="alert"` dans `recon-panel.tsx`. |
| F-13 | **Vérifié, déjà correct** | `{}` → pas de bilan ; `'0'` → zéro explicite ; fond sans espèces → refus. Test permanent. |
| F-15 | **Fait** | Messages des exports explicites (limite nommée) ; filtre `du`/`au` (AAAA-MM-JJ, bornes incluses) sur les 5 tables datées (`interpreterPeriode`, `colonneDate`) ; 400 explicite sur les tables sans date. |
| F-16 | **Fait** | `insuffisantStock` et `sansPrixConnu` séparés de `insuffisant` (coût). Test permanent. |
| F-19 | **Fait** | Drapeau labo/vendeur (1.7) ; table `app_schema_version` (migration `35`, version requise `36`) et refus au chargement de l'espace (mode `supabase`). Matrice app × schéma : `tests/matrice-app-schema.test.mjs` — toute table, vue ou RPC lue par l'application doit exister dans la chaîne déployée `01`→`39` ; les exceptions (vues `labo_*`/`vendeur_*`, RPC `equipe_*`, `patisgest_tous_sites_autorises`) ne sont admises que si leur garde-fou est active. |
| B-011 | **Fait** (workflow) | `sauvegarde-free.yml` chiffre avec le coffre AES-256-GCM du dépôt, relecture authentifiée, dump clair en `/dev/shm` seulement. Les anciennes copies `.enc` (AES-CBC) restent lisibles avec openssl (procédure dans le résumé). Non exécuté : à vérifier au premier run. |
| Phase 4 `error.tsx` | **Fait** | `src/app/error.tsx` et `src/app/(app)/error.tsx`. |
| Phase 4 CI | **Fait** | `.github/workflows/ci.yml`. |
| F-12 | **Fait** | 28 brouillons déplacés dans `supabase/brouillons/` (`git mv`, SHA-256 inchangés). Lecteurs corrigés via `cheminMigration`/`tousLesSql`. `securite.test.mjs` et `vitrine.test.mjs` scannent aussi les brouillons (sinon les contrôles de grants sortaient silencieusement). |
| F-08 | **Fermé par garde de test** | Les droits par défaut ne suffisent pas (mesuré sur PostgreSQL 17.12). La protection est le test d'exécution `droits-execution-db.test.mjs` : toute nouvelle fonction exposée à PUBLIC ou anon le fait échouer. |
| B-002 | **Non fait** | Clés composites : une quarantaine de relations, migration à données existantes. Pilote : 1 client, 0 incohérence sur `lots→articles` et `mouvements→lots`. Risque latent multi-client. |
| B-007 / B-008 | **Partiel (migrations 37 et 38 écrites et testées, non appliquées au pilote)** | RPC transactionnelle de transfert : **déjà en place** (`transferer_article`, plpgsql, migrations 08 et 21). **Reste** : `client_ref` idempotent sur les transferts (double soumission / rejeu hors ligne, comme les OF en 16), et anti-abus vitrine par source plutôt que compteur global. Ces deux points exigent une migration 37 : à valider avant écriture. |
| N+1 fiche de coût | **Fait** | `lib/lots-batch.ts` : un `in()` par bloc de 100 articles, pagination jusqu'à page courte, erreur remontée (plus de `[]` silencieux). Fiche de coût et simulation. Tests : `tests/lots-batch.test.mjs`. |
| Phase 4 Playwright | **Non fait** | Navigateurs non téléchargeables depuis cet environnement (hôtes autorisés : npm, PyPI, GitHub). |
| Phase 4 lint textuel `securite.test.mjs` | **Partiel** | Les contrôles de droits (grants PUBLIC/anon, révocation avant grant) sont remplacés par `tests/droits-execution-db.test.mjs` : migrations appliquées sur PGlite et sur PostgreSQL 17 réel (chaîne 01–38), droits lus dans `pg_proc`. Restent des contrôles textuels sur le code source TypeScript (routes, actions, rôles). |

**Migrations à relire avant tout passage sur le pilote :** `33` à `38`. Aucune n'a été appliquée au pilote par ce travail.
**Conséquence de F-19 au déploiement :** une base sans `app_schema_version` (ou en version 35) bloque l'espace tant que `36` n'est pas appliquée.

## Revue de vigilance avant pilote : migrations 33 à 37

Aucune de ces migrations n'est appliquée au pilote par ce travail. Ordre requis : 33 → 34 → 35 → 36 → 37 → 38 (chacune vérifie son prérequis). Déployer l'application seulement après 35 (`VERSION_SCHEMA_REQUISE = 36`).

| Migration | Ce qu'elle change | Points de vigilance | Garde-fou dans le fichier |
|---|---|---|---|
| **33** restauration sans perte | Réécrit l'interne de restauration. | Insertion `on conflict do nothing` : additive, jamais d'écrasement ; les doublons sont comptés en `ignore`. Liste des tables `v_ordre` constante (pas d'entrée utilisateur dans `format`). Le contrôle de tenant ne porte que sur la clé `client_id` : une table fille sans `client_id` n'est pas vérifiée (à relire). | Vérifie client, version de dump, « sans tables ». |
| **34** coût OF partiel | Corrige la formule de `terminer_of` par remplacement de texte sur sa définition. | Patch textuel à l'exécution : garde stricte (une seule occurrence attendue). Les coûts déjà enregistrés ne sont **pas** recalculés (décision F-20). Pas de retour arrière automatique. | Échec si la formule diffère ; rejouable. |
| **35** version de schéma | Table `app_schema_version` (version 35), lecture seule côté authentifié. | Sans elle, l'application refuse de démarrer en mode `supabase`. Ne jamais abaisser la version. | Rejouable, version jamais abaissée. |
| **36** dates Algiers | Remplace `current_date` par la date locale dans les fonctions publiques et les défauts de colonnes. | Remplacement par expression régulière `\mcurrent_date\M` : touche aussi un `current_date` écrit dans un commentaire ou une chaîne d'une fonction (sans effet fonctionnel, à connaître). Modifie les défauts de toutes les tables concernées (métadonnées seulement). | Échec si `current_date` subsiste, si une vue publique en contient, ou si un défaut est inattendu. |
| **37** transfert idempotent (B-007) | `transferts.client_ref` (unique par client) et `transferer_article_ref`. Ne modifie pas `transferer_article`. | Non branchée côté application : aucun effet tant que l'app n'appelle pas la nouvelle RPC. Une même référence rejouée renvoie le transfert existant ; une référence réutilisée pour une autre demande est refusée. Verrou consultatif par (client, référence). | Prérequis 08, 21, 35 ; droits fermés à anon et PUBLIC. |

Tests : `tests/phase1-f02-f20-db.test.mjs`, `tests/dates-algiers-db.test.mjs`, `tests/schema-version-db.test.mjs`, `tests/transfert-client-ref-db.test.mjs` (6), `tests/droits-execution-db.test.mjs`.

Limite : PGlite est mono-connexion. Le verrou et l'unicité sont vérifiés par la logique et la contrainte, pas par une vraie concurrence à deux sessions. Une vérification en concurrence réelle reste à faire sur un environnement Postgres jetable avant branchement.

**Statut B-007 :** `client_ref` des transferts = migration 37 écrite et testée, non appliquée, non branchée. **Statut B-008 :** migration 38 et code serveur écrits et testés, non appliqués au pilote.

**Décision anti-abus vitrine (B-008) — tranchée sur recommandation, à valider avec le pilote.** Option retenue : plafond **par source** sans conserver d'IP.
- Le serveur calcule `HMAC-SHA256(secret, IP)` (`src/lib/vitrine-anti-abus.ts`, secret `VITRINE_SECRET_ANTI_ABUS` ≥ 32 caractères). La base ne reçoit jamais l'IP.
- Migration 38 : `patisgest_verifier_source_vitrine` plafonne à 10 demandes/heure par source et par établissement ; lignes purgées après 2 heures ; plafond global relevé de 30 à 300.
- Sans secret, ou avant la migration 38 : seul le plafond global s'applique (repli explicite, pas de panne).
- **Limites :** un botnet qui change d'adresse n'est pas arrêté par ce mécanisme ; cela relève d'une limitation au bord (hébergeur). Le hachage reste une donnée pseudonyme pendant 2 heures : à faire valider au regard de la loi 18-07 avant mise en production.
- Ouvert : la fonction de vérification est exécutable par `anon` (voulu, elle ne lit rien et n'écrit que des hachages).

## Vérification réelle sur PostgreSQL 17 (B-007)

- `tests/concurrence-transfert-reel.test.mjs` : deux appels **simultanés** sur deux connexions réelles. Résultats observés sur PostgreSQL 17.12 : même référence → un transfert réel et un rejeu, stock déplacé une seule fois ; sans référence → un seul des deux transferts réussit, stock jamais négatif. La chaîne 01→38 s'applique intégralement sur Postgres réel (y compris les patchs des migrations 34 et 38).
- Le test est ignoré sans `PATSYGEST_PG_URL`. La CI (`.github/workflows/ci.yml`) lance un service `postgres:17` et définit cette variable. Dépendance ajoutée : `pg` (devDependency), uniquement pour ce test.
- Exécution locale : `PATSYGEST_PG_URL=postgres://postgres@127.0.0.1:5432/postgres npm test`.
