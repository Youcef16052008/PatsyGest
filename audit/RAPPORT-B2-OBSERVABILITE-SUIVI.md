# Rapport de suivi — Mesures B.2, observabilité production, CI et conformité documentaire

**Date** : 2026-11-28  
**Branche** : `arena/81a8dfab-patsygest` (base `1b87f85` sur `main`)  
**Cible production inspectée (sans redéploiement)** : `https://patsy-gest.vercel.app` (`dpl_FuYBGdL1SYFQJUByzs4Lbhr2abkn` sur `1b87f85`)  
**Dossiers externes vérifiés** : Vercel `prj_UpFyCGQfqxP4BsO5JPAmWboeBp1z`, Supabase prod `evepzygucfxarpdnflzv` & pilote `gmmjrzyhvihxvaqvuoxy`, Google Drive `rapport-patisgest` (`10IZw_nja02RJO9r-L7DWE8mtwFMUUk9t`), Figma (compte connecté sans maquette ni projet)

---

## 1. Synthèse exécutive

Ce suivi traite les axes vérifiables laissés ouverts après `audit/RAPPORT-VAGUE6-PRODUCTION.md` :

1. **Correction CI `Parcours Playwright · vitrine`** : ajout d'un `VITRINE_SECRET_ANTI_ABUS` éphémère de test dans `.github/workflows/ci.yml` après le diagnostic du run `46112345697` ; **8/8 jobs CI verts** sur le run `46115878667`.
2. **Audit B.2 mesuré par navigateur réel (Chromium + charge HTTP)** : ajout de `patisgest-app/scripts/audit-b2-reel.mjs`, `patisgest-app/tests/audit-b2-reel.test.mjs` et du job `b2-mesures` dans `.github/workflows/ci.yml`. L'audit a détecté un débordement horizontal réel à `360 × 780 px` sur `/estimation` (`+363 px`, `div.pg-table-wrap` propagé par `.pg-card`) ; corrigé dans `src/app/workspace.css` et `src/components/portion-estimator.tsx` (**0 px** en CI `46115878667`).
3. **Observabilité continue et garde-veille** : ajout de `patisgest-app/scripts/observabilite-sondes.mjs` (`npm run test:obs:sondes`), `.github/workflows/observabilite-sondes.yml` (cron 6 h + manuel) et `tests/observabilite-sondes.test.mjs`, ainsi que du repli `NEXT_PUBLIC_SUPABASE_*` + sonde `/api/health/stack` dans `.github/workflows/sauvegarde-free.yml`. Les **5 sondes** contre `https://patsy-gest.vercel.app` ont réussi dans le job `140890637671`.
4. **Transparence Loi 18-07 / mentions légales** : mise à jour de `src/app/(app)/mentions-legales/page.tsx`, `src/lib/ui-catalog-fr.json` et `src/lib/ui-text-ar-complet.ts` pour mentionner explicitement le transit applicatif sur Vercel (`iad1` — Virginie du Nord, États-Unis) en plus du stockage Supabase (`eu-west-1`, Irlande).
5. **Runbook et livrables Drive** : actualisation de `audit/RUNBOOK-ROLLBACK.md` (état réel `dpl_FuYBGdL1SYFQJUByzs4Lbhr2abkn` / `dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7`, en conservant les ancres contractuelles), et dépôt de ce rapport dans le dossier Google Drive `rapport-patisgest`.

---

## 2. État initial constaté (baseline `main` @ `1b87f85`)

