# 00 — INDEX MAÎTRE DE L’AUDIT FORENSIQUE (MODE A)

**Dépôt** : `Youcef16052008/PatsyGest` · **Branche** : `arena/923a4433-patsygest` · **Base** : `da5857dddab46842e5029d1c745f93e89265a013` · **Date** : 2026-11-26 (UTC).

> **Loi fondamentale appliquée** : seul le code exécutable a servi à établir les faits ci-dessous.
> Les `README.md`, guides, commentaires, JSDoc, noms de tests et documents `.md`/`.docx`/`.pdf` ont été
> **inventoriés mais jamais crus** : ils sont tous affectés à la tranche 20 comme *affirmations hostiles*
> à confronter au code (`DRIFT-DOC`). Les commentaires présents dans les fichiers sources ont été lus
> comme des hypothèses, pas comme des preuves.

---

## 1. Périmètre et méthode de cartographie

- Inventaire réel : **580 fichiers** (hors `.git`, `node_modules`, artefacts de build).
- Livrables d’audit ajoutés : **22 fichiers** (`00-INDEX.md` + `01`…`20` + l’artefact consolidé unique).
- **Matrice de propriété : 602 fichiers, exactement une tranche chacun**, 0 doublon, 0 orphelin.
- Fichiers de code (ts/tsx/mjs/js/sql/yml/sh/pgsql/json/css/html/example/d.ts) : **507**, **75 814 lignes**.
- Sources applicatives `patisgest-app/src/**` : **242 fichiers TS/TSX**, **37 244 lignes** (CSS inclus dans ce total).
- Découpage : 5 couches / 20 tranches orthogonales ; les fichiers « partagés » sont découpés **par symbole/responsabilité** (§5).
- Aucune modification du code produit : seuls les fichiers `audit/*.md` sont créés.

### 1.1 Ce qui a été exécuté pour produire cet index (honnêteté radicale)

| Commande | Statut | Sortie brute (extrait) |
|---|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | **EXÉCUTÉ** | `added 402 packages in 16s` ; `npm warn deprecated eslint@9.39.4` |
| `npm test` | **EXÉCUTÉ** | `# tests 788` · `# suites 0` · `# pass 781` · `# fail 0` · `# cancelled 0` · `# skipped 3` · `# todo 4` · `# duration_ms 248936.313588` |
| `npm run typecheck` (`tsc --noEmit`) | **EXÉCUTÉ** | aucune erreur (sortie = en-tête npm uniquement) |
| `npm run lint` (`eslint .`) | **EXÉCUTÉ** | aucune erreur (sortie = en-tête npm uniquement) |
| `npm run build` | **NON EXÉCUTÉ** | `[STATIQUE UNIQUEMENT]` — non requis pour la cartographie |
| `npm audit --omit=dev` | **NON EXÉCUTÉ** | `[STATIQUE UNIQUEMENT]` — la CI l’exécute (`ci.yml:46`) |
| `node --test tests/e2e/*.spec.mjs` (Playwright) | **NON EXÉCUTÉ** | navigateurs Chromium non installés (`--ignore-scripts`) ; `[STATIQUE UNIQUEMENT]` |
| PostgreSQL / Supabase réels, PostgREST, Auth | **NON EXÉCUTÉ** | `psql` et `pg_isready` absents, `PATSYGEST_PG_URL` absent, aucun secret ; `[STATIQUE UNIQUEMENT]` |

**Sortie brute de `npm test` (fin du flux TAP, telle qu’observée)** :

```text
1..785
# tests 788
# suites 0
# pass 781
# fail 0
# cancelled 0
# skipped 3
# todo 4
# duration_ms 248936.313588
```

**Sortie brute de `npm ci`** : `added 402 packages in 16s` (avec `npm warn deprecated eslint@9.39.4`).
`npm run typecheck` et `npm run lint` n’ont produit aucune ligne d’erreur, uniquement l’en-tête npm.
Deux avertissements de type de module ont été observés pendant `npm test`
(`workspace-nav.ts`, `z-input.ts`) ; ils ne font pas échouer la suite.


> **Limites d’environnement déclarées** : pas de base de données réelle, pas de navigateur, pas de
> secrets de production, pas de pile Supabase locale (CLI/Auth/PostgREST), pas de serveur `next start`.
> Les 3 tests `skipped` correspondent à `tests/concurrence-transfert-reel.test.mjs:19-20` exécuté sans
> `PATSYGEST_PG_URL` ; la CI fournit cette variable (`.github/workflows/ci.yml:37`). Les 4 `todo`
> = 1 `test.todo` (`tests/chaine-rejouable.test.mjs:20`) + 3 options `{ todo: ... }`. Les 231 ancres `fichier:ligne` des prompts ont été
> **vérifiées** (fichier existant + numéro de ligne dans le fichier) : 0 ancre invalide.

### 1.2 Métriques factuelles extraites du code

| Métrique | Valeur | Méthode de comptage |
|---|---:|---|
| Migrations SQL de la série main | 53 | `patisgest-app/supabase/NN-*.sql` |
| **Chaîne de déploiement `chaineDeploiement()`** | **52** | `repetition.json` : 22 `historique` + 30 `main_hors_serie`, `tests/migrations-historique.mjs:23-25` |
| Fichiers exclus de la chaîne | 1 | `exclus` = `02-seed-pilote.sql` (seed vise `auth.users`) |
| `53-caisse-ticket-scope.sql` dans la chaîne | OUI | entrée `main_hors_serie`, **pas une preuve d’application sur le pilote** |
| Chaîne `migrationsRepetition()` | 50 | 22 `historique` + 28 `brouillons_securite`, `tests/migrations-historique.mjs:6-8` |
| Brouillons SQL (101–128) | 28 | `patisgest-app/supabase/brouillons/*.sql` |
| Fixtures SQL de vitrine | 7 | `patisgest-app/tests/fixtures/pilote-vitrine/*.sql` (7, sous-ensemble de `main_hors_serie`) |
| Fichiers `*.test.mjs` | 121 | 120 dans `patisgest-app/tests/` + 1 `design-studio/tests/` |
| Fichiers important `node:test` | 129 | grep sur tout `tests/**` |
| Appels `test(...)`/`it(...)` dans le glob `npm test` | 873 | `grep -rhcE "\b(test\|it)\(" patisgest-app/tests/*.test.mjs` |
| Appels `test(...)`/`it(...)` dans tous les scripts `.mjs` | 928 | 922 dans `patisgest-app/tests/**` + 6 dans `design-studio/tests/**` |
| Scripts `.mjs` hors glob `npm test` | 21 | 6 à la racine de `tests/`, 15 dans `e2e/`, `integration/`, `mocks/`, `support/` |
| Fichiers `"use server"` | 29 | lignes de directive, hors commentaires |
| Appels `getSessionContext(...)` | 71 | occurrences dans `src/**` |
| **Déclarations de fonctions SQL** | 151 | parseur `CREATE [OR REPLACE] FUNCTION` sur les 88 SQL catalogués |
| **Fonctions privilégiées `SECURITY DEFINER`** | **142** | même parseur : 78 main / 58 brouillons / 6 fixtures |
| Lignes SQL `set search_path` | 149 | hors commentaires |
| Lignes SQL `GRANT`/`REVOKE` | 347 | début de ligne, hors commentaires |
| Lignes SQL `CREATE POLICY` | 88 | hors commentaires |
| Lignes SQL `FOR UPDATE` | 63 | hors commentaires (inclut les clauses de policy `FOR UPDATE`) |
| Blocs `catch` (AST TypeScript) | 246 | 242 fichiers `.ts`/`.tsx` de `src/**` |
| `catch` sans variable | 186 | AST `CatchClause.variableDeclaration == null` |
| **`catch` réellement vides** | **35** | AST : corps sans statement (ou uniquement commentaires), répartis dans 28 fichiers `src/**` |
| **Assertions de type `as` (AST)** | **320** | `AsExpression` dans 109 fichiers `src/**` |
| dont `as unknown as` / `as any` | 10 | grep hors commentaires |
| Assertions non-nulles `expr!` | 38 | AST `NonNullExpression` |
| Occurrences `localStorage` | 68 | dans `src/**` |
| Occurrences `Math.round(` | 158 | dans `src/**` |
| `test.skip` / `test.todo` explicites | 1 / 1 | `grep` sur `tests/**` ; 1 alias `test.skip` produit 3 sous-tests ignorés |
| Sous-tests `todo` mesurés par Node | 4 | 1 `test.todo` + 3 options `{ todo: ... }` (`of-cout-partiel-main`, `of-perte-experimentale`) |
| Documents (`.md`/`.docx`/`.pdf`) | 41 | tous affectés à T20 |
| Modules `src/lib` sans référence d’import dans `tests/**` | 6 | `admin, client, client-ref, journal-actions-communs, tomorrow-lab-private-server, vitrine` sur 118 modules `src/lib/**/*.ts` — **pas une preuve d’absence de test** |
| Modules `src/lib` sans aucune occurrence textuelle dans `tests/**` | 2 | heuristique de nommage, à confirmer par T20 |

> `npm test` ne couvre que `tests/*.test.mjs` (`package.json:16`). Sont **hors glob** : `tests/e2e/*.spec.mjs`
> (4 fichiers, `ci.yml:115` = `workflow_dispatch` uniquement), `tests/integration/*` (6), `tests/smoke-http.mjs`,
> `tests/preview-http.mjs`, `tests/mocks/*`, `tests/support/*`, `design-studio/tests/*` (`ci.yml:58`).

