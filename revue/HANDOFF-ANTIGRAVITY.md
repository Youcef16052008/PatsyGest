# Passation : PatsyGest, reste à faire

Document destiné à l'agent qui reprend le travail (Antigravity). À lire en entier avant toute action.
Source de vérité : `revue/PLAN-CORRECTIF.md` (section « État après la suite », ligne par ligne) et `revue/REVUE-CODE-PATISGEST.md`.

## 1. État du dépôt

- Dépôt : `Youcef16052008/PatsyGest`. Branche de travail : `arena/27fe0740-patsygest`, issue de `main` (`2fba72c`).
- Application : `patisgest-app/` (Next.js + Supabase). Migrations SQL : `patisgest-app/supabase/`.
- Tout le travail de revue est sur la branche et poussé. Une PR a été ouverte vers `main` (numéro indiqué dans le message de fin de session).
- Dernier contrôle complet avant passation : `tsc` 0, lint 0, `npm test` 416 réussis, 2 ignorés (les tests PostgreSQL réel, sans `PATSYGEST_PG_URL`).

## 2. Règles non négociables

1. **Ne jamais appliquer une migration au pilote** sans validation humaine explicite. Les migrations `33` à `38` ne sont pas appliquées.
2. **Ne jamais éditer une migration déjà appliquée** (`01` à `31`, et `32` à `36` une fois appliquées au pilote). Toute correction passe par une nouvelle migration à gardes strictes.
3. **Les migrations `01` à `31` sont figées par empreinte SHA-256** (`migrations/repetition.json`, testées par `tests/migrations-repetition.test.mjs`). Toute nouvelle migration doit être classée dans ce manifeste, avec son empreinte, et la liste de `tests/migrations-repetition.test.mjs` doit être étendue.
4. **Les brouillons de sécurité sont dans `supabase/brouillons/`** (101 à 128). Ce ne sont pas des migrations de déploiement.
5. **Les probes et scripts exploratoires ne vont jamais dans `tests/`.** Les vérifications sont des tests permanents nommés.
6. **Les tests d'exécution remplacent les tests textuels** quand c'est possible. Un test qui lit du code source ne prouve pas un comportement.
7. **Ne jamais commiter de secret.** `.env.example` documente les variables, sans valeur.
8. Ne jamais forcer un push. Ne jamais créer ni pousser sur une autre branche que celle de la session.

## 3. Reste à faire, par priorité

### 3.1 Décisions humaines bloquantes avant pilote

| Sujet | Action | Qui |
|---|---|---|
| Relecture des migrations `33` à `38` | Lire `revue/PLAN-CORRECTIF.md` (section « Revue de vigilance »), point par point. | Humain, puis agent sur demande |
| Application au pilote | Ordre strict `33 → 34 → 35 → 36 → 37 → 38`. Chaque migration vérifie son prérequis. Déployer l'application seulement après `35`. | Humain uniquement |
| Secret anti-abus | Générer 32 caractères minimum, le mettre dans l'environnement de production (`VITRINE_SECRET_ANTI_ABUS`). Ne jamais le commiter. Sans secret, seul le plafond global s'applique (repli, pas de panne). | Humain |
| Conformité du hachage par source | Le HMAC de l'IP reste une donnée pseudonyme pendant 2 heures. Faire valider au regard de la loi 18-07. | Humain (juridique) |
| Limitation au bord | Le plafond par source ne protège pas contre un botnet qui change d'adresse. Configurer une limitation chez l'hébergeur. | Humain |

### 3.2 Travail d'implémentation restant

**a. Branchement du transfert idempotent (B-007).**
- La migration `37` est écrite et testée, mais pas branchée.
- Une fois `37` appliquée au pilote : modifier l'action de transfert (`src/lib/actions-stock.ts`, fonction `transferReal`) pour appeler `transferer_article_ref` avec une `client_ref` générée côté formulaire (une par ouverture de formulaire). Garder le repli actuel sur la signature à 6 paramètres.
- Puis passer `VERSION_SCHEMA_REQUISE` (`src/lib/schema-version.ts`) de `36` à `37`, et mettre à jour `tests/schema-version-db.test.mjs`.
- Tests à étendre : vérifier qu'un formulaire envoyé deux fois ne déplace le stock qu'une fois (le test réel existe déjà côté base : `tests/concurrence-transfert-reel.test.mjs`).

**b. Bascule vitrine (B-008).**
- La migration `38` et le code serveur (`src/lib/vitrine-anti-abus.ts`, `src/app/(vitrine)/vitrine/[slug]/commander/actions.ts`) sont écrits et testés.
- Aucune action si le secret n'est pas configuré : le code se replie sur le plafond global.

**c. Matrice app × schéma (F-19, « non fait »).**
- Écrire un test qui vérifie, pour chaque vue et chaque fonction lues par l'application, qu'elle existe dans le schéma déployé à la version requise.

**d. Lint textuel restant (« partiel »).**
- Les tests de `tests/securite.test.mjs` qui lisent encore le code TypeScript (routes, actions, rôles) doivent devenir des tests d'exécution : il faut des mocks de session et de Supabase.
- Ne pas supprimer un test textuel avant d'avoir un test d'exécution qui couvre le même comportement.