| Vérification | Référence / ID | Résultat initial | Observation |
|---|---|---|---|
| `certification-production.yml` | Run `46112341890` | **Succès** (3/3 jobs) | Contrats OCR/chaîne, concurrence PostgreSQL 17, pile hébergée |
| `rollback-chaud.yml` (`dry_run=true`) | Run `46112343902` | **Succès** | Cible passée : `dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7` |
| `ci.yml` sur `main` (`1b87f85`) | Run `46112345697` | **Échec** (`vitrine`) | `VITRINE_SECRET_ANTI_ABUS` absent du job isolé `Parcours Playwright · vitrine` |
| `cron-connectivite.yml` | Run `46110843164` | **Succès** | `disconnected=0`, `dispatched=0` |
| `sauvegarde-free.yml` | `46041711979` / `45985163141` | Skip / **Échec** | `SUPABASE_DB_URL` refusé par le pooler (`FATAL: password authentication failed for user "postgres"`) |
| Supabase prod & pilote | `evepzygucfxarpdnflzv`, `gmmjrzyhvihxvaqvuoxy` | `ACTIVE_HEALTHY` | PostgreSQL `17.12.0.000`, `app_schema_version=57`, `eu-west-1`, bucket `patsygest-ocr` privé |
| Vercel prod | `dpl_FuYBGdL1SYFQJUByzs4Lbhr2abkn` | `READY` (`1b87f85`) | Région fonctions `iad1`, alias `patsy-gest.vercel.app`, Node `26.x` |
| `npm test` local (`1b87f85`) | 912 tests | **906 pass**, 0 fail | 3 skipped (`H18-02` `PATSYGEST_PG_URL`), 3 todo |
| `npm run test:roadmap` / `:live` | 11 / 4 | **11/11** et **4/4** | — |
| `npm run test:smoke` (hors CI) | 28 checks | 22/28 | Script historique avec assertions antérieures aux Vagues 5/6 |

---

## 3. Mesures réelles B.2 — Chromium (FCP / TTFB / RTL / Accessibilité)

Exécuté par `patisgest-app/scripts/audit-b2-reel.mjs` dans le job CI `Mesures B.2` (`140890637671`, run `46115878667`, commit `75ef930`).  
Critères bloquants en local et sur les routes de production alignées : statut HTTP 200, `<html lang>` et `<html dir>` conformes (`rtl` en `ar`, `ltr` en `fr`), présence de `<h1>`, présence de `<main>` (hors `/connexion` et `/hors-ligne`), images avec `alt`, contrôles nommés, **0 px** de débordement horizontal à `360 × 780 px` et `1280 × 800 px`.

| Cible | Viewport | Lang / Dir | HTTP | TTFB | FCP | Load | Overflow | État |
|---|---|---|---:|---:|---:|---:|---:|---|
| `local:/connexion` | `1280×800` | `fr` / `ltr` | 200 | 3042 ms | 3236 ms | 3387 ms | 0 px | **OK** |
| `local:/estimation` | `360×780` | `fr` / `ltr` | 200 | 608 ms | 748 ms | 860 ms | 0 px | **OK** (était `+363 px` avant `75ef930`) |
| `local:/hors-ligne` | `360×780` | `fr` / `ltr` | 200 | 278 ms | 356 ms | 504 ms | 0 px | **OK** |
| `local:/tableau-de-bord` | `1280×800` | `fr` / `ltr` | 200 | 773 ms | 888 ms | 1038 ms | 0 px | **OK** |
| `local:/tableau-de-bord` | `360×780` | `ar` / `rtl` | 200 | 80 ms | 188 ms | 304 ms | 0 px | **OK** |
| `local:/caisse` | `360×780` | `ar` / `rtl` | 200 | 1337 ms | 1512 ms | 1623 ms | 0 px | **OK** |
| `local:/stocks` | `360×780` | `ar` / `rtl` | 200 | 102 ms | 232 ms | 400 ms | 0 px | **OK** |
| `local:/mentions-legales` | `1280×800` | `fr` / `ltr` | 200 | 302 ms | 436 ms | 526 ms | 0 px | **OK** |
| `prod:/connexion` | `1280×800` | `fr` / `ltr` | 200 | 12 ms | 924 ms | 965 ms | 0 px | **OK** |
| `prod:/connexion` | `360×780` | `fr` / `ltr` | 200 | 13 ms | 260 ms | 322 ms | 0 px | **OK** |
| `prod:/estimation` | `1280×800` | `fr` / `ltr` | 200 | 12 ms | 228 ms | 249 ms | 0 px | **OK** |
| `prod:/estimation` | `360×780` | `fr` / `ltr` | 200 | 11 ms | 212 ms | 225 ms | +363 px | **AVERTISSEMENT pré-déploiement** (`div.pg-table-wrap(731/304)` sur `1b87f85`, corrigé sur branche) |
| `prod:/hors-ligne` | `360×780` | `fr` / `ltr` | 200 | 11 ms | 164 ms | 216 ms | 0 px | **OK** |