---

## 2. Matrice de propriété exclusive — vue synthétique

| Tranche | Titre | Couche | Fichiers | Lignes de code |
|---:|---|---|---:|---:|
| **01** | Authentification, Sessions, Identites & Tokens | Couche 1 | 37 | 4 001 |
| **02** | Autorisation, Matrice des Roles & Isolation Multi-Tenant | Couche 1 | 26 | 2 931 |
| **03** | Securite Base de Donnees, Privileges & Execution Privilegiee | Couche 1 | 24 | 3 625 |
| **04** | Surfaces Publiques, Anti-Abus & Securite Web | Couche 1 | 33 | 4 350 |
| **05** | Moteurs de Calcul, Precision Numerique & Regles Financieres | Couche 2 | 65 | 14 139 |
| **06** | Machines a Etats, Workflows & Invariants Metier | Couche 2 | 74 | 11 287 |
| **07** | Concurrence, Verrous, Isolation SQL & Idempotence | Couche 2 | 19 | 2 231 |
| **08** | Modele de Donnees, Contraintes, Fuseaux Horaires & Integrite Referentielle | Couche 2 | 19 | 2 442 |
| **09** | Contrats API, Validation d'Entrees & Serialisation | Couche 3 | 18 | 1 827 |
| **10** | Etat Client, Hydratation, Caches & Coherence UI-Serveur | Couche 3 | 18 | 1 553 |
| **11** | Mode Hors-Ligne, PWA, Files d'Attente & Stockage Local | Couche 3 | 21 | 2 197 |
| **12** | Fichiers, Medias, Imports/Exports & Contenu Externe | Couche 3 | 47 | 1 838 |
| **13** | Fiabilite Runtime, Gestion d'Erreurs & Reprise sur Panne | Couche 4 | 5 | 194 |
| **14** | Performance Applicative, Complexite & Ressources | Couche 4 | 12 | 2 725 |
| **15** | Performance Base de Donnees & Scalabilite | Couche 4 | 10 | 1 057 |
| **16** | Architecture, Maintenabilite, Typage & Code Mort | Couche 4 | 14 | 2 550 |
| **17** | Build, Configuration, Secrets & Supply Chain | Couche 5 | 17 | 7 545 |
| **18** | CI/CD, Migrations, Sauvegarde, Restauration & Rollback | Couche 5 | 53 | 4 533 |
| **19** | Observabilite, Auditabilite, PII & Exploitation | Couche 5 | 22 | 2 876 |
| **20** | Meta-Audit des Tests & Derive Code-Documentation | Couche 5 | 68 | 1 913 |
| | **TOTAL** | | **602** | |

### 2.1 Répartition par type de fichier (indicative)

| Extension | Fichiers |
|---|---:|
| `.mjs` | 151 |
| `.ts` | 130 |
| `.tsx` | 114 |
| `.sql` | 90 |
| `.md` | 35 |
| `.webp` | 18 |
| `.css` | 6 |
| `.json` | 6 |
| `.docx` | 5 |
| `.yml` | 4 |
| `.txt` | 4 |
| `.woff2` | 4 |
| `.png` | 3 |
| `(sans ext)` | 2 |
| `.sh` | 2 |
| `.pdf` | 1 |
| `.svg` | 1 |
| `.html` | 1 |
| `.example` | 1 |
| `.js` | 1 |
| `.pgsql` | 1 |

---

## 3. Matrice de propriété exclusive — liste exhaustive

Chaque ligne = un fichier du dépôt (ou un livrable d’audit) = **une seule tranche propriétaire**.
`L` = nombre de lignes (0 pour les binaires / fichiers non textuels).

