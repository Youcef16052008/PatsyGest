# MODE A — DOSSIER CONSOLIDÉ EN UN SEUL FICHIER

**Dépôt** : `Youcef16052008/PatsyGest` · **Branche** : `arena/923a4433-patsygest` · **Base** : `da5857dddab46842e5029d1c745f93e89265a013` · **Date** : 2026-11-26 (UTC).
**Fichier** : `audit/MODE-A-CONSOLIDE-UN-SEUL-FICHIER.md` · **Sources fusionnées** : 21 · **Lignes sources** : 4512 · **Octets sources** : 393936.

> **Objet** : transmettre à un agent tout le matériel MODE A dans un seul Markdown auto-suffisant.
> Ce fichier contient **l’intégralité, octet pour octet**, de `audit/00-INDEX.md` et des 20 prompts
> `audit/01-*.md` … `audit/20-*.md`. Il contient l’instantané forensique, la matrice de propriété
> exclusive, les métriques, l’ordre de fusion et les 231 hypothèses ancrées.
>
> **Il ne contient PAS les 20 rapports MODE B** : ils n’ont pas encore été exécutés. Pour un plan
> fondé sur des preuves, l’agent doit d’abord exécuter les 20 prompts, produire `S01.md`…`S20.md`,
> puis consolider (MODE C). Pour un plan immédiat, il peut exploiter les hypothèses ci-dessous en
> marquant `[STATIQUE UNIQUEMENT]` tout ce qui n’est pas prouvé par exécution.

---

## 0. Mode d’emploi pour l’agent destinataire

1. **Lire la Partie 00** (`00-INDEX.md`) en premier : elle fixe la loi « code seul », les métriques,
   la matrice 602 entrées, les découpages par symbole et l’ordre de fusion S01–S04 → S05–S08 →
   S09–S12 → S13–S16 → S17–S19 → S20 → consolidation.
2. **Pour créer le plan sans attendre MODE B** : extraire les 231 hypothèses `H01-01`…`H20-12`,
   les regrouper par cause racine (session/RLS, arrondi, idempotence, panne silencieuse, dérive
   doc↔code), puis produire un backlog `P0/P1/P2/P3` avec dépendances et tests de régression
   « qui mordent ». Chaque risque non exécuté reste `[STATIQUE UNIQUEMENT]`.
3. **Pour créer le plan validé** : exécuter MODE B tranche par tranche avec les Parties 01–20,
   écrire `audit/rapports/S01.md`…`S20.md`, puis lancer MODE C (vue exécutive 20 lignes, backlog
   dédupliqué, matrice transverse, Release Gate Go/No-Go).
4. **Interdictions reçues avec le dossier** : ne jamais croire `README`/guides/commentaires/JSDoc/
   noms de tests ; ne pas supposer de protection « ailleurs » ; ne pas modifier le code produit ;
   ne pas prétendre avoir lancé PostgreSQL, Supabase, navigateur, E2E, build ou secrets absents.
5. Les marqueurs `<!-- BEGIN SOURCE ... -->` / `<!-- END SOURCE ... -->` permettent de redécouper
   ce fichier en 21 fichiers si l’agent préfère travailler par tranche. Entre chaque paire de
   marqueurs, le contenu est **exactement** le fichier source, y compris ses sauts de ligne finaux.

### 0.1 Rappel des faits déjà exécutés (sortie brute en Partie 00)

```text
npm ci  -> added 402 packages in 16s
npm test -> 1..785 | # tests 788 | # pass 781 | # fail 0 | # skipped 3 | # todo 4 | # duration_ms 248936.313588
npm run typecheck (tsc --noEmit) -> 0 erreur
npm run lint (eslint .) -> 0 erreur
Node v22.22.3 | npm 10.9.8
```

`npm run build`, `npm audit --omit=dev`, Playwright/E2E, PostgreSQL/Supabase/PostgREST/Auth réels,
navigateur, secrets de production et pile locale : **`[STATIQUE UNIQUEMENT]`**.

### 0.2 Check-list de transmission

- [x] 21 livrables MODE A intégrés verbatim, octet pour octet.
- [x] Matrice de propriété exclusive (602 entrées, 0 doublon).
- [x] 231 ancres `fichier:ligne` vérifiées, 10 à 12 par tranche.
- [x] Protocole forensique 7 étapes + Passe 2 + format de sortie standardisé.
- [x] Sorties brutes exécutées et limites d’environnement déclarées.
- [ ] 20 rapports MODE B — **absents volontairement, non encore produits**.

---

## 1. Sommaire des parties