**e. Clés composites (B-002, « non fait »).**
- Une quarantaine de relations. Migration à données existantes, à faire avec relecture humaine. Le pilote compte 1 client et 0 incohérence, mais le risque est multi-client.
- Ne pas démarrer sans décision de l'humain sur l'ordre et les données.

**f. Phase 4 Playwright (« non fait »).**
- Quatre parcours à couvrir : caisse, stock, transfert, vitrine (commande).
- Impossible dans le sandbox actuel (navigateurs non téléchargeables). À faire sur une machine qui a Chromium : `npx playwright install chromium`.

**g. Vérification CI.**
- Le workflow `.github/workflows/ci.yml` lance un service `postgres:17` et `PATSYGEST_PG_URL`. Vérifier, à l'ouverture de la PR, que les deux tests `concurrence-transfert-reel` passent (et ne sont plus ignorés).

**h. Sauvegarde (B-011).**
- `sauvegarde-free.yml` est écrit mais jamais exécuté. Le vérifier au premier run manuel, et lire la procédure de déchiffrement des anciennes copies `.enc` (AES-CBC, décrites dans le résumé du plan).

### 3.3 Points de vigilance connus

- **Migration 33** : le contrôle de tenant ne couvre que les tables qui ont une colonne `client_id`. Une table fille sans `client_id` n'est pas vérifiée. À relire.
- **Migration 34** : patch textuel de `terminer_of`, gardé. Les coûts déjà enregistrés ne sont pas recalculés (décision F-20). Pas de retour arrière automatique.
- **Migration 36** : le remplacement de `current_date` touche aussi les commentaires et chaînes des fonctions. Sans effet fonctionnel.
- **F-08** : les droits par défaut PostgreSQL ne retirent pas PUBLIC des nouvelles fonctions (mesuré sur PostgreSQL 17.12). La garde est `tests/droits-execution-db.test.mjs`. Ne pas tenter de corriger par `ALTER DEFAULT PRIVILEGES`.
- **Pilote** : 12 articles à prix 0 ont été renseignés (trace dans `revue/donnees-prix-zero-pilote.sql`). Ne pas rejouer ce fichier.
- **Décision F-20** : seules les nouvelles clôtures de lots sont corrigées. Les OF déjà valorisés ne sont pas recalculés.

## 4. Comment vérifier l'état

```bash
cd patisgest-app
npm ci
npm run lint
npx tsc --noEmit
npm test
```

Vérification sur PostgreSQL réel (hors du dépôt) :

```bash
# Installer un Postgres 17 embarqué dans un dossier temporaire, pas dans le dépôt
mkdir -p /tmp/pgreal && cd /tmp/pgreal
npm install embedded-postgres@17.12.0-beta.19 pg@8
B=$PWD/node_modules/@embedded-postgres/linux-x64/native/bin
$B/initdb -D $PWD/data -U postgres --auth=trust
$B/pg_ctl -D $PWD/data -o "-p 54329 -k /tmp -c listen_addresses=127.0.0.1" -l server.log -w start
cd ~/PatsyGest/patisgest-app
PATSYGEST_PG_URL=postgres://postgres@127.0.0.1:54329/postgres npm test
```

## 5. Outils à utiliser

| Outil | Usage | Limite |
|---|---|---|
| `git` | État, diff, commit, push sans force sur la branche de session | Ne jamais changer de branche |
| `gh` | PR, checks, fusion | Fusion : `gh pr merge <numéro> --merge` en dernière commande, sans `--auto` |
| `npm` / Node 22 | Lint, typecheck, tests | Dépendances via registre npm uniquement |
| PostgreSQL 17 réel (embarqué, voir §4) | Tests de concurrence et de chaîne | Hors dépôt, dans `/tmp` |
| Connecteur Supabase | Lecture seule sur le pilote, si l'humain le demande | Aucune écriture, aucune migration appliquée sans validation |
| Connecteur Vercel | Variables d'environnement de production (secret anti-abus), uniquement sur demande humaine | Ne jamais afficher de valeur de secret |
| Playwright | Parcours navigateur (§3.2.f) | Nécessite Chromium, absent du sandbox |
| Figma / Google Drive | Non nécessaires pour ce chantier | — |

Aucune skill propre au dépôt n'est documentée. Si l'environnement d'Antigravity en fournit pour Next.js, Supabase ou PostgreSQL, elles sont utiles pour les points §3.2.a et §3.2.c.

## 6. Ordre de reprise recommandé

1. Lire ce document et `revue/PLAN-CORRECTIF.md`.
2. Lancer le §4 : tout doit être vert avant de modifier quoi que ce soit.
3. Attendre la relecture humaine des migrations `33` à `38` (§3.1).
4. Une fois `37` appliquée au pilote par un humain : §3.2.a.
5. Matrice app × schéma (§3.2.c), puis lint textuel restant (§3.2.d).
6. Playwright (§3.2.f) sur une machine avec navigateur.