| Fichier | T | L | Responsabilité / symbole propriétaire |
|---|---:|---:|---|
| `.github/workflows/ci.yml` | 18 | 218 | CI/CD, sauvegarde, pile isolee |
| `.github/workflows/cron-connectivite.yml` | 19 | 79 | tache planifiee et alertes |
| `.github/workflows/sauvegarde-free.yml` | 18 | 184 | CI/CD, sauvegarde, pile isolee |
| `.github/workflows/supabase-isole.yml` | 18 | 152 | CI/CD, sauvegarde, pile isolee |
| `.gitignore` | 17 | 30 | configuration de build/runtime et secrets |
| `AUDIT-CONFORMITE-CDC-CODE.md` | 20 | 508 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `ETUDE-MARCHE-PATISSERIES-DZ-2026.md` | 20 | 129 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `GUIDE-PILOTE.md` | 20 | 285 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `NOTE-COUT-MINIMAL.md` | 20 | 200 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `NOTE-HEBERGEMENT.md` | 20 | 270 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PLAN-AMELIORATION-PATISGEST.md` | 20 | 214 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PROTOCOLE-QUALIFICATION-MATERIELLE.md` | 20 | 252 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/01-Cahier-des-Charges-PatisGest-v4.docx` | 20 | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/01-Cahier-des-Charges-PatisGest-v4.md` | 20 | 427 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/02-Architecture-Technique-PatisGest-v4.docx` | 20 | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/02-Architecture-Technique-PatisGest-v4.md` | 20 | 328 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.docx` | 20 | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.md` | 20 | 176 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/04-Plan-Attaque-1-Pilote.docx` | 20 | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/04-Plan-Attaque-1-Pilote.md` | 20 | 138 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/05-Kit-Phase0-Terrain.docx` | 20 | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/05-Kit-Phase0-Terrain.md` | 20 | 122 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/06-Maquettes-Onboarding.pdf` | 20 | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `README.md` | 20 | 59 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `audit/00-INDEX.md` | 20 | 888 | index maitre et matrice de propriete |
| `audit/01-authentification-sessions.md` | 01 | 185 | prompt autonome MODE B de cette tranche |
| `audit/02-autorisation-rbac-tenant.md` | 02 | 173 | prompt autonome MODE B de cette tranche |
| `audit/03-securite-base-rls.md` | 03 | 177 | prompt autonome MODE B de cette tranche |
| `audit/04-surfaces-publiques-anti-abus.md` | 04 | 189 | prompt autonome MODE B de cette tranche |
| `audit/05-calculs-precision-financiere.md` | 05 | 228 | prompt autonome MODE B de cette tranche |
| `audit/06-machines-etat-workflows.md` | 06 | 229 | prompt autonome MODE B de cette tranche |
| `audit/07-concurrence-verrous-idempotence.md` | 07 | 170 | prompt autonome MODE B de cette tranche |
| `audit/08-modele-donnees-fuseaux.md` | 08 | 173 | prompt autonome MODE B de cette tranche |
| `audit/09-contrats-api-validation.md` | 09 | 168 | prompt autonome MODE B de cette tranche |
| `audit/10-etat-client-hydratation-caches.md` | 10 | 171 | prompt autonome MODE B de cette tranche |
| `audit/11-hors-ligne-pwa-files-locales.md` | 11 | 172 | prompt autonome MODE B de cette tranche |
| `audit/12-fichiers-medias-imports-exports.md` | 12 | 188 | prompt autonome MODE B de cette tranche |
| `audit/13-fiabilite-runtime-erreurs.md` | 13 | 155 | prompt autonome MODE B de cette tranche |
| `audit/14-performance-applicative.md` | 14 | 159 | prompt autonome MODE B de cette tranche |
| `audit/15-performance-base-scalabilite.md` | 15 | 153 | prompt autonome MODE B de cette tranche |
| `audit/16-architecture-maintenabilite.md` | 16 | 162 | prompt autonome MODE B de cette tranche |
| `audit/17-build-config-secrets-supply-chain.md` | 17 | 161 | prompt autonome MODE B de cette tranche |
| `audit/18-cicd-migrations-sauvegardes.md` | 18 | 205 | prompt autonome MODE B de cette tranche |
| `audit/19-observabilite-audit-pii.md` | 19 | 168 | prompt autonome MODE B de cette tranche |
| `audit/20-meta-audit-tests-drift.md` | 20 | 238 | prompt autonome MODE B de cette tranche |
| `audit/MODE-A-CONSOLIDE-UN-SEUL-FICHIER.md` | 20 | 0 | artefact de transmission unique: index + 20 prompts en un seul Markdown (L=0, genere apres metriques) |
| `design-studio/README.md` | 20 | 46 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `design-studio/public/app.css` | 16 | 375 | module autonome du studio de maquettes |
| `design-studio/public/assets/croissant.webp` | 12 | 0 | media / police du prototype |
| `design-studio/public/assets/eclair.webp` | 12 | 0 | media / police du prototype |
| `design-studio/public/assets/fraunces-OFL.txt` | 12 | 93 | media / police du prototype |
| `design-studio/public/assets/fraunces.woff2` | 12 | 0 | media / police du prototype |
| `design-studio/public/assets/hero.webp` | 12 | 0 | media / police du prototype |
| `design-studio/public/assets/manrope-OFL.txt` | 12 | 93 | media / police du prototype |
| `design-studio/public/assets/manrope.woff2` | 12 | 0 | media / police du prototype |
| `design-studio/public/assets/pain.webp` | 12 | 0 | media / police du prototype |
| `design-studio/public/assets/studio.svg` | 12 | 0 | media / police du prototype |
| `design-studio/public/assets/tarte.webp` | 12 | 0 | media / police du prototype |
| `design-studio/public/icons.mjs` | 16 | 33 | module autonome du studio de maquettes |
| `design-studio/public/index.html` | 16 | 26 | module autonome du studio de maquettes |
| `design-studio/public/model.mjs` | 16 | 103 | module autonome du studio de maquettes |
| `design-studio/public/studio.css` | 16 | 164 | module autonome du studio de maquettes |
| `design-studio/public/studio.mjs` | 16 | 271 | module autonome du studio de maquettes |
| `design-studio/public/views.mjs` | 16 | 263 | module autonome du studio de maquettes |
| `design-studio/serve.mjs` | 16 | 38 | module autonome du studio de maquettes |
| `design-studio/tests/model.test.mjs` | 20 | 58 | test du prototype |
| `patisgest-app/.env.example` | 17 | 96 | configuration de build/runtime et secrets |
| `patisgest-app/.gitignore` | 17 | 12 | configuration de build/runtime et secrets |
| `patisgest-app/AGENTS.md` | 20 | 9 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/AUDIT-PHASE-1.md` | 20 | 159 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/CHECKLIST-60.md` | 20 | 107 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/PLAN-CLOTURE.md` | 20 | 174 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/README.md` | 20 | 337 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/SECURITE-COMPTES.md` | 20 | 138 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/eslint.config.mjs` | 17 | 7 | configuration de build/runtime et secrets |
| `patisgest-app/migrations/APPLICATION-39-42.md` | 20 | 176 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md` | 20 | 131 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/EQUIPE-MODULE-INACTIF.md` | 20 | 130 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/ETAT-RESTAURATION.md` | 20 | 32 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/RI-04-unicite-lot.md` | 20 | 127 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/SAUVEGARDE-EXPERIMENTALE.md` | 20 | 42 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/VALIDATION-CONFIDENTIALITE-ROLES.md` | 20 | 205 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/VUES-ROLES-ABSENTES.md` | 20 | 191 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/propositions/cloture-of-perte-experimentale.sql` | 18 | 87 | chaine de migrations, manifeste, propositions et snapshots |
| `patisgest-app/migrations/repetition.json` | 18 | 433 | chaine de migrations, manifeste, propositions et snapshots |
| `patisgest-app/migrations/snapshots/pilote-v38-2026-11-23.md` | 20 | 59 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/next-env.d.ts` | 17 | 7 | configuration de build/runtime et secrets |
| `patisgest-app/next.config.ts` | 17 | 24 | configuration de build/runtime et secrets |
| `patisgest-app/package-lock.json` | 17 | 7089 | configuration de build/runtime et secrets |
| `patisgest-app/package.json` | 17 | 47 | configuration de build/runtime et secrets |
| `patisgest-app/postcss.config.mjs` | 17 | 7 | configuration de build/runtime et secrets |
| `patisgest-app/public/appearance/croissant.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/appearance/eclair.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/appearance/fraunces-OFL.txt` | 12 | 93 | media / asset statique |
| `patisgest-app/public/appearance/fraunces.woff2` | 12 | 0 | media / asset statique |
| `patisgest-app/public/appearance/hero.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/appearance/manrope-OFL.txt` | 12 | 93 | media / asset statique |
| `patisgest-app/public/appearance/manrope.woff2` | 12 | 0 | media / asset statique |
| `patisgest-app/public/appearance/owner-patisserie.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/appearance/pain.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/appearance/tarte.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/icons/apple-touch-icon.png` | 12 | 0 | media / asset statique |
| `patisgest-app/public/icons/icon-192.png` | 12 | 0 | media / asset statique |
| `patisgest-app/public/icons/icon-512.png` | 12 | 0 | media / asset statique |
| `patisgest-app/public/recettes/baklawa.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/recettes/croissant.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/recettes/eclair.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/recettes/layer-cake.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/recettes/mille-feuille.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/recettes/pain-chocolat.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/recettes/tarte-citron.webp` | 12 | 0 | media / asset statique |
| `patisgest-app/public/sw.js` | 11 | 154 | Service Worker et strategie de cache |
| `patisgest-app/scripts/coffre-sauvegarde.mjs` | 12 | 66 | chiffrement du coffre de sauvegarde |
| `patisgest-app/scripts/db-push-disabled.mjs` | 17 | 4 | garde anti db:push |
| `patisgest-app/src/app/(app)/[module]/page.tsx` | 02 | 455 | garde d'acces aux modules et roles |
| `patisgest-app/src/app/(app)/error.tsx` | 13 | 13 | boundary d'erreur espace connecte |
| `patisgest-app/src/app/(app)/layout.tsx` | 01 | 87 | garde de session allowLocked (symboles initialBundle/DemoWorkspaceProvider -> T10) |
| `patisgest-app/src/app/(app)/mentions-legales/page.tsx` | 19 | 139 | mentions legales et donnees personnelles |
| `patisgest-app/src/app/(app)/parametres/page.tsx` | 02 | 349 | parametres: modules, equipe, sites, roles |
| `patisgest-app/src/app/(app)/tableau-de-bord/page.tsx` | 14 | 92 | assemblage des donnees du tableau de bord |
| `patisgest-app/src/app/(auth)/connexion/login-form.tsx` | 01 | 146 | formulaire login/signup |
| `patisgest-app/src/app/(auth)/connexion/page.tsx` | 01 | 32 | page de connexion |
| `patisgest-app/src/app/(auth)/rejoindre/page.tsx` | 01 | 37 | acceptation d'invitation |
| `patisgest-app/src/app/(vitrine)/layout.tsx` | 04 | 33 | layout public vitrine |
| `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts` | 04 | 109 | Server Action anonyme de commande |
| `patisgest-app/src/app/(vitrine)/vitrine/[slug]/page.tsx` | 04 | 145 | rendu public par slug |
| `patisgest-app/src/app/api/cron/connectivite/route.ts` | 19 | 36 | route cron et authentification Bearer |
| `patisgest-app/src/app/api/export/comptable/route.ts` | 12 | 170 | export comptable CSV |
| `patisgest-app/src/app/api/export/route.ts` | 12 | 82 | export CSV generique |
| `patisgest-app/src/app/api/health/route.ts` | 19 | 20 | healthcheck public |
| `patisgest-app/src/app/api/licence/statut/route.ts` | 01 | 29 | statut de licence |
| `patisgest-app/src/app/api/presence/heartbeat/route.ts` | 01 | 74 | heartbeat + signature du bundle |
| `patisgest-app/src/app/api/sauvegarde/route.ts` | 18 | 81 | generation de sauvegarde JSON |
| `patisgest-app/src/app/appearance.css` | 14 | 153 | feuille de style: taille de bundle |
| `patisgest-app/src/app/error.tsx` | 13 | 13 | boundary d'erreur globale |
| `patisgest-app/src/app/estimation/page.tsx` | 04 | 55 | calculateur public sans compte |
| `patisgest-app/src/app/globals.css` | 14 | 5 | feuille de style: taille de bundle |
| `patisgest-app/src/app/hors-ligne/page.tsx` | 11 | 46 | coquille hors-ligne publique |
| `patisgest-app/src/app/layout.tsx` | 10 | 42 | layout racine: providers et metadata |
| `patisgest-app/src/app/manifest.ts` | 11 | 33 | manifest PWA |
| `patisgest-app/src/app/master/page.tsx` | 02 | 144 | entree de l'espace Master privilegie |
| `patisgest-app/src/app/page.tsx` | 01 | 14 | racine: routage selon raison de session |
| `patisgest-app/src/app/refinement.css` | 14 | 87 | feuille de style: taille de bundle |
| `patisgest-app/src/app/workspace.css` | 14 | 1011 | feuille de style: taille de bundle |
| `patisgest-app/src/components/advanced-mode-toggle.tsx` | 10 | 27 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/appearance.tsx` | 10 | 204 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/article-guide.tsx` | 08 | 68 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/avoir-form.tsx` | 06 | 130 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cake-forms.tsx` | 06 | 328 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cake-operations.tsx` | 06 | 56 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cake-ticket.tsx` | 05 | 77 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cash-closing-quick.tsx` | 06 | 264 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cash-workspace.tsx` | 10 | 57 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/charge-capacite-panel.tsx` | 05 | 129 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/client-logout.tsx` | 01 | 51 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/client-ref-field.tsx` | 07 | 17 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/closing-operations.tsx` | 06 | 359 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cloture-form.tsx` | 06 | 231 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/commande-forms.tsx` | 06 | 177 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/coquille-hors-ligne.tsx` | 11 | 213 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cost-sheet-form.tsx` | 05 | 176 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/credits-workspace.tsx` | 06 | 445 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/dashboard-workspace.tsx` | 10 | 101 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-caisse.tsx` | 16 | 201 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-dashboard.tsx` | 16 | 241 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-module.tsx` | 16 | 267 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-workspace.tsx` | 16 | 41 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/donnees-personnelles-panel.tsx` | 19 | 142 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/equipe-settings.tsx` | 02 | 106 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/etablissement-form.tsx` | 09 | 137 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/export-panel.tsx` | 12 | 102 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/express-onboarding.tsx` | 09 | 195 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/fetes-planner.tsx` | 08 | 209 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/fournisseur-form.tsx` | 06 | 31 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/free-recipes-workspace.tsx` | 14 | 900 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/guide-form.tsx` | 08 | 130 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/ingredient-impact-panel.tsx` | 05 | 480 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/invoice-photo-intake.tsx` | 12 | 317 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/journal-audit-panel.tsx` | 19 | 147 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/kitchen-lab-screen.tsx` | 06 | 381 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/lab-cake-form.tsx` | 06 | 16 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/lab-workspace.tsx` | 06 | 67 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/label-maker.tsx` | 12 | 120 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/liste-courses-panel.tsx` | 15 | 132 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/locale-provider.tsx` | 10 | 65 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/master-portal.tsx` | 02 | 515 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/module-guide.tsx` | 08 | 141 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/modules-settings.tsx` | 02 | 14 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/network-status-pill.tsx` | 11 | 94 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/of-forms.tsx` | 06 | 241 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/onboarding-panel.tsx` | 06 | 49 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/owner-day-overview.tsx` | 10 | 56 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/owner-motion-control.tsx` | 10 | 23 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/owner-price-alerts.tsx` | 05 | 266 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/pilot-dashboard.tsx` | 10 | 490 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/planning-forms.tsx` | 06 | 53 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/planning-operations.tsx` | 06 | 33 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/portion-estimator.tsx` | 05 | 977 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/product-photo-picker.tsx` | 12 | 154 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/production-board.tsx` | 06 | 44 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/production-workspace.tsx` | 06 | 58 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/quality-alerts-panel.tsx` | 06 | 45 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/quality-forms.tsx` | 06 | 122 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/quality-operations.tsx` | 06 | 24 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recall-form.tsx` | 06 | 147 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recette-guide.tsx` | 08 | 125 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recipe-operations.tsx` | 06 | 62 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recon-panel.tsx` | 05 | 183 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/rejoindre-equipe.tsx` | 01 | 32 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/restock-request-quick-form.tsx` | 06 | 169 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-composer.tsx` | 05 | 539 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-credit-fields.tsx` | 05 | 58 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-form.tsx` | 05 | 496 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-history.tsx` | 05 | 72 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-ticket.tsx` | 05 | 154 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sales-chart.tsx` | 05 | 144 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sauvegarde-panel.tsx` | 18 | 135 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/seller-blind-closing.tsx` | 07 | 237 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/service-worker.tsx` | 11 | 68 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/shop-advisor-panel.tsx` | 05 | 264 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/simulation-form.tsx` | 06 | 101 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/simulation-operations.tsx` | 06 | 25 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sites-settings.tsx` | 02 | 31 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sprint2-operations.tsx` | 06 | 68 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/stock-list.tsx` | 15 | 85 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/stock-workspace.tsx` | 15 | 98 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/stock-write-forms.tsx` | 06 | 103 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/telephone-alerte-form.tsx` | 19 | 54 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/tomorrow-lab-panel.tsx` | 06 | 717 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/trace-operations.tsx` | 06 | 39 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/transfer-form.tsx` | 06 | 57 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/trial-guard-client.tsx` | 01 | 162 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/trial-lock-screen.tsx` | 01 | 129 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/version-form.tsx` | 08 | 169 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/vitrine-commande.tsx` | 04 | 129 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/vitrine-form.tsx` | 04 | 255 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/workspace-icons.tsx` | 10 | 39 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/workspace-nav.tsx` | 02 | 64 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/workspace-ui.tsx` | 10 | 26 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/z-import-form.tsx` | 06 | 90 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/z-import-operations.tsx` | 06 | 27 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-achats.ts` | 06 | 90 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-auth.ts` | 01 | 52 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-caisse.ts` | 05 | 364 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-cakes.ts` | 06 | 172 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-clotures.ts` | 06 | 118 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-couts.ts` | 05 | 538 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-credits.ts` | 05 | 206 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-donnees.ts` | 19 | 113 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-equipe.ts` | 02 | 162 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-etablissement.ts` | 09 | 58 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-free-recipes.ts` | 06 | 171 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-haccp.ts` | 06 | 138 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-licence.ts` | 01 | 442 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-modules.ts` | 02 | 21 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-of.ts` | 06 | 125 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-onboarding.ts` | 06 | 104 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-photos.ts` | 12 | 34 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-planning.ts` | 06 | 195 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-price-alerts.ts` | 05 | 172 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-rappel.ts` | 06 | 95 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-recettes.ts` | 06 | 107 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-rejoindre.ts` | 01 | 48 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-restauration.ts` | 18 | 100 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-simulation.ts` | 05 | 105 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-sites.ts` | 02 | 32 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-stock.ts` | 07 | 229 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-vitrine.ts` | 04 | 301 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/allergenes.ts` | 08 | 177 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/appearance.ts` | 10 | 118 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/auth-session.ts` | 01 | 41 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/auth.ts` | 01 | 204 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/cake-money.ts` | 05 | 6 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/cake-priority.ts` | 05 | 9 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/catalogue-cache.ts` | 11 | 298 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/charge-capacite.ts` | 05 | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/client-ref.ts` | 07 | 13 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/connectivite-cron.ts` | 19 | 204 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/cost-sheet.ts` | 05 | 294 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/courses-server.ts` | 15 | 128 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/credits.ts` | 05 | 153 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/csv.ts` | 12 | 141 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/dashboard-insights.ts` | 14 | 134 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/deconnexion-locale.ts` | 01 | 26 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/demo-workspace.ts` | 16 | 527 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/domaines.ts` | 04 | 172 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/equipe-experimental.ts` | 02 | 20 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/erreurs-db.ts` | 13 | 71 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/etablissement.ts` | 09 | 139 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/export-comptable.ts` | 12 | 174 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/fefo-cost.ts` | 05 | 132 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/fetes-dz.ts` | 08 | 210 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/file-attente-cloture.ts` | 11 | 66 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/free-recipes.ts` | 05 | 165 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/i18n.ts` | 09 | 81 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/ingredient-impact.ts` | 05 | 541 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/invitation-mail.ts` | 02 | 27 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/invoice-photo-parser.ts` | 12 | 104 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/journal-actions-communs.ts` | 19 | 32 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/journal-audit.ts` | 19 | 123 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/journal-input.ts` | 09 | 295 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/label-model.ts` | 12 | 108 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/licence-mode.ts` | 17 | 37 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/liste-courses.ts` | 15 | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/lots-batch.ts` | 07 | 63 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/main-oeuvre.ts` | 05 | 34 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/master-auth.ts` | 01 | 88 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/modules-access.ts` | 02 | 14 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/notifications-alerte.ts` | 19 | 275 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/of-queue.ts` | 11 | 93 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/onboarding-server.ts` | 06 | 27 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/onboarding.ts` | 06 | 85 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/owner-day.ts` | 14 | 41 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/owner-price-guard.ts` | 05 | 119 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pack-patisserie-dz.ts` | 08 | 61 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pagination.ts` | 09 | 44 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pastry-visuals.ts` | 12 | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/patisgest-store.ts` | 06 | 649 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/permissions.ts` | 02 | 128 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pilot-account.ts` | 01 | 7 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pilot-accounts.ts` | 01 | 42 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/portion-estimator.ts` | 05 | 687 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pos-cart.ts` | 05 | 359 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/preview-guard.ts` | 17 | 26 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/price-alerts.ts` | 05 | 57 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/proxy-session.ts` | 01 | 83 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/purchase-input.ts` | 09 | 75 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/quality-alerts.ts` | 06 | 139 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/recipe-photo.ts` | 12 | 33 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/reconciliation.ts` | 05 | 288 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/rls-probe.ts` | 03 | 101 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/sale-queue.ts` | 11 | 264 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/sale-session.ts` | 07 | 37 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/sauvegarde.ts` | 18 | 253 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/schema-version.ts` | 18 | 36 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/shop-advisor.ts` | 05 | 404 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/stock-input.ts` | 09 | 190 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/stock-overview.ts` | 15 | 17 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/supabase/admin.ts` | 02 | 23 | client Supabase: session / privileges |
| `patisgest-app/src/lib/supabase/client.ts` | 01 | 9 | client Supabase: session / privileges |
| `patisgest-app/src/lib/supabase/server.ts` | 01 | 35 | client Supabase: session / privileges |
| `patisgest-app/src/lib/tomorrow-lab-private-server.ts` | 06 | 49 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-lab-server.ts` | 06 | 324 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-lab.ts` | 06 | 538 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-recipe-guard.ts` | 06 | 22 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/trial-crypto.ts` | 01 | 117 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/trial-lock-client.ts` | 01 | 391 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/trial-server.ts` | 01 | 130 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/version-input.ts` | 09 | 90 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-anti-abus.ts` | 04 | 22 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-format.ts` | 09 | 26 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-permissions.ts` | 02 | 99 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-slug.ts` | 04 | 54 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine.ts` | 04 | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/whatsapp.ts` | 04 | 94 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/workspace-data.ts` | 15 | 138 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/workspace-nav.ts` | 02 | 36 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/workspace-read.ts` | 15 | 196 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/z-input.ts` | 09 | 51 | module lib: responsabilite de la tranche |
| `patisgest-app/src/proxy.ts` | 01 | 98 | proxy: rotation de cookies via getUser()/setAll (symbole deciderRoutage -> T04) |
| `patisgest-app/supabase/01-socle.sql` | 03 | 97 | migration 01: socle: tables, RLS, policies clients/utilisateurs/sites |
| `patisgest-app/supabase/02-seed-pilote.sql` | 08 | 85 | migration 02: seed pilote: types de donnees et compatibilite de schema |
| `patisgest-app/supabase/03-sprint2-modules.sql` | 08 | 253 | migration 03: creation des tables Sprint 2, contraintes et valeurs par defaut |
| `patisgest-app/supabase/04-securite-lecture.sql` | 03 | 12 | migration 04: policies de lecture tenant generees dynamiquement |
| `patisgest-app/supabase/05-ecritures-articles-lots.sql` | 07 | 157 | migration 05: ecritures articles/lots: policies + RPC receptionner_lot |
| `patisgest-app/supabase/06-ventes-caisse-fefo.sql` | 05 | 192 | migration 06: vente FEFO: arrondi, consommation de lots, totaux |
| `patisgest-app/supabase/07-of-production.sql` | 06 | 455 | migration 07: OF: cycle de vie, contraintes de statut, transitions |
| `patisgest-app/supabase/08-transferts.sql` | 07 | 168 | migration 08: transfert de stock: verrous et race de quantite |
| `patisgest-app/supabase/09-journaux-ecritures.sql` | 06 | 423 | migration 09: clotures, non-conformites, cakes: machines a etats |
| `patisgest-app/supabase/10-achats-commandes.sql` | 06 | 211 | migration 10: achats/commandes: cycle commande -> reception |
| `patisgest-app/supabase/11-import-z.sql` | 06 | 222 | migration 11: import Z: invariant (date, caisse, numero Z) |
| `patisgest-app/supabase/12-sous-recettes-conversions.sql` | 05 | 442 | migration 12: sous-recettes et conversions: facteurs et couts |
| `patisgest-app/supabase/13-rappel-blocage-lots.sql` | 06 | 266 | migration 13: rappel/blocage de lots: invariant de consommation |
| `patisgest-app/supabase/14-cake-edition-cgv-ticket.sql` | 05 | 152 | migration 14: edition cake, CGV, ticket: montants et acompte |
| `patisgest-app/supabase/15-parametres-couts.sql` | 05 | 25 | migration 15: parametres de couts: taux horaire, charges |
| `patisgest-app/supabase/16-creer-of-idempotent.sql` | 07 | 151 | migration 16: creer_of idempotent: cle client et conflit |
| `patisgest-app/supabase/17-confidentialite-couts-rls.sql` | 03 | 115 | migration 17: confidentialite des couts: RLS et revoke/grant |
| `patisgest-app/supabase/18-restauration-sauvegarde.sql` | 18 | 156 | migration 18: sauvegarde/restauration: RPC et ordre de rejeu |
| `patisgest-app/supabase/19-confidentialite-familles-recettes.sql` | 03 | 14 | migration 19: confidentialite familles de recettes: RLS |
| `patisgest-app/supabase/20-creation-fournisseur.sql` | 03 | 17 | migration 20: creation fournisseur: revoke INSERT + policy |
| `patisgest-app/supabase/21-prix-demain-panier.sql` | 05 | 1249 | migration 21: prix demain/panier: vendre_panier, FEFO, arrondis |
| `patisgest-app/supabase/22-cake-production.sql` | 05 | 203 | migration 22: production cake: couts et tickets |
| `patisgest-app/supabase/23-controle-modules.sql` | 03 | 142 | migration 23: controle des modules: policies restrictives + gardes RPC |
| `patisgest-app/supabase/24-index-exploitation.sql` | 15 | 113 | migration 24: index d'exploitation et plans de requete |
| `patisgest-app/supabase/25-domaines-boutiques.sql` | 04 | 196 | migration 25: domaines boutiques, sous-domaines, vitrine |
| `patisgest-app/supabase/26-vitrine-publique.sql` | 04 | 267 | migration 26: vitrine publique: vue catalogue et donnees exposees |
| `patisgest-app/supabase/27-commandes-vitrine.sql` | 04 | 249 | migration 27: commandes vitrine anonymes, plafond global |
| `patisgest-app/supabase/28-fermeture-anon.sql` | 03 | 102 | migration 28: fermeture des droits anon sur tables/sequences |
| `patisgest-app/supabase/29-fermeture-public-fonctions.sql` | 03 | 73 | migration 29: fermeture des droits PUBLIC sur les fonctions |
| `patisgest-app/supabase/30-edition-vitrine-rpc.sql` | 03 | 153 | migration 30: RPC d'edition vitrine: security definer et tenant |
| `patisgest-app/supabase/31-publication-vitrine.sql` | 03 | 98 | migration 31: publication vitrine: verrous et droits |
| `patisgest-app/supabase/32-garde-prix-vitrine-rattrapage.sql` | 04 | 75 | migration 32: garde de prix vitrine (rattrapage) |
| `patisgest-app/supabase/33-restauration-sans-perte.sql` | 18 | 109 | migration 33: restauration sans perte: transaction et ordre |
| `patisgest-app/supabase/34-cout-of-partiel.sql` | 05 | 47 | migration 34: cout OF partiel: calcul des couts connus |
| `patisgest-app/supabase/35-version-schema-app.sql` | 18 | 49 | migration 35: version de schema applicative et garde de deploiement |
| `patisgest-app/supabase/36-dates-algiers.sql` | 08 | 89 | migration 36: fuseau Africa/Algiers sur les defaults de dates |
| `patisgest-app/supabase/37-transfert-client-ref.sql` | 07 | 144 | migration 37: transfert + reference client: idempotence |
| `patisgest-app/supabase/38-anti-abus-vitrine-source.sql` | 04 | 120 | migration 38: anti-abus vitrine par source (plafond) |
| `patisgest-app/supabase/39-limites-tenant-restauration-sites-vitrine.sql` | 03 | 245 | migration 39: limites tenant, restauration, sites et vitrine |
| `patisgest-app/supabase/40-journal-audit.sql` | 19 | 258 | migration 40: journal d'audit immuable et triggers |
| `patisgest-app/supabase/41-avoirs-retours.sql` | 05 | 281 | migration 41: avoirs/retours: montants negatifs |
| `patisgest-app/supabase/42-donnees-personnelles.sql` | 19 | 236 | migration 42: donnees personnelles: export et anonymisation |
| `patisgest-app/supabase/43-unicite-lot.sql` | 07 | 76 | migration 43: unicite des lots: index unique et NULL |
| `patisgest-app/supabase/44-retrait-mode-carte.sql` | 07 | 55 | migration 44: retrait du mode carte: contraintes et rejeu |
| `patisgest-app/supabase/45-recettes-libres.sql` | 06 | 63 | migration 45: recettes libres: cycle de vie et suppression |
| `patisgest-app/supabase/46-credits-clients.sql` | 05 | 132 | migration 46: credits clients: soldes et reglements |
| `patisgest-app/supabase/47-onboarding-pack-dz.sql` | 06 | 68 | migration 47: onboarding pack DZ: donnees initiales |
| `patisgest-app/supabase/48-notifications-patron.sql` | 19 | 142 | migration 48: notifications patron: alertes et journal |
| `patisgest-app/supabase/49-wave3-wave4.sql` | 06 | 47 | migration 49: wave3/wave4: workflows additionnels |
| `patisgest-app/supabase/50-roles-permissions-vues.sql` | 03 | 700 | migration 50: roles/permissions/vues: parite et RLS |
| `patisgest-app/supabase/51-essai-abonnement-connectivite.sql` | 01 | 363 | migration 51: essai, abonnement, presence: jetons et licence |
| `patisgest-app/supabase/52-recettes-photos.sql` | 12 | 41 | migration 52: photos de recettes: colonne et contenu externe |
| `patisgest-app/supabase/53-caisse-ticket-scope.sql` | 07 | 293 | migration 53: portee du ticket de caisse: idempotence stricte |
| `patisgest-app/supabase/brouillons/101-confidentialite-labo.sql` | 18 | 126 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/102-cout-of-partiel.sql` | 18 | 25 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/103-gestion-sites.sql` | 18 | 10 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/104-equipe-fondations.sql` | 18 | 124 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/105-sites-lecture-brouillon.sql` | 18 | 42 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/106-sites-rpc-brouillon.sql` | 18 | 53 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/107-tracabilite-sites-brouillon.sql` | 18 | 34 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/108-reassort-sites-brouillon.sql` | 18 | 68 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/109-cake-sites-brouillon.sql` | 18 | 180 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/110-equipe-approbation-brouillon.sql` | 18 | 57 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/111-of-idempotence-sites-brouillon.sql` | 18 | 27 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/112-donnees-sans-site-brouillon.sql` | 18 | 49 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/113-equipe-affectations-revocation-brouillon.sql` | 18 | 75 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/114-equipe-admission-brouillon.sql` | 18 | 108 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/115-confidentialite-vendeur-lots-brouillon.sql` | 18 | 24 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/116-confidentialite-vendeur-of-brouillon.sql` | 18 | 20 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/117-rappel-perimetre-brouillon.sql` | 18 | 54 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/118-equipe-liste-invitations-brouillon.sql` | 18 | 16 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/119-equipe-mes-demandes-brouillon.sql` | 18 | 16 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/120-equipe-membres-revision-brouillon.sql` | 18 | 79 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/121-vendeur-sites-boutique-brouillon.sql` | 18 | 20 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/122-revocation-adresses-brouillon.sql` | 18 | 27 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/123-revocation-decisions-brouillon.sql` | 18 | 112 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/124-restauration-gardes-brouillon.sql` | 18 | 54 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/125-vitrine-perimetre-brouillon.sql` | 18 | 30 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/126-vitrine-photos-modules-brouillon.sql` | 18 | 51 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/127-vitrine-depot-schema-brouillon.sql` | 18 | 24 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/128-caisse-collision-ticket-brouillon.sql` | 18 | 52 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/tests/actions-caisse-surface.test.mjs` | 02 | 45 | test a auditer pour cette tranche |
| `patisgest-app/tests/actions-credits.test.mjs` | 05 | 274 | test a auditer pour cette tranche |
| `patisgest-app/tests/actions-roles-execution.test.mjs` | 02 | 193 | test a auditer pour cette tranche |
| `patisgest-app/tests/allergenes.test.mjs` | 08 | 140 | test a auditer pour cette tranche |
| `patisgest-app/tests/anti-abus-vitrine-db.test.mjs` | 03 | 103 | test a auditer pour cette tranche |
| `patisgest-app/tests/api-health.test.mjs` | 19 | 45 | test a auditer pour cette tranche |
| `patisgest-app/tests/apparence-licence-photos.test.mjs` | 10 | 93 | test a auditer pour cette tranche |
| `patisgest-app/tests/appearance.test.mjs` | 10 | 93 | test a auditer pour cette tranche |
| `patisgest-app/tests/audit-catalogue.sql` | 20 | 25 | catalogue SQL d audit |
| `patisgest-app/tests/auth-session.test.mjs` | 01 | 36 | test a auditer pour cette tranche |
| `patisgest-app/tests/avoirs-db.test.mjs` | 05 | 270 | test a auditer pour cette tranche |
| `patisgest-app/tests/caisse-collision-db.test.mjs` | 07 | 61 | test a auditer pour cette tranche |
| `patisgest-app/tests/caisse-ticket-scope-db.test.mjs` | 07 | 174 | test a auditer pour cette tranche |
| `patisgest-app/tests/cake-dossier.test.mjs` | 06 | 41 | test a auditer pour cette tranche |
| `patisgest-app/tests/cake-production-db.test.mjs` | 06 | 75 | test a auditer pour cette tranche |
| `patisgest-app/tests/catalogue-cache.test.mjs` | 11 | 86 | test a auditer pour cette tranche |
| `patisgest-app/tests/catalogue-hors-ligne.test.mjs` | 11 | 121 | test a auditer pour cette tranche |
| `patisgest-app/tests/catalogue-local.mjs` | 11 | 36 | adaptateur local du catalogue hors-ligne |
| `patisgest-app/tests/chaine-rejouable.test.mjs` | 18 | 55 | test a auditer pour cette tranche |
| `patisgest-app/tests/charge-capacite.test.mjs` | 05 | 97 | test a auditer pour cette tranche |
| `patisgest-app/tests/cloture-file-attente.test.mjs` | 11 | 48 | test a auditer pour cette tranche |
| `patisgest-app/tests/coffre-sauvegarde.test.mjs` | 12 | 42 | test a auditer pour cette tranche |
| `patisgest-app/tests/concurrence-transfert-reel.test.mjs` | 07 | 175 | test a auditer pour cette tranche |
| `patisgest-app/tests/confidentialite-roles-db.test.mjs` | 03 | 192 | test a auditer pour cette tranche |
| `patisgest-app/tests/connectivite-lignes.test.mjs` | 19 | 122 | test a auditer pour cette tranche |
| `patisgest-app/tests/cost-sheet.test.mjs` | 05 | 124 | test a auditer pour cette tranche |
| `patisgest-app/tests/credits.test.mjs` | 05 | 146 | test a auditer pour cette tranche |
| `patisgest-app/tests/csv.test.mjs` | 05 | 128 | test a auditer pour cette tranche |
| `patisgest-app/tests/dashboard-insights.test.mjs` | 14 | 38 | test a auditer pour cette tranche |
| `patisgest-app/tests/dates-algiers-db.test.mjs` | 08 | 77 | test a auditer pour cette tranche |
| `patisgest-app/tests/db-push-guard.test.mjs` | 17 | 20 | test a auditer pour cette tranche |
| `patisgest-app/tests/deconnexion-locale.test.mjs` | 11 | 99 | test a auditer pour cette tranche |
| `patisgest-app/tests/design-refinement.test.mjs` | 10 | 34 | test a auditer pour cette tranche |
| `patisgest-app/tests/domaines.test.mjs` | 04 | 76 | test a auditer pour cette tranche |
| `patisgest-app/tests/donnees-personnelles-db.test.mjs` | 19 | 193 | test a auditer pour cette tranche |
| `patisgest-app/tests/droits-execution-db.test.mjs` | 03 | 51 | test a auditer pour cette tranche |
| `patisgest-app/tests/e2e/README.md` | 20 | 58 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/tests/e2e/bootstrap-ci.mjs` | 20 | 174 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/caisse.spec.mjs` | 20 | 28 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/helpers.mjs` | 20 | 24 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/seed.mjs` | 20 | 50 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/stock.spec.mjs` | 20 | 47 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/transfert.spec.mjs` | 20 | 29 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/vitrine.spec.mjs` | 20 | 31 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/equipe-experimental.test.mjs` | 02 | 68 | test a auditer pour cette tranche |
| `patisgest-app/tests/erreurs-db.test.mjs` | 13 | 97 | test a auditer pour cette tranche |
| `patisgest-app/tests/essai-master-connectivite.test.mjs` | 19 | 211 | test a auditer pour cette tranche |
| `patisgest-app/tests/etablissement.test.mjs` | 08 | 132 | test a auditer pour cette tranche |
| `patisgest-app/tests/export-comptable.test.mjs` | 05 | 104 | test a auditer pour cette tranche |
| `patisgest-app/tests/fefo-cost.test.mjs` | 05 | 123 | test a auditer pour cette tranche |
| `patisgest-app/tests/fefo-parite-db.test.mjs` | 05 | 30 | test a auditer pour cette tranche |
| `patisgest-app/tests/file-attente-cloture.test.mjs` | 11 | 60 | test a auditer pour cette tranche |
| `patisgest-app/tests/fixtures/pilote-vitrine/25-domaines-boutiques.sql` | 04 | 196 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/26-vitrine-publique.sql` | 04 | 267 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/27-commandes-vitrine.sql` | 04 | 249 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/28-fermeture-anon.sql` | 04 | 102 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/29-fermeture-public-fonctions.sql` | 04 | 73 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/30-edition-vitrine-rpc.sql` | 04 | 153 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/31-publication-vitrine.sql` | 04 | 98 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/README.md` | 20 | 5 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/tests/free-recipes-dashboard.test.mjs` | 05 | 60 | test a auditer pour cette tranche |
| `patisgest-app/tests/harness-execution.mjs` | 20 | 94 | harnais de tests: mocks de session et de client DB |
| `patisgest-app/tests/impression-ticket.test.mjs` | 05 | 69 | test a auditer pour cette tranche |
| `patisgest-app/tests/ingredient-impact.test.mjs` | 05 | 265 | test a auditer pour cette tranche |
| `patisgest-app/tests/integration/auth-apres-restauration.mjs` | 18 | 32 | procedure de restauration isolee |
| `patisgest-app/tests/integration/auth-postgrest.mjs` | 03 | 876 | pile Auth + PostgREST locale: privileges et RLS |
| `patisgest-app/tests/integration/empreinte-restauration.mjs` | 18 | 53 | procedure de restauration isolee |
| `patisgest-app/tests/integration/restauration-cli-isolee.sh` | 18 | 55 | procedure de restauration isolee |
| `patisgest-app/tests/integration/restauration-isolee.sh` | 18 | 35 | procedure de restauration isolee |
| `patisgest-app/tests/integration/verifier-restauration.mjs` | 18 | 33 | procedure de restauration isolee |
| `patisgest-app/tests/inventaire-rpc.json` | 20 | 9 | inventaire / catalogue de tests |
| `patisgest-app/tests/inventaire-surface.json` | 20 | 171 | inventaire / catalogue de tests |
| `patisgest-app/tests/inventaire-surface.mjs` | 20 | 26 | inventaire statique des points d entree |
| `patisgest-app/tests/inventaire-surface.test.mjs` | 20 | 9 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/invitation-mail.test.mjs` | 01 | 27 | test a auditer pour cette tranche |
| `patisgest-app/tests/journal-audit-db.test.mjs` | 19 | 222 | test a auditer pour cette tranche |
| `patisgest-app/tests/journal-audit.test.mjs` | 19 | 83 | test a auditer pour cette tranche |
| `patisgest-app/tests/journal-input.test.mjs` | 09 | 139 | test a auditer pour cette tranche |
| `patisgest-app/tests/label-model.test.mjs` | 20 | 64 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/labo-confidentialite-db.test.mjs` | 03 | 53 | test a auditer pour cette tranche |
| `patisgest-app/tests/liste-courses.test.mjs` | 20 | 135 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/lots-batch.test.mjs` | 06 | 57 | test a auditer pour cette tranche |
| `patisgest-app/tests/main-oeuvre.test.mjs` | 05 | 31 | test a auditer pour cette tranche |
| `patisgest-app/tests/master-auth.test.mjs` | 01 | 188 | test a auditer pour cette tranche |
| `patisgest-app/tests/matrice-app-schema.test.mjs` | 02 | 150 | test a auditer pour cette tranche |
| `patisgest-app/tests/migrations-historique.mjs` | 18 | 26 | manifeste de la chaine de deploiement |
| `patisgest-app/tests/migrations-repetition.test.mjs` | 18 | 48 | test a auditer pour cette tranche |
| `patisgest-app/tests/mocks/next-stubs.mjs` | 20 | 33 | harnais / fixture de test |
| `patisgest-app/tests/mocks/register-hooks.mjs` | 20 | 43 | harnais / fixture de test |
| `patisgest-app/tests/modules-access-db.test.mjs` | 02 | 42 | test a auditer pour cette tranche |
| `patisgest-app/tests/modules-access.test.mjs` | 02 | 110 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-cout-partiel-brouillon.test.mjs` | 06 | 46 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-cout-partiel-main.test.mjs` | 06 | 27 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-perte-experimentale.test.mjs` | 06 | 171 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-queue.test.mjs` | 11 | 61 | test a auditer pour cette tranche |
| `patisgest-app/tests/onboarding.test.mjs` | 06 | 81 | test a auditer pour cette tranche |
| `patisgest-app/tests/owner-day.test.mjs` | 14 | 90 | test a auditer pour cette tranche |
| `patisgest-app/tests/pagination.test.mjs` | 09 | 53 | test a auditer pour cette tranche |
| `patisgest-app/tests/performance-dashboard.test.mjs` | 14 | 174 | test a auditer pour cette tranche |
| `patisgest-app/tests/permissions.test.mjs` | 02 | 83 | test a auditer pour cette tranche |
| `patisgest-app/tests/phase1-f02-f20-db.test.mjs` | 03 | 107 | test a auditer pour cette tranche |
| `patisgest-app/tests/phase1-rattrapage-db.test.mjs` | 03 | 99 | test a auditer pour cette tranche |
| `patisgest-app/tests/phase1-security-regressions.test.mjs` | 03 | 121 | test a auditer pour cette tranche |
| `patisgest-app/tests/pilot-account.test.mjs` | 01 | 13 | test a auditer pour cette tranche |
| `patisgest-app/tests/portion-estimator.test.mjs` | 05 | 178 | test a auditer pour cette tranche |
| `patisgest-app/tests/pos-cart-demain.test.mjs` | 05 | 270 | test a auditer pour cette tranche |
| `patisgest-app/tests/pos-cart-prix-nul.test.mjs` | 05 | 25 | test a auditer pour cette tranche |
| `patisgest-app/tests/pos-rounding.test.mjs` | 05 | 62 | test a auditer pour cette tranche |
| `patisgest-app/tests/preview-guard.test.mjs` | 17 | 79 | test a auditer pour cette tranche |
| `patisgest-app/tests/preview-http.mjs` | 17 | 59 | sonde du garde-fou de preview hors glob npm test |
| `patisgest-app/tests/price-alerts.test.mjs` | 05 | 60 | test a auditer pour cette tranche |
| `patisgest-app/tests/proxy-session.test.mjs` | 01 | 112 | test a auditer pour cette tranche |
| `patisgest-app/tests/purchase-input.test.mjs` | 09 | 67 | test a auditer pour cette tranche |
| `patisgest-app/tests/quality-alerts.test.mjs` | 06 | 102 | test a auditer pour cette tranche |
| `patisgest-app/tests/rc-reference.test.mjs` | 05 | 100 | test a auditer pour cette tranche |
| `patisgest-app/tests/reconciliation.test.mjs` | 05 | 75 | test a auditer pour cette tranche |
| `patisgest-app/tests/retrait-mode-carte-db.test.mjs` | 20 | 63 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/revue-corrections.test.mjs` | 18 | 147 | test a auditer pour cette tranche |
| `patisgest-app/tests/rls-probe.test.mjs` | 03 | 92 | test a auditer pour cette tranche |
| `patisgest-app/tests/sale-queue.test.mjs` | 11 | 173 | test a auditer pour cette tranche |
| `patisgest-app/tests/sale-session.test.mjs` | 07 | 46 | test a auditer pour cette tranche |
| `patisgest-app/tests/sauvegarde.test.mjs` | 18 | 276 | test a auditer pour cette tranche |
| `patisgest-app/tests/schema-complet.test.mjs` | 08 | 244 | test a auditer pour cette tranche |
| `patisgest-app/tests/schema-version-db.test.mjs` | 08 | 58 | test a auditer pour cette tranche |
| `patisgest-app/tests/securite.test.mjs` | 04 | 335 | test a auditer pour cette tranche |
| `patisgest-app/tests/serie-main-vitrine-commande.test.mjs` | 04 | 28 | test a auditer pour cette tranche |
| `patisgest-app/tests/serie-main-vitrine-db.test.mjs` | 04 | 32 | test a auditer pour cette tranche |
| `patisgest-app/tests/service-worker-scope.test.mjs` | 11 | 102 | test a auditer pour cette tranche |
| `patisgest-app/tests/service-worker-securite.test.mjs` | 11 | 82 | test a auditer pour cette tranche |
| `patisgest-app/tests/shop-advisor.test.mjs` | 05 | 127 | test a auditer pour cette tranche |
| `patisgest-app/tests/smoke-http.mjs` | 20 | 442 | script HTTP hors glob npm test |
| `patisgest-app/tests/stock-input.test.mjs` | 09 | 149 | test a auditer pour cette tranche |
| `patisgest-app/tests/store.test.mjs` | 06 | 596 | test a auditer pour cette tranche |
| `patisgest-app/tests/support/fixture-of-cout.mjs` | 20 | 17 | harnais / fixture de test |
| `patisgest-app/tests/support/serie-main.mjs` | 20 | 33 | harnais / fixture de test |
| `patisgest-app/tests/tomorrow-recipe-guard.test.mjs` | 20 | 15 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/transfert-client-ref-db.test.mjs` | 07 | 135 | test a auditer pour cette tranche |
| `patisgest-app/tests/trial-license.test.mjs` | 01 | 256 | test a auditer pour cette tranche |
| `patisgest-app/tests/trial-lock-demo.test.mjs` | 01 | 118 | test a auditer pour cette tranche |
| `patisgest-app/tests/trial-lock.test.mjs` | 01 | 282 | test a auditer pour cette tranche |
| `patisgest-app/tests/unicite-lot.test.mjs` | 06 | 78 | test a auditer pour cette tranche |
| `patisgest-app/tests/usabilite-parcours.test.mjs` | 06 | 84 | test a auditer pour cette tranche |
| `patisgest-app/tests/version-input.test.mjs` | 08 | 74 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-anti-abus.test.mjs` | 04 | 34 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-perimetre.test.mjs` | 04 | 77 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-permissions.test.mjs` | 04 | 126 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-slug.test.mjs` | 04 | 78 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine.test.mjs` | 20 | 293 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/vues-roles-recette.test.mjs` | 03 | 62 | test a auditer pour cette tranche |
| `patisgest-app/tests/wave1-features.test.mjs` | 06 | 82 | test a auditer pour cette tranche |
| `patisgest-app/tests/wave2-features.test.mjs` | 06 | 95 | test a auditer pour cette tranche |
| `patisgest-app/tests/wave3-wave4.test.mjs` | 06 | 90 | test a auditer pour cette tranche |
| `patisgest-app/tests/workspace-daily-ux.test.mjs` | 10 | 41 | test a auditer pour cette tranche |
| `patisgest-app/tests/workspace-nav.test.mjs` | 10 | 44 | test a auditer pour cette tranche |
| `patisgest-app/tests/z-input.test.mjs` | 09 | 38 | test a auditer pour cette tranche |
| `patisgest-app/tsconfig.json` | 17 | 43 | configuration de build/runtime et secrets |
| `revue/CHECKLIST-DEPLOIEMENT.md` | 20 | 405 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/DOSSIER-PILOTES-COMMERCIAL.md` | 20 | 91 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/PLAN-DE-COMMIT.md` | 20 | 310 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/PROCEDURE-RESTAURATION-PILOTE.md` | 20 | 94 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/sauvegardes/vendre_panier-avant-53.pgsql` | 18 | 223 | artefact de rollback / sauvegarde SQL |

