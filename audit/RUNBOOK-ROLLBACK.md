# Runbook — rollback à chaud Vercel (préparation seule)

**Branche** : `arena/923a4433-patsygest`  
**Décision utilisateur** : `rollback = plan_only`  
**Statut de cette passe** : **NON EXÉCUTÉ**. Le workflow et ce runbook existent ; aucun alias de production n'a été promu, aucun rollback à chaud n'a été déclenché.

## 1. Cible figée

| Élément | Valeur |
|---|---|
| Projet | `prj_UpFyCGQfqxP4BsO5JPAmWboeBp1z` / `patsy-gest` |
| Team | `team_Zs0MWAYqYN2fjolkybUsUqbK` |
| Déploiement cible | `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3` |
| État constaté | `READY`, `readySubstate=PROMOTED`, `isRollbackCandidate=true` |
| Commit cible | `da5857dddab46842e5029d1c745f93e89265a013` |
| Alias | `patsy-gest.vercel.app`, `patsy-gest-all-intelligence.vercel.app`, `patsy-gest-git-main-all-intelligence.vercel.app` |

Le déploiement VAGUE 6 est créé depuis un nouveau commit de la branche courante avec un `git_source` étroit (`type=github`, `repoId`, `ref` de branche et `sha` exact) et `project_settings:null`. Le rollback, lui, promeut un déploiement déjà `READY` : il ne reconstruit pas le code.

### 1bis. Déploiement VAGUE 6 effectivement promu

| Élément | Valeur constatée |
|---|---|
| Déploiement | `dpl_AAB6vX2CNHBSBG8s4YVebyX1uL43` |
| Commit | `31fa43b2d50d35edb89ea00e6773f682458b83ac` (branche courante) |
| État | `READY`, `readySubstate=PROMOTED`, `aliasAssigned=true` |
| Alias | `patsy-gest.vercel.app`, `patsy-gest-all-intelligence.vercel.app`, `patsy-gest-git-arena-923a4433-patsygest-all-intelligence.vercel.app` |
| Cible de rollback conservée | `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3` (ancienne production `main`/`da5857d`) |

Les commits postérieurs à `31fa43b` ne modifient que des scripts de certification, des tests et des workflows ; aucun code d'exécution Next n'a changé. Le runbook garde `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3` comme cible de retour arrière, conformément à `rollback=plan_only`.

## 2. Workflow préparé, non dispatché

`.github/workflows/rollback-chaud.yml` est `workflow_dispatch` uniquement. Son input `dry_run` vaut `true` par défaut ; le job `promote` exige en plus `confirm=ROLLBACK`. Dans cette passe, aucun `workflow_dispatch` de rollback n'a été envoyé.

Plan seul :

```bash
gh workflow run rollback-chaud.yml \
  --ref arena/923a4433-patsygest \
  -f deployment_id=dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3 \
  -f dry_run=true
```

Promotion réelle, **uniquement sur incident et décision humaine explicite** :

```bash
gh workflow run rollback-chaud.yml \
  --ref arena/923a4433-patsygest \
  -f deployment_id=dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3 \
  -f dry_run=false \
  -f confirm=ROLLBACK
```

## 3. API Vercel équivalente

Le secret `VERCEL_TOKEN` doit rester dans GitHub Actions Secrets ; aucune valeur n'est reproduite ici.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"deploymentId":"dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3"}' \
  "https://api.vercel.com/v9/projects/prj_UpFyCGQfqxP4BsO5JPAmWboeBp1z/promote?teamId=team_Zs0MWAYqYN2fjolkybUsUqbK"
```

Accepter uniquement `200`, `201` ou `202`, puis vérifier les alias et la sonde applicative. Ne pas journaliser le corps de réponse ni le jeton.

## 4. Contrôles après une promotion réelle

1. `GET https://patsy-gest.vercel.app/api/health` → `200`, `ok=true`.
2. `npm run test:cert:hosted` avec `CRON_SECRET`, `SUPABASE_URL` et `SUPABASE_ANON_KEY` existants → Auth/PostgREST/Storage/schema `57`.
3. `vercel.get_deployment(dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3)` → alias de production de nouveau attachés.
4. Dispatcher uniquement `certification-production.yml`, jamais `cron-connectivite.yml` ni `sauvegarde-free.yml` pour valider un rollback.
5. Laisser la PR #26 **OPEN** tant qu'aucune fusion n'est explicitement demandée.

## 5. Ce que ce runbook ne prouve pas

- Aucun rollback à chaud exécuté : pas de preuve de restauration d'alias en conditions réelles.
- Aucune modification des secrets Vercel/GitHub ; `secrets=existing`.
- Aucun write Figma/Drive ; `b2_figma_drive=skip`.
- Aucune validation humaine exhaustive B.2 ; la traduction AR reste machine + curations locales.