### Diagnostic et correctif du débordement `/estimation` (`360 × 780`)

- **Cause racine** : sur `360 × 780 px` en Chromium desktop (sans émulation tactile `isMobile: true`), Blink propageait le `scrollWidth` (`731 px`) de `div.pg-table-wrap` (`overflow-x: auto`, `clientWidth: 304 px`) jusqu'à `document.documentElement.scrollWidth` (`723 px`, soit `+363 px`) à travers `.pg-card` (`overflow: visible`).
- **Correctif (`75ef930` / `281f0b0`)** :
  - `patisgest-app/src/app/workspace.css` : ajout de `overflow-x: clip` sur `.pg-card`, et mise en grille carte 2 colonnes sous `@media (max-width: 720px)` pour `.pg-est-table` (en-tête masqué visuellement tout en restant accessible aux lecteurs d'écran, libellés `data-label` sur les cellules chiffrées).
  - `patisgest-app/src/components/portion-estimator.tsx` : ajout de la classe `pg-est-table`, des attributs `data-label` (`Qté base`, `Unité`, `Parage %`, `Prix unit. (DA)`, `Coût ajusté`), et `minWidth` responsive sur le sélecteur d'ingrédient.
  - Validation : `local:/estimation` passe à **0 px** en CI `46115878667`. La production `patsy-gest.vercel.app` reflètera cette correction dès fusion et déploiement de cette branche.

---

## 4. Charge HTTP légère en lecture seule

### A. Mesures CI (run `46115878667`, job `140890637671`)

| Cible | Concurrence | Requêtes | OK 200 | Erreurs | p50 | p95 | Max | Débit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `http://127.0.0.1:3419/api/health` (`next dev`) | 5 | 50 | 50 | 0 % | 42 ms | 136 ms | 147 ms | 93,1 req/s |
| `http://127.0.0.1:3419/estimation` (`next dev`) | 4 | 20 | 20 | 0 % | 164 ms | 215 ms | 218 ms | 23,0 req/s |
| `https://patsy-gest.vercel.app/api/health` | 5 | 50 | 50 | 0 % | 86 ms | 195 ms | 437 ms | 45,4 req/s |
| `https://patsy-gest.vercel.app/estimation` | 4 | 20 | 20 | 0 % | 94 ms | 166 ms | 747 ms | 21,4 req/s |

### B. Benchmark local `next start` (build production `NODE_ENV=production`, commit `bcba584`)

| Cible | Concurrence | Requêtes | OK 200 | Erreurs | p50 | p95 | Max | Débit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `http://127.0.0.1:3421/api/health` (`next start`) | 5 | 50 | 50 | 0 % | 23 ms | 67 ms | — | 156,3 req/s |
| `http://127.0.0.1:3421/estimation` (`next start`) | 5 | 20 | 20 | 0 % | 73 ms | 160 ms | — | 50,3 req/s |

*(Ce benchmark est strictement limité à une charge légère en lecture seule sur endpoints publics ; aucun test d'écriture concurrente en production ni de montée en charge > 5 connexions simultanées n'a été lancé.)*

---

## 5. Sondes d'observabilité sur la production réelle

Exécutées par `node scripts/observabilite-sondes.mjs` dans le job `140890637671` (CI `46115878667`) contre `https://patsy-gest.vercel.app` :

| Sonde | Attendu | HTTP observé | Latence | Détail vérifié |
|---|---|---:|---:|---|
| `GET /api/health` | HTTP 200, `ok=true` | **200** | 197 ms | `ok=true (patisgest)` |
| `GET /api/health/stack` (sans secret) | Refus `401` ou `503` | **401** | 85 ms | Porte fail-closed active (`protégée`) |
| `GET /api/health/stack` (`Bearer CRON_SECRET`) | Auth/PostgREST ok, `schema >= 57`, `storage=prive` | **200** | 1296 ms | `auth=ok postgrest=ok schema=57 storage=prive` |
| `GET /connexion` | HTTP 200 HTML | **200** | 135 ms | HTML 200 |
| `GET /estimation` | HTTP 200 HTML | **200** | 108 ms | HTML 200 |

- Workflow planifié ajouté : `.github/workflows/observabilite-sondes.yml` (`cron: "17 */6 * * *"` + `workflow_dispatch`, alerte optionnelle via `OBS_WEBHOOK_URL` ou `ALERTS_WEBHOOK_URL`). Note GitHub Actions : un nouveau workflow n'est dispatchable manuellement qu'après fusion sur la branche par défaut `main` (HTTP 404 constaté sur branche non fusionnée) ; l'exécution exacte du script est validée dans `ci.yml` (`b2-mesures`).

---

## 6. Historique CI sur la branche et validations locales finales

### Runs `ci.yml` sur `arena/81a8dfab-patsygest`

| Run | Commit | Résultat | Cause ou portée |
|---|---|---|---|
| `46114154336` | `bcba584` | 7/8 verts, `b2-mesures` en échec | Débordement `/estimation` `360×780` détecté (`+363 px`) |
| `46114870480` | `281f0b0` | 7/8 verts, `b2-mesures` en échec | `div.pg-table-wrap` toujours non confinée dans `.pg-card` (`759/360`) |
| `46115424826` | `0497d3b` | 7/8 verts, `b2-mesures` en échec | Diagnostic affiné isolant `elems:sw:div.pg-table-wrap(731/304)` |
| `46115878667` | `75ef930` | **8/8 SUCCÈS** | Application, Auth/PostgREST isolés ×2, Playwright stock/caisse/transfert/vitrine, **Mesures B.2** |

### Validations locales sur l'état final (`75ef930` + ce rapport)

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | **OK** (`tsc --noEmit`) |
| `npm run lint` | **OK** (`eslint .`) |
| `npm test` | **916 tests : 910 pass, 0 fail**, 3 skipped (`H18-02`), 3 todo |
| `npm run build` | **OK** (Next.js 16.4.6 Turbopack) |
| `npm run build:chain -- --check` | **OK** (`56` fichiers, `440 543` octets, SHA-256 `e54c0881712e705912a87b7edd982cbc67e7c3e3a896b2a3be977eefc469b2bf`) |
| `design-studio/tests/*.test.mjs` | **6/6 pass** |
| `git diff --check` | **OK** |

---

## 7. Ce qui reste hors portée technique ou à arbitrer humainement

- **Déploiement production & activation du nouveau workflow** : `patsy-gest.vercel.app` reste volontairement sur `1b87f85` (`prod:/estimation` garde donc l'avertissement `+363 px` à `360 × 780` tant que la PR n'est pas fusionnée et promue sur `main`). De même, `.github/workflows/observabilite-sondes.yml` s'activera sur ses déclencheurs après fusion sur `main`.
- **Secret `SUPABASE_DB_URL` pour `sauvegarde-free.yml`** : l'identifiant pooler existant reste refusé par PostgreSQL ; aucune valeur secrète n'a été modifiée sans autorisation du propriétaire. Le `garde-veille` replié sur `NEXT_PUBLIC_SUPABASE_*` protège contre l'inactivité tant que le dump reste à renouveler par le propriétaire.
- **Relecture linguistique humaine AR & maquettes Figma** : `i18n-100.test.mjs`, les 72 parcours `roadmap-vague4.spec.mjs` et Chromium `360×780` valident l'absence de résidu FR et l'alignement RTL, mais ne remplacent pas une relecture native arabe/darija ni une revue visuelle (l'espace Figma connecté est vide).
- **Gouvernance Loi 18-07 & rollback réel** : le texte `/mentions-legales` reflète désormais le transit Vercel `iad1` et le stockage Supabase `eu-west-1`, mais la déclaration ANPDP, les durées de rétention comptable (`10` ans) vs effacement et toute anonymisation sur base réelle relèvent du responsable de traitement. Aucun rollback destructif (`dry_run=false`) n'a été exécuté.