---

## 4. Découpages par symbole (fichiers partagés)

| Fichier | Propriétaire | Symboles / responsabilités cédés aux autres tranches (lecture seule, jamais audit de propriété) |
|---|---|---|
| `patisgest-app/src/proxy.ts` | T01 | `deciderRoutage()`/`resoudreHote()` (T04, via `src/lib/domaines.ts`) ; `previewBloquee()` (T17) ; en-tête `x-patisgest-session-stale` (T13) |
| `patisgest-app/src/app/(app)/layout.tsx` | T01 | `initialBundle`/`TrialGuardClient`/`DemoWorkspaceProvider` (T10) ; `verifierVersionSchema` (T18) ; filtrage de nav par rôle (T02) |
| `patisgest-app/src/lib/supabase/admin.ts` | T02 | `service_role` et garde `previewBloquee` (T03/T17 en lecture seule) |
| `patisgest-app/src/lib/actions-caisse.ts` | T05 | `p_ticket`/`sameSaleReplay`/repli `vendre_article` (T07) ; `catch` final (T13) ; montants (T05) |
| `patisgest-app/supabase/21-prix-demain-panier.sql` | T05 | `vendre_panier`, verrous `FOR UPDATE` et portée du ticket (T07) ; `GRANT/REVOKE` (T03) |
| `patisgest-app/supabase/53-caisse-ticket-scope.sql` | T07 | `SECURITY DEFINER`/`search_path` (T03) ; appartenance à la chaîne de migrations (T18) |
| `patisgest-app/src/lib/sauvegarde.ts` | T18 | `TABLES_EXCLUES` et PII omises (T19) ; `MAX_OCTETS_SAUVEGARDE` et 413 (T12/T09) |
| `patisgest-app/src/lib/csv.ts` | T12 | validation de date ISO (T08) ; arrondis décimaux (T05) |
| `patisgest-app/src/lib/catalogue-cache.ts` | T11 | snapshot `useSyncExternalStore` et fuite inter-comptes (T10) ; fraîcheur 14 j (T08) |
| `patisgest-app/src/lib/workspace-read.ts` | T15 | complexité applicative des boucles (T14) ; pagination `range()` (T09) |
| `patisgest-app/src/lib/patisgest-store.ts` | T06 | duplication démo/réel (T16) ; dédup Z (T07) ; `isValidDate` UTC (T08) |
| `patisgest-app/src/app/api/export/route.ts` | T12 | limite 20 000 et codes HTTP (T09) ; coût DB (T15) ; `catch` 503 (T13) |
| `patisgest-app/src/app/api/health/route.ts` | T19 | surface anonyme (T04) ; usage E2E `ci.yml:184` (T18) |
| `patisgest-app/src/lib/trial-crypto.ts` | T01 | graine de repli et secrets (T17) ; bundle signé poussé au client (T10) |
| Tous les `*.test.mjs` | T01–T19 selon §3 | **T20 possède les corps d’assertions, les mocks et l’inventaire** (découpage par symbole) ; les autres tranches possèdent le comportement testé |

