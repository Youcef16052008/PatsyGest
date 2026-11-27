# Rapport — VAGUE 6, production et certification externe

**Branche** : `arena/923a4433-patsygest`  
**Décisions utilisateur** : `cibles_sql=both_full`, `secrets=existing`, `dispatch=dispatch_ci`, `deploy=deploy_current`, `rollback=plan_only`, `b2_figma_drive=skip`, `pr_final=keep_open`.  
**Statut initial de rédaction** : opérations externes en cours ; ce fichier est complété après commit, déploiement, dispatch CI et exécution de la chaîne pilote.

## 1. Périmètre réellement autorisé

| Choix | Portée appliquée |
|---|---|
| `both_full` | chaîne 01→57 sur le pilote `gmmjrzyhvihxvaqvuoxy` ; conservation de 54→57 déjà appliquée sur la production `evepzygucfxarpdnflzv` |
| `existing` | secrets Vercel/GitHub existants réutilisés ; aucune valeur secrète demandée, déchiffrée, modifiée ou recopiée |
| `dispatch_ci` | seul le workflow de certification production + concurrence PostgreSQL réelle est dispatché |
| `deploy_current` | déploiement production depuis un nouveau commit de la branche courante |
| `plan_only` | procédure et workflow de rollback préparés ; aucun rollback exécuté |
| `skip` | B.2 humaine exhaustive, Figma et Drive reportés ; aucun write Figma/Drive |
| `keep_open` | PR #26 laissée OPEN, non fusionnée |

## 2. Livrables de code

- OCR serveur `/api/invoice-ocr` : Tesseract.js FR/ENG, modèles `public/tessdata` figés, WASM/core inclus dans le tracing Next, aucune persistance de l'image ni du texte, garde de session et de rôle, i18n FR/AR, parcours client avec validation humaine obligatoire.
- Sonde protégée `/api/health/stack` : `CRON_SECRET` + `timingSafeEqual`, contrôles réels Auth, PostgREST, Storage et version de schéma, sans fuite de secret ni de corps de réponse.
- Chaîne déterministe `audit/sql/chain-01-57.sql` (56 fichiers, version 57), ses 12 fragments et `chain-01-57.meta.json` (SHA-256/MD5).
- Workflow `.github/workflows/certification-production.yml` : `workflow_dispatch` seul, PostgreSQL 17 réel, concurrence hébergée par verrous d'avis sans écriture métier, pile Supabase/Vercel production, OCR et contrats.
- Workflow `.github/workflows/rollback-chaud.yml` et `audit/RUNBOOK-ROLLBACK.md` : cible `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3`, `dry_run=true` par défaut, aucune exécution.
- Scripts npm `test:cert:ocr`, `test:cert:postgresql`, `test:cert:concurrency`, `test:cert:hosted`, `test:cert:production`, `build:chain`.

## 3. Preuves à consigner après exécution externe

Sections remplies après les opérations : commit/push, chaîne pilote, déploiement Vercel, dispatch CI, production Supabase, pile hébergée, rollback, limites.

_(En cours.)_
