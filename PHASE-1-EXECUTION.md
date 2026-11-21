# Phase 1 — CI et reproductibilité (premier lot)

**Date : 21 novembre 2026 (UTC)** · **Branche :** `arena/d51c48b6-patsygest` · **HEAD de départ :** `2fba72c78e643ac4cb1b484cb26b0efaa38cdeff`.

> Ce rapport consigne les travaux de CI/reproductibilité et les correctifs applicatifs limités livrés pendant cette reprise. Il ne clôt pas le plan d’`ANALYSE-REVUES-AGENTS.md`, dont la phase de remédiation commence par les frontières tenant. Les tests isolés D2/D4/D7 exposent les risques actuels et ne constituent pas des remédiations SQL.

## Travail effectué

1. **Workflow GitHub Actions ajouté** sous `.github/workflows/ci.yml` (repris du `origin/main` actuellement déployé, avec une vérification additionnelle des dépendances de production). Il s’exécute sur PR, push vers `main` et déclenchement manuel.
   - Job qualité sous Node 22 : `npm ci`, `npm audit --omit=dev`, typecheck, ESLint, tests Node/PGlite, build avec URL/clé Supabase fictives, tests du design studio.
   - Job d’intégration en matrice `historique` / `vitrine` : Supabase CLI local, jetable; Auth et PostgREST réels de la pile locale et données fictives. Le script requiert `PATSYGEST_DISPOSABLE=yes`, vérifie les hôtes/ports loopback et exige une base vierge avant toute migration. Nettoyage avec `supabase stop --no-backup` en fin de job.
   - Aucun secret du pilote n’est injecté par le workflow. Ces tests ne certifient pas l’équivalence avec la base pilote.
   - Après le premier run distant, les actions ont été mises à jour vers les versions vérifiées et épinglées par SHA : checkout v7.0.1, setup-node v7.1.0, Supabase setup-cli v3.2.0. Le second run sur la nouvelle révision est aussi vert; l’interface `gh run watch` n’y a pas affiché les avertissements runtime vus au premier run. L’API de téléchargement des logs a répondu EOF lors de la vérification, donc l’absence d’avertissement n’est pas certifiée au niveau de chaque log brut.
