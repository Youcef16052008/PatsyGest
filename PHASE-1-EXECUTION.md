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

Le premier run GitHub Actions [`44882477492`](https://github.com/Youcef16052008/PatsyGest/actions/runs/44882477492), lancé par `workflow_dispatch` sur le commit `e4bef7afa8bb5626e326f5bbdd3c6d642b89fd13`, s’est terminé **SUCCESS** : qualité applicative et les deux matrices Auth/PostgREST isolées (`historique`, `vitrine`) sont toutes vertes. Il a signalé les runtimes Node 20 dépréciés de `checkout@v4`, `setup-node@v4` et `setup-cli@v1`. Après épinglage des nouvelles versions par SHA, le second run [`44882762909`](https://github.com/Youcef16052008/PatsyGest/actions/runs/44882762909), commit `6f01cfb0a05fc3b23f3b2404d258e5a310bffc33`, a également terminé **SUCCESS** sur ses trois jobs. La sortie `gh run watch` ne montrait plus d’avertissement runtime; le téléchargement des logs bruts a échoué sur EOF, donc ce détail reste non confirmé par les logs bruts. Enfin, le run manuel [`44894517461`](https://github.com/Youcef16052008/PatsyGest/actions/runs/44894517461), déclenché sur le commit `753b904` après ajout des correctifs CSV, pagination, compte démo et calcul monétaire exact, a terminé **SUCCESS** sur les trois jobs (qualité et deux intégrations jetables Auth/PostgREST).

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

## Addendum — fusion `main` et vérification du HEAD livré

Cet addendum supersède les décomptes de TODO et la description de la série source indiqués plus haut, qui étaient exacts avant la réconciliation avec `origin/main`.

- Fusion de `origin/main` effectuée sur la branche active; les migrations source 32–38 sont maintenant présentes. Les migrations 101–128 restent rangées dans `supabase/brouillons/` et **n’ont pas été appliquées**. Le test PGlite de commande anonyme utilise la fixture mise à jour avec le rattrapage 32 et est devenu bloquant; il a réussi seul puis dans toute la suite.
- HEAD livré : `a27fd2b` (`Merge origin/main and complete phase 1 hardening`), poussé sur `arena/d51c48b6-patsygest`; arbre de travail propre après push.
- Validation locale sur ce HEAD : `npm test` — 438 pass, 0 échec, 2 skipped, 6 TODO; typecheck, lint, build Next.js, `npm audit --omit=dev` (0 vulnérabilité runtime), et `git diff --check` réussis. Les TODO restants concernent des scénarios non approuvés/non exécutés, pas le test de commande vitrine.
- GitHub Actions manuel `44895653276` sur le SHA `a27fd2bbee501f0ef8ea47ca1badde3685a9ca9e` : **SUCCESS**, trois jobs verts (qualité incluant PostgreSQL jetable et tests du studio, intégration Auth/PostgREST historique, intégration Auth/PostgREST vitrine). Ces piles sont jetables et synthétiques; aucun job ne cible le pilote.
- Cet achèvement ne lève pas le NO-GO établi en phase 0 : aucune migration 32–38 n’a été appliquée à Supabase, aucune écriture ou lecture de données métier n’a été faite sur le pilote, et les risques D2/D4/D7, la restauration, l’isolation des previews et les décisions de gouvernance restent à traiter avec approbation et preuves propres. Le plan global n’est donc **pas terminé à 100 %**.

## Addendum — PR #11, garde-fous tenant et configuration Preview

- Le propriétaire a approuvé la poursuite des recommandations. Le PR **#11** est ouvert en brouillon sur `main`; il ne doit pas être fusionné comme autorisation de déploiement.
- Une proposition additive `supabase/39-limites-tenant-restauration-sites-vitrine.sql` ferme la projection `client_id` de la vue publique, limite les écritures directes sur les colonnes sensibles des sites et sur `clients.offre`, et prévalide les FK mono-colonne entre tables restaurées avant la première insertion. Les tests synthétiques PGlite pour D2/D4/D7/D9 passent. Le test de commande vitrine passe aussi après adaptation de sa RPC à la nouvelle projection.
- `npm test` local : 442 pass, 0 fail, 3 skipped et 3 TODO. Le test de garde D2/D4/D7/D9 sur PostgreSQL réel est inclus mais ignoré localement faute de serveur PostgreSQL. Le run GitHub Actions `44897895997` sur `a81608a` est **SUCCESS** sur les 3 jobs; le job qualité fournit PostgreSQL 17 et exécute cette suite ainsi que tests/types/lint/build/studio. Le run PR `44897888220` est également vert sur les 3 checks.
- Le catalogue Supabase relu en lecture seule indique toujours seulement les migrations jusqu’à 32. **Aucune 33–39, et aucune 101–128, n’a été exécutée sur le projet connecté.** L’essai de création d’une branche DB isolée a été refusé par Supabase : le plan Hobby ne permet pas le branching (réponse 402, fonctionnalité réservée au plan Pro ou supérieur). Aucun projet alternatif n’a été créé pour contourner cette restriction; la preuve de migration sur une branche Supabase reste bloquée.
- Mesure de confinement réversible Vercel : les deux variables Supabase du projet sont désormais ciblées uniquement sur `production`; Preview reçoit `https://preview-isolated.invalid` et une clé fictive. Le nouveau déploiement Preview de la branche active est `READY` avec cet environnement isolé; les variables de production sont restées inchangées. Les anciens déploiements Preview immuables n’ont pas été modifiés et ne doivent pas être utilisés pour des essais.
- La migration 39 et ses contrôles D2/D4/D7/D9 passent désormais en PGlite et dans le run CI qui utilise PostgreSQL 17. Il reste une revue indépendante des références JSON/foreign keys non couvertes, puis une répétition Auth/PostgREST sur une vraie branche DB isolée (bloquée par le plan Hobby), un exercice de restauration complet et les décisions opérationnelles documentées. Ce lot réduit des risques mais ne certifie pas toute la frontière tenant. Le plan reste **inachevé**; aucune écriture sur le pilote n’est autorisée.
