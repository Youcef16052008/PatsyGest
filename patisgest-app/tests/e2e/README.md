# Tests E2E (Phase 4) — Playwright

Dix parcours navigateur, en Chromium headless. Quatre nécessitent l'application
**en production** et une stack Supabase **locale jetable** ; les six parcours
VAGUE 4 démarrent leur propre serveur de démonstration locale :

| Spéc | Parcours |
|---|---|
| `caisse.spec.mjs` | connecter → composer un panier → encaisser → ticket |
| `stock.spec.mjs` | créer un article → réceptionner un lot |
| `transfert.spec.mjs` | déplacer des lots entre deux sites (RPC idempotente) |
| `vitrine.spec.mjs` | commande publique sans compte sur une boutique publiée |
| `roadmap-vague4.spec.mjs` | B.2/B.4 en démo locale, viewport **360 px**, dashboards propriétaire + vendeur en AR, RTL et absence de débordement horizontal |

## Prérequis

1. **Stack Supabase locale** (ports décalés si une autre stack occupe 54321-54329) :
   ```bash
   mkdir -p /tmp/patsygest-e2e && cd /tmp/patsygest-e2e
   supabase init
   supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,inbucket
   supabase status -o env > supabase.env
   ```
2. **Schéma & amorçage** : exécuter `bootstrap-ci.mjs` avec les variables
   exportées par `supabase status -o env` (applique `01`, `03`→`57`, crée les
   comptes Auth pilotes et exécute `tests/e2e/seed.mjs`). En CI, le job
   `parcours-e2e` de `.github/workflows/ci.yml` (`workflow_dispatch`) automatise
   toute cette séquence sur une pile Supabase CLI jetable.
   ```bash
   set -a; . /tmp/patsygest-e2e/supabase.env; set +a
   PATSYGEST_DISPOSABLE=yes node tests/e2e/bootstrap-ci.mjs
   ```
3. **Application en production** (le mode `next dev` ne répond pas aux clics
   synthétiques sur la grille de produits) :
   ```bash
   set -a; . /tmp/patsygest-e2e/supabase.env; set +a
   export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
   npm run build && npm run start   # PORT=3416
   ```
4. **Navigateurs** : `npx playwright install chromium` (révision attendue par
   le `playwright` déclaré dans `package.json`). En environnement sans accès au
   CDN Playwright, un binaire Chrome for Testing local peut être utilisé :
   ```bash
   export PATISGEST_CHROMIUM_PATH=/tmp/chromium
   export PATISGEST_CHROMIUM_LIBS=/tmp/al2023/lib:/tmp/swiftshader
   export PATISGEST_CHROMIUM_FONTS=/tmp/fonts
   ```
   Le harnais `helpers.mjs` ajoute alors les bibliothèques et polices au
   processus enfant. Ces artefacts restent hors dépôt.

## Exécution

```bash
export PATSYGEST_PG_URL="postgresql://postgres:postgres@127.0.0.1:54522/postgres"
export PATSYGEST_E2E_BASE="http://127.0.0.1:3416"
npm run test:e2e
```

Le parcours `roadmap-vague4.spec.mjs` ne demande ni pile Supabase, ni seed,
ni `PATSYGEST_E2E_BASE` : il démarre et arrête son propre `next dev` en mode
démo local sur `3419` (`ROADMAP_E2E_PORT` pour changer), avec un viewport
**360 × 780 px**. Il vérifie RTL/bascule FR-AR, l’absence de libellés
interface français sur les dashboards propriétaire et vendeur après hydratation,
ticket caisse arabe, photo fournisseur B.4, Mode Simple, absence de débordement
horizontal et bandeau hors-ligne. La traduction des composants enfants est
assurée par le filet DOM `useDomTranslation()` de `locale-provider.tsx` :

```bash
export PATISGEST_CHROMIUM_PATH=/tmp/chromium
export PATISGEST_CHROMIUM_LIBS=/tmp/al2023/lib:/tmp/swiftshader
export PATISGEST_CHROMIUM_FONTS=/tmp/fonts
npm run test:roadmap:e2e
```

`seed.mjs` est idempotent : il recrée l'article, le lot (quantité remise à 50)
et la boutique publiée avant chaque parcours concerné.

## Limites connues

- La stack locale n'a pas les *default privileges* d'un projet Supabase réel ;
  le script d'amorçage les rétablit (sinon `authenticated` n'a aucun droit sur
  les tables créées par les migrations).
- Le parcours vitrine utilise le sous-domaine `el-yasmine` et une recette
  `visible_vitrine` ; `seed.mjs` les (re)crée.
