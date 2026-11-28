# Rapport — VAGUE 6, production et certification externe

**Branche** : `arena/923a4433-patsygest`  \
**Décisions utilisateur** : `cibles_sql=both_full`, `secrets=existing`, `dispatch=dispatch_ci`, `deploy=deploy_current`, `rollback=plan_only`, `b2_figma_drive=skip`, `pr_final=keep_open`.  \
**Statut** : opérations externes exécutées (chaîne pilote rejouée, production conservée, déploiement Vercel promu, CI distante verte). Les limites de la section 9 restent ouvertes par décision.

## 1. Périmètre réellement autorisé

| Choix | Portée appliquée |
|---|---|
| `both_full` | chaîne 01→57 rejouée intégralement sur le pilote `gmmjrzyhvihxvaqvuoxy` ; conservation de 54→57 déjà appliquée sur la production `evepzygucfxarpdnflzv` |
| `existing` | secrets Vercel/GitHub existants réutilisés ; aucune valeur secrète demandée, déchiffrée, modifiée ou recopiée ; aucun nouveau secret créé |
| `dispatch_ci` | seul `certification-production.yml` est dispatché ; jamais les workflows de cron de connectivité ni de sauvegarde |
| `deploy_current` | déploiement production créé depuis un commit de la branche courante, puis redéployé depuis le commit final |
| `plan_only` | procédure et workflow de rollback préparés ; aucun rollback exécuté |
| `skip` | B.2 humaine exhaustive, Figma et Drive reportés ; aucun write Figma/Drive |
| `keep_open` | PR #26 laissée OPEN, non fusionnée |

## 2. Livrables de code

- OCR serveur `/api/invoice-ocr` : Tesseract.js FR/ENG, modèles `public/tessdata` figés, WASM/core inclus dans le tracing Next, aucune persistance de l'image ni du texte, garde de session et de rôle, i18n FR/AR, parcours client avec validation humaine obligatoire.
- Sonde protégée `/api/health/stack` : `CRON_SECRET` + `timingSafeEqual`, contrôles réels Auth, PostgREST, Storage et version de schéma, sans fuite de secret ni de corps de réponse.
- Chaîne déterministe `audit/sql/chain-01-57.sql` (56 fichiers, version 57), ses 12 fragments et `chain-01-57.meta.json` (SHA-256/MD5), avec 5 correctifs de rejouabilité.
- Workflow `.github/workflows/certification-production.yml` : `workflow_dispatch` seul, trois jobs — contrats OCR/chaîne/types/lint, concurrence sur un service PostgreSQL 17 réel (service `postgres:17` du runner, aucune ressource hébergée), pile hébergée Auth/PostgREST/Storage/Vercel via la sonde protégée.
- Workflow `.github/workflows/rollback-chaud.yml` et `audit/RUNBOOK-ROLLBACK.md` : cible `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3`, `dry_run=true` par défaut, aucune exécution.
- Scripts npm `test:cert:ocr`, `test:cert:postgresql`, `test:cert:concurrency`, `test:cert:hosted`, `test:cert:production`, `build:chain`.

### 2bis. Retrait du job de concurrence hébergé (motif factuel)

Le job `Concurrence PostgreSQL hébergé` utilisait le secret GitHub `SUPABASE_DB_URL`. Ce secret existe mais son authentification est refusée par le pooler (`password authentication failed for user "postgres"`), et l'API GitHub refuse la lecture/écriture des secrets de ce dépôt (`403 Resource not accessible by integration`). Conformément à `secrets=existing`, aucun secret n'a été créé ni corrigé : la dépendance a été retirée et la concurrence reste certifiée sur un PostgreSQL 17 réel (service du runner), la pile hébergée étant certifiée séparément par la sonde protégée. Aucune valeur secrète n'a été journalisée ni reproduite.

## 3. Livraison Git