| Partie | Fichier source | Lignes | Octets | SHA-256 (extrait) |
|---:|---|---:|---:|---|
| [00](#part-00) | `audit/00-INDEX.md` — 00 — INDEX MAÎTRE | 888 | 82474 | `4db5e0edac55…` |
| [01](#part-01) | `audit/01-authentification-sessions.md` — 01 — Authentification, Sessions, Identites & Tokens | 185 | 15951 | `beb709fbfd65…` |
| [02](#part-02) | `audit/02-autorisation-rbac-tenant.md` — 02 — Autorisation, Matrice des Roles & Isolation Multi-Tenant | 173 | 14613 | `9914d237b91d…` |
| [03](#part-03) | `audit/03-securite-base-rls.md` — 03 — Securite Base de Donnees, Privileges & Execution Privilegiee | 177 | 15666 | `4f20c9f21554…` |
| [04](#part-04) | `audit/04-surfaces-publiques-anti-abus.md` — 04 — Surfaces Publiques, Anti-Abus & Securite Web | 189 | 16673 | `e3694a6afb59…` |
| [05](#part-05) | `audit/05-calculs-precision-financiere.md` — 05 — Moteurs de Calcul, Precision Numerique & Regles Financieres | 228 | 19928 | `73ecb6c3b261…` |
| [06](#part-06) | `audit/06-machines-etat-workflows.md` — 06 — Machines a Etats, Workflows & Invariants Metier | 229 | 20405 | `22c4aceacfa3…` |
| [07](#part-07) | `audit/07-concurrence-verrous-idempotence.md` — 07 — Concurrence, Verrous, Isolation SQL & Idempotence | 170 | 14966 | `64249ff7d805…` |
| [08](#part-08) | `audit/08-modele-donnees-fuseaux.md` — 08 — Modele de Donnees, Contraintes, Fuseaux Horaires & Integrite Referentielle | 173 | 14830 | `9960b96d7b16…` |
| [09](#part-09) | `audit/09-contrats-api-validation.md` — 09 — Contrats API, Validation d'Entrees & Serialisation | 168 | 13980 | `7542f9f952d8…` |
| [10](#part-10) | `audit/10-etat-client-hydratation-caches.md` — 10 — Etat Client, Hydratation, Caches & Coherence UI-Serveur | 171 | 14844 | `5ef13c7141e4…` |
| [11](#part-11) | `audit/11-hors-ligne-pwa-files-locales.md` — 11 — Mode Hors-Ligne, PWA, Files d'Attente & Stockage Local | 172 | 14220 | `0d941314447d…` |
| [12](#part-12) | `audit/12-fichiers-medias-imports-exports.md` — 12 — Fichiers, Medias, Imports/Exports & Contenu Externe | 188 | 15509 | `d41f8b1190d2…` |
| [13](#part-13) | `audit/13-fiabilite-runtime-erreurs.md` — 13 — Fiabilite Runtime, Gestion d'Erreurs & Reprise sur Panne | 155 | 12946 | `275cc7260e68…` |
| [14](#part-14) | `audit/14-performance-applicative.md` — 14 — Performance Applicative, Complexite & Ressources | 159 | 12908 | `12484e7a38b6…` |
| [15](#part-15) | `audit/15-performance-base-scalabilite.md` — 15 — Performance Base de Donnees & Scalabilite | 153 | 12617 | `ec64bdbd06b9…` |
| [16](#part-16) | `audit/16-architecture-maintenabilite.md` — 16 — Architecture, Maintenabilite, Typage & Code Mort | 162 | 13477 | `0ac47a782736…` |
| [17](#part-17) | `audit/17-build-config-secrets-supply-chain.md` — 17 — Build, Configuration, Secrets & Supply Chain | 161 | 13132 | `8c02e8266752…` |
| [18](#part-18) | `audit/18-cicd-migrations-sauvegardes.md` — 18 — CI/CD, Migrations, Sauvegarde, Restauration & Rollback | 205 | 18773 | `1e9df16e4a57…` |
| [19](#part-19) | `audit/19-observabilite-audit-pii.md` — 19 — Observabilite, Auditabilite, PII & Exploitation | 168 | 14255 | `64cac47cd14d…` |
| [20](#part-20) | `audit/20-meta-audit-tests-drift.md` — 20 — Meta-Audit des Tests & Derive Code-Documentation | 238 | 21769 | `acedf1fb4b43…` |

**Empreinte combinée des 21 sources dans cet ordre** : `3aca815efb3ebff23d73ff088f6748da1a2bbd2863726d57fb131eefaf6ebf55`

> Ce fichier consolidé est le **22e livrable**, déclaré en T20 dans la Partie 00 (§8) avec `L=0`
> pour ne pas falsifier les 75 814 lignes de code mesurées avant sa création. Il n’est donc pas
> inclus dans son propre sommaire : il se lit lui-même.

---

<a id="part-00"></a>

## Partie 00 — `audit/00-INDEX.md`

> **Source** : `audit/00-INDEX.md` · **888 lignes** · **82474 octets** · **SHA-256** : `4db5e0edac55966ec892be42c551b082eeb724f61f2fcabd9d0e45490a5abf64`
> **Titre** : INDEX MAÎTRE · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/00-INDEX.md sha256=4db5e0edac55966ec892be42c551b082eeb724f61f2fcabd9d0e45490a5abf64 -->

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

<!-- END SOURCE: audit/00-INDEX.md -->

---

<a id="part-01"></a>

## Partie 01 — `audit/01-authentification-sessions.md`

> **Source** : `audit/01-authentification-sessions.md` · **185 lignes** · **15951 octets** · **SHA-256** : `beb709fbfd65800ad4f9ee04fea8237f58ef5d05b5b24c25a6d1c9ab10fe7b37`
> **Titre** : Authentification, Sessions, Identites & Tokens · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/01-authentification-sessions.md sha256=beb709fbfd65800ad4f9ee04fea8237f58ef5d05b5b24c25a6d1c9ab10fe7b37 -->

# Tranche 01/20 — Authentification, Sessions, Identites & Tokens

**Couche** : Couche 1 — Securite & frontieres de confiance · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S01.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**37 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/01-authentification-sessions.md` | 185 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/layout.tsx` | 87 | garde de session allowLocked (symboles initialBundle/DemoWorkspaceProvider -> T10) |
| `patisgest-app/src/app/(auth)/connexion/login-form.tsx` | 146 | formulaire login/signup |
| `patisgest-app/src/app/(auth)/connexion/page.tsx` | 32 | page de connexion |
| `patisgest-app/src/app/(auth)/rejoindre/page.tsx` | 37 | acceptation d'invitation |
| `patisgest-app/src/app/api/licence/statut/route.ts` | 29 | statut de licence |
| `patisgest-app/src/app/api/presence/heartbeat/route.ts` | 74 | heartbeat + signature du bundle |
| `patisgest-app/src/app/page.tsx` | 14 | racine: routage selon raison de session |
| `patisgest-app/src/components/client-logout.tsx` | 51 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/rejoindre-equipe.tsx` | 32 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/trial-guard-client.tsx` | 162 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/trial-lock-screen.tsx` | 129 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-auth.ts` | 52 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-licence.ts` | 442 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-rejoindre.ts` | 48 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/auth-session.ts` | 41 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/auth.ts` | 204 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/deconnexion-locale.ts` | 26 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/master-auth.ts` | 88 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pilot-account.ts` | 7 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pilot-accounts.ts` | 42 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/proxy-session.ts` | 83 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/supabase/client.ts` | 9 | client Supabase: session / privileges |
| `patisgest-app/src/lib/supabase/server.ts` | 35 | client Supabase: session / privileges |
| `patisgest-app/src/lib/trial-crypto.ts` | 117 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/trial-lock-client.ts` | 391 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/trial-server.ts` | 130 | module lib: responsabilite de la tranche |
| `patisgest-app/src/proxy.ts` | 98 | proxy: rotation de cookies via getUser()/setAll (symbole deciderRoutage -> T04) |
| `patisgest-app/supabase/51-essai-abonnement-connectivite.sql` | 363 | migration 51: essai, abonnement, presence: jetons et licence |
| `patisgest-app/tests/auth-session.test.mjs` | 36 | test a auditer pour cette tranche |
| `patisgest-app/tests/invitation-mail.test.mjs` | 27 | test a auditer pour cette tranche |
| `patisgest-app/tests/master-auth.test.mjs` | 188 | test a auditer pour cette tranche |
| `patisgest-app/tests/pilot-account.test.mjs` | 13 | test a auditer pour cette tranche |
| `patisgest-app/tests/proxy-session.test.mjs` | 112 | test a auditer pour cette tranche |
| `patisgest-app/tests/trial-license.test.mjs` | 256 | test a auditer pour cette tranche |
| `patisgest-app/tests/trial-lock-demo.test.mjs` | 118 | test a auditer pour cette tranche |
| `patisgest-app/tests/trial-lock.test.mjs` | 282 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- Tous les fichiers SQL de RLS/`GRANT` (T03) : ne pas auditer, citer uniquement pour la parité.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/auth-session.test.mjs` (36 lignes) — propriété T01.
- `patisgest-app/tests/invitation-mail.test.mjs` (27 lignes) — propriété T01.
- `patisgest-app/tests/master-auth.test.mjs` (188 lignes) — propriété T01.
- `patisgest-app/tests/pilot-account.test.mjs` (13 lignes) — propriété T01.
- `patisgest-app/tests/proxy-session.test.mjs` (112 lignes) — propriété T01.
- `patisgest-app/tests/trial-license.test.mjs` (256 lignes) — propriété T01.
- `patisgest-app/tests/trial-lock-demo.test.mjs` (118 lignes) — propriété T01.
- `patisgest-app/tests/trial-lock.test.mjs` (282 lignes) — propriété T01.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H01-01** — `patisgest-app/src/lib/auth.ts:122` — `if (!essaiActif()) return { ctx, raison: null }` : le mode gratuit (defaut) court-circuite toute lecture de licence. Verifier l'activation reelle du verrou serveur quand PATISGEST_MODE_GRATUIT=0 et la liste des actions qui appellent getSessionContext().
- **H01-02** — `patisgest-app/src/lib/auth.ts:126` — `lireStatutEssaiPartage().catch(() => null)` : echec ouvert assume. Une panne ou un timeout du RPC de licence leve le verrou ; determiner si un client peut provoquer cette panne a volonte.
- **H01-03** — `patisgest-app/src/lib/auth.ts:153` — `Promise.race([supabase.auth.getUser(), timer 1500 ms])` : au-dela de 1,5 s la session devient `null` sans distinction entre 'pas de session' et 'Auth indisponible'. Mesurer l'effet sur une connexion lente.
- **H01-04** — `patisgest-app/src/lib/auth.ts:136` — `demoEnabled() && pilotCookie` : cookie HMAC-SHA256 `payload.signature`, expire par `expires > Date.now()` (l.145), sans jti, sans rotation, sans revocation. Verifier le rejeu et le changement d'utilisateur sur appareil partage.
- **H01-05** — `patisgest-app/src/lib/trial-crypto.ts:32` — Graine de repli publique `"patisgest-ephemeral-dev-seed-change-in-production"` quand aucun des 4 secrets n'est defini : les jetons de licence ECDSA sont alors reproductibles par quiconque connait le depot.
- **H01-06** — `patisgest-app/src/lib/master-auth.ts:34` — `createHmac("sha256", masterKey())` : la cle de signature du cookie Master est le mot de passe lui-meme, dont la longueur minimale n'est que 16 caracteres (l.16). Verifier l'absence de rotation et la duree de 12 h (l.39).
- **H01-07** — `patisgest-app/src/proxy.ts:45` — `if (!url || !anonKey) return supabaseResponse;` : configuration absente = laisser passer. Etablir la chaine complete des gardes qui empechent neanmoins l'acces aux donnees dans ce cas.
- **H01-08** — `patisgest-app/src/proxy.ts:50` — Court-circuit `NODE_ENV !== "production" && PATISGEST_DEMO_MODE === "true" && cookie present` AVANT getUser() : la simple presence d'un cookie non verifie suffit a sauter le rafraichissement de session.
- **H01-09** — `patisgest-app/src/lib/supabase/server.ts:28` — `catch { /* Appele depuis un Server Component */ }` sur cookieStore.set : la rotation de session est avalee. Correler avec le marqueur `x-patisgest-session-stale` pose par proxy.ts:85.
- **H01-10** — `patisgest-app/src/app/api/presence/heartbeat/route.ts:15` — `getSessionContext({ allowLocked: true })` : un compte verrouille peut atteindre cette route, qui signe et renvoie un bundle de licence (l.42-69). Verifier que ce n'est pas une issue d'escalade.
- **H01-11** — `patisgest-app/src/lib/actions-auth.ts:31` — `if (!demoEnabled()) redirect("/connexion");` puis HMAC du cookie (l.34-37) : tracer login/logout, fixation de session et destruction du cookie cote navigateur (client-logout.tsx).
- **H01-12** — `patisgest-app/src/app/(app)/layout.tsx:33` — `getSessionContextDetaille({ allowLocked: true })` : le layout est la seule garde de rendu ; prouver que CHAQUE Server Action revalide la session et le role sans se fier au layout.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S01.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S01-F001`, `S01-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/01-authentification-sessions.md -->

---

<a id="part-02"></a>

## Partie 02 — `audit/02-autorisation-rbac-tenant.md`

> **Source** : `audit/02-autorisation-rbac-tenant.md` · **173 lignes** · **14613 octets** · **SHA-256** : `9914d237b91da551e9c0eec8615924d8dbf1e461e4c075c526d17fa44c799ca5`
> **Titre** : Autorisation, Matrice des Roles & Isolation Multi-Tenant · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/02-autorisation-rbac-tenant.md sha256=9914d237b91da551e9c0eec8615924d8dbf1e461e4c075c526d17fa44c799ca5 -->

# Tranche 02/20 — Autorisation, Matrice des Roles & Isolation Multi-Tenant

**Couche** : Couche 1 — Securite & frontieres de confiance · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S02.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**26 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/02-autorisation-rbac-tenant.md` | 173 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/[module]/page.tsx` | 455 | garde d'acces aux modules et roles |
| `patisgest-app/src/app/(app)/parametres/page.tsx` | 349 | parametres: modules, equipe, sites, roles |
| `patisgest-app/src/app/master/page.tsx` | 144 | entree de l'espace Master privilegie |
| `patisgest-app/src/components/equipe-settings.tsx` | 106 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/master-portal.tsx` | 515 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/modules-settings.tsx` | 14 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sites-settings.tsx` | 31 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/workspace-nav.tsx` | 64 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-equipe.ts` | 162 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-modules.ts` | 21 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-sites.ts` | 32 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/equipe-experimental.ts` | 20 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/invitation-mail.ts` | 27 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/modules-access.ts` | 14 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/permissions.ts` | 128 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/supabase/admin.ts` | 23 | client Supabase: session / privileges |
| `patisgest-app/src/lib/vitrine-permissions.ts` | 99 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/workspace-nav.ts` | 36 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/actions-caisse-surface.test.mjs` | 45 | test a auditer pour cette tranche |
| `patisgest-app/tests/actions-roles-execution.test.mjs` | 193 | test a auditer pour cette tranche |
| `patisgest-app/tests/equipe-experimental.test.mjs` | 68 | test a auditer pour cette tranche |
| `patisgest-app/tests/matrice-app-schema.test.mjs` | 150 | test a auditer pour cette tranche |
| `patisgest-app/tests/modules-access-db.test.mjs` | 42 | test a auditer pour cette tranche |
| `patisgest-app/tests/modules-access.test.mjs` | 110 | test a auditer pour cette tranche |
| `patisgest-app/tests/permissions.test.mjs` | 83 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/actions-licence.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les policies RLS, `SECURITY DEFINER` et `GRANT`/`REVOKE` (T03) : lire pour la parité, ne pas auditer.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/actions-caisse-surface.test.mjs` (45 lignes) — propriété T02.
- `patisgest-app/tests/actions-roles-execution.test.mjs` (193 lignes) — propriété T02.
- `patisgest-app/tests/equipe-experimental.test.mjs` (68 lignes) — propriété T02.
- `patisgest-app/tests/matrice-app-schema.test.mjs` (150 lignes) — propriété T02.
- `patisgest-app/tests/modules-access-db.test.mjs` (42 lignes) — propriété T02.
- `patisgest-app/tests/modules-access.test.mjs` (110 lignes) — propriété T02.
- `patisgest-app/tests/permissions.test.mjs` (83 lignes) — propriété T02.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H02-01** — `patisgest-app/src/lib/permissions.ts:51` — `canAccessModule` : `role === "proprietaire"` retourne true pour n'importe quelle cle, meme inconnue de MODULE_ROLES. Verifier la parite avec les cles de `acces_modules` et les policies de la migration 23.
- **H02-02** — `patisgest-app/src/lib/permissions.ts:67` — `canReadCosts` = proprietaire seul. Comparer avec `50-roles-permissions-vues.sql:123` (policies vendeur) et avec les RPC SECURITY DEFINER de couts : la meme regle est-elle appliquee cote base ?
- **H02-03** — `patisgest-app/src/lib/modules-access.ts:11` — `if (error || !Array.isArray(data) ...) return null` : en panne DB la navigation est reduite (fail-closed) mais les actions serveur, elles, ne consultent pas ce Set. Prouver ou refuter le contournement par appel direct.
- **H02-04** — `patisgest-app/src/app/(app)/[module]/page.tsx:140` — Garde `canAccessModule` + `coutsAutorises` au rendu, et `catch { /* refuser si la verification est indisponible */ }` en l.151. Verifier le chemin d'une action invoquee directement sans passer par la page.
- **H02-05** — `patisgest-app/src/lib/actions-licence.ts:52` — `createAdminClient()` (service_role, bypass RLS) dans une Server Action : tracer l'appelant, la garde `verifyMasterCredentials` (l.208) et `requireMasterSession` pour chaque usage (l.240, 328, 366, 408).
- **H02-06** — `patisgest-app/src/lib/supabase/admin.ts:15` — `if (!url || !serviceKey) return null;` : verifier que TOUS les appelants transforment ce null en refus explicite plutot qu'en degradation silencieuse.
- **H02-07** — `patisgest-app/src/lib/actions-equipe.ts:19` — Garde `estProprietaireSeul(ctx.role)` sur une seule export ; verifier que les exports des l.49, 64, 77, 94, 138, 157 portent la meme garde et un filtre client_id.
- **H02-08** — `patisgest-app/src/lib/actions-sites.ts:25` — `.eq("client_id", ctx.clientId)` sur UPDATE, mais INSERT (l.26) prend `client_id` du contexte : tester l'IDOR avec un `id` d'un autre tenant et prouver le role exact de la RLS.
- **H02-09** — `patisgest-app/src/lib/vitrine-permissions.ts:55` — Matrice `PERMISSIONS`/`peutVitrine` : verifier que chaque export de actions-vitrine.ts appelle cette matrice et que les RPC SQL correspondantes la re appliquent.
- **H02-10** — `patisgest-app/src/app/(app)/parametres/page.tsx:98` — `catch { modulesError=true; sitesError=true; equipeError=true; }` : une seule panne RPC marque trois domaines indisponibles. Verifier l'absence de contournement et la lisibilite pour l'operateur.
- **H02-11** — `patisgest-app/src/app/master/page.tsx:1` — Entree de l'espace Master : prouver la chaine `page -> master-portal -> actions-licence -> admin client` et l'absence d'appel direct non authentifie.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S02.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S02-F001`, `S02-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/02-autorisation-rbac-tenant.md -->

---

<a id="part-03"></a>

## Partie 03 — `audit/03-securite-base-rls.md`

> **Source** : `audit/03-securite-base-rls.md` · **177 lignes** · **15666 octets** · **SHA-256** : `4f20c9f21554025a90a0feb5621ed54ff308dcef768e1fee6288285bd21e6667`
> **Titre** : Securite Base de Donnees, Privileges & Execution Privilegiee · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/03-securite-base-rls.md sha256=4f20c9f21554025a90a0feb5621ed54ff308dcef768e1fee6288285bd21e6667 -->

# Tranche 03/20 — Securite Base de Donnees, Privileges & Execution Privilegiee

**Couche** : Couche 1 — Securite & frontieres de confiance · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S03.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**24 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/03-securite-base-rls.md` | 177 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/lib/rls-probe.ts` | 101 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/01-socle.sql` | 97 | migration 01: socle: tables, RLS, policies clients/utilisateurs/sites |
| `patisgest-app/supabase/04-securite-lecture.sql` | 12 | migration 04: policies de lecture tenant generees dynamiquement |
| `patisgest-app/supabase/17-confidentialite-couts-rls.sql` | 115 | migration 17: confidentialite des couts: RLS et revoke/grant |
| `patisgest-app/supabase/19-confidentialite-familles-recettes.sql` | 14 | migration 19: confidentialite familles de recettes: RLS |
| `patisgest-app/supabase/20-creation-fournisseur.sql` | 17 | migration 20: creation fournisseur: revoke INSERT + policy |
| `patisgest-app/supabase/23-controle-modules.sql` | 142 | migration 23: controle des modules: policies restrictives + gardes RPC |
| `patisgest-app/supabase/28-fermeture-anon.sql` | 102 | migration 28: fermeture des droits anon sur tables/sequences |
| `patisgest-app/supabase/29-fermeture-public-fonctions.sql` | 73 | migration 29: fermeture des droits PUBLIC sur les fonctions |
| `patisgest-app/supabase/30-edition-vitrine-rpc.sql` | 153 | migration 30: RPC d'edition vitrine: security definer et tenant |
| `patisgest-app/supabase/31-publication-vitrine.sql` | 98 | migration 31: publication vitrine: verrous et droits |
| `patisgest-app/supabase/39-limites-tenant-restauration-sites-vitrine.sql` | 245 | migration 39: limites tenant, restauration, sites et vitrine |
| `patisgest-app/supabase/50-roles-permissions-vues.sql` | 700 | migration 50: roles/permissions/vues: parite et RLS |
| `patisgest-app/tests/anti-abus-vitrine-db.test.mjs` | 103 | test a auditer pour cette tranche |
| `patisgest-app/tests/confidentialite-roles-db.test.mjs` | 192 | test a auditer pour cette tranche |
| `patisgest-app/tests/droits-execution-db.test.mjs` | 51 | test a auditer pour cette tranche |
| `patisgest-app/tests/integration/auth-postgrest.mjs` | 876 | pile Auth + PostgREST locale: privileges et RLS |
| `patisgest-app/tests/labo-confidentialite-db.test.mjs` | 53 | test a auditer pour cette tranche |
| `patisgest-app/tests/phase1-f02-f20-db.test.mjs` | 107 | test a auditer pour cette tranche |
| `patisgest-app/tests/phase1-rattrapage-db.test.mjs` | 99 | test a auditer pour cette tranche |
| `patisgest-app/tests/phase1-security-regressions.test.mjs` | 121 | test a auditer pour cette tranche |
| `patisgest-app/tests/rls-probe.test.mjs` | 92 | test a auditer pour cette tranche |
| `patisgest-app/tests/vues-roles-recette.test.mjs` | 62 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/supabase/03-sprint2-modules.sql` → **T08** (`migration 03: creation des tables Sprint 2, contraintes et valeurs par defaut`) : preuve de traçage uniquement.
- `patisgest-app/supabase/06-ventes-caisse-fefo.sql` → **T05** (`migration 06: vente FEFO: arrondi, consommation de lots, totaux`) : preuve de traçage uniquement.
- `patisgest-app/supabase/26-vitrine-publique.sql` → **T04** (`migration 26: vitrine publique: vue catalogue et donnees exposees`) : preuve de traçage uniquement.
- Les actions serveur et `permissions.ts` (T01/T02) : citer pour la chaîne d’appel, ne pas auditer.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/anti-abus-vitrine-db.test.mjs` (103 lignes) — propriété T03.
- `patisgest-app/tests/confidentialite-roles-db.test.mjs` (192 lignes) — propriété T03.
- `patisgest-app/tests/droits-execution-db.test.mjs` (51 lignes) — propriété T03.
- `patisgest-app/tests/integration/auth-postgrest.mjs` (876 lignes) — propriété T03.
- `patisgest-app/tests/labo-confidentialite-db.test.mjs` (53 lignes) — propriété T03.
- `patisgest-app/tests/phase1-f02-f20-db.test.mjs` (107 lignes) — propriété T03.
- `patisgest-app/tests/phase1-rattrapage-db.test.mjs` (99 lignes) — propriété T03.
- `patisgest-app/tests/phase1-security-regressions.test.mjs` (121 lignes) — propriété T03.
- `patisgest-app/tests/rls-probe.test.mjs` (92 lignes) — propriété T03.
- `patisgest-app/tests/vues-roles-recette.test.mjs` (62 lignes) — propriété T03.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H03-01** — `patisgest-app/supabase/01-socle.sql:51` — `create policy "clients_select_own"` : lire la clause USING exacte et verifier qu'elle ne permet pas a un utilisateur de lire un autre client via une jointure.
- **H03-02** — `patisgest-app/supabase/04-securite-lecture.sql:9` — `execute format('create policy %I on public.%I for select ...')` : la liste de tables est figee dans la migration ; comparer avec toutes les tables creees par 02..53 pour detecter les tables sans policy.
- **H03-03** — `patisgest-app/supabase/03-sprint2-modules.sql:251` — Seconde generation de policies tenant (meme motif) : verifier la divergence de perimetre entre 03 et 04 et le risque de policy dupliquee ou manquante.
- **H03-04** — `patisgest-app/supabase/28-fermeture-anon.sql:48` — `execute format('revoke all on public.%I from anon', r.relname)` : boucle sur l'etat a l'instant T. Verifier les tables creees APRES 28 (40, 42, 48, 51) et leurs droits anon.
- **H03-05** — `patisgest-app/supabase/29-fermeture-public-fonctions.sql:42` — `revoke all on function %s from public` : PostgreSQL accorde EXECUTE a PUBLIC par defaut. Verifier les fonctions creees apres 29 (40, 41, 42, 48, 51, 53) et l'heritage anon.
- **H03-06** — `patisgest-app/supabase/50-roles-permissions-vues.sql:135` — Vues `labo_*`/`vendeur_*` avec `security_barrier = true` : verifier que le predicat de role est aussi porte par la RLS de la table sous-jacente (sinon lecture directe possible).
- **H03-07** — `patisgest-app/supabase/17-confidentialite-couts-rls.sql:99` — `revoke all ... from public, anon, authenticated; grant execute ... to authenticated, service_role` (l.100) : revoke puis grant sur le meme role. Etablir l'effet net reel et la garde de role dans le corps de la fonction.
- **H03-08** — `patisgest-app/supabase/23-controle-modules.sql:132` — Policies RESTRICTIVE generees avec `unnest(string_to_array(%L,'|'))` : verifier le comportement quand la liste de modules est vide ou NULL (fail-open vs fail-closed).
- **H03-09** — `patisgest-app/supabase/30-edition-vitrine-rpc.sql:38` — `security definer` sur une RPC d'edition : tracer la garde `client_id = patisgest_mon_client()` et `patisgest_mon_role()` dans tout le corps.
- **H03-10** — `patisgest-app/supabase/39-limites-tenant-restauration-sites-vitrine.sql:124` — `security definer` : verifier `set search_path`, la garde de role et l'absence d'injection via les parametres textes.
- **H03-11** — `patisgest-app/supabase/06-ventes-caisse-fefo.sql:191` — `revoke execute ... from public, anon; grant ... to authenticated, service_role` : verifier que la version finale installee (21/53) conserve ces droits et que le `search_path` est vide (21:525).
- **H03-12** — `patisgest-app/supabase/26-vitrine-publique.sql:148` — `create policy vitrine_photos_lecture ... using (client_id = patisgest_mon_client())` : tester la lecture d'une photo d'un autre tenant et la presence d'une policy INSERT/UPDATE equivalente.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S03.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S03-F001`, `S03-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/03-securite-base-rls.md -->

---

<a id="part-04"></a>

## Partie 04 — `audit/04-surfaces-publiques-anti-abus.md`

> **Source** : `audit/04-surfaces-publiques-anti-abus.md` · **189 lignes** · **16673 octets** · **SHA-256** : `e3694a6afb59e5d20132cd91b20cc3c4f9bdc9b7d3deffe023da311115e4f8bc`
> **Titre** : Surfaces Publiques, Anti-Abus & Securite Web · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/04-surfaces-publiques-anti-abus.md sha256=e3694a6afb59e5d20132cd91b20cc3c4f9bdc9b7d3deffe023da311115e4f8bc -->

# Tranche 04/20 — Surfaces Publiques, Anti-Abus & Securite Web

**Couche** : Couche 1 — Securite & frontieres de confiance · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S04.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**33 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/04-surfaces-publiques-anti-abus.md` | 189 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(vitrine)/layout.tsx` | 33 | layout public vitrine |
| `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts` | 109 | Server Action anonyme de commande |
| `patisgest-app/src/app/(vitrine)/vitrine/[slug]/page.tsx` | 145 | rendu public par slug |
| `patisgest-app/src/app/estimation/page.tsx` | 55 | calculateur public sans compte |
| `patisgest-app/src/components/vitrine-commande.tsx` | 129 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/vitrine-form.tsx` | 255 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-vitrine.ts` | 301 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/domaines.ts` | 172 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-anti-abus.ts` | 22 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-slug.ts` | 54 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine.ts` | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/whatsapp.ts` | 94 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/25-domaines-boutiques.sql` | 196 | migration 25: domaines boutiques, sous-domaines, vitrine |
| `patisgest-app/supabase/26-vitrine-publique.sql` | 267 | migration 26: vitrine publique: vue catalogue et donnees exposees |
| `patisgest-app/supabase/27-commandes-vitrine.sql` | 249 | migration 27: commandes vitrine anonymes, plafond global |
| `patisgest-app/supabase/32-garde-prix-vitrine-rattrapage.sql` | 75 | migration 32: garde de prix vitrine (rattrapage) |
| `patisgest-app/supabase/38-anti-abus-vitrine-source.sql` | 120 | migration 38: anti-abus vitrine par source (plafond) |
| `patisgest-app/tests/domaines.test.mjs` | 76 | test a auditer pour cette tranche |
| `patisgest-app/tests/fixtures/pilote-vitrine/25-domaines-boutiques.sql` | 196 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/26-vitrine-publique.sql` | 267 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/27-commandes-vitrine.sql` | 249 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/28-fermeture-anon.sql` | 102 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/29-fermeture-public-fonctions.sql` | 73 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/30-edition-vitrine-rpc.sql` | 153 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/31-publication-vitrine.sql` | 98 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/securite.test.mjs` | 335 | test a auditer pour cette tranche |
| `patisgest-app/tests/serie-main-vitrine-commande.test.mjs` | 28 | test a auditer pour cette tranche |
| `patisgest-app/tests/serie-main-vitrine-db.test.mjs` | 32 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-anti-abus.test.mjs` | 34 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-perimetre.test.mjs` | 77 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-permissions.test.mjs` | 126 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-slug.test.mjs` | 78 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/app/api/health/route.ts` → **T19** (`healthcheck public`) : preuve de traçage uniquement.
- Les RPC de calcul et de vente (T05/T07), le CSS et le bundle (T14), le Service Worker (T11).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/domaines.test.mjs` (76 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/25-domaines-boutiques.sql` (196 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/26-vitrine-publique.sql` (267 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/27-commandes-vitrine.sql` (249 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/28-fermeture-anon.sql` (102 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/29-fermeture-public-fonctions.sql` (73 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/30-edition-vitrine-rpc.sql` (153 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/31-publication-vitrine.sql` (98 lignes) — propriété T04.
- `patisgest-app/tests/securite.test.mjs` (335 lignes) — propriété T04.
- `patisgest-app/tests/serie-main-vitrine-commande.test.mjs` (28 lignes) — propriété T04.
- `patisgest-app/tests/serie-main-vitrine-db.test.mjs` (32 lignes) — propriété T04.
- `patisgest-app/tests/vitrine-anti-abus.test.mjs` (34 lignes) — propriété T04.
- `patisgest-app/tests/vitrine-perimetre.test.mjs` (77 lignes) — propriété T04.
- `patisgest-app/tests/vitrine-permissions.test.mjs` (126 lignes) — propriété T04.
- `patisgest-app/tests/vitrine-slug.test.mjs` (78 lignes) — propriété T04.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H04-01** — `patisgest-app/src/lib/vitrine-anti-abus.ts:15` — `if (!secret || secret.length < 32) return null;` : sans secret (valeur par defaut de .env.example:20), le plafond par source est desactive et seul le plafond global de 27 subsiste. Quantifier l'abus possible.
- **H04-02** — `patisgest-app/src/lib/vitrine-anti-abus.ts:16` — `x-forwarded-for?.split(",")[0]` : en-tete controllabe par le client chez certains proxys. Un attaquant change la valeur -> nouveau HMAC -> contournement du plafond par source.
- **H04-03** — `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts:73` — Les erreurs `CODES_FONCTION_ABSENTE` (PGRST202/42883) de la verification de source sont ignorees : si la migration 38 n'est pas installee, la commande passe sans aucun plafond par source.
- **H04-04** — `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts:33` — `sousDomaine` est lu dans le FormData, pas dans l'en-tete Host : un visiteur peut soumettre un autre slug. Prouver que la RPC 27 (l.63-69 de la migration) lie bien la boutique cible au domaine.
- **H04-05** — `patisgest-app/supabase/27-commandes-vitrine.sql:105` — Idempotence par `cle_navigateur` fournie par le client (actions.ts:40) : verifier l'enumeration, la reutilisation d'une cle d'autrui et l'absence de limite de taille cote SQL.
- **H04-06** — `patisgest-app/supabase/38-anti-abus-vitrine-source.sql:75` — `insert ...` (l.75) AVANT le `select count(*)` (l.77) sans verrou : deux requetes concurrentes peuvent toutes deux passer le plafond. Decrire la sequence exacte.
- **H04-07** — `patisgest-app/supabase/38-anti-abus-vitrine-source.sql:88` — `grant execute ... to anon, authenticated, service_role` : verifier qu'il s'agit bien de la SEULE fonction anon restante apres 29, et que son corps n'expose aucune donnee d'un autre tenant.
- **H04-08** — `patisgest-app/src/lib/domaines.ts:51` — `hote.endsWith(".vercel.app") || hote.endsWith(".e2b.app")` classe ces hotes comme 'application' : analyser le spoofing Host et l'interaction avec `src/proxy.ts:25-29`.
- **H04-09** — `patisgest-app/src/lib/domaines.ts:158` — `CHEMINS_APPLICATION.some(p => normalise === p || normalise.startsWith(p))` : `/api/...` sur un sous-domaine boutique n'est PAS reecrit. Verifier quelles routes API restent joignables depuis l'origine publique.
- **H04-10** — `patisgest-app/src/app/api/health/route.ts:15` — Sonde GET publique sans DB : verifier l'absence de donnee de tenant, l'absence d'effet de bord et le comportement quand la base est en pause (200 mensonger).
- **H04-11** — `patisgest-app/supabase/26-vitrine-publique.sql:208` — `create or replace view public.vitrine_catalogue` : lire la liste exacte des colonnes (l.212-225) et prouver qu'aucun cout, marge, prix de revient ou identifiant interne n'est expose a anon.
- **H04-12** — `patisgest-app/src/lib/domaines.ts:87` — Validation du sous-domaine par regex DNS (1-63, ASCII) : verifier les entrees avec port, point final, unicode/punycode et leur effet sur la reecriture de proxy.ts:34-37.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S04.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S04-F001`, `S04-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/04-surfaces-publiques-anti-abus.md -->

---

<a id="part-05"></a>

## Partie 05 — `audit/05-calculs-precision-financiere.md`

> **Source** : `audit/05-calculs-precision-financiere.md` · **228 lignes** · **19928 octets** · **SHA-256** : `73ecb6c3b261ce825a96b12b74243a7377c60e4b4db2e19ed00fd8de07d6e94d`
> **Titre** : Moteurs de Calcul, Precision Numerique & Regles Financieres · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/05-calculs-precision-financiere.md sha256=73ecb6c3b261ce825a96b12b74243a7377c60e4b4db2e19ed00fd8de07d6e94d -->

# Tranche 05/20 — Moteurs de Calcul, Precision Numerique & Regles Financieres

**Couche** : Couche 2 — Logique metier & integrite · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S05.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**65 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/05-calculs-precision-financiere.md` | 228 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/cake-ticket.tsx` | 77 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/charge-capacite-panel.tsx` | 129 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cost-sheet-form.tsx` | 176 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/ingredient-impact-panel.tsx` | 480 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/owner-price-alerts.tsx` | 266 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/portion-estimator.tsx` | 977 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recon-panel.tsx` | 183 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-composer.tsx` | 539 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-credit-fields.tsx` | 58 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-form.tsx` | 496 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-history.tsx` | 72 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-ticket.tsx` | 154 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sales-chart.tsx` | 144 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/shop-advisor-panel.tsx` | 264 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-caisse.ts` | 364 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-couts.ts` | 538 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-credits.ts` | 206 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-price-alerts.ts` | 172 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-simulation.ts` | 105 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/cake-money.ts` | 6 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/cake-priority.ts` | 9 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/charge-capacite.ts` | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/cost-sheet.ts` | 294 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/credits.ts` | 153 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/fefo-cost.ts` | 132 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/free-recipes.ts` | 165 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/ingredient-impact.ts` | 541 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/main-oeuvre.ts` | 34 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/owner-price-guard.ts` | 119 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/portion-estimator.ts` | 687 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pos-cart.ts` | 359 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/price-alerts.ts` | 57 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/reconciliation.ts` | 288 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/shop-advisor.ts` | 404 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/06-ventes-caisse-fefo.sql` | 192 | migration 06: vente FEFO: arrondi, consommation de lots, totaux |
| `patisgest-app/supabase/12-sous-recettes-conversions.sql` | 442 | migration 12: sous-recettes et conversions: facteurs et couts |
| `patisgest-app/supabase/14-cake-edition-cgv-ticket.sql` | 152 | migration 14: edition cake, CGV, ticket: montants et acompte |
| `patisgest-app/supabase/15-parametres-couts.sql` | 25 | migration 15: parametres de couts: taux horaire, charges |
| `patisgest-app/supabase/21-prix-demain-panier.sql` | 1249 | migration 21: prix demain/panier: vendre_panier, FEFO, arrondis |
| `patisgest-app/supabase/22-cake-production.sql` | 203 | migration 22: production cake: couts et tickets |
| `patisgest-app/supabase/34-cout-of-partiel.sql` | 47 | migration 34: cout OF partiel: calcul des couts connus |
| `patisgest-app/supabase/41-avoirs-retours.sql` | 281 | migration 41: avoirs/retours: montants negatifs |
| `patisgest-app/supabase/46-credits-clients.sql` | 132 | migration 46: credits clients: soldes et reglements |
| `patisgest-app/tests/actions-credits.test.mjs` | 274 | test a auditer pour cette tranche |
| `patisgest-app/tests/avoirs-db.test.mjs` | 270 | test a auditer pour cette tranche |
| `patisgest-app/tests/charge-capacite.test.mjs` | 97 | test a auditer pour cette tranche |
| `patisgest-app/tests/cost-sheet.test.mjs` | 124 | test a auditer pour cette tranche |
| `patisgest-app/tests/credits.test.mjs` | 146 | test a auditer pour cette tranche |
| `patisgest-app/tests/csv.test.mjs` | 128 | test a auditer pour cette tranche |
| `patisgest-app/tests/export-comptable.test.mjs` | 104 | test a auditer pour cette tranche |
| `patisgest-app/tests/fefo-cost.test.mjs` | 123 | test a auditer pour cette tranche |
| `patisgest-app/tests/fefo-parite-db.test.mjs` | 30 | test a auditer pour cette tranche |
| `patisgest-app/tests/free-recipes-dashboard.test.mjs` | 60 | test a auditer pour cette tranche |
| `patisgest-app/tests/impression-ticket.test.mjs` | 69 | test a auditer pour cette tranche |
| `patisgest-app/tests/ingredient-impact.test.mjs` | 265 | test a auditer pour cette tranche |
| `patisgest-app/tests/main-oeuvre.test.mjs` | 31 | test a auditer pour cette tranche |
| `patisgest-app/tests/portion-estimator.test.mjs` | 178 | test a auditer pour cette tranche |
| `patisgest-app/tests/pos-cart-demain.test.mjs` | 270 | test a auditer pour cette tranche |
| `patisgest-app/tests/pos-cart-prix-nul.test.mjs` | 25 | test a auditer pour cette tranche |
| `patisgest-app/tests/pos-rounding.test.mjs` | 62 | test a auditer pour cette tranche |
| `patisgest-app/tests/price-alerts.test.mjs` | 60 | test a auditer pour cette tranche |
| `patisgest-app/tests/rc-reference.test.mjs` | 100 | test a auditer pour cette tranche |
| `patisgest-app/tests/reconciliation.test.mjs` | 75 | test a auditer pour cette tranche |
| `patisgest-app/tests/shop-advisor.test.mjs` | 127 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/export-comptable.ts` → **T12** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-free-recipes.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les contrats HTTP et la sérialisation (T09/T12), les verrous SQL (T07), les indexes (T15).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/actions-credits.test.mjs` (274 lignes) — propriété T05.
- `patisgest-app/tests/avoirs-db.test.mjs` (270 lignes) — propriété T05.
- `patisgest-app/tests/charge-capacite.test.mjs` (97 lignes) — propriété T05.
- `patisgest-app/tests/cost-sheet.test.mjs` (124 lignes) — propriété T05.
- `patisgest-app/tests/credits.test.mjs` (146 lignes) — propriété T05.
- `patisgest-app/tests/csv.test.mjs` (128 lignes) — propriété T05.
- `patisgest-app/tests/export-comptable.test.mjs` (104 lignes) — propriété T05.
- `patisgest-app/tests/fefo-cost.test.mjs` (123 lignes) — propriété T05.
- `patisgest-app/tests/fefo-parite-db.test.mjs` (30 lignes) — propriété T05.
- `patisgest-app/tests/free-recipes-dashboard.test.mjs` (60 lignes) — propriété T05.
- `patisgest-app/tests/impression-ticket.test.mjs` (69 lignes) — propriété T05.
- `patisgest-app/tests/ingredient-impact.test.mjs` (265 lignes) — propriété T05.
- `patisgest-app/tests/main-oeuvre.test.mjs` (31 lignes) — propriété T05.
- `patisgest-app/tests/portion-estimator.test.mjs` (178 lignes) — propriété T05.
- `patisgest-app/tests/pos-cart-demain.test.mjs` (270 lignes) — propriété T05.
- `patisgest-app/tests/pos-cart-prix-nul.test.mjs` (25 lignes) — propriété T05.
- `patisgest-app/tests/pos-rounding.test.mjs` (62 lignes) — propriété T05.
- `patisgest-app/tests/price-alerts.test.mjs` (60 lignes) — propriété T05.
- `patisgest-app/tests/rc-reference.test.mjs` (100 lignes) — propriété T05.
- `patisgest-app/tests/reconciliation.test.mjs` (75 lignes) — propriété T05.
- `patisgest-app/tests/shop-advisor.test.mjs` (127 lignes) — propriété T05.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H05-01** — `patisgest-app/src/lib/pos-cart.ts:77` — `round4 = n => Math.round((n + Number.EPSILON) * 10_000)/10_000` : EPSILON ajoute est negligible pour les grands nombres et biaise les negatifs. Comparer avec `numeric` PostgreSQL et la limite MAX_CART_QTE (l.15).
- **H05-02** — `patisgest-app/src/lib/pos-cart.ts:113` — Calcul BigInt `q.coefficient * prix.coefficient * BIGINT_HUNDRED` : avec qte=1e8 et prix=1e8, verifier le depassement de BIGINT et la parite avec `round(x,2)` de 21-prix-demain-panier.sql:503.
- **H05-03** — `patisgest-app/src/lib/pos-cart.ts:214` — `item.prixHT > 0` refuse le prix nul cote client : verifier que le serveur (21/53) applique la meme regle et qu'un panier forge via RPC n'encaisse pas 0 DA.
- **H05-04** — `patisgest-app/src/lib/cake-money.ts:3` — `prixHt * (1 + tvaPct/100)` en virgule flottante puis `Math.round(...)` : montrer un cas ou le resultat differe du `numeric` SQL (demi-centime, arrondi half-up).
- **H05-05** — `patisgest-app/src/lib/export-comptable.ts:71` — `arrondi2 = n => Math.round(n*100)/100` : pour les avoirs negatifs (l.88 `signe = -1`), Math.round(-x.5) arrondit vers le haut, pas comme PostgreSQL round(numeric,2). Calculer l'ecart sur un avoir a 0,005.
- **H05-06** — `patisgest-app/src/lib/actions-couts.ts:236` — `Math.round(lignes.reduce((s,l) => s+l.cout,0)*100)/100` : arrondi du total apres somme de floats ; comparer avec la somme d'arrondis par ligne et l'impact sur la marge.
- **H05-07** — `patisgest-app/src/lib/actions-simulation.ts:95` — `coutUnite: Math.round((total/qte)*10000)/10000` : verifier la garde sur qte (l.46) et le resultat si qte=0 ou NaN (Infinity/NaN serialise en JSON).
- **H05-08** — `patisgest-app/supabase/21-prix-demain-panier.sql:503` — `round(v_total_ht, 2)` / `round(v_total_ttc, 2)` : reconstruire le calcul ligne par ligne et le comparer a `computeCartTotals` (pos-cart.ts:251-253) sur un panier de 3 lignes a 4 decimales.
- **H05-09** — `patisgest-app/src/lib/actions-credits.ts:91` — `Math.round(Number(input.montantTotalDa)*100)/100` puis `regle > total` (l.93) : tester NaN, Infinity, montant negatif et la perte d'un centime sur un reglement partiel.
- **H05-10** — `patisgest-app/src/lib/pos-cart.ts:129` — `isValidCartQty` (0,0001..1e8, 4 decimales) cote client vs les controles de `53-caisse-ticket-scope.sql:79-88` (ticket, lignes, mode) : lister les entrees acceptees d'un cote et refusees de l'autre.
- **H05-11** — `patisgest-app/src/lib/actions-free-recipes.ts:102` — `prix_vente_da: Math.max(0, Math.round(...))` : un prix negatif saisi devient 0 en silence. Verifier la coherence avec le calcul de marge de free-recipes.ts.
- **H05-12** — `patisgest-app/src/lib/actions-couts.ts:444` — `Number(ancienRaw)` avec repli `Number.NaN` (l.444-445) puis garde `Number.isFinite` (l.446) : verifier le cas ou un seul des deux prix est vide et la division par l'ancien prix a 0.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S05.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S05-F001`, `S05-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/05-calculs-precision-financiere.md -->

---

<a id="part-06"></a>

## Partie 06 — `audit/06-machines-etat-workflows.md`

> **Source** : `audit/06-machines-etat-workflows.md` · **229 lignes** · **20405 octets** · **SHA-256** : `22c4aceacfa3a682bd77727a64e7ed323bc640a89ce3eb6363e1467598edadab`
> **Titre** : Machines a Etats, Workflows & Invariants Metier · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/06-machines-etat-workflows.md sha256=22c4aceacfa3a682bd77727a64e7ed323bc640a89ce3eb6363e1467598edadab -->

# Tranche 06/20 — Machines a Etats, Workflows & Invariants Metier

**Couche** : Couche 2 — Logique metier & integrite · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S06.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**74 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/06-machines-etat-workflows.md` | 229 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/avoir-form.tsx` | 130 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cake-forms.tsx` | 328 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cake-operations.tsx` | 56 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cash-closing-quick.tsx` | 264 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/closing-operations.tsx` | 359 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cloture-form.tsx` | 231 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/commande-forms.tsx` | 177 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/credits-workspace.tsx` | 445 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/fournisseur-form.tsx` | 31 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/kitchen-lab-screen.tsx` | 381 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/lab-cake-form.tsx` | 16 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/lab-workspace.tsx` | 67 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/of-forms.tsx` | 241 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/onboarding-panel.tsx` | 49 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/planning-forms.tsx` | 53 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/planning-operations.tsx` | 33 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/production-board.tsx` | 44 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/production-workspace.tsx` | 58 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/quality-alerts-panel.tsx` | 45 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/quality-forms.tsx` | 122 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/quality-operations.tsx` | 24 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recall-form.tsx` | 147 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recipe-operations.tsx` | 62 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/restock-request-quick-form.tsx` | 169 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/simulation-form.tsx` | 101 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/simulation-operations.tsx` | 25 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sprint2-operations.tsx` | 68 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/stock-write-forms.tsx` | 103 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/tomorrow-lab-panel.tsx` | 717 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/trace-operations.tsx` | 39 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/transfer-form.tsx` | 57 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/z-import-form.tsx` | 90 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/z-import-operations.tsx` | 27 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-achats.ts` | 90 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-cakes.ts` | 172 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-clotures.ts` | 118 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-free-recipes.ts` | 171 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-haccp.ts` | 138 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-of.ts` | 125 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-onboarding.ts` | 104 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-planning.ts` | 195 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-rappel.ts` | 95 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-recettes.ts` | 107 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/onboarding-server.ts` | 27 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/onboarding.ts` | 85 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/patisgest-store.ts` | 649 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/quality-alerts.ts` | 139 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-lab-private-server.ts` | 49 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-lab-server.ts` | 324 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-lab.ts` | 538 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-recipe-guard.ts` | 22 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/07-of-production.sql` | 455 | migration 07: OF: cycle de vie, contraintes de statut, transitions |
| `patisgest-app/supabase/09-journaux-ecritures.sql` | 423 | migration 09: clotures, non-conformites, cakes: machines a etats |
| `patisgest-app/supabase/10-achats-commandes.sql` | 211 | migration 10: achats/commandes: cycle commande -> reception |
| `patisgest-app/supabase/11-import-z.sql` | 222 | migration 11: import Z: invariant (date, caisse, numero Z) |
| `patisgest-app/supabase/13-rappel-blocage-lots.sql` | 266 | migration 13: rappel/blocage de lots: invariant de consommation |
| `patisgest-app/supabase/45-recettes-libres.sql` | 63 | migration 45: recettes libres: cycle de vie et suppression |
| `patisgest-app/supabase/47-onboarding-pack-dz.sql` | 68 | migration 47: onboarding pack DZ: donnees initiales |
| `patisgest-app/supabase/49-wave3-wave4.sql` | 47 | migration 49: wave3/wave4: workflows additionnels |
| `patisgest-app/tests/cake-dossier.test.mjs` | 41 | test a auditer pour cette tranche |
| `patisgest-app/tests/cake-production-db.test.mjs` | 75 | test a auditer pour cette tranche |
| `patisgest-app/tests/lots-batch.test.mjs` | 57 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-cout-partiel-brouillon.test.mjs` | 46 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-cout-partiel-main.test.mjs` | 27 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-perte-experimentale.test.mjs` | 171 | test a auditer pour cette tranche |
| `patisgest-app/tests/onboarding.test.mjs` | 81 | test a auditer pour cette tranche |
| `patisgest-app/tests/quality-alerts.test.mjs` | 102 | test a auditer pour cette tranche |
| `patisgest-app/tests/store.test.mjs` | 596 | test a auditer pour cette tranche |
| `patisgest-app/tests/unicite-lot.test.mjs` | 78 | test a auditer pour cette tranche |
| `patisgest-app/tests/usabilite-parcours.test.mjs` | 84 | test a auditer pour cette tranche |
| `patisgest-app/tests/wave1-features.test.mjs` | 82 | test a auditer pour cette tranche |
| `patisgest-app/tests/wave2-features.test.mjs` | 95 | test a auditer pour cette tranche |
| `patisgest-app/tests/wave3-wave4.test.mjs` | 90 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/supabase/26-vitrine-publique.sql` → **T04** (`migration 26: vitrine publique: vue catalogue et donnees exposees`) : preuve de traçage uniquement.
- Les verrous/idempotence (T07), les types/contraintes SQL (T08), le store démo comme doublon (T16).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/cake-dossier.test.mjs` (41 lignes) — propriété T06.
- `patisgest-app/tests/cake-production-db.test.mjs` (75 lignes) — propriété T06.
- `patisgest-app/tests/lots-batch.test.mjs` (57 lignes) — propriété T06.
- `patisgest-app/tests/of-cout-partiel-brouillon.test.mjs` (46 lignes) — propriété T06.
- `patisgest-app/tests/of-cout-partiel-main.test.mjs` (27 lignes) — propriété T06.
- `patisgest-app/tests/of-perte-experimentale.test.mjs` (171 lignes) — propriété T06.
- `patisgest-app/tests/onboarding.test.mjs` (81 lignes) — propriété T06.
- `patisgest-app/tests/quality-alerts.test.mjs` (102 lignes) — propriété T06.
- `patisgest-app/tests/store.test.mjs` (596 lignes) — propriété T06.
- `patisgest-app/tests/unicite-lot.test.mjs` (78 lignes) — propriété T06.
- `patisgest-app/tests/usabilite-parcours.test.mjs` (84 lignes) — propriété T06.
- `patisgest-app/tests/wave1-features.test.mjs` (82 lignes) — propriété T06.
- `patisgest-app/tests/wave2-features.test.mjs` (95 lignes) — propriété T06.
- `patisgest-app/tests/wave3-wave4.test.mjs` (90 lignes) — propriété T06.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H06-01** — `patisgest-app/src/lib/patisgest-store.ts:492` — `allowed: Record<CakeStatus,CakeStatus[]>` : transitions du mode demo uniquement. Comparer avec la machine a etats SQL de `09-journaux-ecritures.sql:363-412` et reperer les transitions autorisees d'un cote seulement.
- **H06-02** — `patisgest-app/supabase/09-journaux-ecritures.sql:18` — `CHECK (statut IN ('ouverte','cloturee','Ouverte','Cloturee'))` : 4 valeurs dont deux casse/accent. Verifier `maj_non_conformite` (l.205, 216) et le risque de blocage d'une NC historique.
- **H06-03** — `patisgest-app/supabase/07-of-production.sql:22` — `add constraint ordres_fabrication_statut_valid check (...)` : verifier que `terminer_of` (l.377) verrouille la ligne (l.370 `for update`) et refuse un OF deja `termine`.
- **H06-04** — `patisgest-app/supabase/07-of-production.sql:425` — `v_new_statut := case when v_of.qte_realisee + p_qte >= v_of.qte_prevue` : une quantite superieure au prevu est-elle acceptee ? Montrer le calcul et l'effet sur le lot produit.
- **H06-05** — `patisgest-app/supabase/09-journaux-ecritures.sql:9` — `CREATE UNIQUE INDEX clotures_revision_unique` : verifier la composition exacte de la cle, la valeur par defaut de `revision` et le comportement des NULL dans un index unique.
- **H06-06** — `patisgest-app/src/lib/patisgest-store.ts:383` — `if (previous.length && !revise) throw` : la regle de revision des clotures n'existe que dans le store demo ; prouver son equivalent cote RPC `saisir_cloture`.
- **H06-07** — `patisgest-app/supabase/13-rappel-blocage-lots.sql:129` — RPC `rappel_lot` (security definer, l.129) : verifier qu'un lot rappele ne peut plus etre consomme par FEFO (21-prix-demain-panier.sql:598) ni vendu.
- **H06-08** — `patisgest-app/src/lib/tomorrow-lab.ts:312` — `if (!["planifie","encours","partiel"].includes(o.statut)) continue;` : les OF termines sont exclus du plan ; verifier les demandes de reassort orphelines et les effets de bord non annules.
- **H06-09** — `patisgest-app/src/lib/actions-clotures.ts:82` — Validation `fondInitial`/`especesComptees` : verifier la presence de NaN, la note tronquee a 250 (l.93) et la coherence avec `parseClosingInput` (journal-input.ts:83).
- **H06-10** — `patisgest-app/supabase/26-vitrine-publique.sql:179` — `drop constraint cakes_statut_valid` puis `add constraint` (l.187) : verifier que la nouvelle liste couvre l'origine vitrine et que les statuts existants restent valides.
- **H06-11** — `patisgest-app/src/lib/actions-cakes.ts:43` — `if (!Number.isFinite(prixHt) || prixHt <= 0)` et `tvaPct` 0..100 : `nbParts` (l.36) n'est pas valide ici. Tracer jusqu'a la RPC creer_cake et la contrainte SQL.
- **H06-12** — `patisgest-app/src/lib/actions-of.ts:59` — `duplicate: true` sur reference client : verifier que l'etat 'OF deja enregistre' n'est pas confondu avec un OF reellement cree (T07 audite le verrou, T06 l'invariant d'etat).

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S06.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S06-F001`, `S06-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/06-machines-etat-workflows.md -->

---

<a id="part-07"></a>

## Partie 07 — `audit/07-concurrence-verrous-idempotence.md`

> **Source** : `audit/07-concurrence-verrous-idempotence.md` · **170 lignes** · **14966 octets** · **SHA-256** : `64249ff7d80525b52cc664deb6e24cbdbcab3525403a41c4c1f11ea3c04de21c`
> **Titre** : Concurrence, Verrous, Isolation SQL & Idempotence · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/07-concurrence-verrous-idempotence.md sha256=64249ff7d80525b52cc664deb6e24cbdbcab3525403a41c4c1f11ea3c04de21c -->

# Tranche 07/20 — Concurrence, Verrous, Isolation SQL & Idempotence

**Couche** : Couche 2 — Logique metier & integrite · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S07.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**19 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/07-concurrence-verrous-idempotence.md` | 170 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/client-ref-field.tsx` | 17 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/seller-blind-closing.tsx` | 237 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-stock.ts` | 229 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/client-ref.ts` | 13 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/lots-batch.ts` | 63 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/sale-session.ts` | 37 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/05-ecritures-articles-lots.sql` | 157 | migration 05: ecritures articles/lots: policies + RPC receptionner_lot |
| `patisgest-app/supabase/08-transferts.sql` | 168 | migration 08: transfert de stock: verrous et race de quantite |
| `patisgest-app/supabase/16-creer-of-idempotent.sql` | 151 | migration 16: creer_of idempotent: cle client et conflit |
| `patisgest-app/supabase/37-transfert-client-ref.sql` | 144 | migration 37: transfert + reference client: idempotence |
| `patisgest-app/supabase/43-unicite-lot.sql` | 76 | migration 43: unicite des lots: index unique et NULL |
| `patisgest-app/supabase/44-retrait-mode-carte.sql` | 55 | migration 44: retrait du mode carte: contraintes et rejeu |
| `patisgest-app/supabase/53-caisse-ticket-scope.sql` | 293 | migration 53: portee du ticket de caisse: idempotence stricte |
| `patisgest-app/tests/caisse-collision-db.test.mjs` | 61 | test a auditer pour cette tranche |
| `patisgest-app/tests/caisse-ticket-scope-db.test.mjs` | 174 | test a auditer pour cette tranche |
| `patisgest-app/tests/concurrence-transfert-reel.test.mjs` | 175 | test a auditer pour cette tranche |
| `patisgest-app/tests/sale-session.test.mjs` | 46 | test a auditer pour cette tranche |
| `patisgest-app/tests/transfert-client-ref-db.test.mjs` | 135 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/supabase/21-prix-demain-panier.sql` → **T05** (`migration 21: prix demain/panier: vendre_panier, FEFO, arrondis`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-caisse.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/supabase/27-commandes-vitrine.sql` → **T04** (`migration 27: commandes vitrine anonymes, plafond global`) : preuve de traçage uniquement.
- `patisgest-app/supabase/31-publication-vitrine.sql` → **T03** (`migration 31: publication vitrine: verrous et droits`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/sale-queue.ts` → **T11** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-of.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les arrondis (T05), les transitions d’état (T06), la chaîne de migrations (T18).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/caisse-collision-db.test.mjs` (61 lignes) — propriété T07.
- `patisgest-app/tests/caisse-ticket-scope-db.test.mjs` (174 lignes) — propriété T07.
- `patisgest-app/tests/concurrence-transfert-reel.test.mjs` (175 lignes) — propriété T07.
- `patisgest-app/tests/sale-session.test.mjs` (46 lignes) — propriété T07.
- `patisgest-app/tests/transfert-client-ref-db.test.mjs` (135 lignes) — propriété T07.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H07-01** — `patisgest-app/supabase/53-caisse-ticket-scope.sql:34` — Le fichier porte une mention 'Non appliquee au pilote' (affirmation hostile). Verifier dans `migrations/repetition.json` que 53 figure dans `main_hors_serie` (chaine de 52 fichiers) et determiner, SANS preuve de production, quelle version de `vendre_panier` est reellement installee sur le pilote.
- **H07-02** — `patisgest-app/supabase/21-prix-demain-panier.sql:512` — `revoke/grant` de `vendre_panier` : lire la clause de recherche du ticket existant dans le corps (avant 53) et montrer le cas 'meme ticket, autre site / autre contenu' decrit en 53:4-15.
- **H07-03** — `patisgest-app/src/lib/actions-caisse.ts:106` — `pTicket = input.ticket ?? crypto.randomUUID()` : meme cle + payload different. Verifier `sameSaleReplay` (l.161) et la condition de confirmation du doublon (l.144-145).
- **H07-04** — `patisgest-app/src/lib/actions-caisse.ts:118` — Repli `vendre_article` sur PGRST202/42883 : verifier que la cle d'idempotence `p_ticket` est conservee et que le mode de paiement n'est pas perdu (l.125-130).
- **H07-05** — `patisgest-app/src/lib/actions-caisse.ts:93` — `sameSaleSession(ctx, formData.get("expectedClientId"), formData.get("expectedAuthUserId"))` : valeurs declaratives issues du formulaire. Prouver qu'elles ne constituent PAS une autorisation et tracer la vraie frontiere.
- **H07-06** — `patisgest-app/supabase/27-commandes-vitrine.sql:208` — `for update` dans la RPC de commande : identifier la ligne verrouillee, le niveau d'isolation par defaut (READ COMMITTED) et le resultat de deux depots simultanes avec la meme cle navigateur.
- **H07-07** — `patisgest-app/supabase/31-publication-vitrine.sql:54` — `for update` : verifier l'ordre de prise de verrous entre publication et edition (30) pour detecter un interblocage.
- **H07-08** — `patisgest-app/src/lib/client-ref.ts:12` — `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}` : cle d'idempotence non cryptographique, sensible a l'horloge dereglee et aux collisions. Comparer avec la contrainte UNIQUE de 16-creer-of-idempotent.sql.
- **H07-09** — `patisgest-app/supabase/21-prix-demain-panier.sql:452` — `for update` sur les lots FEFO : verifier l'ordre deterministe annonce en l.414 ('zero interblocage') et le cas de deux ventes concurrentes sur le meme lot.
- **H07-10** — `patisgest-app/supabase/16-creer-of-idempotent.sql:26` — RPC idempotente `security definer` : lire le `on conflict`/verrou reel et tester la meme cle avec un payload different (article, quantite, date).
- **H07-11** — `patisgest-app/src/lib/sale-queue.ts:37` — `const MAX = 200` : deux onglets rejouant la file en parallele, quota plein, navigateur ferme a mi-parcours. Decrire la perte ou le doublon exact et le mecanisme de retrait.
- **H07-12** — `patisgest-app/src/lib/actions-of.ts:40` — Reference client issue de la file hors-ligne : prouver l'existence d'une contrainte UNIQUE en base (ou son absence) et le comportement sous rejeu apres coupure reseau.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S07.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S07-F001`, `S07-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/07-concurrence-verrous-idempotence.md -->

---

<a id="part-08"></a>

## Partie 08 — `audit/08-modele-donnees-fuseaux.md`

> **Source** : `audit/08-modele-donnees-fuseaux.md` · **173 lignes** · **14830 octets** · **SHA-256** : `9960b96d7b16cadf7e3430a652f1326a404869df46685c375ca4f9124033551a`
> **Titre** : Modele de Donnees, Contraintes, Fuseaux Horaires & Integrite Referentielle · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/08-modele-donnees-fuseaux.md sha256=9960b96d7b16cadf7e3430a652f1326a404869df46685c375ca4f9124033551a -->

# Tranche 08/20 — Modele de Donnees, Contraintes, Fuseaux Horaires & Integrite Referentielle

**Couche** : Couche 2 — Logique metier & integrite · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S08.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**19 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/08-modele-donnees-fuseaux.md` | 173 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/article-guide.tsx` | 68 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/fetes-planner.tsx` | 209 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/guide-form.tsx` | 130 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/module-guide.tsx` | 141 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recette-guide.tsx` | 125 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/version-form.tsx` | 169 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/allergenes.ts` | 177 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/fetes-dz.ts` | 210 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pack-patisserie-dz.ts` | 61 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/02-seed-pilote.sql` | 85 | migration 02: seed pilote: types de donnees et compatibilite de schema |
| `patisgest-app/supabase/03-sprint2-modules.sql` | 253 | migration 03: creation des tables Sprint 2, contraintes et valeurs par defaut |
| `patisgest-app/supabase/36-dates-algiers.sql` | 89 | migration 36: fuseau Africa/Algiers sur les defaults de dates |
| `patisgest-app/tests/allergenes.test.mjs` | 140 | test a auditer pour cette tranche |
| `patisgest-app/tests/dates-algiers-db.test.mjs` | 77 | test a auditer pour cette tranche |
| `patisgest-app/tests/etablissement.test.mjs` | 132 | test a auditer pour cette tranche |
| `patisgest-app/tests/schema-complet.test.mjs` | 244 | test a auditer pour cette tranche |
| `patisgest-app/tests/schema-version-db.test.mjs` | 58 | test a auditer pour cette tranche |
| `patisgest-app/tests/version-input.test.mjs` | 74 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/journal-audit.ts` → **T19** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-caisse.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/supabase/11-import-z.sql` → **T06** (`migration 11: import Z: invariant (date, caisse, numero Z)`) : preuve de traçage uniquement.
- `patisgest-app/supabase/26-vitrine-publique.sql` → **T04** (`migration 26: vitrine publique: vue catalogue et donnees exposees`) : preuve de traçage uniquement.
- `patisgest-app/supabase/25-domaines-boutiques.sql` → **T04** (`migration 25: domaines boutiques, sous-domaines, vitrine`) : preuve de traçage uniquement.
- `patisgest-app/supabase/43-unicite-lot.sql` → **T07** (`migration 43: unicite des lots: index unique et NULL`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/stock-input.ts` → **T09** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/patisgest-store.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/csv.ts` → **T12** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les calculs (T05), les exports CSV (T12), les indexes (T15).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/allergenes.test.mjs` (140 lignes) — propriété T08.
- `patisgest-app/tests/dates-algiers-db.test.mjs` (77 lignes) — propriété T08.
- `patisgest-app/tests/etablissement.test.mjs` (132 lignes) — propriété T08.
- `patisgest-app/tests/schema-complet.test.mjs` (244 lignes) — propriété T08.
- `patisgest-app/tests/schema-version-db.test.mjs` (58 lignes) — propriété T08.
- `patisgest-app/tests/version-input.test.mjs` (74 lignes) — propriété T08.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H08-01** — `patisgest-app/src/lib/journal-audit.ts:82` — `quandAudit(iso, fuseau = "Africa/Algiers")` vs `journal-input.ts:43` `new Date().toISOString().slice(0,10)` (UTC) : a 23h30 a Alger, la date 'aujourd'hui' differe. Montrer le calcul du decalage.
- **H08-02** — `patisgest-app/src/lib/actions-caisse.ts:242` — `date > new Date().toISOString().slice(0,10)` : un import Z du jour local peut etre refuse ou accepte a tort autour de minuit UTC. Comparer avec `36-dates-algiers.sql:23`.
- **H08-03** — `patisgest-app/supabase/36-dates-algiers.sql:47` — `alter table ... set default (now() at time zone 'Africa/Algiers')::date` : verifier la liste des colonnes traitees et celles qui gardent un default UTC.
- **H08-04** — `patisgest-app/supabase/11-import-z.sql:8` — `create table z_imports` : types `numeric not null default 0`, `jsonb not null default '[]'`, `timestamptz default now()`. Verifier les colonnes nullable et les FK vers clients/sites.
- **H08-05** — `patisgest-app/supabase/26-vitrine-publique.sql:197` — `create unique index ... (client_id, cle_vitrine) where cle_vitrine is not null` : les NULL ne sont pas contraints -> doublons de fiches non publiees. Quantifier le cas.
- **H08-06** — `patisgest-app/supabase/25-domaines-boutiques.sql:79` — `create unique index sites_subdomain_unique` et l.82 `sites_custom_domain_unique` : verifier la gestion des NULL et le comportement d'un sous-domaine reattribue a un autre tenant.
- **H08-07** — `patisgest-app/supabase/43-unicite-lot.sql:62` — `create unique index lots_reception_unique` : lire la composition (client_id, article_id, site_id, numero, date_reception ?) et le traitement des valeurs NULL.
- **H08-08** — `patisgest-app/src/lib/stock-input.ts:105` — `const today = new Date().toISOString().slice(0,10); if (s < today) throw` : DLC/livraison saisie en heure locale. Montrer le rejet indu entre 23h et 00h UTC.
- **H08-09** — `patisgest-app/src/lib/patisgest-store.ts:407` — `isValidDate` base sur `new Date(date).toISOString().slice(0,10)` : compatibilite ascendante des donnees demo et des dates historiques au changement d'annee.
- **H08-10** — `patisgest-app/supabase/02-seed-pilote.sql:1` — Seed visant `auth.users` (exclu du test de chaine rejouable) : verifier les types, les FK et la compatibilite avec 01-socle.sql sur une base vierge.
- **H08-11** — `patisgest-app/src/lib/csv.ts:136` — `DATE_ISO.test(v) && ... new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v` : verifier les annees bissextiles, les dates avant 1970 et les fuseaux.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S08.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S08-F001`, `S08-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/08-modele-donnees-fuseaux.md -->

---

<a id="part-09"></a>

## Partie 09 — `audit/09-contrats-api-validation.md`

> **Source** : `audit/09-contrats-api-validation.md` · **168 lignes** · **13980 octets** · **SHA-256** : `7542f9f952d8e6f9080acff48f49c815b35c546af32981a0a210c3bbfecf8edb`
> **Titre** : Contrats API, Validation d'Entrees & Serialisation · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/09-contrats-api-validation.md sha256=7542f9f952d8e6f9080acff48f49c815b35c546af32981a0a210c3bbfecf8edb -->

# Tranche 09/20 — Contrats API, Validation d'Entrees & Serialisation

**Couche** : Couche 3 — Contrats & etat client · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S09.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**18 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/09-contrats-api-validation.md` | 168 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/etablissement-form.tsx` | 137 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/express-onboarding.tsx` | 195 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-etablissement.ts` | 58 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/etablissement.ts` | 139 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/i18n.ts` | 81 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/journal-input.ts` | 295 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pagination.ts` | 44 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/purchase-input.ts` | 75 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/stock-input.ts` | 190 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/version-input.ts` | 90 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-format.ts` | 26 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/z-input.ts` | 51 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/journal-input.test.mjs` | 139 | test a auditer pour cette tranche |
| `patisgest-app/tests/pagination.test.mjs` | 53 | test a auditer pour cette tranche |
| `patisgest-app/tests/purchase-input.test.mjs` | 67 | test a auditer pour cette tranche |
| `patisgest-app/tests/stock-input.test.mjs` | 149 | test a auditer pour cette tranche |
| `patisgest-app/tests/z-input.test.mjs` | 38 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/app/api/export/route.ts` → **T12** (`export CSV generique`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/export/comptable/route.ts` → **T12** (`export comptable CSV`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-cakes.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-credits.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts` → **T04** (`Server Action anonyme de commande`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/erreurs-db.ts` → **T13** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les fichiers/export CSV (T12), la performance DB (T15), les états client (T10).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/journal-input.test.mjs` (139 lignes) — propriété T09.
- `patisgest-app/tests/pagination.test.mjs` (53 lignes) — propriété T09.
- `patisgest-app/tests/purchase-input.test.mjs` (67 lignes) — propriété T09.
- `patisgest-app/tests/stock-input.test.mjs` (149 lignes) — propriété T09.
- `patisgest-app/tests/z-input.test.mjs` (38 lignes) — propriété T09.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H09-01** — `patisgest-app/src/app/api/export/route.ts:60` — `> 20 000 lignes` -> 413 : verifier qu'aucune troncature silencieuse ne precede (l.54-59) et que le comptage est exact avec la pagination de `pagination.ts`.
- **H09-02** — `patisgest-app/src/lib/pagination.ts:29` — `while (lignes.length < limiteTotale) { const offset = lignes.length; ... }` : PostgREST `range(debut, fin)` est INCLUSIF. Montrer le decalage d'une ligne si `lirePage` interprete `quantite` comme un nombre de lignes.
- **H09-03** — `patisgest-app/src/lib/pagination.ts:39` — `const sonde = await lirePage(limiteTotale, 1)` : verifier le cas ou la sonde renvoie une ligne deja incluse et la normalisation des codes d'erreur (l.33-34).
- **H09-04** — `patisgest-app/src/lib/z-input.ts:22` — Limite 50 000 caracteres et 100 lignes cote parseur : verifier que `actions-caisse.ts:239` (import Z) applique les MEMES bornes avant l'appel RPC.
- **H09-05** — `patisgest-app/src/lib/journal-input.ts:96` — `lignes.push(line as unknown as ClosingLineInput)` : cast qui affirme une forme non verifiee. Injecter un champ supplementaire et tracer sa propagation jusqu'au JSONB de `saisir_cloture`.
- **H09-06** — `patisgest-app/src/app/api/export/comptable/route.ts:110` — `ventesLecture.lignes as unknown as {...}[]` : mass-assignment/cast ; verifier la normalisation des erreurs et des codes HTTP (l.64-92).
- **H09-07** — `patisgest-app/src/lib/actions-cakes.ts:36` — `Number(formData.get("nbParts"))` sans `Number.isInteger` : comparer avec la validation de la commande anonyme (commander/actions.ts:56) et la contrainte SQL.
- **H09-08** — `patisgest-app/src/lib/actions-credits.ts:90` — `input.nomDebiteur.trim()` sans longueur maximale, alors que `note` est tronquee a 400 (l.109) : verifier la limite cote DB et la reponse d'erreur normalisee.
- **H09-09** — `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts:53` — `/^\d{4}-\d{2}-\d{2}$/` valide la FORME mais pas la date reelle (2026-02-30) ni le passe : verifier le refus cote RPC 27 et le message renvoye au visiteur.
- **H09-10** — `patisgest-app/src/lib/erreurs-db.ts:37` — `${(e!.message as string).trim()}` : normalisation des erreurs Postgres ; verifier qu'aucun detail technique (contrainte, schema, SQLSTATE brut) ne remonte a un visiteur anonyme.
- **H09-11** — `patisgest-app/src/lib/stock-input.ts:154` — `if (fromSiteId === toSiteId) throw` : verifier que les deux UUID sont valides (l.47) et rattaches au meme client avant l'appel RPC transferer_article.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S09.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S09-F001`, `S09-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/09-contrats-api-validation.md -->

---

<a id="part-10"></a>

## Partie 10 — `audit/10-etat-client-hydratation-caches.md`

> **Source** : `audit/10-etat-client-hydratation-caches.md` · **171 lignes** · **14844 octets** · **SHA-256** : `5ef13c7141e471e14ea15c06db1cd79ad3c7f1c5cfa91a3883ca7e317a9b5488`
> **Titre** : Etat Client, Hydratation, Caches & Coherence UI-Serveur · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/10-etat-client-hydratation-caches.md sha256=5ef13c7141e471e14ea15c06db1cd79ad3c7f1c5cfa91a3883ca7e317a9b5488 -->

# Tranche 10/20 — Etat Client, Hydratation, Caches & Coherence UI-Serveur

**Couche** : Couche 3 — Contrats & etat client · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S10.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**18 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/10-etat-client-hydratation-caches.md` | 171 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/layout.tsx` | 42 | layout racine: providers et metadata |
| `patisgest-app/src/components/advanced-mode-toggle.tsx` | 27 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/appearance.tsx` | 204 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cash-workspace.tsx` | 57 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/dashboard-workspace.tsx` | 101 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/locale-provider.tsx` | 65 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/owner-day-overview.tsx` | 56 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/owner-motion-control.tsx` | 23 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/pilot-dashboard.tsx` | 490 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/workspace-icons.tsx` | 39 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/workspace-ui.tsx` | 26 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/appearance.ts` | 118 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/apparence-licence-photos.test.mjs` | 93 | test a auditer pour cette tranche |
| `patisgest-app/tests/appearance.test.mjs` | 93 | test a auditer pour cette tranche |
| `patisgest-app/tests/design-refinement.test.mjs` | 34 | test a auditer pour cette tranche |
| `patisgest-app/tests/workspace-daily-ux.test.mjs` | 41 | test a auditer pour cette tranche |
| `patisgest-app/tests/workspace-nav.test.mjs` | 44 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/app/(app)/layout.tsx` → **T01** (`garde de session allowLocked (symboles initialBundle/DemoWorkspaceProvider -> T10)`) : preuve de traçage uniquement.
- `patisgest-app/src/components/demo-workspace.tsx` → **T16** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/coquille-hors-ligne.tsx` → **T11** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/catalogue-cache.ts` → **T11** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/network-status-pill.tsx` → **T11** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/service-worker.tsx` → **T11** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/trial-guard-client.tsx` → **T01** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/credits-workspace.tsx` → **T06** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/(app)/[module]/page.tsx` → **T02** (`garde d'acces aux modules et roles`) : preuve de traçage uniquement.
- Le stockage local/PWA (T11), le build et les secrets (T17), les composants métier (T05/T06).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/apparence-licence-photos.test.mjs` (93 lignes) — propriété T10.
- `patisgest-app/tests/appearance.test.mjs` (93 lignes) — propriété T10.
- `patisgest-app/tests/design-refinement.test.mjs` (34 lignes) — propriété T10.
- `patisgest-app/tests/workspace-daily-ux.test.mjs` (41 lignes) — propriété T10.
- `patisgest-app/tests/workspace-nav.test.mjs` (44 lignes) — propriété T10.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H10-01** — `patisgest-app/src/app/(app)/layout.tsx:75` — `initialBundle={(trialStatus?.signedBundle as unknown as ServerLicenseBundle | undefined)}` : props serveur (token + publicJwk + payload) pousses dans un composant client. Inventorier exactement ce qui part dans le bundle.
- **H10-02** — `patisgest-app/src/app/(app)/layout.tsx:83` — `serverLocked ? null : demo ? <DemoWorkspaceProvider> : children` : le masquage UI est-il double d'un refus serveur pour TOUTES les actions (getSessionContext) ?
- **H10-03** — `patisgest-app/src/components/demo-workspace.tsx:20` — `setData(upgradeState(JSON.parse(event.newValue) as State))` sur l'evenement `storage` : verifier la race entre deux onglets, la corruption JSON et l'absence de versionnage.
- **H10-04** — `patisgest-app/src/components/coquille-hors-ligne.tsx:50` — `window.localStorage.getItem("patisgest.session.v1")` puis `JSON.parse` (l.61) : l'identite locale est lisible par tout script ; verifier qu'aucune donnee d'un autre compte n'est rendue dans le DOM.
- **H10-05** — `patisgest-app/src/lib/catalogue-cache.ts:140` — `getCatalogueSnapshot()` met en cache un objet MODULE-LEVEL : si `enregistrerIdentite` echoue (l.205 catch), `cacheLu` reste true et l'ancien catalogue peut etre servi au nouveau compte.
- **H10-06** — `patisgest-app/src/components/network-status-pill.tsx:9` — Boucle sur TOUT `window.localStorage` + `JSON.parse(raw)` (l.14) a chaque snapshot : verifier le cout, la levee d'exception sur valeur corrompue et la fuite d'information dans le DOM.
- **H10-07** — `patisgest-app/src/components/service-worker.tsx:60` — `controller?.postMessage("SKIP_WAITING")` puis `window.location.reload()` (l.61) : verifier la condition de garde et l'absence de boucle de rechargement.
- **H10-08** — `patisgest-app/src/components/trial-guard-client.tsx:84` — Polling `fetch("/api/presence/heartbeat")` : verifier l'invalidation de cache, la race de navigation et le comportement hors ligne (l.82).
- **H10-09** — `patisgest-app/src/components/credits-workspace.tsx:48` — `useSyncExternalStore` + `localStorage` + `setItem` (l.81) : verifier la desynchronisation optimiste si la Server Action echoue apres l'ecriture locale.
- **H10-10** — `patisgest-app/src/app/(app)/[module]/page.tsx:410` — `Promise.all` de RPC (`cake_options_production`, `cake_liens_production`, ...) : verifier quelles donnees de couts sont serialisees vers les composants client pour un role vendeur.
- **H10-11** — `patisgest-app/src/components/coquille-hors-ligne.tsx:86` — `() => null as unknown as boolean` : cast du snapshot serveur de `useSyncExternalStore`. Verifier l'effet sur l'hydratation (serveur null -> client booleen).

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S10.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S10-F001`, `S10-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/10-etat-client-hydratation-caches.md -->

---

<a id="part-11"></a>

## Partie 11 — `audit/11-hors-ligne-pwa-files-locales.md`

> **Source** : `audit/11-hors-ligne-pwa-files-locales.md` · **172 lignes** · **14220 octets** · **SHA-256** : `0d941314447db0a9b11cc553cb23ace5eea0d43fbba6b28c5f9ad120621b589c`
> **Titre** : Mode Hors-Ligne, PWA, Files d'Attente & Stockage Local · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/11-hors-ligne-pwa-files-locales.md sha256=0d941314447db0a9b11cc553cb23ace5eea0d43fbba6b28c5f9ad120621b589c -->

# Tranche 11/20 — Mode Hors-Ligne, PWA, Files d'Attente & Stockage Local

**Couche** : Couche 3 — Contrats & etat client · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S11.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**21 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/11-hors-ligne-pwa-files-locales.md` | 172 | prompt autonome MODE B de cette tranche |
| `patisgest-app/public/sw.js` | 154 | Service Worker et strategie de cache |
| `patisgest-app/src/app/hors-ligne/page.tsx` | 46 | coquille hors-ligne publique |
| `patisgest-app/src/app/manifest.ts` | 33 | manifest PWA |
| `patisgest-app/src/components/coquille-hors-ligne.tsx` | 213 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/network-status-pill.tsx` | 94 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/service-worker.tsx` | 68 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/catalogue-cache.ts` | 298 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/file-attente-cloture.ts` | 66 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/of-queue.ts` | 93 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/sale-queue.ts` | 264 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/catalogue-cache.test.mjs` | 86 | test a auditer pour cette tranche |
| `patisgest-app/tests/catalogue-hors-ligne.test.mjs` | 121 | test a auditer pour cette tranche |
| `patisgest-app/tests/catalogue-local.mjs` | 36 | adaptateur local du catalogue hors-ligne |
| `patisgest-app/tests/cloture-file-attente.test.mjs` | 48 | test a auditer pour cette tranche |
| `patisgest-app/tests/deconnexion-locale.test.mjs` | 99 | test a auditer pour cette tranche |
| `patisgest-app/tests/file-attente-cloture.test.mjs` | 60 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-queue.test.mjs` | 61 | test a auditer pour cette tranche |
| `patisgest-app/tests/sale-queue.test.mjs` | 173 | test a auditer pour cette tranche |
| `patisgest-app/tests/service-worker-scope.test.mjs` | 102 | test a auditer pour cette tranche |
| `patisgest-app/tests/service-worker-securite.test.mjs` | 82 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/components/cash-closing-quick.tsx` → **T06** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- La cohérence UI↔serveur (T10), l’idempotence serveur (T07), la fiabilité des catches (T13).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/catalogue-cache.test.mjs` (86 lignes) — propriété T11.
- `patisgest-app/tests/catalogue-hors-ligne.test.mjs` (121 lignes) — propriété T11.
- `patisgest-app/tests/catalogue-local.mjs` (36 lignes) — propriété T11.
- `patisgest-app/tests/cloture-file-attente.test.mjs` (48 lignes) — propriété T11.
- `patisgest-app/tests/deconnexion-locale.test.mjs` (99 lignes) — propriété T11.
- `patisgest-app/tests/file-attente-cloture.test.mjs` (60 lignes) — propriété T11.
- `patisgest-app/tests/of-queue.test.mjs` (61 lignes) — propriété T11.
- `patisgest-app/tests/sale-queue.test.mjs` (173 lignes) — propriété T11.
- `patisgest-app/tests/service-worker-scope.test.mjs` (102 lignes) — propriété T11.
- `patisgest-app/tests/service-worker-securite.test.mjs` (82 lignes) — propriété T11.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H11-01** — `patisgest-app/public/sw.js:69` — `if (request.method !== "GET") return;` : aucune interception des POST / Server Actions. Prouver que la file d'attente est bien le seul mecanisme de reprise et qu'elle n'est pas contournee.
- **H11-02** — `patisgest-app/public/sw.js:80` — Navigation -> coquille : verifier qu'aucune reponse HTML authentifiee n'entre dans CACHE_COQUILLE ou CACHE_ASSETS, y compris via le sous-domaine boutique (l.145).
- **H11-03** — `patisgest-app/public/sw.js:24` — `contenuAssetValide` compare l'extension au Content-Type : tester un `/appearance/x.png` servi en `text/html` (empoisonnement de cache) et l'absence de verification d'origine sur `response.redirected`.
- **H11-04** — `patisgest-app/public/sw.js:56` — Purge `caches.delete(name)` de tout `patisgest-*` a l'activation : verifier le risque de suppression d'un cache encore utilise par un autre onglet/compte.
- **H11-05** — `patisgest-app/src/lib/sale-queue.ts:37` — `const MAX = 200` : verifier la politique exacte quand la file est pleine (perte silencieuse ? ecrasement ?) et le message a l'utilisateur.
- **H11-06** — `patisgest-app/src/lib/catalogue-cache.ts:100` — `ageCatalogue(c, maintenant) > 14` : une horloge client avancee/retardee fait accepter un catalogue perime ou refuser un catalogue frais. Montrer le calcul.
- **H11-07** — `patisgest-app/src/lib/catalogue-cache.ts:205` — `catch { /* quota plein : le hors-ligne restera indisponible */ }` : echec d'enregistrement de l'identite sans signal UI. Verifier la consequence sur appareil partage.
- **H11-08** — `patisgest-app/src/lib/of-queue.ts:29` — `return [...without, op].slice(-MAX)` avec MAX=100 : rejeu concurrent de deux onglets, perte des plus anciens OF. Decrire la sequence et l'absence de verrou inter-onglets.
- **H11-09** — `patisgest-app/src/lib/file-attente-cloture.ts:42` — `if (Array.isArray(parse)) tickets += parse.length;` et `illisible` (l.44-48) : verifier que JSON corrompu ou d'une autre version n'est pas compte comme zero ticket.
- **H11-10** — `patisgest-app/src/components/cash-closing-quick.tsx:56` — `localStorage.getItem("patisgest.caisse_soir."+today)` : la cle de jour est calculee cote client (UTC vs Alger). Verifier le blocage de cloture du mauvais jour.
- **H11-11** — `patisgest-app/src/app/manifest.ts:9` — Manifest PWA : verifier `start_url`, `scope`, `display` et l'absence de donnees de tenant dans le manifeste servi a tous.
- **H11-12** — `patisgest-app/src/lib/sale-queue.ts:40` — `queuedSaleLines` gere les anciennes entrees mono-produit : verifier le versionnage `patisgest.saleQueue.v1` et l'absence de migration d'un format corrompu.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S11.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S11-F001`, `S11-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/11-hors-ligne-pwa-files-locales.md -->

---

<a id="part-12"></a>

## Partie 12 — `audit/12-fichiers-medias-imports-exports.md`

> **Source** : `audit/12-fichiers-medias-imports-exports.md` · **188 lignes** · **15509 octets** · **SHA-256** : `d41f8b1190d204876bfb1245ed0a2048d6a2bfdddca11a657fe6be0d83ad07fe`
> **Titre** : Fichiers, Medias, Imports/Exports & Contenu Externe · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/12-fichiers-medias-imports-exports.md sha256=d41f8b1190d204876bfb1245ed0a2048d6a2bfdddca11a657fe6be0d83ad07fe -->

# Tranche 12/20 — Fichiers, Medias, Imports/Exports & Contenu Externe

**Couche** : Couche 3 — Contrats & etat client · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S12.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**47 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/12-fichiers-medias-imports-exports.md` | 188 | prompt autonome MODE B de cette tranche |
| `design-studio/public/assets/croissant.webp` | 0 | media / police du prototype |
| `design-studio/public/assets/eclair.webp` | 0 | media / police du prototype |
| `design-studio/public/assets/fraunces-OFL.txt` | 93 | media / police du prototype |
| `design-studio/public/assets/fraunces.woff2` | 0 | media / police du prototype |
| `design-studio/public/assets/hero.webp` | 0 | media / police du prototype |
| `design-studio/public/assets/manrope-OFL.txt` | 93 | media / police du prototype |
| `design-studio/public/assets/manrope.woff2` | 0 | media / police du prototype |
| `design-studio/public/assets/pain.webp` | 0 | media / police du prototype |
| `design-studio/public/assets/studio.svg` | 0 | media / police du prototype |
| `design-studio/public/assets/tarte.webp` | 0 | media / police du prototype |
| `patisgest-app/public/appearance/croissant.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/eclair.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/fraunces-OFL.txt` | 93 | media / asset statique |
| `patisgest-app/public/appearance/fraunces.woff2` | 0 | media / asset statique |
| `patisgest-app/public/appearance/hero.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/manrope-OFL.txt` | 93 | media / asset statique |
| `patisgest-app/public/appearance/manrope.woff2` | 0 | media / asset statique |
| `patisgest-app/public/appearance/owner-patisserie.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/pain.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/tarte.webp` | 0 | media / asset statique |
| `patisgest-app/public/icons/apple-touch-icon.png` | 0 | media / asset statique |
| `patisgest-app/public/icons/icon-192.png` | 0 | media / asset statique |
| `patisgest-app/public/icons/icon-512.png` | 0 | media / asset statique |
| `patisgest-app/public/recettes/baklawa.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/croissant.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/eclair.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/layer-cake.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/mille-feuille.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/pain-chocolat.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/tarte-citron.webp` | 0 | media / asset statique |
| `patisgest-app/scripts/coffre-sauvegarde.mjs` | 66 | chiffrement du coffre de sauvegarde |
| `patisgest-app/src/app/api/export/comptable/route.ts` | 170 | export comptable CSV |
| `patisgest-app/src/app/api/export/route.ts` | 82 | export CSV generique |
| `patisgest-app/src/components/export-panel.tsx` | 102 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/invoice-photo-intake.tsx` | 317 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/label-maker.tsx` | 120 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/product-photo-picker.tsx` | 154 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-photos.ts` | 34 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/csv.ts` | 141 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/export-comptable.ts` | 174 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/invoice-photo-parser.ts` | 104 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/label-model.ts` | 108 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pastry-visuals.ts` | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/recipe-photo.ts` | 33 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/52-recettes-photos.sql` | 41 | migration 52: photos de recettes: colonne et contenu externe |
| `patisgest-app/tests/coffre-sauvegarde.test.mjs` | 42 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- La validation des entrées (T09), la PII et l’audit (T19), la chaîne de restauration (T18).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/coffre-sauvegarde.test.mjs` (42 lignes) — propriété T12.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H12-01** — `patisgest-app/src/lib/csv.ts:32` — `INVISIBLES` + `FORMULE` : verifier la couverture reelle de U+200B, U+202E, U+2066-2069, U+FEFF, tab/CR et le cas d'un champ commencant par plusieurs invisibles.
- **H12-02** — `patisgest-app/src/lib/csv.ts:39` — `if (FORMULE.test(s)) s = "'" + s;` AVANT l'echappement RFC (l.40) : verifier qu'une valeur `=..."...` reste injective et que l'apostrophe n'est pas interpretee par Excel en locale FR.
- **H12-03** — `patisgest-app/src/app/api/export/route.ts:72` — Headers de reponse : verifier la presence du BOM UTF-8 (`csv.ts:19`), du separateur `;`, du `Content-Disposition` et de l'absence de troncature des lignes.
- **H12-04** — `patisgest-app/src/lib/recipe-photo.ts:28` — `^data:image/(jpeg|png|webp);base64,A[A-Za-z0-9+/=]*$` : la regex verifie un PREFIXE de contenu, pas les magic bytes. Forger une charge utile base64 valide mais non image et tracer son stockage.
- **H12-05** — `patisgest-app/src/lib/recipe-photo.ts:14` — `MAX_DATA_URL_BYTES = 220_000` : verifier que la limite est appliquee cote serveur (actions-photos.ts) et non seulement dans le composant, et le comportement au-dela.
- **H12-06** — `patisgest-app/src/components/product-photo-picker.tsx:129` — `accept="image/*"` cote navigateur : verifier la chaine de validation serveur (compressImageFileToDataUrl, sanitizeRecipePhoto, RPC) et le refus des SVG/XSS.
- **H12-07** — `patisgest-app/scripts/coffre-sauvegarde.mjs:35` — `scryptSync(password, salt, 32, {N:32768,...})` + `cipher.setAAD(header)` (l.37) : verifier l'authentification du header, le tag GCM (l.42) et la limite MAX_DATA_SIZE.
- **H12-08** — `patisgest-app/scripts/coffre-sauvegarde.mjs:60` — `await link(temp, output)` : atomicite et refus de sortie preexistante ; verifier le nettoyage `key?.fill(0)` / `rm(tempDir)` (l.61-64) en cas d'echec.
- **H12-09** — `patisgest-app/supabase/52-recettes-photos.sql:13` — `add column if not exists photo_url text` : verifier l'absence de contrainte de taille/format cote DB et l'exposition de cette colonne aux roles vendeur/anon.
- **H12-10** — `patisgest-app/src/lib/invoice-photo-parser.ts:94` — `id: `${Date.now()}-${parsed.length}`` : collision d'identifiants sur deux lignes parsees a la meme milliseconde. Verifier l'impact sur la deduplication.
- **H12-11** — `patisgest-app/src/app/api/export/comptable/route.ts:66` — Codes 413/500/409 selon les anomalies : verifier que l'export comptable ne livre jamais un fichier partiel quand une lecture echoue en cours de route.
- **H12-12** — `patisgest-app/src/lib/csv.ts:47` — `valeur instanceof Date -> toISOString()` : verifier la locale, le separateur decimal (l.14-15) et la conversion des `number` en virgule decimale pour Excel FR.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S12.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S12-F001`, `S12-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/12-fichiers-medias-imports-exports.md -->

---

<a id="part-13"></a>

## Partie 13 — `audit/13-fiabilite-runtime-erreurs.md`

> **Source** : `audit/13-fiabilite-runtime-erreurs.md` · **155 lignes** · **12946 octets** · **SHA-256** : `275cc7260e68170a6c0539bffda05f617ab3d2dd81012ed9e5c31f0bebdcd0d8`
> **Titre** : Fiabilite Runtime, Gestion d'Erreurs & Reprise sur Panne · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/13-fiabilite-runtime-erreurs.md sha256=275cc7260e68170a6c0539bffda05f617ab3d2dd81012ed9e5c31f0bebdcd0d8 -->

# Tranche 13/20 — Fiabilite Runtime, Gestion d'Erreurs & Reprise sur Panne

**Couche** : Couche 4 — Fiabilite, performance, structure · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S13.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**5 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/13-fiabilite-runtime-erreurs.md` | 155 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/error.tsx` | 13 | boundary d'erreur espace connecte |
| `patisgest-app/src/app/error.tsx` | 13 | boundary d'erreur globale |
| `patisgest-app/src/lib/erreurs-db.ts` | 71 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/erreurs-db.test.mjs` | 97 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/auth.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/export/route.ts` → **T12** (`export CSV generique`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/notifications-alerte.ts` → **T19** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/invitation-mail.ts` → **T02** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/trial-server.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/proxy-session.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/sauvegarde/route.ts` → **T18** (`generation de sauvegarde JSON`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-caisse.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/service-worker.tsx` → **T11** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/(app)/parametres/page.tsx` → **T02** (`parametres: modules, equipe, sites, roles`) : preuve de traçage uniquement.
- Les erreurs métier des actions (T05/T06), la supervision/alertes (T19), le harnais de tests (T20).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/erreurs-db.test.mjs` (97 lignes) — propriété T13.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H13-01** — `patisgest-app/src/lib/auth.ts:182` — `catch { return null; }` : une panne DB devient 'pas de session' -> redirect /connexion au lieu d'un 503. Decrire l'experience operateur a 3 h du matin.
- **H13-02** — `patisgest-app/src/app/api/export/route.ts:79` — `catch { ... 503 "Supabase est inaccessible" }` : verifier l'absence de log/telemetrie et la distinction entre erreur reseau, RLS et bug applicatif.
- **H13-03** — `patisgest-app/src/lib/notifications-alerte.ts:124` — `catch` -> `{ ok:false, error }` : verifier que `sendSmsAndWhatsAppAlerts` (l.179) et `runOfflineDisconnectAlerts` (connectivite-cron.ts:159) ne comptent pas un echec d'envoi comme une alerte livree.
- **H13-04** — `patisgest-app/src/lib/invitation-mail.ts:26` — `catch { return "echec"; } finally { transport.close(); }` : l'action d'invitation (actions-equipe.ts:142) annonce-t-elle le succes malgre l'echec SMTP ?
- **H13-05** — `patisgest-app/src/lib/trial-server.ts:54` — `statutEnVol = lireStatutEssaiServeur().finally(() => { statutEnVol = null; })` : verifier le comportement si le RPC reste pendant (tous les rendus partagent la promesse) et l'absence de timeout.
- **H13-06** — `patisgest-app/src/lib/proxy-session.ts:68` — `Promise.race([travail, budget])` avec `clearTimeout` en `finally` (l.80-82) : verifier qu'aucun rejet non traite ni minuteur fantome ne subsiste, et le sens de `perime` (l.77).
- **H13-07** — `patisgest-app/src/app/api/sauvegarde/route.ts:78` — `catch { 503 }` : verifier l'etat a mi-parcours (tables deja lues, reponse partiellement ecrite) et l'absence de sauvegarde vide silencieuse.
- **H13-08** — `patisgest-app/src/lib/actions-caisse.ts:209` — `catch { return { erreur: "Supabase est inaccessible...", reessayer: true }; }` : un vendeur qui retry apres un commit reussi mais une reponse perdue doit-il rejouer ? Correler avec l'idempotence par ticket.
- **H13-09** — `patisgest-app/src/components/service-worker.tsx:40` — `catch {}` sur l'enregistrement du Service Worker : verifier l'absence de nettoyage des listeners et le signal utilisateur.
- **H13-10** — `patisgest-app/src/lib/erreurs-db.ts:37` — `(e!.message as string).trim()` : verifier le cas d'une erreur non-Error (string, objet PostgREST, null) et la non-divulgation du message brut.
- **H13-11** — `patisgest-app/src/app/(app)/parametres/page.tsx:66` — Multiples `catch` (l.66, 98, 123, 150, 229) : cartographier pour chaque panne partielle ce qui reste affiche et ce qui est tu.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S13.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S13-F001`, `S13-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/13-fiabilite-runtime-erreurs.md -->

---

<a id="part-14"></a>

## Partie 14 — `audit/14-performance-applicative.md`

> **Source** : `audit/14-performance-applicative.md` · **159 lignes** · **12908 octets** · **SHA-256** : `12484e7a38b6fb6791a82b2de33e21072520808f12a0bc750634578de843be36`
> **Titre** : Performance Applicative, Complexite & Ressources · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/14-performance-applicative.md sha256=12484e7a38b6fb6791a82b2de33e21072520808f12a0bc750634578de843be36 -->

# Tranche 14/20 — Performance Applicative, Complexite & Ressources

**Couche** : Couche 4 — Fiabilite, performance, structure · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S14.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**12 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/14-performance-applicative.md` | 159 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/tableau-de-bord/page.tsx` | 92 | assemblage des donnees du tableau de bord |
| `patisgest-app/src/app/appearance.css` | 153 | feuille de style: taille de bundle |
| `patisgest-app/src/app/globals.css` | 5 | feuille de style: taille de bundle |
| `patisgest-app/src/app/refinement.css` | 87 | feuille de style: taille de bundle |
| `patisgest-app/src/app/workspace.css` | 1011 | feuille de style: taille de bundle |
| `patisgest-app/src/components/free-recipes-workspace.tsx` | 900 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/dashboard-insights.ts` | 134 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/owner-day.ts` | 41 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/dashboard-insights.test.mjs` | 38 | test a auditer pour cette tranche |
| `patisgest-app/tests/owner-day.test.mjs` | 90 | test a auditer pour cette tranche |
| `patisgest-app/tests/performance-dashboard.test.mjs` | 174 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/workspace-read.ts` → **T15** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/tomorrow-lab.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/portion-estimator.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/ingredient-impact.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/courses-server.ts` → **T15** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/portion-estimator.tsx` → **T05** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les plans de requête et indexes (T15), les casts et la duplication (T16).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/dashboard-insights.test.mjs` (38 lignes) — propriété T14.
- `patisgest-app/tests/owner-day.test.mjs` (90 lignes) — propriété T14.
- `patisgest-app/tests/performance-dashboard.test.mjs` (174 lignes) — propriété T14.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (10)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H14-01** — `patisgest-app/src/lib/dashboard-insights.ts:11` — `articles.filter(...).map(a => lots.filter(...).reduce(...))` : complexite O(A x L). Calculer le nombre d'operations pour A=1 000 et L=5 000 (5 000 000).
- **H14-02** — `patisgest-app/src/lib/dashboard-insights.ts:36` — Second motif O(A x L) dans `productVelocity` : verifier si les deux fonctions sont appelees dans le meme rendu (tableau-de-bord) et si les resultats sont memoises.
- **H14-03** — `patisgest-app/src/lib/workspace-read.ts:24` — `LIMITE_TOTALE = 20_000`, `PAGE_SIZE = 500` (l.8), boucle `while` (l.28) : 40 requetes SEQUENTIelles par rendu. Mesurer la latence a 20 000 lignes.
- **H14-04** — `patisgest-app/src/lib/tomorrow-lab.ts:346` — Boucles imbriquees sur `sameDowDates` et `byDate` (l.358) : evaluer le cout a volume x100 et le passage a minuit/changement d'annee.
- **H14-05** — `patisgest-app/src/components/free-recipes-workspace.tsx:131` — Composant de 900 lignes avec plusieurs `useSyncExternalStore`/`localStorage` (l.111, 141, 223) : reperer les rendus couteux et les recalculs a chaque frappe.
- **H14-06** — `patisgest-app/src/app/workspace.css:1` — 1 011 lignes / 87 697 octets de CSS : verifier l'inclusion dans le bundle critique et l'impact sur le First Contentful Paint de la caisse.
- **H14-07** — `patisgest-app/src/lib/portion-estimator.ts:368` — Boucle sur `input.lignes` dans un module de 687 lignes couple a un composant de 977 lignes : verifier la complexite et l'absence de memoisation.
- **H14-08** — `patisgest-app/src/lib/ingredient-impact.ts:198` — Trois Maps puis boucles sur `current.ingredients` (l.212) : verifier la charge memoire sur 5 000 lots et 1 000 versions de recettes.
- **H14-09** — `patisgest-app/src/lib/courses-server.ts:46` — `Promise.all` de 4 requetes dont deux `.limit(5000)` (l.60, 67) : verifier la memoire et le cout de l'agregation en JS (l.83-111).
- **H14-10** — `patisgest-app/src/components/portion-estimator.tsx:95` — `useSyncExternalStore` lisant `localStorage` a chaque snapshot : verifier la stabilite de l'objet retourne (boucle de rendu) et le cout de `JSON.parse`.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S14.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S14-F001`, `S14-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/14-performance-applicative.md -->

---

<a id="part-15"></a>

## Partie 15 — `audit/15-performance-base-scalabilite.md`

> **Source** : `audit/15-performance-base-scalabilite.md` · **153 lignes** · **12617 octets** · **SHA-256** : `ec64bdbd06b938f99c013f554153fd46196a1f8f7c5db217b64956ddc76d3229`
> **Titre** : Performance Base de Donnees & Scalabilite · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/15-performance-base-scalabilite.md sha256=ec64bdbd06b938f99c013f554153fd46196a1f8f7c5db217b64956ddc76d3229 -->

# Tranche 15/20 — Performance Base de Donnees & Scalabilite

**Couche** : Couche 4 — Fiabilite, performance, structure · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S15.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**10 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/15-performance-base-scalabilite.md` | 153 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/liste-courses-panel.tsx` | 132 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/stock-list.tsx` | 85 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/stock-workspace.tsx` | 98 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/courses-server.ts` | 128 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/liste-courses.ts` | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/stock-overview.ts` | 17 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/workspace-data.ts` | 138 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/workspace-read.ts` | 196 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/24-index-exploitation.sql` | 113 | migration 24: index d'exploitation et plans de requete |

## 2. Exclusions (hors périmètre)

- `patisgest-app/supabase/50-roles-permissions-vues.sql` → **T03** (`migration 50: roles/permissions/vues: parite et RLS`) : preuve de traçage uniquement.
- `patisgest-app/supabase/04-securite-lecture.sql` → **T03** (`migration 04: policies de lecture tenant generees dynamiquement`) : preuve de traçage uniquement.
- `patisgest-app/supabase/23-controle-modules.sql` → **T03** (`migration 23: controle des modules: policies restrictives + gardes RPC`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/export/route.ts` → **T12** (`export CSV generique`) : preuve de traçage uniquement.
- La complexité JS (T14), les policies RLS en tant que règles de sécurité (T03).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- **Aucun fichier de test en propriété** : documenter explicitement cet angle mort dans la section 4 du rapport.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (10)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H15-01** — `patisgest-app/supabase/24-index-exploitation.sql:32` — `create index ventes_client_date_idx` : verifier l'ordre des colonnes vs les predicats reels `eq(client_id) + date_vente between ... order by id` et l'absence d'index sur `id` pour le tri.
- **H15-02** — `patisgest-app/supabase/24-index-exploitation.sql:54` — `lots_fefo_idx ... where qte_rest > 0 and not bloque` : verifier que l'`order by congele, dlc nulls last, date_reception, id` de FEFO peut utiliser l'index partiel.
- **H15-03** — `patisgest-app/src/lib/workspace-read.ts:163` — `for (let offset = 0; offset < 20_000; offset += PAGE_SIZE)` + `.range(offset, offset+499)` : pagination par OFFSET sur gros volumes, cout croissant et risque de doublons sous ecritures concurrentes.
- **H15-04** — `patisgest-app/src/lib/workspace-read.ts:37` — `const sonde = await page(LIMITE_TOTALE, LIMITE_TOTALE);` : verifier le plan de la requete a offset 20 000 et le cout d'une sonde systematique.
- **H15-05** — `patisgest-app/supabase/50-roles-permissions-vues.sql:135` — Vues `security_barrier` avec `patisgest_mon_role()` : evaluer le cout d'appel de la fonction par ligne sur une table de 100 000 mouvements.
- **H15-06** — `patisgest-app/supabase/04-securite-lecture.sql:9` — Policy `client_id in (select client_id from public.utilisateurs where auth_user_id = auth.uid())` : verifier si le sous-predicat est evalue une fois (InitPlan) ou par ligne, et l'index sur `utilisateurs.auth_user_id`.
- **H15-07** — `patisgest-app/src/lib/courses-server.ts:52` — `.limit(500)` / `.limit(5000)` sans pagination ni garde de depassement : troncature silencieuse des besoins de production au-dela du plafond.
- **H15-08** — `patisgest-app/supabase/23-controle-modules.sql:132` — Policies RESTRICTIVE avec `exists(select 1 from unnest(string_to_array(...)))` : mesurer le surcout par INSERT/UPDATE sur les tables de mouvements.
- **H15-09** — `patisgest-app/src/lib/workspace-read.ts:112` — Repli `legacy` : une seconde requete de 50 ventes est executee apres la premiere. Identifier la condition exacte et le cas N+1.
- **H15-10** — `patisgest-app/src/app/api/export/route.ts:60` — Export plafonne a 20 000 lignes : verifier le plan de la requete, l'absence de `count(*)` couteux et le comportement multi-tenant sous charge.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S15.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S15-F001`, `S15-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/15-performance-base-scalabilite.md -->

---

<a id="part-16"></a>

## Partie 16 — `audit/16-architecture-maintenabilite.md`

> **Source** : `audit/16-architecture-maintenabilite.md` · **162 lignes** · **13477 octets** · **SHA-256** : `0ac47a7827366b99f9d19280cad36982db2737fae5a340ac09711caa27a3f686`
> **Titre** : Architecture, Maintenabilite, Typage & Code Mort · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/16-architecture-maintenabilite.md sha256=0ac47a7827366b99f9d19280cad36982db2737fae5a340ac09711caa27a3f686 -->

# Tranche 16/20 — Architecture, Maintenabilite, Typage & Code Mort

**Couche** : Couche 4 — Fiabilite, performance, structure · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S16.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**14 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/16-architecture-maintenabilite.md` | 162 | prompt autonome MODE B de cette tranche |
| `design-studio/public/app.css` | 375 | module autonome du studio de maquettes |
| `design-studio/public/icons.mjs` | 33 | module autonome du studio de maquettes |
| `design-studio/public/index.html` | 26 | module autonome du studio de maquettes |
| `design-studio/public/model.mjs` | 103 | module autonome du studio de maquettes |
| `design-studio/public/studio.css` | 164 | module autonome du studio de maquettes |
| `design-studio/public/studio.mjs` | 271 | module autonome du studio de maquettes |
| `design-studio/public/views.mjs` | 263 | module autonome du studio de maquettes |
| `design-studio/serve.mjs` | 38 | module autonome du studio de maquettes |
| `patisgest-app/src/components/demo-caisse.tsx` | 201 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-dashboard.tsx` | 241 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-module.tsx` | 267 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-workspace.tsx` | 41 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/demo-workspace.ts` | 527 | module lib: responsabilite de la tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/actions-couts.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/vitrine.ts` → **T04** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/export/comptable/route.ts` → **T12** (`export comptable CSV`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/tomorrow-lab-private-server.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-haccp.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/patisgest-store.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-simulation.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les règles métier elles-mêmes (T05/T06) : n’auditer ici que duplication, typage et code mort.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- **Aucun fichier de test en propriété** : documenter explicitement cet angle mort dans la section 4 du rapport.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H16-01** — `patisgest-app/src/lib/demo-workspace.ts:335` — `createDemoWorkspace` : une seconde implementation de la logique metier (patisgest-store.ts:240). Lister les regles dupliquees et celles qui divergent (arrondis, statuts, Z).
- **H16-02** — `patisgest-app/src/lib/demo-workspace.ts:220` — `demoTomorrowPlan` vs `tomorrow-lab.ts:244` : deux moteurs de planification. Comparer les formules de besoin et reperer la derive.
- **H16-03** — `patisgest-app/src/lib/demo-workspace.ts:158` — `demoMercurialeFor` vs `actions-couts.ts:444` : deux calculs de variation de prix. Montrer un cas ou les resultats different.
- **H16-04** — `patisgest-app/src/lib/actions-couts.ts:215` — `supabase as unknown as ClientLots` : cast structurel non verifie sur un client PostgREST. Verifier les methodes reellement presentes au runtime.
- **H16-05** — `patisgest-app/src/lib/vitrine.ts:98` — `(data ?? []) as unknown as LigneVitrine[]` : cast sur une jointure PostgREST ; comparer avec la garde de `connectivite-cron.ts:33` (exemple de code sain).
- **H16-06** — `patisgest-app/src/app/api/export/comptable/route.ts:110` — `as unknown as` sur les lignes de ventes : verifier qu'aucun champ obligatoire n'est suppose present sans validation.
- **H16-07** — `design-studio/serve.mjs:15` — Serveur HTTP autonome (port 4173) absent des scripts package.json : determiner s'il est un module mort toujours exposable et s'il sert des donnees reelles.
- **H16-08** — `design-studio/public/views.mjs:1` — Prototype UI de 25 072 octets dupliquant les ecrans de src/components : verifier s'il est importe par l'application (non) et s'il est maintenu en parallele.
- **H16-09** — `patisgest-app/src/lib/tomorrow-lab-private-server.ts:33` — Ligne unique dense (`for(const v of allVersions) if(...)`) : verifier la lisibilite, la correction du choix de version active et l'absence de test dedie.
- **H16-10** — `patisgest-app/src/lib/actions-haccp.ts:38` — `client_id: ctx!.clientId` : assertion non-null apres `getSessionContext()` ; verifier la garde sur ctx et le risque de TypeError en cas de session expiree.
- **H16-11** — `patisgest-app/src/lib/patisgest-store.ts:616` — Deduplication d'import Z implementee uniquement dans le store demo : verifier l'equivalent SQL/RPC et la divergence des deux regles.
- **H16-12** — `patisgest-app/src/lib/actions-simulation.ts:67` — `supabase as unknown as ClientLots` (meme cast qu'en actions-couts.ts:215) : duplication d'un contournement de typage, a factoriser ou a remplacer par un contrat reel.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S16.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S16-F001`, `S16-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/16-architecture-maintenabilite.md -->

---

<a id="part-17"></a>

## Partie 17 — `audit/17-build-config-secrets-supply-chain.md`

> **Source** : `audit/17-build-config-secrets-supply-chain.md` · **161 lignes** · **13132 octets** · **SHA-256** : `8c02e8266752e92c7aa1bdf5205f8ccd8a836a5ea34e422807b077e1617f5348`
> **Titre** : Build, Configuration, Secrets & Supply Chain · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/17-build-config-secrets-supply-chain.md sha256=8c02e8266752e92c7aa1bdf5205f8ccd8a836a5ea34e422807b077e1617f5348 -->

# Tranche 17/20 — Build, Configuration, Secrets & Supply Chain

**Couche** : Couche 5 — Ops, supply chain, verite des tests · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S17.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**17 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `.gitignore` | 30 | configuration de build/runtime et secrets |
| `audit/17-build-config-secrets-supply-chain.md` | 161 | prompt autonome MODE B de cette tranche |
| `patisgest-app/.env.example` | 96 | configuration de build/runtime et secrets |
| `patisgest-app/.gitignore` | 12 | configuration de build/runtime et secrets |
| `patisgest-app/eslint.config.mjs` | 7 | configuration de build/runtime et secrets |
| `patisgest-app/next-env.d.ts` | 7 | configuration de build/runtime et secrets |
| `patisgest-app/next.config.ts` | 24 | configuration de build/runtime et secrets |
| `patisgest-app/package-lock.json` | 7089 | configuration de build/runtime et secrets |
| `patisgest-app/package.json` | 47 | configuration de build/runtime et secrets |
| `patisgest-app/postcss.config.mjs` | 7 | configuration de build/runtime et secrets |
| `patisgest-app/scripts/db-push-disabled.mjs` | 4 | garde anti db:push |
| `patisgest-app/src/lib/licence-mode.ts` | 37 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/preview-guard.ts` | 26 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/db-push-guard.test.mjs` | 20 | test a auditer pour cette tranche |
| `patisgest-app/tests/preview-guard.test.mjs` | 79 | test a auditer pour cette tranche |
| `patisgest-app/tests/preview-http.mjs` | 59 | sonde du garde-fou de preview hors glob npm test |
| `patisgest-app/tsconfig.json` | 43 | configuration de build/runtime et secrets |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/trial-crypto.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Le runtime applicatif (T13), les workflows CI (T18), les gardes d’aperçu côté rendu (T10).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/db-push-guard.test.mjs` (20 lignes) — propriété T17.
- `patisgest-app/tests/preview-guard.test.mjs` (79 lignes) — propriété T17.
- `patisgest-app/tests/preview-http.mjs` (59 lignes) — propriété T17.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H17-01** — `patisgest-app/next.config.ts:7` — `PATISGEST_PREVIEW_BLOCKED: process.env.VERCEL_ENV === "preview" ? "1" : "0"` : valeur FIGEE AU BUILD. Correler avec preview-guard.ts:19-20 et le cas de promotion d'un build preview en production.
- **H17-02** — `patisgest-app/next.config.ts:10` — `NEXT_PUBLIC_PATISGEST_MODE_GRATUIT: process.env.PATISGEST_MODE_GRATUIT ?? "1"` alors que `licence-mode.ts:24` lit `NEXT_PUBLIC_PATISGEST_MODE_GRATUIT` : verifier la chaine de noms et le defaut fail-open.
- **H17-03** — `patisgest-app/src/lib/licence-mode.ts:25` — `if (brut === undefined) return true;` : en l'absence de variable, le mode gratuit est actif -> aucun verrou de licence. Verifier les consequences en production.
- **H17-04** — `patisgest-app/src/lib/trial-crypto.ts:26` — `serverSeed()` : 4 replis de secrets puis une graine publique. Verifier quels deploiements ont au moins PATISGEST_MASTER_KEY et si un jeton signe avec la graine de dev est accepte.
- **H17-05** — `patisgest-app/.env.example:20` — `VITRINE_SECRET_ANTI_ABUS=` (vide par defaut) : comportement fail-open de l'anti-abus (vitrine-anti-abus.ts:15). Verifier qu'aucun secret n'est committe ailleurs dans le depot.
- **H17-06** — `patisgest-app/.env.example:41` — `SUPABASE_SERVICE_ROLE_KEY=` : verifier par grep l'absence de valeur reelle dans le depot et la separation des secrets de build/runtime.
- **H17-07** — `patisgest-app/package.json:16` — `--test tests/*.test.mjs` : le glob n'inclut NI tests/e2e/*.spec.mjs, NI tests/integration/*.mjs, NI smoke-http.mjs, NI preview-http.mjs. Mesurer la couverture reelle (voir 00-INDEX.md).
- **H17-08** — `patisgest-app/package.json:22` — 9 dependances en `^` (supabase-js, nodemailer, postgres, react...) avec `package-lock.json` verrouille : verifier `npm ci` et `npm audit --omit=dev` (ci.yml:46) et la reproductibilite du build.
- **H17-09** — `patisgest-app/scripts/db-push-disabled.mjs:3` — `console.error(...); process.exitCode = 1;` : garde anti-Drizzle. Verifier qu'aucun autre script ou workflow n'applique un schema non revu.
- **H17-10** — `patisgest-app/.gitignore:6` — `.env*.local`, `.env`, `*.pem` : verifier que .env.example, les artefacts de dev (design-studio) et les rapports d'audit ne contiennent pas de secret.
- **H17-11** — `patisgest-app/next.config.ts:19` — `allowedDevOrigins: process.env.E2B_SANDBOX_ID ? [...] : []` : config conditionnee a une variable de sandbox ; verifier le comportement hors de ce contexte.
- **H17-12** — `patisgest-app/package.json:6` — `engines.node >=22.15.0` vs `ci.yml:42` `node-version: '22'` : verifier la version exacte resolue par le runner et les flags `--experimental-strip-types` (l.16).

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S17.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S17-F001`, `S17-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/17-build-config-secrets-supply-chain.md -->

---

<a id="part-18"></a>

## Partie 18 — `audit/18-cicd-migrations-sauvegardes.md`

> **Source** : `audit/18-cicd-migrations-sauvegardes.md` · **205 lignes** · **18773 octets** · **SHA-256** : `1e9df16e4a5741b26c2a76a3e8fee1c704fef9eb9342244235630982405d9989`
> **Titre** : CI/CD, Migrations, Sauvegarde, Restauration & Rollback · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/18-cicd-migrations-sauvegardes.md sha256=1e9df16e4a5741b26c2a76a3e8fee1c704fef9eb9342244235630982405d9989 -->

# Tranche 18/20 — CI/CD, Migrations, Sauvegarde, Restauration & Rollback

**Couche** : Couche 5 — Ops, supply chain, verite des tests · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S18.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**53 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `.github/workflows/ci.yml` | 218 | CI/CD, sauvegarde, pile isolee |
| `.github/workflows/sauvegarde-free.yml` | 184 | CI/CD, sauvegarde, pile isolee |
| `.github/workflows/supabase-isole.yml` | 152 | CI/CD, sauvegarde, pile isolee |
| `audit/18-cicd-migrations-sauvegardes.md` | 205 | prompt autonome MODE B de cette tranche |
| `patisgest-app/migrations/propositions/cloture-of-perte-experimentale.sql` | 87 | chaine de migrations, manifeste, propositions et snapshots |
| `patisgest-app/migrations/repetition.json` | 433 | chaine de migrations, manifeste, propositions et snapshots |
| `patisgest-app/src/app/api/sauvegarde/route.ts` | 81 | generation de sauvegarde JSON |
| `patisgest-app/src/components/sauvegarde-panel.tsx` | 135 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-restauration.ts` | 100 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/sauvegarde.ts` | 253 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/schema-version.ts` | 36 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/18-restauration-sauvegarde.sql` | 156 | migration 18: sauvegarde/restauration: RPC et ordre de rejeu |
| `patisgest-app/supabase/33-restauration-sans-perte.sql` | 109 | migration 33: restauration sans perte: transaction et ordre |
| `patisgest-app/supabase/35-version-schema-app.sql` | 49 | migration 35: version de schema applicative et garde de deploiement |
| `patisgest-app/supabase/brouillons/101-confidentialite-labo.sql` | 126 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/102-cout-of-partiel.sql` | 25 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/103-gestion-sites.sql` | 10 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/104-equipe-fondations.sql` | 124 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/105-sites-lecture-brouillon.sql` | 42 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/106-sites-rpc-brouillon.sql` | 53 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/107-tracabilite-sites-brouillon.sql` | 34 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/108-reassort-sites-brouillon.sql` | 68 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/109-cake-sites-brouillon.sql` | 180 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/110-equipe-approbation-brouillon.sql` | 57 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/111-of-idempotence-sites-brouillon.sql` | 27 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/112-donnees-sans-site-brouillon.sql` | 49 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/113-equipe-affectations-revocation-brouillon.sql` | 75 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/114-equipe-admission-brouillon.sql` | 108 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/115-confidentialite-vendeur-lots-brouillon.sql` | 24 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/116-confidentialite-vendeur-of-brouillon.sql` | 20 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/117-rappel-perimetre-brouillon.sql` | 54 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/118-equipe-liste-invitations-brouillon.sql` | 16 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/119-equipe-mes-demandes-brouillon.sql` | 16 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/120-equipe-membres-revision-brouillon.sql` | 79 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/121-vendeur-sites-boutique-brouillon.sql` | 20 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/122-revocation-adresses-brouillon.sql` | 27 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/123-revocation-decisions-brouillon.sql` | 112 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/124-restauration-gardes-brouillon.sql` | 54 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/125-vitrine-perimetre-brouillon.sql` | 30 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/126-vitrine-photos-modules-brouillon.sql` | 51 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/127-vitrine-depot-schema-brouillon.sql` | 24 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/128-caisse-collision-ticket-brouillon.sql` | 52 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/tests/chaine-rejouable.test.mjs` | 55 | test a auditer pour cette tranche |
| `patisgest-app/tests/integration/auth-apres-restauration.mjs` | 32 | procedure de restauration isolee |
| `patisgest-app/tests/integration/empreinte-restauration.mjs` | 53 | procedure de restauration isolee |
| `patisgest-app/tests/integration/restauration-cli-isolee.sh` | 55 | procedure de restauration isolee |
| `patisgest-app/tests/integration/restauration-isolee.sh` | 35 | procedure de restauration isolee |
| `patisgest-app/tests/integration/verifier-restauration.mjs` | 33 | procedure de restauration isolee |
| `patisgest-app/tests/migrations-historique.mjs` | 26 | manifeste de la chaine de deploiement |
| `patisgest-app/tests/migrations-repetition.test.mjs` | 48 | test a auditer pour cette tranche |
| `patisgest-app/tests/revue-corrections.test.mjs` | 147 | test a auditer pour cette tranche |
| `patisgest-app/tests/sauvegarde.test.mjs` | 276 | test a auditer pour cette tranche |
| `revue/sauvegardes/vendre_panier-avant-53.pgsql` | 223 | artefact de rollback / sauvegarde SQL |

## 2. Exclusions (hors périmètre)

- `patisgest-app/tests/concurrence-transfert-reel.test.mjs` → **T07** (`test a auditer pour cette tranche`) : preuve de traçage uniquement.
- `patisgest-app/supabase/53-caisse-ticket-scope.sql` → **T07** (`migration 53: portee du ticket de caisse: idempotence stricte`) : preuve de traçage uniquement.
- Les corps SQL de sécurité (T03), la portée du ticket (T07), les PII omises (T19).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/chaine-rejouable.test.mjs` (55 lignes) — propriété T18.
- `patisgest-app/tests/integration/auth-apres-restauration.mjs` (32 lignes) — propriété T18.
- `patisgest-app/tests/integration/empreinte-restauration.mjs` (53 lignes) — propriété T18.
- `patisgest-app/tests/integration/restauration-cli-isolee.sh` (55 lignes) — propriété T18.
- `patisgest-app/tests/integration/restauration-isolee.sh` (35 lignes) — propriété T18.
- `patisgest-app/tests/integration/verifier-restauration.mjs` (33 lignes) — propriété T18.
- `patisgest-app/tests/migrations-historique.mjs` (26 lignes) — propriété T18.
- `patisgest-app/tests/migrations-repetition.test.mjs` (48 lignes) — propriété T18.
- `patisgest-app/tests/revue-corrections.test.mjs` (147 lignes) — propriété T18.
- `patisgest-app/tests/sauvegarde.test.mjs` (276 lignes) — propriété T18.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H18-01** — `patisgest-app/tests/chaine-rejouable.test.mjs:20` — `test.todo('les migrations de schema 01→43 se rejouent sur une base vierge')` : le seul test de rejouabilite de la chaine est DESACTIVE. Execution reelle : 4 todo, 0 fail.
- **H18-02** — `patisgest-app/tests/concurrence-transfert-reel.test.mjs:19` — `const sansBase = test.skip; const lancer = URL_ADMIN ? test : sansBase;` : sans PATSYGEST_PG_URL, le test de concurrence sur vrai PostgreSQL est ignore (3 skipped mesures).
- **H18-03** — `patisgest-app/tests/migrations-historique.mjs:23` — `chaineDeploiement()` = `plan.historique` + `plan.main_hors_serie` tries : verifier que 53 figure dans `migrations/repetition.json` et que le manifeste est la source de verite du deploiement.
- **H18-04** — `patisgest-app/supabase/53-caisse-ticket-scope.sql:36` — `begin; create or replace function public.vendre_panier(...)` : verifier la presence du `commit;`, l'idempotence du rejeu et la separation brouillons (101-128) / serie main.
- **H18-05** — `patisgest-app/supabase/18-restauration-sauvegarde.sql:153` — `revoke all ...; grant execute ... to authenticated, service_role` : verifier la transaction englobante, la garde de role et l'ordre de restauration de `sauvegarde.ts:25`.
- **H18-06** — `patisgest-app/src/lib/sauvegarde.ts:52` — `TABLES_EXCLUES` (12 entrees, l.53-64) : la sauvegarde JSON omet utilisateurs, equipe_*, vitrine_photos, storage. Verifier que l'utilisateur en est informe et la consequence d'une restauration.
- **H18-07** — `patisgest-app/src/lib/sauvegarde.ts:22` — `MAX_OCTETS_SAUVEGARDE = 4*1024*1024` + `api/sauvegarde/route.ts:69` -> 413 : au-dela, aucune sauvegarde n'est possible. Calculer le volume a partir duquel un pilote est sans filet.
- **H18-08** — `.github/workflows/sauvegarde-free.yml:128` — Garde 'sauvegarde suspecte' sur le nombre de tables, mais l.176 'Restauration reelle non testee par ce workflow' : etablir ce qui est prouve et ce qui ne l'est pas.
- **H18-09** — `.github/workflows/ci.yml:50` — `npm test` puis l.52 'Build sans acces ni secrets de production' : verifier que le build n'embarque aucune creance et que les migrations ne sont jamais appliquees au pilote depuis la CI.
- **H18-10** — `revue/sauvegardes/vendre_panier-avant-53.pgsql:1` — Artefact de rollback de `vendre_panier` : verifier qu'il est complet, rejouable et qu'une procedure de retour arriere a chaud est definie par le code (et non seulement decrite).
- **H18-11** — `patisgest-app/supabase/33-restauration-sans-perte.sql:29` — `security definer` : verifier l'ordre des DELETE/INSERT, la gestion des FK et le comportement a mi-parcours si une insertion echoue.
- **H18-12** — `patisgest-app/supabase/35-version-schema-app.sql:1` — Table `app_schema_version` + garde `(app)/layout.tsx:38-42` : verifier le refus explicite en cas de version decalee et l'absence de blocage silencieux.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S18.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S18-F001`, `S18-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/18-cicd-migrations-sauvegardes.md -->

---

<a id="part-19"></a>

## Partie 19 — `audit/19-observabilite-audit-pii.md`

> **Source** : `audit/19-observabilite-audit-pii.md` · **168 lignes** · **14255 octets** · **SHA-256** : `64cac47cd14d0c124fb4b9f8a1596936163061e02516791c2b33766e61a66336`
> **Titre** : Observabilite, Auditabilite, PII & Exploitation · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/19-observabilite-audit-pii.md sha256=64cac47cd14d0c124fb4b9f8a1596936163061e02516791c2b33766e61a66336 -->

# Tranche 19/20 — Observabilite, Auditabilite, PII & Exploitation

**Couche** : Couche 5 — Ops, supply chain, verite des tests · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S19.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**22 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `.github/workflows/cron-connectivite.yml` | 79 | tache planifiee et alertes |
| `audit/19-observabilite-audit-pii.md` | 168 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/mentions-legales/page.tsx` | 139 | mentions legales et donnees personnelles |
| `patisgest-app/src/app/api/cron/connectivite/route.ts` | 36 | route cron et authentification Bearer |
| `patisgest-app/src/app/api/health/route.ts` | 20 | healthcheck public |
| `patisgest-app/src/components/donnees-personnelles-panel.tsx` | 142 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/journal-audit-panel.tsx` | 147 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/telephone-alerte-form.tsx` | 54 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-donnees.ts` | 113 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/connectivite-cron.ts` | 204 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/journal-actions-communs.ts` | 32 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/journal-audit.ts` | 123 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/notifications-alerte.ts` | 275 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/40-journal-audit.sql` | 258 | migration 40: journal d'audit immuable et triggers |
| `patisgest-app/supabase/42-donnees-personnelles.sql` | 236 | migration 42: donnees personnelles: export et anonymisation |
| `patisgest-app/supabase/48-notifications-patron.sql` | 142 | migration 48: notifications patron: alertes et journal |
| `patisgest-app/tests/api-health.test.mjs` | 45 | test a auditer pour cette tranche |
| `patisgest-app/tests/connectivite-lignes.test.mjs` | 122 | test a auditer pour cette tranche |
| `patisgest-app/tests/donnees-personnelles-db.test.mjs` | 193 | test a auditer pour cette tranche |
| `patisgest-app/tests/essai-master-connectivite.test.mjs` | 211 | test a auditer pour cette tranche |
| `patisgest-app/tests/journal-audit-db.test.mjs` | 222 | test a auditer pour cette tranche |
| `patisgest-app/tests/journal-audit.test.mjs` | 83 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- Les objets SQL d’audit en tant que privilèges (T03), la conformité des tests (T20).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/api-health.test.mjs` (45 lignes) — propriété T19.
- `patisgest-app/tests/connectivite-lignes.test.mjs` (122 lignes) — propriété T19.
- `patisgest-app/tests/donnees-personnelles-db.test.mjs` (193 lignes) — propriété T19.
- `patisgest-app/tests/essai-master-connectivite.test.mjs` (211 lignes) — propriété T19.
- `patisgest-app/tests/journal-audit-db.test.mjs` (222 lignes) — propriété T19.
- `patisgest-app/tests/journal-audit.test.mjs` (83 lignes) — propriété T19.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H19-01** — `patisgest-app/supabase/40-journal-audit.sql:108` — `create trigger journal_audit_immuable` : lire l'evenement exact (BEFORE/AFTER, INSERT/UPDATE/DELETE) et prouver qu'un proprietaire ne peut ni modifier ni effacer une ligne d'audit.
- **H19-02** — `patisgest-app/supabase/40-journal-audit.sql:126` — `create policy journal_audit_lecture_proprietaire` + `grant select` (l.123) : verifier le predicat de tenant et qu'un labo/vendeur ne lit pas les actions d'autrui.
- **H19-03** — `patisgest-app/supabase/40-journal-audit.sql:158` — `insert ... (acteur_email, ...)` : PII conservee en clair et 'survit a la suppression du compte' (l.65). Verifier la compatibilite avec l'anonymisation de la migration 42.
- **H19-04** — `patisgest-app/supabase/42-donnees-personnelles.sql:173` — `set client_nom = 'Client anonymise (' || v_ref || ')', telephone = null` : verifier TOUTES les autres colonnes identifiantes (email, adresse, notes, reference) et les tables liees avant de conclure a une anonymisation reelle.
- **H19-05** — `patisgest-app/supabase/42-donnees-personnelles.sql:87` — L'export inclut `c.telephone` (l.87) et `u.email` (l.97) : verifier le filtre de tenant de `exporter_donnees_personnelles` et l'absence de fuite inter-clients.
- **H19-06** — `patisgest-app/src/app/api/health/route.ts:15` — `{ ok:true, ... }` sans aucune sonde DB : un 200 est renvoye meme si Supabase est en pause. Evaluer la detection de panne silencieuse (ci.yml:184 utilise cette route pour le E2E).
- **H19-07** — `patisgest-app/src/lib/connectivite-cron.ts:75` — `cutoffIso = new Date(Date.now() - thresholdMin*60_000)` : horloge du serveur Next vs `last_seen_at` ecrit par la DB. Verifier le decalage et les faux positifs/negatifs d'alerte.
- **H19-08** — `patisgest-app/src/lib/connectivite-cron.ts:128` — `if (!u.last_seen_at) continue;` : un compte jamais vu n'est jamais considere comme deconnecte -> aucune alerte. Verifier si c'est le comportement voulu pour un nouveau pilote.
- **H19-09** — `patisgest-app/src/app/api/cron/connectivite/route.ts:9` — `CRON_SECRET` absent ou < 12 caracteres -> 401 (fail-closed), mais repli `getMasterSession()` (l.22) : verifier la surface d'appel et l'absence de brute force sur ce secret.
- **H19-10** — `.github/workflows/cron-connectivite.yml:30` — Garde `CRON_SECRET` >= 12 : verifier l'alerting si le workflow lui-meme ne s'execute plus (pas de heartbeat de surveillance du cron).
- **H19-11** — `patisgest-app/supabase/48-notifications-patron.sql:35` — `grant select, insert, update, delete ... to authenticated, service_role` : verifier les policies (l.38-57) et qu'un vendeur ne peut pas marquer une alerte prix traitee.
- **H19-12** — `patisgest-app/src/lib/notifications-alerte.ts:147` — `params.fetchImpl(params.webhookUrl, {...})` sans timeout ni AbortSignal : verifier le SSRF via variable d'environnement et le blocage du cron sur un webhook lent.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S19.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S19-F001`, `S19-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/19-observabilite-audit-pii.md -->

---

<a id="part-20"></a>

## Partie 20 — `audit/20-meta-audit-tests-drift.md`

> **Source** : `audit/20-meta-audit-tests-drift.md` · **238 lignes** · **21769 octets** · **SHA-256** : `acedf1fb4b4393047f8a807bef474afd85c46d5eb1dd4b11cf8b36c99ff486ad`
> **Titre** : Meta-Audit des Tests & Derive Code-Documentation · **Contenu** : intégral, verbatim, octet pour octet.

<!-- BEGIN SOURCE: audit/20-meta-audit-tests-drift.md sha256=acedf1fb4b4393047f8a807bef474afd85c46d5eb1dd4b11cf8b36c99ff486ad -->

# Tranche 20/20 — Meta-Audit des Tests & Derive Code-Documentation

**Couche** : Couche 5 — Ops, supply chain, verite des tests · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S20.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**68 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `AUDIT-CONFORMITE-CDC-CODE.md` | 508 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `ETUDE-MARCHE-PATISSERIES-DZ-2026.md` | 129 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `GUIDE-PILOTE.md` | 285 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `NOTE-COUT-MINIMAL.md` | 200 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `NOTE-HEBERGEMENT.md` | 270 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PLAN-AMELIORATION-PATISGEST.md` | 214 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PROTOCOLE-QUALIFICATION-MATERIELLE.md` | 252 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/01-Cahier-des-Charges-PatisGest-v4.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/01-Cahier-des-Charges-PatisGest-v4.md` | 427 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/02-Architecture-Technique-PatisGest-v4.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/02-Architecture-Technique-PatisGest-v4.md` | 328 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.md` | 176 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/04-Plan-Attaque-1-Pilote.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/04-Plan-Attaque-1-Pilote.md` | 138 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/05-Kit-Phase0-Terrain.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/05-Kit-Phase0-Terrain.md` | 122 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/06-Maquettes-Onboarding.pdf` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `README.md` | 59 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `audit/00-INDEX.md` | 888 | index maitre et matrice de propriete |
| `audit/20-meta-audit-tests-drift.md` | 238 | prompt autonome MODE B de cette tranche |
| `audit/MODE-A-CONSOLIDE-UN-SEUL-FICHIER.md` | 0 | artefact de transmission unique: index + 20 prompts en un seul Markdown (L=0, genere apres metriques) |
| `design-studio/README.md` | 46 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `design-studio/tests/model.test.mjs` | 58 | test du prototype |
| `patisgest-app/AGENTS.md` | 9 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/AUDIT-PHASE-1.md` | 159 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/CHECKLIST-60.md` | 107 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/PLAN-CLOTURE.md` | 174 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/README.md` | 337 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/SECURITE-COMPTES.md` | 138 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/APPLICATION-39-42.md` | 176 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md` | 131 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/EQUIPE-MODULE-INACTIF.md` | 130 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/ETAT-RESTAURATION.md` | 32 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/RI-04-unicite-lot.md` | 127 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/SAUVEGARDE-EXPERIMENTALE.md` | 42 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/VALIDATION-CONFIDENTIALITE-ROLES.md` | 205 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/VUES-ROLES-ABSENTES.md` | 191 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/snapshots/pilote-v38-2026-11-23.md` | 59 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/tests/audit-catalogue.sql` | 25 | catalogue SQL d audit |
| `patisgest-app/tests/e2e/README.md` | 58 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/tests/e2e/bootstrap-ci.mjs` | 174 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/caisse.spec.mjs` | 28 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/helpers.mjs` | 24 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/seed.mjs` | 50 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/stock.spec.mjs` | 47 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/transfert.spec.mjs` | 29 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/vitrine.spec.mjs` | 31 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/fixtures/pilote-vitrine/README.md` | 5 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/tests/harness-execution.mjs` | 94 | harnais de tests: mocks de session et de client DB |
| `patisgest-app/tests/inventaire-rpc.json` | 9 | inventaire / catalogue de tests |
| `patisgest-app/tests/inventaire-surface.json` | 171 | inventaire / catalogue de tests |
| `patisgest-app/tests/inventaire-surface.mjs` | 26 | inventaire statique des points d entree |
| `patisgest-app/tests/inventaire-surface.test.mjs` | 9 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/label-model.test.mjs` | 64 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/liste-courses.test.mjs` | 135 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/mocks/next-stubs.mjs` | 33 | harnais / fixture de test |
| `patisgest-app/tests/mocks/register-hooks.mjs` | 43 | harnais / fixture de test |
| `patisgest-app/tests/retrait-mode-carte-db.test.mjs` | 63 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/smoke-http.mjs` | 442 | script HTTP hors glob npm test |
| `patisgest-app/tests/support/fixture-of-cout.mjs` | 17 | harnais / fixture de test |
| `patisgest-app/tests/support/serie-main.mjs` | 33 | harnais / fixture de test |
| `patisgest-app/tests/tomorrow-recipe-guard.test.mjs` | 15 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/vitrine.test.mjs` | 293 | test non apparie: meta-audit des assertions |
| `revue/CHECKLIST-DEPLOIEMENT.md` | 405 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/DOSSIER-PILOTES-COMMERCIAL.md` | 91 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/PLAN-DE-COMMIT.md` | 310 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/PROCEDURE-RESTAURATION-PILOTE.md` | 94 | affirmation documentaire non fiable (DRIFT a confronter au code) |

## 2. Exclusions (hors périmètre)

- `patisgest-app/package.json` → **T17** (`configuration de build/runtime et secrets`) : preuve de traçage uniquement.
- `patisgest-app/tests/chaine-rejouable.test.mjs` → **T18** (`test a auditer pour cette tranche`) : preuve de traçage uniquement.
- `patisgest-app/tests/concurrence-transfert-reel.test.mjs` → **T07** (`test a auditer pour cette tranche`) : preuve de traçage uniquement.
- `patisgest-app/.env.example` → **T17** (`configuration de build/runtime et secrets`) : preuve de traçage uniquement.
- Les fichiers applicatifs (T01–T19) : n’auditer ici que les corps d’assertions, mocks, harnais et docs.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `design-studio/tests/model.test.mjs` (58 lignes) — propriété T20.
- `patisgest-app/tests/audit-catalogue.sql` (25 lignes) — propriété T20.
- `patisgest-app/tests/e2e/README.md` (58 lignes) — propriété T20.
- `patisgest-app/tests/e2e/bootstrap-ci.mjs` (174 lignes) — propriété T20.
- `patisgest-app/tests/e2e/caisse.spec.mjs` (28 lignes) — propriété T20.
- `patisgest-app/tests/e2e/helpers.mjs` (24 lignes) — propriété T20.
- `patisgest-app/tests/e2e/seed.mjs` (50 lignes) — propriété T20.
- `patisgest-app/tests/e2e/stock.spec.mjs` (47 lignes) — propriété T20.
- `patisgest-app/tests/e2e/transfert.spec.mjs` (29 lignes) — propriété T20.
- `patisgest-app/tests/e2e/vitrine.spec.mjs` (31 lignes) — propriété T20.
- `patisgest-app/tests/fixtures/pilote-vitrine/README.md` (5 lignes) — propriété T20.
- `patisgest-app/tests/harness-execution.mjs` (94 lignes) — propriété T20.
- `patisgest-app/tests/inventaire-rpc.json` (9 lignes) — propriété T20.
- `patisgest-app/tests/inventaire-surface.json` (171 lignes) — propriété T20.
- `patisgest-app/tests/inventaire-surface.mjs` (26 lignes) — propriété T20.
- `patisgest-app/tests/inventaire-surface.test.mjs` (9 lignes) — propriété T20.
- `patisgest-app/tests/label-model.test.mjs` (64 lignes) — propriété T20.
- `patisgest-app/tests/liste-courses.test.mjs` (135 lignes) — propriété T20.
- `patisgest-app/tests/mocks/next-stubs.mjs` (33 lignes) — propriété T20.
- `patisgest-app/tests/mocks/register-hooks.mjs` (43 lignes) — propriété T20.
- `patisgest-app/tests/retrait-mode-carte-db.test.mjs` (63 lignes) — propriété T20.
- `patisgest-app/tests/smoke-http.mjs` (442 lignes) — propriété T20.
- `patisgest-app/tests/support/fixture-of-cout.mjs` (17 lignes) — propriété T20.
- `patisgest-app/tests/support/serie-main.mjs` (33 lignes) — propriété T20.
- `patisgest-app/tests/tomorrow-recipe-guard.test.mjs` (15 lignes) — propriété T20.
- `patisgest-app/tests/vitrine.test.mjs` (293 lignes) — propriété T20.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H20-01** — `patisgest-app/package.json:16` — Glob `--test tests/*.test.mjs` : execution REELLE mesuree en MODE A = 788 tests, 781 pass, 0 fail, 3 skipped, 4 todo, ~249 s, sur 129 fichiers `node:test`, 873 appels test/it dans le glob, 6 scripts `.mjs` a la racine hors glob et 21 au total sous `tests/`. Verifier les 129 fichiers.
- **H20-02** — `patisgest-app/tests/chaine-rejouable.test.mjs:20` — `test.todo(...)` avec un corps complet et une assertion `assert.deepEqual(echecs, [])` : test present mais INCAPABLE d'echouer. Mesurer l'ecart entre la suite verte et la verite de la chaine de migrations.
- **H20-03** — `patisgest-app/tests/concurrence-transfert-reel.test.mjs:19` — `const sansBase = test.skip` : la seule preuve de concurrence sur PostgreSQL reel est conditionnelle a une variable d'environnement absente hors CI.
- **H20-04** — `patisgest-app/tests/harness-execution.mjs:35` — `mock.module(authUrl, { namedExports: { ...permissions, getSessionContext: async () => etat.session } })` : tous les tests d'actions remplacent la vraie session. Prouver qu'aucun test ne valide la chaine auth reelle.
- **H20-05** — `patisgest-app/tests/harness-execution.mjs:71` — `new Proxy(b, { get(cible, prop) { ... return (...args) => { appels.push(...); return proxy; } } })` : toute methode inexistante est acceptee. Un test peut donc passer avec un appel `.eq()` oublie.
- **H20-06** — `patisgest-app/tests/mocks/register-hooks.mjs:28` — `specifier === 'server-only' -> data:text/javascript,export default undefined` : la garde de bundler est neutralisee dans les tests ; verifier qu'aucun test ne certifie l'absence d'import serveur cote client.
- **H20-07** — `patisgest-app/tests/inventaire-surface.test.mjs:8` — `assert.deepEqual(await surface(), expected)` : test de conformite a un fichier JSON COMMITE, pas a un risque. Verifier qui regenere l'inventaire (`inventaire-surface.mjs:24 --update`) et la tautologie possible.
- **H20-08** — `patisgest-app/tests/inventaire-surface.mjs:20` — `source.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)` : ne detecte pas les fonctions exportees en const/arrow ni les actions non async. Comparer avec le nombre reel de points d'entree.
- **H20-09** — `README.md:1` — Affirmation documentaire (hypothese hostile) : confronter CHAQUE affirmation de README.md, patisgest-app/README.md, SECURITE-COMPTES.md, AGENTS.md, AUDIT-CONFORMITE-CDC-CODE.md, revue/*.md et PâtisGest-Documents/*.md au code executable. Produire le tableau DRIFT.
- **H20-10** — `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md:1` — Document annoncant '43 fichiers, 4 echecs' : le code reel contient 53 migrations main + 28 brouillons + 7 fixtures. Mesurer la derive et l'impact sur la procedure de restauration.
- **H20-11** — `patisgest-app/.env.example:34` — Le commentaire affirme '87 actions' verrouillees : compter REELLEMENT les fichiers `"use server"` et les appels `getSessionContext()` et signaler l'ecart en DRIFT-DOC.
- **H20-12** — `patisgest-app/tests/e2e/caisse.spec.mjs:1` — Parcours E2E soumis a `if: github.event_name == 'workflow_dispatch'` (ci.yml:115) : jamais executes sur PR ni sur push main. Evaluer la couverture E2E effective de la release.

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S20.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S20-F001`, `S20-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

<!-- END SOURCE: audit/20-meta-audit-tests-drift.md -->

---

## 2. Vérification d’intégrité finale

| Contrôle | Résultat |
|---|---|
| Sources fusionnées | 21 |
| Lignes sources cumulées | 4512 |
| Octets sources cumulés | 393936 |
| SHA-256 combiné | `3aca815efb3ebff23d73ff088f6748da1a2bbd2863726d57fb131eefaf6ebf55` |
| Doublons de propriété dans la matrice | 0 |
| Ancres `fichier:ligne` invalides | 0 |
| Modification du code produit | 0 (`git status` = `?? audit/` uniquement) |
| Rapports MODE B inclus | Non, volontairement |

### 2.1 Empreintes complètes par source

| Partie | Fichier | SHA-256 |
|---:|---|---|
| 00 | `audit/00-INDEX.md` | `4db5e0edac55966ec892be42c551b082eeb724f61f2fcabd9d0e45490a5abf64` |
| 01 | `audit/01-authentification-sessions.md` | `beb709fbfd65800ad4f9ee04fea8237f58ef5d05b5b24c25a6d1c9ab10fe7b37` |
| 02 | `audit/02-autorisation-rbac-tenant.md` | `9914d237b91da551e9c0eec8615924d8dbf1e461e4c075c526d17fa44c799ca5` |
| 03 | `audit/03-securite-base-rls.md` | `4f20c9f21554025a90a0feb5621ed54ff308dcef768e1fee6288285bd21e6667` |
| 04 | `audit/04-surfaces-publiques-anti-abus.md` | `e3694a6afb59e5d20132cd91b20cc3c4f9bdc9b7d3deffe023da311115e4f8bc` |
| 05 | `audit/05-calculs-precision-financiere.md` | `73ecb6c3b261ce825a96b12b74243a7377c60e4b4db2e19ed00fd8de07d6e94d` |
| 06 | `audit/06-machines-etat-workflows.md` | `22c4aceacfa3a682bd77727a64e7ed323bc640a89ce3eb6363e1467598edadab` |
| 07 | `audit/07-concurrence-verrous-idempotence.md` | `64249ff7d80525b52cc664deb6e24cbdbcab3525403a41c4c1f11ea3c04de21c` |
| 08 | `audit/08-modele-donnees-fuseaux.md` | `9960b96d7b16cadf7e3430a652f1326a404869df46685c375ca4f9124033551a` |
| 09 | `audit/09-contrats-api-validation.md` | `7542f9f952d8e6f9080acff48f49c815b35c546af32981a0a210c3bbfecf8edb` |
| 10 | `audit/10-etat-client-hydratation-caches.md` | `5ef13c7141e471e14ea15c06db1cd79ad3c7f1c5cfa91a3883ca7e317a9b5488` |
| 11 | `audit/11-hors-ligne-pwa-files-locales.md` | `0d941314447db0a9b11cc553cb23ace5eea0d43fbba6b28c5f9ad120621b589c` |
| 12 | `audit/12-fichiers-medias-imports-exports.md` | `d41f8b1190d204876bfb1245ed0a2048d6a2bfdddca11a657fe6be0d83ad07fe` |
| 13 | `audit/13-fiabilite-runtime-erreurs.md` | `275cc7260e68170a6c0539bffda05f617ab3d2dd81012ed9e5c31f0bebdcd0d8` |
| 14 | `audit/14-performance-applicative.md` | `12484e7a38b6fb6791a82b2de33e21072520808f12a0bc750634578de843be36` |
| 15 | `audit/15-performance-base-scalabilite.md` | `ec64bdbd06b938f99c013f554153fd46196a1f8f7c5db217b64956ddc76d3229` |
| 16 | `audit/16-architecture-maintenabilite.md` | `0ac47a7827366b99f9d19280cad36982db2737fae5a340ac09711caa27a3f686` |
| 17 | `audit/17-build-config-secrets-supply-chain.md` | `8c02e8266752e92c7aa1bdf5205f8ccd8a836a5ea34e422807b077e1617f5348` |
| 18 | `audit/18-cicd-migrations-sauvegardes.md` | `1e9df16e4a5741b26c2a76a3e8fee1c704fef9eb9342244235630982405d9989` |
| 19 | `audit/19-observabilite-audit-pii.md` | `64cac47cd14d0c124fb4b9f8a1596936163061e02516791c2b33766e61a66336` |
| 20 | `audit/20-meta-audit-tests-drift.md` | `acedf1fb4b4393047f8a807bef474afd85c46d5eb1dd4b11cf8b36c99ff486ad` |

---

**FIN DU DOSSIER CONSOLIDÉ — MODE A COMPLET, 21 SOURCES, 1 FICHIER.**
