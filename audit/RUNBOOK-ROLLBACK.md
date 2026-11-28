# Runbook — rollback à chaud Vercel (préparation et vérification dry-run)

**Branche courante** : `arena/81a8dfab-patsygest` (post-merge PR #26 sur `main` @ `1b87f853b021655c5858ff34ff59b3362145697a`)
**Statut de promotion** : **NON EXÉCUTÉ**. Le workflow et ce runbook sont prêts ; le `dry_run=true` a été vérifié sur GitHub Actions (run `46112343902`), mais aucun alias de production n'a été promu en arrière.

## 1. Cible figée et état vérifié au 28/11/2026

| Élément | Valeur |
|---|---|
| Projet | `prj_UpFyCGQfqxP4BsO5JPAmWboeBp1z` / `patsy-gest` |
| Team | `team_Zs0MWAYqYN2fjolkybUsUqbK` |
| Production active | `dpl_FuYBGdL1SYFQJUByzs4Lbhr2abkn` (`1b87f853b021655c5858ff34ff59b3362145697a`, `main`, `READY`, `isRollbackCandidate=true`) |
| Cible de rollback active (`isRollbackCandidate=true`) | `dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7` (`e26596fc56947c7b77df8a21b9931ed5968f7f67`, `READY`) |
| Cible historique pré-Vague 6 (référence archivée) | `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3` (`da5857dddab46842e5029d1c745f93e89265a013`, désormais `isRollbackCandidate=false`) |
| Alias | `patsy-gest.vercel.app`, `patsy-gest-all-intelligence.vercel.app`, `patsy-gest-git-main-all-intelligence.vercel.app` |

Tout déploiement programmatique reste créé avec un `git_source` étroit (`type=github`, `repoId`, `ref`, `sha` exact) et `project_settings:null`. Le rollback, lui, promeut un déploiement déjà `READY` : il ne reconstruit pas le code.

### 1bis. Chaîne de déploiements constatée

| Déploiement | Commit / Branche | État Vercel |
|---|---|---|
| `dpl_FuYBGdL1SYFQJUByzs4Lbhr2abkn` | `1b87f85` (`main`, merge PR #26) | `READY`, `PROMOTED`, `aliasAssigned=true` |
| `dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7` | `e26596f` (`arena/923a4433-patsygest`) | `READY`, `isRollbackCandidate=true` |
| `dpl_AAB6vX2CNHBSBG8s4YVebyX1uL43` | `31fa43b` (Vague 6) | `READY`, historique |
| `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3` | `da5857d` (`main` pré-Vague 6) | `READY`, `isRollbackCandidate=false` |

## 2. Workflow préparé et vérification dry-run

`.github/workflows/rollback-chaud.yml` est `workflow_dispatch` uniquement. Son input `dry_run` vaut `true` par défaut ; le job `promote` exige en plus `confirm=ROLLBACK`. Le 28/11/2026, le run `46112343902` (`dry_run=true`, `deployment_id=dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7`) s'est terminé en `success` sans aucune promotion.

Plan seul (`dry_run=true`) :

```bash
gh workflow run rollback-chaud.yml \
  --ref main \
  -f deployment_id=dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7 \
  -f dry_run=true
```

Promotion réelle, **uniquement sur incident et décision humaine explicite** :

```bash
gh workflow run rollback-chaud.yml \
  --ref main \
  -f deployment_id=dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7 \
  -f dry_run=false \
  -f confirm=ROLLBACK
```

## 3. API Vercel équivalente

Le secret `VERCEL_TOKEN` doit rester dans GitHub Actions Secrets ; aucune valeur n'est reproduite ici.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"deploymentId":"dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7"}' \
  "https://api.vercel.com/v9/projects/prj_UpFyCGQfqxP4BsO5JPAmWboeBp1z/promote?teamId=team_Zs0MWAYqYN2fjolkybUsUqbK"
```

Accepter uniquement `200`, `201` ou `202`, puis vérifier les alias et la sonde applicative. Ne pas journaliser le corps de réponse ni le jeton.

## 4. Contrôles après une promotion réelle

1. `GET https://patsy-gest.vercel.app/api/health` → `200`, `ok=true`.
2. `npm run test:cert:hosted` et `node scripts/observabilite-sondes.mjs` avec `CRON_SECRET`, `SUPABASE_URL` et `SUPABASE_ANON_KEY` → Auth/PostgREST/Storage/`app_schema_version=57`.
3. `vercel.get_deployment(dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7)` → alias de production de nouveau attachés.
4. Dispatcher `certification-production.yml` pour vérifier l'ensemble des sondes.

## 5. Ce que ce runbook ne prouve pas

- Aucun rollback à chaud réel exécuté : seul le chemin `dry_run=true` (`46112343902`) a été vérifié ; le chemin `promote` (`dry_run=false`, `confirm=ROLLBACK`) reste non exécuté pour ne pas perturber la production.
- La cible historique `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3` n'est plus éligible au rollback Vercel (`isRollbackCandidate=false`) ; toute promotion réelle doit utiliser `dpl_AnuNYMvMJ4mTEkYN9PmRtHeC5uC7`.