---

## 5. Ordre de fusion / d’exécution

1. **T01 → T02 → T03 → T04** (Couche 1, prioritaire) : leurs conclusions sur les frontières de confiance
   nourrissent les tranches 05–19. T03 doit être lue avec T02 (parité App ↔ API ↔ Base).
2. **T05 → T06 → T07 → T08** : calculs, états, concurrence, modèle. T07 consomme les invariants de T06
   et les arrondis de T05.
3. **T09 → T10 → T11 → T12** : contrats puis état client, hors-ligne, fichiers.
4. **T13 → T14 → T15 → T16** : fiabilité, puis performance applicative/DB, puis structure.
5. **T17 → T18 → T19 → T20** : build/secrets, CI/migrations, exploitation, vérité des tests.
6. **MODE C (consolidation)** : fusionner les 20 rapports `SXX-Fxxx`, dédupliquer par cause racine,
   produire la vue exécutive 20 lignes, la matrice de risques transverses et la *Release Gate* Go/No-Go.

Dépendances transverses à expliciter dans chaque rapport (sans reprendre la propriété d’autrui) :

| Axe | Tranches concernées | Question transverse |
|---|---|---|
| Session → RLS → RPC | 01, 02, 03 | `auth.uid()` suffit-il à garantir le tenant dans les `SECURITY DEFINER` ? |
| Arrondi JS ↔ `numeric` SQL | 05, 09, 12 | le total affiché, encaissé et exporté est-il identique au centime ? |
| Ticket / file / clé d’idempotence | 07, 11, 13 | rejeu après coupure réseau = 0 doublon, 0 perte ? |
| Mode gratuit / verrou / licence | 01, 17, 19 | le défaut `fail-open` est-il compatible avec une mise en production ? |
| Brouillons ↔ chaîne déployée | 03, 07, 18 | la base de production exécute-t-elle le code du dépôt ? |
| Suite verte ↔ risque métier | 20, toutes | quels tests ne peuvent pas échouer, et sur quels risques ? |