| Commit | Contenu |
|---|---|
| `3c9f8b7` | OCR serveur, sonde pile, chaîne initiale, workflows, tests |
| `31fa43b` | chaîne 01→57 rendue rejouable (5 correctifs), contrats mis à jour |
| `a8684b1` | amorce temporaire `pull_request` pour enregistrer le `workflow_dispatch` |
| `ab0c1fd` | retour au `workflow_dispatch` seul |
| `f1ee633` | CI sans nouvelle valeur secrète, concurrence SSL/pooler |
| `985d0dd` | garde-fous de connexion (délais, fermeture bornée) |
| `a67c90b` | SSL hébergé sans vérification de chaîne auto-signée |
| `b2f3da4` | préservation de l'URI secrète (pas de réencodage) |
| `81d511d` | certification CI verte sans dépendance au secret DB périmé |
| `4f7150f` | test de coût de démonstration daté explicitement |
| `e26596f` | rapport de certification production complété (documentation seule) |

Branche `arena/923a4433-patsygest`, base `da5857d`, PR #26 <https://github.com/Youcef16052008/PatsyGest/pull/26> **OPEN**.

## 4. Chaîne 01→57 rejouée sur le pilote

| Preuve | Valeur |
|---|---|
| Fichiers / fragments | 56 fichiers, 12 fragments |
| Taille | 440543 octets |
| SHA-256 | `e54c0881712e705912a87b7edd982cbc67e7c3e3a896b2a3be977eefc469b2bf` |
| MD5 | `ec2971b1c441ae3a7601dba0d456a72b` |
| Correctifs de rejouabilité | 5 (4 sur `creer_of` 4 arguments, 1 sur `clotures.revision`/`agent_id`) |

Procédure réellement exécutée sur `gmmjrzyhvihxvaqvuoxy` : rechargement des 12 fragments depuis GitHub `31fa43b` via `extensions.http_get` dans `public._patisgest_chain_sql` (vérification 440543 octets / MD5 `ec2971b…`), puis `drop schema public cascade` et rejeu complet avec amorçage Supabase (`rls_auto_enable()` et event trigger `ensure_rls`) conservé dans `_patsygest_replay`.

Résultat : `{"ok":true,"details":{"md5":"ec2971b1c441ae3a7601dba0d456a72b","tables":47,"staging":0,"version":57,"bootstrap":2,"fonctions":75}}`. Contrôles finaux : version 57, staging 0, objets 54/56/57 présents, 14 fonctions `extensions.http*`, aucune fonction/vue utilisant `current_date`, une seule surcharge `creer_of`, trigger RLS actif, projet `ACTIVE_HEALTHY`.

## 5. Production Supabase conservée

`evepzygucfxarpdnflzv` : `schema_version=57`, objets 54 (`vitrine_sources_recentes`, `patisgest_verifier_source_vitrine(text,text)`), 56 (`utilisateurs.langue`, `enregistrer_langue_utilisateur(text)`), 57 (`importer_pack_patisserie_dz(text,text)`) présents ; bucket `patsygest-ocr` privé (10 Mio, PNG/JPEG/WEBP) ; Auth `site_url=https://patsy-gest-all-intelligence.vercel.app`, `disable_signup=true` ; 8 services `ACTIVE_HEALTHY` (GoTrue v2.199.0, db, pooler, rest, storage, realtime, pg_bouncer). Aucune migration supplémentaire n'a été appliquée en production dans cette passe.

## 6. Déploiements Vercel

| Déploiement | Commit | État | Alias |
|---|---|---|---|
| `dpl_AAB6vX2CNHBSBG8s4YVebyX1uL43` | `31fa43b` | READY / PROMOTED | production + branche |
| `dpl_BhB8UvwddL4HFJRLCQZex1KLwyku` | `81d511d` | READY / PROMOTED, `timeToReady=23046 ms` | production + branche |
| `dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7` | `e26596f` (HEAD avant ce rapport) | READY / PROMOTED, `timeToReady=16253 ms` | `patsy-gest.vercel.app`, `patsy-gest-all-intelligence.vercel.app`, branche |