2. **`db:push` désactivé par défaut** : le script npm appelle maintenant un garde-fou qui échoue avant `drizzle-kit`; un test de régression lance réellement cette commande avec une URL DB invalide et vérifie qu’aucune commande Drizzle n’est exécutée. Le schéma Drizzle n’est pas la source de vérité Supabase. Ce verrou n’empêche pas une personne de lancer des commandes SQL manuelles; il évite le push accidentel par le chemin npm.
3. **Audit de dépendances** : le workflow vérifie `npm audit --omit=dev`, soit les dépendances livrées en production. Scan observé : 0 vulnérabilité production. L’audit complet signale 4 vulnérabilités modérées uniquement dans la chaîne de dépendances de développement autour de `drizzle-kit` / `esbuild`; la recommandation automatique de npm implique une rétrogradation majeure de Drizzle Kit, non appliquée sans analyse de compatibilité.
4. **Régression de référence pour frontières tenant (tests seulement)** : ajout des reconstructions PGlite `serie-main-vitrine-db.test.mjs` / `serie-main-vitrine-commande.test.mjs` sur les migrations SQL 01–31, sans les brouillons de sécurité 101–128. Un nouveau fichier `phase1-security-regressions.test.mjs` porte trois assertions TODO : la vue `anon` doit cesser de projeter `client_id` (D2), le labo doit être empêché de modifier directement domaine/publication (D4), et la restauration doit refuser une famille du tenant A liée à l’article B (D7). Ces tests sont isolés et fictifs; ils enregistrent des protections attendues, pas un déploiement ni un correctif. Le test de commande valide reste aussi TODO car le SQL 27 du dépôt échoue sur `v_site.subdomain`.
5. **Durcissement export CSV local** : les cellules textuelles qui commencent par des espaces ou un BOM avant un opérateur de formule sont désormais neutralisées; les tableaux et objets JSON issus de `select *` sont rendus en JSON lisible avec clés triées, au lieu de produire `[object Object]`. Les valeurs numériques typées restent numériques, notamment les montants négatifs. Tests de régression ajoutés. Cela n’altère ni l’autorisation d’export ni la sélection des données, et ne résout pas les risques SQL tenant ouverts.
6. **Pagination export/sauvegarde aux plafonds** : le lecteur partagé sonde une ligne après une dernière page pleine, accepte exactement 20 000 lignes pour CSV et 50 000 lignes par table pour JSON, mais refuse explicitement toute ligne au-delà sans produire un fichier partiel. L’export répond 413 au dépassement; la sauvegarde reste fail-closed. Tests synthétiques vérifient cap−1/cap/cap+1 et une erreur de sonde. La cohérence face à des mutations concurrentes entre pages (snapshot transactionnel/keyset) n’est pas garantie par ce correctif et reste à traiter avant de qualifier une sauvegarde de snapshot cohérent.
7. **R6 — compte de démo** : l’autorisation de connexion rapide et la résolution d’un cookie signé recherchent maintenant une clé propre dans la liste blanche; les clés héritées (`constructor`, `__proto__`, etc.) sont refusées. Le mode démo reste désactivé en production. Tests couvrent la vraie liste de comptes.
8. **R2/D1 — arrondis caisse** : le navigateur calcule désormais les centimes à partir de fractions décimales exactes (`BigInt`) et applique l’arrondi demi-haut de PostgreSQL numeric, plutôt que de multiplier en virgule flottante binaire. Un test compare le cas 2,50 × 1,19 à PGlite et une matrice déterministe de 200 000 cas valide HT/TVA/TTC. Cette preuve est locale et synthétique; elle ne remplace pas une comparaison des tickets de production, qui reste interdite sur le pilote.

## Vérifications exécutées

Les commandes suivantes ont été lancées dans `patisgest-app` sous Node `v22.22.3` / npm `10.9.8` :

| Contrôle | Résultat |
|---|---|
| `npm ci` | Réussi, 401 paquets installés depuis le lockfile. npm signale 4 vulnérabilités modérées à l’audit complet. |
| `npm audit --omit=dev` | Réussi : 0 vulnérabilité dans les dépendances de production. |
| `npm run typecheck` | Réussi. |
| `npm run lint` | Réussi. |
| `npm test` | Réussi après changements CSV, pagination et compte démo : 377 pass, 0 fail, 4 TODO / 381 tests. Les 4 TODO restent les trois assertions D2/D4/D7 et le test de commande D3. |
| Build avec `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:65531` et clé fictive `test` | Réussi. Ces valeurs sont destinées à la compilation locale seulement. |
| `node --test design-studio/tests/*.test.mjs` | Réussi : 6/6 tests. |
| Validation du YAML du workflow (`js-yaml`) et assertions de présence des étapes | Réussies. |
| `git diff --check` | Réussi; aucun problème d’espacement relevé. |

Après le `npm ci`, les contrôles typecheck, lint, suite complète, build et tests du design studio ont été relancés sur cette installation propre et ont tous réussi. Les tests locaux n’incluent pas l’intégration Auth/PostgREST : Docker et Supabase CLI ne sont pas installés dans ce runner.