---

## 6. Règles de non-chevauchement et usage des prompts

- Un fichier = **un propriétaire**. Une tranche peut **citer** un fichier d’une autre tranche comme
  preuve de traçage, mais ne produit **aucun constat** sur ce fichier : le constat appartient au propriétaire.
- Chaque prompt `01-*.md`…`20-*.md` est **autonome** : il contient ses fichiers, ses exclusions,
  ses tests à auditer, 10 à 12 hypothèses ancrées sur de vrais `fichier:ligne`, le protocole forensique
  en 7 étapes et le format de sortie standardisé.
- Lancer **MODE B** avec : `Audite la tranche XX/20 en suivant audit/XX-*.md, sans modifier le code produit.`
- Lancer **MODE C** après les 20 rapports : `Consolide les 20 rapports en document décisionnel unique.`

### 6.1 Fichiers de sortie attendus par tranche

| Tranche | Prompt | Rapport attendu |
|---:|---|---|
| 01 | `audit/01-authentification-sessions.md` | `audit/rapports/S01.md` |
| 02 | `audit/02-autorisation-rbac-tenant.md` | `audit/rapports/S02.md` |
| 03 | `audit/03-securite-base-rls.md` | `audit/rapports/S03.md` |
| 04 | `audit/04-surfaces-publiques-anti-abus.md` | `audit/rapports/S04.md` |
| 05 | `audit/05-calculs-precision-financiere.md` | `audit/rapports/S05.md` |
| 06 | `audit/06-machines-etat-workflows.md` | `audit/rapports/S06.md` |
| 07 | `audit/07-concurrence-verrous-idempotence.md` | `audit/rapports/S07.md` |
| 08 | `audit/08-modele-donnees-fuseaux.md` | `audit/rapports/S08.md` |
| 09 | `audit/09-contrats-api-validation.md` | `audit/rapports/S09.md` |
| 10 | `audit/10-etat-client-hydratation-caches.md` | `audit/rapports/S10.md` |
| 11 | `audit/11-hors-ligne-pwa-files-locales.md` | `audit/rapports/S11.md` |
| 12 | `audit/12-fichiers-medias-imports-exports.md` | `audit/rapports/S12.md` |
| 13 | `audit/13-fiabilite-runtime-erreurs.md` | `audit/rapports/S13.md` |
| 14 | `audit/14-performance-applicative.md` | `audit/rapports/S14.md` |
| 15 | `audit/15-performance-base-scalabilite.md` | `audit/rapports/S15.md` |
| 16 | `audit/16-architecture-maintenabilite.md` | `audit/rapports/S16.md` |
| 17 | `audit/17-build-config-secrets-supply-chain.md` | `audit/rapports/S17.md` |
| 18 | `audit/18-cicd-migrations-sauvegardes.md` | `audit/rapports/S18.md` |
| 19 | `audit/19-observabilite-audit-pii.md` | `audit/rapports/S19.md` |
| 20 | `audit/20-meta-audit-tests-drift.md` | `audit/rapports/S20.md` |

