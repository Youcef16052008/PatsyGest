# Phase 1 — CI et reproductibilité (premier lot)

**Date : 21 novembre 2026 (UTC)** · **Branche :** `arena/d51c48b6-patsygest` · **HEAD de départ :** `2fba72c78e643ac4cb1b484cb26b0efaa38cdeff`.

> Dans le plan de référence `ETAT-PHASES-0-1.md`, la phase 1 est le socle CI/reproductibilité. Elle ne doit pas être confondue avec le « Phase 1 » d’`ANALYSE-REVUES-AGENTS.md`, dont la première étape de remédiation porte sur les frontières tenant. Ici, seuls le socle de tests et un garde-fou local contre les pushes Drizzle sont traités.

## Travail effectué

1. **Workflow GitHub Actions ajouté** sous `.github/workflows/ci.yml` (repris du `origin/main` actuellement déployé, avec une vérification additionnelle des dépendances de production). Il s’exécute sur PR, push vers `main` et déclenchement manuel.
   - Job qualité sous Node 22 : `npm ci`, `npm audit --omit=dev`, typecheck, ESLint, tests Node/PGlite, build avec URL/clé Supabase fictives, tests du design studio.
   - Job d’intégration en matrice `historique` / `vitrine` : Supabase CLI local, jetable; Auth et PostgREST réels de la pile locale et données fictives. Le script requiert `PATSYGEST_DISPOSABLE=yes`, vérifie les hôtes/ports loopback et exige une base vierge avant toute migration. Nettoyage avec `supabase stop --no-backup` en fin de job.
   - Aucun secret du pilote n’est injecté par le workflow. Ces tests ne certifient pas l’équivalence avec la base pilote.
2. **`db:push` désactivé par défaut** : le script npm appelle maintenant un garde-fou qui échoue avant `drizzle-kit`; un test de régression lance réellement cette commande avec une URL DB invalide et vérifie qu’aucune commande Drizzle n’est exécutée. Le schéma Drizzle n’est pas la source de vérité Supabase. Ce verrou n’empêche pas une personne de lancer des commandes SQL manuelles; il évite le push accidentel par le chemin npm.
3. **Audit de dépendances** : le workflow vérifie `npm audit --omit=dev`, soit les dépendances livrées en production. Scan observé : 0 vulnérabilité production. L’audit complet signale 4 vulnérabilités modérées uniquement dans la chaîne de dépendances de développement autour de `drizzle-kit` / `esbuild`; la recommandation automatique de npm implique une rétrogradation majeure de Drizzle Kit, non appliquée sans analyse de compatibilité.

## Vérifications exécutées

Les commandes suivantes ont été lancées dans `patisgest-app` sous Node `v22.22.3` / npm `10.9.8` :

| Contrôle | Résultat |
|---|---|
| `npm ci` | Réussi, 401 paquets installés depuis le lockfile. npm signale 4 vulnérabilités modérées à l’audit complet. |
| `npm audit --omit=dev` | Réussi : 0 vulnérabilité dans les dépendances de production. |
| `npm run typecheck` | Réussi. |
| `npm run lint` | Réussi. |
| `npm test` | Réussi : 367/367 tests (dont le nouveau test `db:push`). |
| Build avec `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:65531` et clé fictive `test` | Réussi. Ces valeurs sont destinées à la compilation locale seulement. |
| `node --test design-studio/tests/*.test.mjs` | Réussi : 6/6 tests. |
| Validation du YAML du workflow (`js-yaml`) et assertions de présence des étapes | Réussies. |
| `git diff --check` | Réussi; aucun problème d’espacement relevé. |

Après le `npm ci`, les contrôles typecheck, lint, suite complète, build et tests du design studio ont été relancés sur cette installation propre et ont tous réussi. Les tests locaux n’incluent pas l’intégration Auth/PostgREST : Docker et Supabase CLI ne sont pas installés dans ce runner. **Aucun run GitHub Actions n’a été lancé** : le workflow et le garde-fou ne sont pas encore poussés/présents dans un run de branche. Les protections de `main` et la configuration des checks obligatoires ne sont pas modifiées et restent à faire confirmer par un administrateur.

## Revue de sécurité et limites

- Le job d’intégration utilise l’environnement local dérivé des migrations de répétition et des brouillons de sécurité référencés dans `migrations/repetition.json`. Il les teste sur une pile jetable; ce n’est ni un ordre de déploiement, ni une approbation de ces brouillons, ni une preuve de parité avec les 18 migrations du pilote.
- Les points de Phase 0 restent ouverts : migration distante 32 non réconciliée avec un SQL suivi, aperçu Vercel relié au projet Supabase pilote, champs et vue publics à examiner, sauvegarde/reprise réelle non prouvée, décisions produit et responsables manquants. **Pas de SQL de remédiation, de test d’écriture sur données client, de migration ni de restauration réelle.**
- Le workflow de qualité couvre le HEAD actuel, qui est en retard sur le `main` actuellement en production; ce lot n’importe pas de façon générale le code applicatif ultérieur. Avant fusion, réconcilier ce décalage et exécuter les workflows sur la branche de PR.
- Les 4 avis de développement ne sont pas ignorés : leur chaîne et le coût du downgrade conseillé doivent faire l’objet d’un ticket/revue. Le workflow ne bloque intentionnellement que sur les vulnérabilités des dépendances runtime pour ne pas masquer cette décision avec un changement de version non étudié.

## État de sortie

**Phase 1 CI — socle de dépôt ajouté et contrôles locaux réussis après installation propre; validation CI distante/intégration et protection de branche en attente.** Prochain pas sûr : faire exécuter la PR GitHub pour les deux matrices jetables; si elles réussissent, faire vérifier et rendre obligatoires les checks attendus. Poursuivre séparément les tests régressifs D2/D3/D4/D7 avant toute correction de sécurité SQL. Le pilote reste en lecture seule.
