# Matrice de dérive documentaire — H20-09

**Date** : 2026-11-27  
**Branche** : `arena/923a4433-patsygest`  
**Périmètre** : clôture locale de l'hypothèse H20-09 (tableau exhaustif des dérives ponctuelles relevées entre documents exécutables et historiques).

Ce document ne réécrit ni `README.md`, ni `SECURITE.md`, ni `AGENTS.md`, ni le CDC, ni `revue/` : il cartographie explicitement les cinq dérives citées par l'audit H13-H20 et indique, pour chacune, la source de vérité courante. Il est vérifié par `patisgest-app/tests/h13-h20-local-guards.test.mjs`.

| Dérive relevée | Ancienne formulation | Source de vérité courante | Décision locale |
|---|---|---|---|
| `87 actions` | « 87 actions serveur » figé dans un document | `patisgest-app/tests/inventaire-surface.mjs` + `tests/inventaire-surface.json` : 30 fichiers `use server`, 90 actions mesurées | Le texte exécutable `.env.example` dit désormais « mesuré par `inventaire-surface.mjs` » ; les prompts/audits historiques conservent la citation comme archive, sans être des docs exécutables. |
| Chaîne `01→43` | « chaîne 01→43 », « 43 fichiers » | `patisgest-app/migrations/repetition.json` : 56 fichiers, dernier `57-onboarding-pack-dz-rpc.sql`, `app_schema_version = 57` | `migrations/CHAINE-NON-REJOUABLE.md` est marqué `ARCHIVÉ` et renvoie au manifeste courant ; `tests/chaine-rejouable.test.mjs` est actif (plus de `todo` inerte). |
| « Drizzle déjà en place » | affirmation d'un ORM déjà intégré | Dépôt : Supabase/PostgREST + SQL de migration, `npm run db:push` garde-fou désactivé, aucun schéma Drizzle | La mention est classée comme historique ; aucun fichier exécutable ne l'affirme. `tests/db-push-guard.test.mjs` verrouille l'absence de `drizzle-kit push`. |
| Montants / centimes | arrondis et centimes décrits différemment selon les documents | `src/lib/money.ts`, `src/lib/csv.ts`, `src/lib/export-comptable.ts`, `tests/vague3-exports.test.mjs` | Les exports refusent un déséquilibre au centime (409) et n'émettent jamais de CSV partiel ; les anciens énoncés sont archivés. |
| « PWA chiffrée » | sous-entendu de chiffrement du stockage hors ligne | `src/components/service-worker.tsx`, `src/lib/offline-queue.ts`, `src/lib/catalogue-hors-ligne.ts` | Le mode démo est explicite : données fictives dans ce navigateur, pas de chiffrement applicatif revendiqué, pas de pile Supabase réelle. |

## Gardes associés

- `tests/vague4-inventaire.test.mjs` : sonde G, 5/5, `nomsActions()` couvre `function`, `async function`, `default`, `const/arrow` et ignore `type`/`interface`.
- `tests/chaine-rejouable.test.mjs` : chaîne active 01→57, migration cassée détectée, plus de `todo`.
- `tests/h13-h20-local-guards.test.mjs` : ce document doit exister et contenir les cinq dérives ; l'inventaire JSON est comparé à un `surface()` recalculé, et une action synthétique doit être détectée par `nomsActions()` (anti-tautologie H20-07).

**Limite** : ce tableau est une clôture documentaire locale. Il ne déclenche aucune CI distante, ne modifie aucun dépôt externe et ne remplace pas une revue juridique/RGPD.