Le premier run GitHub Actions [`44882477492`](https://github.com/Youcef16052008/PatsyGest/actions/runs/44882477492), lancé par `workflow_dispatch` sur le commit `e4bef7afa8bb5626e326f5bbdd3c6d642b89fd13`, s’est terminé **SUCCESS** : qualité applicative et les deux matrices Auth/PostgREST isolées (`historique`, `vitrine`) sont toutes vertes. Il a signalé les runtimes Node 20 dépréciés de `checkout@v4`, `setup-node@v4` et `setup-cli@v1`. Après épinglage des nouvelles versions par SHA, le second run [`44882762909`](https://github.com/Youcef16052008/PatsyGest/actions/runs/44882762909), commit `6f01cfb0a05fc3b23f3b2404d258e5a310bffc33`, a également terminé **SUCCESS** sur ses trois jobs. La sortie `gh run watch` ne montrait plus d’avertissement runtime; le téléchargement des logs bruts a échoué sur EOF, donc ce détail reste non confirmé par les logs bruts.

Les protections de `main` et la configuration des checks obligatoires ne sont pas modifiées et restent à faire confirmer par un administrateur.

## Régressions tenant reproduites sur la série source 01–31

La suite ajoutée construit chaque cas dans une base PGlite éphémère avec deux identifiants de tenant fictifs. Elle n’exécute aucune requête sur Supabase. Les trois résultats observés concordent avec l’inventaire read-only du pilote :

- **D2 :** sous le rôle `anon`, la vue `vitrine_catalogue` renvoie le `client_id` du tenant fictif alors que la table `clients` n’est pas directement lisible par `anon`.
- **D4 :** sous un JWT simulé de rôle `labo`, un `UPDATE` direct de `sites` peut réserver `support` et changer le champ `publication`; cela contourne les validations de la RPC de réservation.
- **D7 :** la restauration `SECURITY DEFINER` accepte un dump dont la famille appartient au tenant A mais dont `produit_id` pointe vers un article du tenant B; la FK simple `produit_id → articles.id` n’impose pas l’égalité de tenant.

Ces assertions sont explicitement **TODO/non bloquantes** tant que les migrations réelles ne sont pas réconciliées. Le run CI distant `44882762909` précède ces trois nouveaux tests et ne les valide pas; les validations locales actuelles sont : suite entière (377 pass / 4 TODO), typecheck, lint et build réussis. La migration 32 reste absente des sources suivies; en complément, `list_snippets` Supabase a renvoyé une liste vide. Aucun SQL n’a été créé ou exécuté sur le pilote pour combler cette lacune.

## Revue de sécurité et limites

- Le job d’intégration utilise l’environnement local dérivé des migrations de répétition et des brouillons de sécurité référencés dans `migrations/repetition.json`. Il les teste sur une pile jetable; ce n’est ni un ordre de déploiement, ni une approbation de ces brouillons, ni une preuve de parité avec les 18 migrations du pilote.
- Les points de Phase 0 restent ouverts : migration distante 32 non réconciliée avec un SQL suivi, aperçu Vercel relié au projet Supabase pilote, champs et vue publics à examiner, sauvegarde/reprise réelle non prouvée, décisions produit et responsables manquants. **Pas de SQL de remédiation, de test d’écriture sur données client, de migration ni de restauration réelle.**
- Le workflow de qualité couvre le HEAD actuel, qui est en retard sur le `main` actuellement en production; ce lot n’importe pas de façon générale le code applicatif ultérieur. Avant fusion, réconcilier ce décalage et exécuter les workflows sur la branche de PR.
- Les 4 avis de développement ne sont pas ignorés : leur chaîne et le coût du downgrade conseillé doivent faire l’objet d’un ticket/revue. Le workflow ne bloque intentionnellement que sur les vulnérabilités des dépendances runtime pour ne pas masquer cette décision avec un changement de version non étudié.

## État de sortie

**Phase 1 CI — socle local terminé; deux runs CI distants réussis, dont les deux intégrations isolées après mise à jour des actions.** Des tests PGlite D2/D4/D7 sont maintenant ajoutés localement comme TODO, en attente d’une source de migration complète et d’une remédiation approuvée; ils restent à exécuter dans le workflow distant. Les checks requis/protections de branche ne sont pas établis ici; un administrateur doit les vérifier sur une PR. La suite sécurité SQL réelle reste en attente; le pilote demeure strictement en lecture seule.
