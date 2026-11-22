# Tests E2E (Phase 4) — Playwright

Quatre parcours navigateur, en Chromium headless, contre l'application **en
production** et une stack Supabase **locale jetable** :

| Spéc | Parcours |
|---|---|
| `caisse.spec.mjs` | connecter → composer un panier → encaisser → ticket |
| `stock.spec.mjs` | créer un article → réceptionner un lot |
| `transfert.spec.mjs` | déplacer des lots entre deux sites (RPC idempotente) |
| `vitrine.spec.mjs` | commande publique sans compte sur une boutique publiée |

## Prérequis

1. **Stack Supabase locale** (ports décalés si une autre stack occupe 54321-54329) :
   ```bash
   mkdir -p /tmp/patsygest-e2e && cd /tmp/patsygest-e2e
   supabase init
   supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,inbucket
   supabase status -o env > supabase.env
   ```
2. **Schéma** : chaîne `01`→`39` puis le seed `02-seed-pilote.sql` (voir
   `tests/e2e/seed.mjs` pour les données de parcours). Le seed appliqué par le
   script doit inclure `rls_auto_enable` (utilitaire DDL) et, sur une stack
   locale, les *default privileges* Supabase (`grant all on all tables in
   schema public to anon, authenticated, service_role`).
3. **Application en production** (le mode `next dev` ne répond pas aux clics
   synthétiques sur la grille de produits) :
   ```bash
   set -a; . /tmp/patsygest-e2e/supabase.env; set +a
   export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
   npm run build && npm run start   # PORT=3416
   ```
4. **Navigateurs** : `npx playwright install chromium` (révision attendue par
   le `playwright` déclaré dans `package.json`).

## Exécution

```bash
export PATSYGEST_PG_URL="postgresql://postgres:postgres@127.0.0.1:54522/postgres"
export PATSYGEST_E2E_BASE="http://127.0.0.1:3416"
npm run test:e2e
```

`seed.mjs` est idempotent : il recrée l'article, le lot (quantité remise à 50)
et la boutique publiée avant chaque parcours concerné.

## Limites connues

- La stack locale n'a pas les *default privileges* d'un projet Supabase réel ;
  le script d'amorçage les rétablit (sinon `authenticated` n'a aucun droit sur
  les tables créées par les migrations).
- Le parcours vitrine utilise le sous-domaine `el-yasmine` et une recette
  `visible_vitrine` ; `seed.mjs` les (re)crée.