**Artefact de transmission unique** : `audit/MODE-A-CONSOLIDE-UN-SEUL-FICHIER.md` regroupe
l’intégralité des 21 livrables ci-dessus (index + 20 prompts) dans un seul fichier Markdown,
avec sommaire, mode d’emploi, séparateurs et empreintes SHA-256 ; propriété T20.

---

## 7. Avertissements de portée (à ne pas transformer en constats)

- Les **commentaires** des fichiers sources comportent de nombreuses affirmations (« mesuré »,
  « idempotent », « rejouable », « aucune donnée en otage », « 87 actions »). Elles sont des
  **hypothèses hostiles** : la tranche propriétaire doit les confronter au code et, si elles sont fausses,
  produire un constat `DRIFT-DOC`.
- Les comptages `catch`, `as`, `!`, `SECURITY DEFINER` et de la chaîne de migrations sont des
  **mesures exactes (AST / parseur / manifeste)**, pas des verdicts de sécurité : la tranche
  propriétaire doit relire chaque occurrence dans son contexte avant de produire un constat.
- `modules sans référence d’import` est une **heuristique** : elle ne prouve ni couverture ni absence de test.
- Les 28 brouillons `101–128` et les 7 fixtures ne sont **pas** une chaîne de déploiement ; T18
  doit prouver leur séparation d’avec `migrations/repetition.json`.
- `audit/MODE-A-CONSOLIDE-UN-SEUL-FICHIER.md` est un **artefact de transmission** créé après
  l’instantané métrique : déclaré en T20 avec `L=0` dans la matrice afin de ne pas falsifier
  les 75 814 lignes de code mesurées avant sa création.

---

## 8. Artefact de transmission unique

| Fichier | T | Rôle |
|---|---:|---|
| `audit/MODE-A-CONSOLIDE-UN-SEUL-FICHIER.md` | 20 | Consolidation intégrale de `00-INDEX.md` + `01`…`20` dans un seul Markdown auto-suffisant. |

Cet artefact peut être transmis tel quel à un autre agent : il contient l’instantané MODE A,
la matrice de propriété, les métriques, l’ordre de fusion et les 20 prompts MODE B. Il ne contient
**pas** les 20 rapports MODE B, qui n’ont pas encore été exécutés.