Les deux créations utilisent un `git_source` étroit (`type=github`, `repoId=1460447340`, `ref=arena/923a4433-patsygest`, `sha` exact) et `project_settings:null`, sans modifier de variable d'environnement. Sonde publique : `GET https://patsy-gest.vercel.app/api/health` → `200 {"ok":true,"service":"patisgest"}`. Cible de rollback inchangée : `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3` (`da5857d`), non promue.

## 7. CI distante

Workflow `433163960` « Certification production · pile réelle », `workflow_dispatch` uniquement, dispatché sur `arena/923a4433-patsygest` avec `base_url=https://patsy-gest.vercel.app`.

| Run | Commit | Conclusion | Cause |
|---|---|---|---|
| `46068634890` | `a8684b1` | succès (amorce PR, 7 s) | enregistrement du workflow |
| `46068820710` | `ab0c1fd` | échec | `SUPABASE_URL` absent ; concurrence hébergée instable |
| `46070200593` | `f1ee633` | échec | `URL is not a constructor` (constante `URL` masquant le global) |
| `46070868054` | `985d0dd` | échec | `self-signed certificate in certificate chain` |
| `46071101268` | `a67c90b` | échec | réencodage de l'URI secrète → `password authentication failed` |
| `46071412991` | `b2f3da4` | échec | secret `SUPABASE_DB_URL` existant mais refusé par le pooler |
| `46107593561` | `81d511d` | **succès** | 3 jobs verts : contrats OCR/chaîne/types/lint, PostgreSQL 17 réel, pile hébergée |
| `46108677405` | `4f7150f` | **succès** | même périmètre après datation explicite du test de coût |
| `46108774768` | `e26596f` | **succès** | même périmètre sur le commit de rapport ; les jobs rejouent `typecheck`, `lint`, contrats, PostgreSQL 17 réel et pile hébergée |

Les runs verts valident : `typecheck`, `lint`, contrats OCR et chaîne, `test:cert:postgresql`, `test:cert:concurrency` sur PostgreSQL 17, puis `test:cert:hosted` (Auth, PostgREST, Storage, version ≥ 57, bucket privé, sonde `/api/health/stack` protégée). Le seul commit postérieur au run vert `46108774768` est la mise à jour de ce rapport : aucun fichier exécuté par la CI n'a changé depuis.

## 8. Validations locales sur le commit final

| Contrôle | Résultat |
|---|---|
| `npm test` | 912 tests, **906 pass**, 0 fail, 3 skipped, 3 todo |
| `npm run typecheck` | OK |
| `npm run lint` | OK |
| `npm run test:cert:ocr` | 7/7 |
| `npm run build` | OK (Next 16.4.6) |
| `npm audit --omit=dev` | 0 vulnérabilité |
| `git diff --check` | OK |

Le test `Wave A : demo-workspace…` dépendait de la date réelle : la DLC du beurre du jeu de démonstration (`2026-11-27`) étant dépassée, le coût FEFO devenait incomplet. La date de référence est désormais explicite (`asOf="2026-11-24"`), ce qui rend le test reproductible.

## 9. Ce que cette vague ne prouve pas

- Aucun rollback à chaud exécuté : pas de preuve de restauration d'alias en conditions réelles.
- La concurrence PostgreSQL est prouvée sur un PostgreSQL 17 réel du runner, pas sur le pooler hébergé (secret refusé, non modifié par décision `secrets=existing`).
- Aucun déploiement en préproduction ni test de charge ; aucune mesure de FCP réel.
- Aucune conformité RGPD exhaustive ni validation humaine B.2 ; la traduction AR reste machine + curations locales.
- Aucun write Figma/Drive ; aucun workflow de cron ou de sauvegarde dispatché.
- PR #26 toujours OPEN : la fusion reste une décision humaine.
