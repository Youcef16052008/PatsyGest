# Rapport final — H13 à H20 (91 hypothèses)


> **Portée** : 91 hypothèses uniques `H13-01`…`H20-12` (11/10/10/12/12/12/12/12).
> Les `DIFFÉRÉ` seuls de la VAGUE 3 et la roadmap fonctionnelle `B.2`/`B.4` restent hors périmètre.
> Branche `arena/923a4433-patsygest`, base `da5857d`, HEAD de départ `14ae7c0`, Node `v22.22.3`.
>
> **Méthode** : aucune hypothèse n’est traitée comme un constat. Un `CORRIGÉ` exige une sonde
> « échoue avant / passe après » sur la base `14ae7c0`, puis la chaîne complète. Un `RÉFUTÉ`
> exige une preuve exécutée ou une lecture de code suffisante. Un `DIFFÉRÉ` conserve
> explicitement `[STATIQUE UNIQUEMENT]` et la limite non levée.
>
> `EXÉCUTÉ` = Node, routes appelées avec faux client Supabase, modules purs, PGlite,
> `npm` local. `[STATIQUE UNIQUEMENT]` = lecture de code/SQL, EXPLAIN à faible volume,
> connecteurs en lecture seule, sans navigateur ni base de production.
> Les journaux bruts de la chaîne et des sondes sont dans `.cache/v4-chain.log` et
> `.cache/v4_probes.log` (artefacts locaux, non commités).


## 1. Résumé exécutif

| Indicateur | Valeur |
|---|---|
| Hypothèses traitées | **91** (`H13-01`…`H20-12`) |
| CORRIGÉ | **15** |
| RÉFUTÉ | **37** |
| DIFFÉRÉ | **39** |
| Sondes avant/après | **8** (A…H), toutes restaurées octet pour octet et rejouées |
| Chaîne npm | `typecheck 0`, `lint 0`, `test 0`, `build 0`, `audit 0`, `diff-check 0` |
| Suite `npm test` | `1..871`, 874 tests, 868 pass, 0 fail, 3 skipped, 3 todo |
| Build | `Compiled successfully in 365ms ; 6/6 static pages ; ƒ Proxy (Middleware)` |
| Audit | `found 0 vulnerabilities` |
| Pull request | **aucune** |
| Déploiement / SQL production | **aucun** |

Le détail des 91 lignes figure aussi dans `audit/PLAN-APPLIQUE.md`, sections
`## VAGUE 4`, `## VAGUE 5` et `## REST`.

## 2. Correctifs livrés

1. **Observabilité des issues de secours** — `journalErreurRoute()` trace origine,
   étape et type d’erreur sans message brut dans `/api/export` et `/api/sauvegarde`.
2. **Complexité du tableau de bord** — `grouperLotsParArticle()` + `Set(shopIds)`
   remplacent les `lots.filter()` et `shopIds.includes()` répétés : O(A+L).
3. **Liste de courses serveur** — quatre limites `+1` et `lectureComplete()`
   refusent une agrégation silencieusement tronquée.
4. **Bornes réseau et RPC** — `AbortController`/`Promise.race` à 10 s pour les
   quatre envois d’alerte ; RPC d’essai borné à 5 s avec libération de la promesse
   partagée.
5. **Confirmation de livraison des alertes** — une seule horloge, `.lt()` DB,
   `alertsFailed`, et `offline_alert_sent_at` écrit seulement si le dispatch est
   `envoye` avec tous les résultats `ok`.
6. **Contexte de session vérifié** — `requireWriterContexte()` et
   `requireAnyRoleContexte()` suppriment les `ctx!.clientId` et la seconde lecture
   de session dans HACCP/planning.
7. **Chaîne de migrations active** — `tests/support/chaine-active.mjs` applique
   réellement 54 fichiers PGlite jusqu’à la version 55 ; le `test.todo` « 01→43 »
   est remplacé par deux tests, dont une sonde de migration cassée.
8. **Inventaire et dérive documentaire** — `nomsActions()` couvre const/arrow et
   ignore les types ; `CHAINE-NON-REJOUABLE.md` est archivé ; « 87 actions » est
   remplacé par un décompte mesuré.

## 3. Fichiers livrés

### Fichiers produit, tests et documentation modifiés

- `audit/PLAN-APPLIQUE.md`
- `patisgest-app/.env.example`
- `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md`
- `patisgest-app/src/app/api/export/route.ts`
- `patisgest-app/src/app/api/sauvegarde/route.ts`
- `patisgest-app/src/lib/actions-haccp.ts`
- `patisgest-app/src/lib/actions-planning.ts`
- `patisgest-app/src/lib/connectivite-cron.ts`
- `patisgest-app/src/lib/courses-server.ts`
- `patisgest-app/src/lib/dashboard-insights.ts`
- `patisgest-app/src/lib/journal-actions-communs.ts`
- `patisgest-app/src/lib/notifications-alerte.ts`
- `patisgest-app/src/lib/trial-server.ts`
- `patisgest-app/tests/chaine-rejouable.test.mjs`
- `patisgest-app/tests/inventaire-surface.mjs`
- `patisgest-app/tests/trial-lock.test.mjs`

### Nouveaux fichiers

- `patisgest-app/src/lib/observabilite-route.ts`
- `patisgest-app/tests/support/chaine-active.mjs`
- `patisgest-app/tests/vague4-actions-contexte.test.mjs`
- `patisgest-app/tests/vague4-connectivite.test.mjs`
- `patisgest-app/tests/vague4-courses.test.mjs`
- `patisgest-app/tests/vague4-inventaire.test.mjs`
- `patisgest-app/tests/vague4-observabilite.test.mjs`
- `patisgest-app/tests/vague4-performances.test.mjs`
- `patisgest-app/tests/vague4-reseau-essai.test.mjs`
- `audit/RAPPORT-H13-H20.md`

### Plan appliqué

- `audit/PLAN-APPLIQUE.md` — 91 lignes ajoutées aux sections VAGUE 4, VAGUE 5 et REST.

## 4. Chaîne de vérification

| Commande | Code | Résultat brut |
|---|---:|---|
| `npm run typecheck` | 0 | tsc --noEmit sans erreur |
| `npm run lint` | 0 | eslint . sans erreur |
| `npm test` | 0 | 1..871 ; # tests 874 ; # pass 868 ; # fail 0 ; # skipped 3 ; # todo 3 ; # duration_ms 276244.836011 |
| `npm run build` | 0 | Compiled successfully in 365ms ; 6/6 static pages ; ƒ Proxy (Middleware) |
| `npm audit --omit=dev` | 0 | found 0 vulnerabilities |
| `git diff --check` | 0 | aucune erreur d’espacement |

Détails : `1..871 ; # tests 874 ; # pass 868 ; # fail 0 ; # skipped 3 ; # todo 3 ; # duration_ms 276244.836011`. Le nombre de `todo`
passe de 4 à 3 grâce au remplacement du todo de rejouabilité.
134 fichiers `tests/*.test.mjs` sont dans le glob ;
156 `.mjs` existent sous `tests`, dont
140 à la racine, 6 scripts
racine hors glob et 4 specs E2E.
`git diff --check` est à `0`.

## 5. Sondes « échoue avant / passe après »

| Sonde | Objet | Fichiers remis à `14ae7c0` | Test ciblé | Avant | Après | Après restauration |
|---|---|---|---|---|---|---|
| A | H13-02/H13-07 observabilité des 503 | `patisgest-app/src/app/api/export/route.ts`, `patisgest-app/src/app/api/sauvegarde/route.ts` | `patisgest-app/tests/vague4-observabilite.test.mjs` | `rc=1`, 2 pass / 2 fail / 0 todo | `rc=0`, 4 pass / 0 fail / 0 todo | `rc=0`, 4 pass / 0 fail / 0 todo · OK |
| B | H14-01/H14-02 O(A×L) | `patisgest-app/src/lib/dashboard-insights.ts` | `patisgest-app/tests/vague4-performances.test.mjs` | `rc=1`, 0 pass / 2 fail / 0 todo | `rc=0`, 2 pass / 0 fail / 0 todo | `rc=0`, 2 pass / 0 fail / 0 todo · OK |
| C | H15-07/H14-09 troncature liste de courses | `patisgest-app/src/lib/courses-server.ts` | `patisgest-app/tests/vague4-courses.test.mjs` | `rc=1`, 2 pass / 2 fail / 0 todo | `rc=0`, 4 pass / 0 fail / 0 todo | `rc=0`, 4 pass / 0 fail / 0 todo · OK |
| D | H19-12/H13-05 bornes réseau et RPC | `patisgest-app/src/lib/notifications-alerte.ts`, `patisgest-app/src/lib/trial-server.ts` | `patisgest-app/tests/vague4-reseau-essai.test.mjs` | `rc=1`, 1 pass / 3 fail / 0 todo | `rc=0`, 4 pass / 0 fail / 0 todo | `rc=0`, 4 pass / 0 fail / 0 todo · OK |
| E | H13-03/H19-07 livraison des alertes | `patisgest-app/src/lib/connectivite-cron.ts` | `patisgest-app/tests/vague4-connectivite.test.mjs` | `rc=1`, 0 pass / 5 fail / 0 todo | `rc=0`, 5 pass / 0 fail / 0 todo | `rc=0`, 5 pass / 0 fail / 0 todo · OK |
| F | H16-10 contexte de session vérifié | `patisgest-app/src/lib/journal-actions-communs.ts`, `patisgest-app/src/lib/actions-haccp.ts`, `patisgest-app/src/lib/actions-planning.ts` | `patisgest-app/tests/vague4-actions-contexte.test.mjs` | `rc=1`, 0 pass / 3 fail / 0 todo | `rc=0`, 3 pass / 0 fail / 0 todo | `rc=0`, 3 pass / 0 fail / 0 todo · OK |
| G | H20-07/08/10/11 inventaire et dérive documentaire | `patisgest-app/.env.example`, `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md`, `patisgest-app/tests/chaine-rejouable.test.mjs`, `patisgest-app/tests/inventaire-surface.mjs`, `patisgest-app/tests/trial-lock.test.mjs` | `patisgest-app/tests/vague4-inventaire.test.mjs` | `rc=1`, 1 pass / 4 fail / 0 todo | `rc=0`, 5 pass / 0 fail / 0 todo | `rc=0`, 5 pass / 0 fail / 0 todo · OK |
| H | H18-01/H20-02 chaîne active remplace le todo | `patisgest-app/tests/chaine-rejouable.test.mjs` | `patisgest-app/tests/chaine-rejouable.test.mjs` | `rc=0`, 0 pass / 0 fail / 1 todo | `rc=0`, 2 pass / 0 fail / 0 todo | `rc=0`, 2 pass / 0 fail / 0 todo · OK |

`tous_restaures=True`, `tous_apres_rc0=True`,
`tous_avant_non_conformes=True`. Les sondes ne
modifient aucune base externe : elles écrivent temporairement des fichiers du
workspace, les restaurent byte à byte, puis relancent le même test ciblé.

## 6. Classification complète

### VAGUE 4 — `H13`…`H14` (21)

| ID | Statut (CORRIGÉ / RÉFUTÉ / DIFFÉRÉ) | Fichiers modifiés | Test ajouté | Vérification (EXÉCUTÉ ou [STATIQUE UNIQUEMENT]) |
|---|---|---|---|---|
| H13-01 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `src/lib/auth.ts:182` transforme une panne DB en `null`, donc redirection `/connexion` et non 503 ; `tests/trial-lock.test.mjs` couvre l’échec fermé. La distinction UX/incident et l’expérience opérateur à 3 h demandent une vraie panne Supabase et une décision produit, non exécutées. |
| H13-02 | CORRIGÉ | `patisgest-app/src/app/api/export/route.ts`, `patisgest-app/src/lib/observabilite-route.ts` | `patisgest-app/tests/vague4-observabilite.test.mjs` | EXÉCUTÉ — sonde A `rc=1, 2/4` avant, `rc=0, 4/4` après. Trace `origine/étape/type` sans message brut ni PII ; une erreur de lecture attendue 500 n’est pas journalisée comme incident. |
| H13-03 | CORRIGÉ | `patisgest-app/src/lib/connectivite-cron.ts` | `patisgest-app/tests/vague4-connectivite.test.mjs` | EXÉCUTÉ — sonde E `rc=1, 0/5` avant, `rc=0, 5/5` après. `simulation`, `partiel` et `echec` ne marquent plus `offline_alert_sent_at` ; `alertsFailed` et `ok:false` sont retournés. |
| H13-04 | RÉFUTÉ | — | `patisgest-app/tests/invitation-mail.test.mjs` | EXÉCUTÉ — `notifierInvitationLocale()` renvoie `echec` quand le SMTP de test est arrêté ; `actions-equipe.ts:142-147` dit « notification non confirmée » et `renvoyerInvitationEquipe():119` renvoie une erreur. Aucun succès d’e-mail n’est annoncé à tort. |
| H13-05 | CORRIGÉ | `patisgest-app/src/lib/trial-server.ts` | `patisgest-app/tests/vague4-reseau-essai.test.mjs` | EXÉCUTÉ — sonde D `rc=1, 1/4` avant, `rc=0, 4/4` après. Borne RPC 5 s, `null` après délai, `statutEnVol` libéré pour la requête suivante ; `reinitialiserStatutEssaiPartage(delaiTestMs?)` réduit le délai en test. |
| H13-06 | RÉFUTÉ | — | `patisgest-app/tests/proxy-session.test.mjs` | EXÉCUTÉ — 8 cas couvrent succès rapide, budget dépassé, échec immédiat/synchrone, rejet tardif non traité et annulation du minuteur. `perime` vaut vrai seulement pour `issue === "budget"`. |
| H13-07 | CORRIGÉ | `patisgest-app/src/app/api/sauvegarde/route.ts`, `patisgest-app/src/lib/observabilite-route.ts` | `patisgest-app/tests/vague4-observabilite.test.mjs`, `patisgest-app/tests/vague3-exports.test.mjs` | EXÉCUTÉ — sonde A `2/4 → 4/4`. Le 503 inattendu est tracé sans PII ; aucun corps de sauvegarde n’est écrit en streaming et les tests VAGUE 3 verrouillent 413/500 sans fichier partiel. |
| H13-08 | RÉFUTÉ | — | `patisgest-app/tests/caisse-collision-db.test.mjs`, `patisgest-app/tests/sale-session.test.mjs` | EXÉCUTÉ — rejeu du même ticket sur PGlite donne `duplicate:true` et le même `sale_id` ; `sameSaleReplay` refuse un contenu, un site ou un mode différents. La réponse réseau perdue après commit n’est pas simulée, mais l’idempotence DB est prouvée. |
| H13-09 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `src/components/service-worker.tsx:40-49` avale l’échec d’enregistrement, ne retire pas les listeners `updatefound`/`statechange` et n’affiche aucun signal. Aucun navigateur ni cycle SW réel exécuté. |
| H13-10 | RÉFUTÉ | — | `patisgest-app/tests/erreurs-db.test.mjs` | EXÉCUTÉ — `estErreurMetier()` exige `code === "P0001"` et un `message` string non vide avant le `e!.message` ; `null`, objet sans code, `XX999`, `23505`, `42501`, `42P01` sont couverts et ne divulguent ni schéma ni message technique. |
| H13-11 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — cartographie lue dans `parametres/page.tsx:66,98,123,150,229` : établissement retombe sur la session silencieusement ; `sitesError`, `equipeError`, `modulesError`, `auditError`, `migrationAbsente` et `migrationPersoActive` sont explicites ; vitrine devient vide sans message. Aucun rendu React avec panne partielle exécuté. |
| H14-01 | CORRIGÉ | `patisgest-app/src/lib/dashboard-insights.ts` | `patisgest-app/tests/vague4-performances.test.mjs` | EXÉCUTÉ — sonde B `rc=1, 0/2` avant, `rc=0, 2/2` après. `grouperLotsParArticle()` fait un passage sur L ; 120 articles × 400 lots passent de 48 000 lectures de `articleId` à 400. |
| H14-02 | CORRIGÉ | `patisgest-app/src/lib/dashboard-insights.ts` | `patisgest-app/tests/vague4-performances.test.mjs` | EXÉCUTÉ — sonde B. `productVelocity()` utilise le même groupement et `Set(shopIds)` : zéro appel à `Array.includes`. Les deux fonctions sont appelées dans `pilot-dashboard.tsx:99-109` ; aucune mémoïsation React n’a été ajoutée, seule la complexité O(A+L) est prouvée. |
| H14-03 | DIFFÉRÉ | — | `patisgest-app/tests/performance-dashboard.test.mjs` | [STATIQUE UNIQUEMENT] — `lirePages` reste séquentiel par pages de 500 ; le test PGlite mesure 20 001 lignes / 41 appels et 700 lignes / 2 appels, pas une latence DB à 20 000 lignes. |
| H14-04 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `tomorrow-lab.ts:242-253,344-365` boucle sur des ensembles de dates distinctes, sans benchmark ×100 ni test de passage à minuit/changement d’année. |
| H14-05 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `free-recipes-workspace.tsx` ~900 lignes, plusieurs `useSyncExternalStore`/`localStorage` ; aucun profilage React ni mesure de recalcul par frappe. |
| H14-06 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `workspace.css` 1 011 lignes / 87 697 octets importé par `globals.css:2-5` ; build local réussi mais aucun Lighthouse/FCP caisse à 360 px. |
| H14-07 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `portion-estimator.ts:368+` parcourt `input.lignes` avec `requireRange` et `rc01Consommation` ; complexité lue, aucune mesure mémoire ni mémoïsation ajoutée. |
| H14-08 | DIFFÉRÉ | — | `patisgest-app/tests/ingredient-impact.test.mjs` | [STATIQUE UNIQUEMENT] — `expandRecipeNeeds` utilise `walk(... depth, ancestors)` et trois Maps ; tests existants sur FEFO/pertes, mais aucune charge 5 000 lots × 1 000 versions exécutée. |
| H14-09 | DIFFÉRÉ | `patisgest-app/src/lib/courses-server.ts` | `patisgest-app/tests/vague4-courses.test.mjs` | [STATIQUE UNIQUEMENT] — la sonde C exécute la garde de troncature associée à H15-07 ; la mémoire des quatre requêtes et le coût de l’agrégation JS ne sont pas mesurés. |
| H14-10 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `portion-estimator.tsx:93-98` renvoie une chaîne `localStorage` stable au snapshot, ce qui évite la boucle de rendu, mais `loadEstimatorDraft()` reparse le JSON au rendu ; aucun navigateur ni coût `JSON.parse` mesuré. |

### VAGUE 5 — `H15`…`H16` (22)

| ID | Statut (CORRIGÉ / RÉFUTÉ / DIFFÉRÉ) | Fichiers modifiés | Test ajouté | Vérification (EXÉCUTÉ ou [STATIQUE UNIQUEMENT]) |
|---|---|---|---|---|
| H15-01 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `24-index-exploitation.sql:32` définit `(client_id, date_vente)`, mais l’index est absent de la liste d’index production lue et l’EXPLAIN sur 8 ventes donne `Seq Scan` + `Sort`. Aucun volume 100 000 lignes exécuté. |
| H15-02 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `lots_fefo_idx` au `:54-56` correspond à l’ORDER BY FEFO, mais il est absent de la base production lue et l’EXPLAIN sur 13 lots reste `Seq Scan` ; utilisabilité de l’index partiel non prouvée à volume. |
| H15-03 | DIFFÉRÉ | — | `patisgest-app/tests/performance-dashboard.test.mjs` | [STATIQUE UNIQUEMENT] — pagination OFFSET bornée à 20 000 et 41 appels mesurés ; coût croissant et doublons sous écritures concurrentes non exécutés sur vraie base. |
| H15-04 | DIFFÉRÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs` | [STATIQUE UNIQUEMENT] — la sonde à `limiteTotale` et le refus 20 001 lignes sont exécutés ; aucun `EXPLAIN` à OFFSET 20 000 ni coût de sonde systématique mesuré. |
| H15-05 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — vues `security_barrier` et `patisgest_mon_role()` lues ; un EXPLAIN faible volume montre `Subquery Scan` one-time filter, pas une mesure sur 100 000 mouvements. |
| H15-06 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `04-securite-lecture.sql:9` lu ; EXPLAIN RLS production à 3 utilisateurs donne `Hash Join` + `Seq Scan utilisateurs`, et `utilisateurs_auth_user_id_key` existe. Aucune conclusion à 100 000 lignes. |
| H15-07 | CORRIGÉ | `patisgest-app/src/lib/courses-server.ts` | `patisgest-app/tests/vague4-courses.test.mjs` | EXÉCUTÉ — sonde C `rc=1, 2/4` avant, `rc=0, 4/4` après. `LIMITES_LECTURE` + une ligne sonde `+1` sur OF, lots, BC et articles ; dépassement ou erreur PostgREST donne `erreur:true` et une liste vide, jamais un calcul tronqué. |
| H15-08 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — policies RESTRICTIVES avec `unnest(string_to_array(...))` lues dans `23-controle-modules.sql:132` ; aucun INSERT/UPDATE benchmark sur 100 000 mouvements, aucune écriture production. |
| H15-09 | RÉFUTÉ | — | — | [STATIQUE UNIQUEMENT] — le repli pré-migration 21 n’est déclenché que par `full.error` sur `mode_paiement`, une seconde requête de 50 ventes au plus par appel ; `lireVentesPeriode():171-175` ne replie qu’au premier offset. Ce n’est pas un N+1 par ligne. |
| H15-10 | RÉFUTÉ | — | `patisgest-app/tests/vague3-exports.test.mjs` | EXÉCUTÉ — export générique filtre `client_id`, lit par `range()` sans `count(*)`, refuse 20 001 lignes en 413 et n’émet aucun CSV partiel en 500. Le plan DB sous charge reste non mesuré. |
| H16-01 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `demo-workspace.ts:335` et `patisgest-store.ts:240` sont deux implémentations lues ; aucune comparaison exhaustive arrondis/statuts/Z exécutée. |
| H16-02 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `demoTomorrowPlan` et `tomorrow-lab.ts:244` coexistent ; aucun cas d’entrée produisant deux besoins différents n’a été exécuté. |
| H16-03 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `demoMercurialeFor` et `actions-couts.ts:444` lus ; divergence de variation de prix non mesurée sur un cas concret. |
| H16-04 | RÉFUTÉ | — | `patisgest-app/tests/lots-batch.test.mjs` | EXÉCUTÉ — `ClientLots` n’exige que `from().select().eq().in().gt().order().range()`, toutes méthodes réellement présentes sur le builder Supabase simulé et exercées par le test. Le cast reste un smell de maintenabilité, pas une méthode absente prouvée. |
| H16-05 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `vitrine.ts:98` caste la réponse puis `construireVitrine()` suppose `etablissement`, `nom`, `prix_ht`… ; aucun test PostgREST avec ligne malformée ni garde runtime ajoutée. |
| H16-06 | DIFFÉRÉ | — | `patisgest-app/tests/vague3-exports.test.mjs` | [STATIQUE UNIQUEMENT] — `export/comptable/route.ts:129-132` caste les lignes de vente et suppose les champs obligatoires ; les tests VAGUE 3 couvrent 200/409/413/500 et lignes équilibrées, pas une ligne PostgREST incomplète. |
| H16-07 | RÉFUTÉ | — | — | [STATIQUE UNIQUEMENT] — `design-studio/serve.mjs` n’est pas mort : `design-studio/README.md:18` documente `node design-studio/serve.mjs`, il ne sert que `public/`, refuse la traversée de chemin, impose `connect-src « none »` et ne touche aucune donnée réelle. |
| H16-08 | RÉFUTÉ | — | `design-studio/tests/model.test.mjs` | [STATIQUE UNIQUEMENT] — `views.mjs` 25 072 octets n’est importé que par `design-studio/public/studio.mjs` et son test de maquette ; aucun import depuis `patisgest-app/src` trouvé. |
| H16-09 | DIFFÉRÉ | — | `patisgest-app/tests/tomorrow-recipe-guard.test.mjs` | [STATIQUE UNIQUEMENT] — `tomorrow-lab-private-server.ts:33` choisit la version active de numéro maximal ; `recettesPlanValides` est testé, mais la sélection de version active et la lisibilité de la ligne dense n’ont pas de test dédié. |
| H16-10 | CORRIGÉ | `patisgest-app/src/lib/journal-actions-communs.ts`, `patisgest-app/src/lib/actions-haccp.ts`, `patisgest-app/src/lib/actions-planning.ts` | `patisgest-app/tests/vague4-actions-contexte.test.mjs` | EXÉCUTÉ — sonde F `rc=1, 0/3` avant, `rc=0, 3/3` après. `requireWriterContexte()`/`requireAnyRoleContexte()` rendent le ctx vérifié ; une session qui expire après la garde ne produit plus `ctx!.clientId` ni perte du nom du demandeur. |
| H16-11 | RÉFUTÉ | — | `patisgest-app/tests/store.test.mjs`, `patisgest-app/tests/caisse-collision-db.test.mjs` | EXÉCUTÉ — `sellCart()` est idempotente par ticket et `store.test.mjs:534-544` refuse un import Z dupliqué ; `11-import-z.sql:155-170` et `06-ventes-caisse-fefo.sql:19-20` portent aussi un contrôle de doublon et une clé unique `(client_id,ticket)`. La règle n’est pas seulement dans le store démo. |
| H16-12 | RÉFUTÉ | — | `patisgest-app/tests/lots-batch.test.mjs` | EXÉCUTÉ — même contrat `ClientLots` que H16-04, mêmes méthodes exercées avec un faux client ; la duplication du cast est relevée mais aucun appel runtime inexistant n’est démontré. |

### REST — `H17`…`H20` (48)

| ID | Statut (CORRIGÉ / RÉFUTÉ / DIFFÉRÉ) | Fichiers modifiés | Test ajouté | Vérification (EXÉCUTÉ ou [STATIQUE UNIQUEMENT]) |
|---|---|---|---|---|
| H17-01 | RÉFUTÉ | — | `patisgest-app/tests/preview-guard.test.mjs` | EXÉCUTÉ — `next.config.ts` fige bien le drapeau, mais `previewBloquee("production","1")` renvoie `false` ; 3 tests couvrent la promotion d’un build preview. |
| H17-02 | RÉFUTÉ | — | `patisgest-app/tests/apparence-licence-photos.test.mjs` | EXÉCUTÉ — chaîne explicite `PATISGEST_MODE_GRATUIT` → `NEXT_PUBLIC_...` → `modeGratuit()` ; le défaut gratuit est un choix produit testé, avec 5 valeurs qui réactivent l’abonnement. |
| H17-03 | RÉFUTÉ | — | `patisgest-app/tests/apparence-licence-photos.test.mjs`, `patisgest-app/tests/trial-lock.test.mjs` | EXÉCUTÉ — absence de variable = mode gratuit assumé ; `=0` réactive le verrou serveur et `trial-lock.test.mjs` exerce le vrai `auth.ts`. Aucune valeur d’environnement Vercel lue. |
| H17-04 | RÉFUTÉ | `patisgest-app/src/lib/trial-crypto.ts` (VAGUE 1) | `patisgest-app/tests/trial-license.test.mjs` | EXÉCUTÉ — VAGUE 1 : 14/15 avant, 15/15 après. `serverSeed()` refuse la graine publique en production ; un jeton signé avec la graine de dev n’est plus accepté. Secrets de déploiement non lus. |
| H17-05 | RÉFUTÉ | `patisgest-app/src/lib/vitrine-anti-abus.ts` (VAGUE 1) | `patisgest-app/tests/commande-vitrine-anti-abus.test.mjs` | EXÉCUTÉ — VAGUE 1 : 1/3 avant, 3/3 après. Secret anti-abus obligatoire en production, RPC de vérification fail-closed ; `.env.example` vide reste un placeholder local. |
| H17-06 | RÉFUTÉ | — | — | [STATIQUE UNIQUEMENT] — `git grep` ne trouve aucune valeur réelle pour `SUPABASE_SERVICE_ROLE_KEY`, `PATISGEST_MASTER_KEY`, `CRON_SECRET` ou secrets webhook ; CI exporte une variable depuis un secret GitHub, tests utilisent des valeurs factices. |
| H17-07 | RÉFUTÉ | — | — | EXÉCUTÉ — `npm test` exécute 134 fichiers `tests/*.test.mjs` : `1..871`, 874 tests, 868 pass, 0 fail, 3 skipped, 3 todo. Les scripts `test:e2e`, `test:smoke`, `test:preview` existent hors glob ; 4 specs E2E et 6 scripts racine hors glob inventoriés. |
| H17-08 | RÉFUTÉ | — | — | EXÉCUTÉ — `npm ci` 402 paquets, `package-lock.json` respecté ; chaîne locale `typecheck/lint/test/build/audit` à 0, `npm audit --omit=dev` `found 0 vulnerabilities`, build `Compiled successfully`. |
| H17-09 | RÉFUTÉ | — | `patisgest-app/tests/db-push-guard.test.mjs` | EXÉCUTÉ — le test lance réellement `npm run db:push` avec un faux `DATABASE_URL`, exige le code 1 et l’absence de `drizzle-kit push` ; aucun workflow n’applique de schéma non revu. |
| H17-10 | RÉFUTÉ | — | — | [STATIQUE UNIQUEMENT] — `.gitignore` exclut `.env`, `.env*.local`, `*.pem` ; grep des dépôts, `.env.example`, design-studio et audits ne révèle que des placeholders vides et des valeurs de test factices. |
| H17-11 | RÉFUTÉ | — | — | [STATIQUE UNIQUEMENT] — `allowedDevOrigins` est vide hors `E2B_SANDBOX_ID` et limité au host `3000-{id}.e2b.app` dans l’aperçu ; ce n’est pas un contrôle de sécurité production. Aucun rejet d’origine étrangère exécuté. |
| H17-12 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — local Node `v22.22.3` / npm `10.9.8` exécute bien `--experimental-strip-types` et `--experimental-test-module-mocks` ; `ci.yml` demande `node-version: 22` sans version de runner observée à distance. |
| H18-01 | CORRIGÉ | `patisgest-app/tests/chaine-rejouable.test.mjs`, `patisgest-app/tests/support/chaine-active.mjs` | `patisgest-app/tests/chaine-rejouable.test.mjs` | EXÉCUTÉ — sonde H : avant `rc=0, 0 pass, 1 todo`, après `rc=0, 2 pass`. PGlite applique réellement les 54 fichiers du manifeste et atteint `app_schema_version = 55` ; une migration cassée fait échouer le test. |
| H18-02 | DIFFÉRÉ | — | `patisgest-app/tests/concurrence-transfert-reel.test.mjs` | [STATIQUE UNIQUEMENT] — sans `PATSYGEST_PG_URL`, 3 mesures restent `skipped` ; aucune base PostgreSQL distante ni concurrence réelle utilisée. |
| H18-03 | RÉFUTÉ | — | `patisgest-app/tests/migrations-repetition.test.mjs`, `patisgest-app/tests/vague4-inventaire.test.mjs` | EXÉCUTÉ — `chaineDeploiement()` contient `53-caisse-ticket-scope.sql`, compte 54 fichiers de schéma, commence à `01-socle.sql` et finit à `55-dates-algiers-rattrapage.sql`. |
| H18-04 | RÉFUTÉ | — | `patisgest-app/tests/caisse-ticket-scope-db.test.mjs` | EXÉCUTÉ (PGlite) — `53-caisse-ticket-scope.sql` a `begin;` … `commit;` et `create or replace function` ; rejeu, conflit de ticket strict et séparation brouillons/série main sont couverts. |
| H18-05 | RÉFUTÉ | — | `patisgest-app/tests/sauvegarde.test.mjs` | EXÉCUTÉ — `18-restauration-sauvegarde.sql:26` `begin;`, `:31` `security definer`, `:57` garde propriétaire, `:153-156` revoke/grant/commit ; l’ordre topologique `ORDRE_RESTAURATION` est testé. |
| H18-06 | RÉFUTÉ | — | `patisgest-app/tests/sauvegarde.test.mjs`, `patisgest-app/tests/coffre-sauvegarde.test.mjs` | EXÉCUTÉ — `TABLES_EXCLUES` 12 entrées avec raison, incluses dans le dump et affichées par `sauvegarde-panel.tsx:131` ; tests d’ordre, d’empreinte, d’exclusions et de chiffrement. |
| H18-07 | DIFFÉRÉ | — | `patisgest-app/tests/vague3-exports.test.mjs` | [STATIQUE UNIQUEMENT] — limite 4 Mio et 413 sans fichier partiel sont testées ; le volume réel d’un pilote et le seuil « sans filet » ne sont pas calculés faute de dump représentatif. |
| H18-08 | RÉFUTÉ | — | — | [STATIQUE UNIQUEMENT] — `sauvegarde-free.yml:122-137` prouve lisibilité, ≥10 tables public et présence `utilisateurs` ; `:171-181` déclare explicitement ACL, Storage, rôles globaux et restauration réelle non certifiés. Aucun run CI distant déclenché. |
| H18-09 | RÉFUTÉ | — | — | [STATIQUE UNIQUEMENT] — workflows lus : `ci.yml` lance tests puis build sans secrets de production, aucun `psql`/`db:push`/migration appliquée ; build local sans valeurs secrètes réelles est sorti à 0. |
| H18-10 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `revue/sauvegardes/vendre_panier-avant-53.pgsql` fait 223 lignes / 9 529 octets et documente le retour arrière ; `PROCEDURE-RESTAURATION-PILOTE.md` exige un retour opéré. Aucun rollback à chaud exécuté sur le pilote. |
| H18-11 | RÉFUTÉ | — | `patisgest-app/tests/schema-complet.test.mjs`, `patisgest-app/tests/phase1-f02-f20-db.test.mjs` | EXÉCUTÉ (PGlite) — `33-restauration-sans-perte.sql` impose ordre fermé, `on conflict do nothing`, garde de version/tenant/rôle et transaction ; FK inter-établissements, collision et erreur de version sont testés. |
| H18-12 | RÉFUTÉ | — | `patisgest-app/tests/schema-version-db.test.mjs` | EXÉCUTÉ — `verifierVersionSchema()` et PGlite couvrent version absente, décalée, schéma protégé ; `(app)/layout.tsx:35-42` renvoie un `role="alert"` explicite avec déconnexion, pas un blocage silencieux. |
| H19-01 | RÉFUTÉ | — | `patisgest-app/tests/journal-audit-db.test.mjs` | EXÉCUTÉ (PGlite) — trigger `BEFORE UPDATE OR DELETE` lu à `40-journal-audit.sql:108-110` ; UPDATE et DELETE directs sont rejetés en test, y compris sous rôle applicatif. |
| H19-02 | RÉFUTÉ | — | `patisgest-app/tests/journal-audit-db.test.mjs` | EXÉCUTÉ (PGlite) — `grant select` seul et policy `client_id = patisgest_mon_client() AND role = proprietaire` ; INSERT/UPDATE directs refusés, policy production identique lue en lecture seule. |
| H19-03 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `journal_audit.acteur_email` est en clair et le journal est immuable 10 ans ; `42-donnees-personnelles.sql` ne le réécrit pas. Compatibilité RGPD et arbitrage conservation/effacement non tranchés, aucune anonymisation production exécutée. |
| H19-04 | DIFFÉRÉ | — | `patisgest-app/tests/donnees-personnelles-db.test.mjs` | [STATIQUE UNIQUEMENT] — les tests couvrent `cakes.client_nom`/`telephone`, la conservation des ventes et la trace d’audit, mais pas `cakes.notes`, `statut_note`, `demandes_donnees.reference`, `journal_audit.acteur_email` ni `utilisateurs.email/nom/telephone`. Anonymisation complète non prouvée. |
| H19-05 | RÉFUTÉ | — | `patisgest-app/tests/donnees-personnelles-db.test.mjs` | EXÉCUTÉ (PGlite) — `exporter_donnees_personnelles()` inclut nom/téléphone du client, et le test « ne déborde pas sur un autre établissement » insère un autre tenant puis vérifie l’absence de fuite. Fonctions `SECURITY DEFINER` avec `search_path=""` lues sur le projet réel. |
| H19-06 | RÉFUTÉ | — | `patisgest-app/tests/api-health.test.mjs` | EXÉCUTÉ — `/api/health` répond 200 sans import DB ni donnée sensible, avec `Cache-Control:no-store` ; c’est une sonde de processus, pas une sonde Supabase, comme le commentaire l’annonce. |
| H19-07 | CORRIGÉ | `patisgest-app/src/lib/connectivite-cron.ts` | `patisgest-app/tests/vague4-connectivite.test.mjs` | EXÉCUTÉ — sonde E `0/5 → 5/5`. `borneConnectivite()` dérive `checkedAtMs`, `cutoffMs` et `cutoffIso` d’une seule horloge ; `.lt("last_seen_at", cutoffIso)` est appliqué côté DB et les minutes viennent de `checkedAtMs`. Dérive horloge Next/DB non simulée. |
| H19-08 | DIFFÉRÉ | — | `patisgest-app/tests/vague4-connectivite.test.mjs` | [STATIQUE UNIQUEMENT] — comportement actuel verrouillé par test : `last_seen_at:null` reste exclu sans faire échouer le balayage. L’intention produit pour un nouveau pilote n’est documentée nulle part ; aucune règle alternative n’a été tranchée. |
| H19-09 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `api/cron/connectivite/route.ts:8-27` fail-closed sur secret <12, `timingSafeEqual`, GET+POST, repli Master ; aucune limitation de débit ni test de brute force sur déploiement réel. |
| H19-10 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `cron-connectivite.yml:30` garde le secret ; aucun heartbeat de surveillance du workflow ni run distant observé. |
| H19-11 | RÉFUTÉ | — | — | [STATIQUE UNIQUEMENT] — grants `authenticated` DML complets lus sur `notifications_patron`, mais RLS `update` exige `proprietaire` et `select` restreint au tenant ; un vendeur ne peut donc pas marquer une alerte traitée via PostgREST. Aucun appel PostgREST réel exécuté. |
| H19-12 | CORRIGÉ | `patisgest-app/src/lib/notifications-alerte.ts` | `patisgest-app/tests/vague4-reseau-essai.test.mjs` | EXÉCUTÉ — sonde D `1/4 → 4/4`. `DELAI_ALERTE_RESEAU_MS=10_000`, `AbortController`, `Promise.race` et `clearTimeout` sur les 4 call sites ; un fetch qui ignore le signal rend quand même `ok:false` en 20 ms. SSRF par URL d’environnement non allowlistée, non testé. |
| H20-01 | RÉFUTÉ | — | — | EXÉCUTÉ — recompte après H13-H20 : 134 fichiers dans le glob, 156 `.mjs` sous `tests`, dont 140 à la racine, 6 scripts racine hors glob et 4 specs E2E. `npm test` `1..871`, 874 tests, 868 pass, 0 fail, 3 skipped, 3 todo, durée 274 296 ms. |
| H20-02 | CORRIGÉ | `patisgest-app/tests/chaine-rejouable.test.mjs`, `patisgest-app/tests/support/chaine-active.mjs` | `patisgest-app/tests/chaine-rejouable.test.mjs` | EXÉCUTÉ — sonde H : le `test.todo` « 01→43 » incapable d’échouer est remplacé par deux tests actifs ; `1 todo` avant, `2 pass` après, dont une sonde de migration cassée. |
| H20-03 | DIFFÉRÉ | — | `patisgest-app/tests/concurrence-transfert-reel.test.mjs` | [STATIQUE UNIQUEMENT] — le seul test de concurrence sur PostgreSQL réel reste conditionnel à `PATSYGEST_PG_URL` ; 3 skipped demeurent dans la suite. |
| H20-04 | RÉFUTÉ | — | `patisgest-app/tests/trial-lock.test.mjs`, `patisgest-app/tests/trial-lock-demo.test.mjs` | [STATIQUE UNIQUEMENT] — 3 fichiers de tests d’actions mockent `auth.ts`, mais `trial-lock*.test.mjs` importent le VRAI `auth.ts` avec seulement Supabase simulé. Aucun Auth/PostgREST réel n’est validé ; l’affirmation « tous les tests » est fausse, la limite réelle reste entière. |
| H20-05 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `harness-execution.mjs:71-79` renvoie bien une fonction pour toute propriété inexistante ; aucun test ne démontre qu’un `.eq()` oublié ferait échouer une assertion de séquence. |
| H20-06 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `register-hooks.mjs:28-30` neutralise `server-only` uniquement sous Node de test ; le build Next réel reste la garde, mais aucun test négatif n’importe volontairement un module serveur côté client. |
| H20-07 | DIFFÉRÉ | `patisgest-app/tests/inventaire-surface.mjs` | `patisgest-app/tests/vague4-inventaire.test.mjs` | EXÉCUTÉ (sonde G) / [STATIQUE UNIQUEMENT] — `--update` à `inventaire-surface.mjs:40` est identifié et `surface()` reste comparée au JSON commité ; le parseur est exécuté, mais la tautologie « JSON régénéré puis comparé à lui-même » n’est pas levée sans risque métier indépendant. |
| H20-08 | CORRIGÉ | `patisgest-app/tests/inventaire-surface.mjs` | `patisgest-app/tests/vague4-inventaire.test.mjs` | EXÉCUTÉ — sonde G `1/5 → 5/5`. `nomsActions()` détecte `function`, `async function`, `default`, `const/arrow` et ignore `type`/`interface` ; 29 fichiers `use server` et 89 actions mesurés, JSON inchangé car les 34 exports non-async actuels sont des types. |
| H20-09 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — dérives ponctuelles relevées (`87 actions`, chaîne 01→43, « Drizzle déjà en place », montants/centimes, PWA chiffrée), mais le tableau exhaustif README/SECURITE/AGENTS/CDC/revue n’a pas été produit. |
| H20-10 | CORRIGÉ | `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md` | `patisgest-app/tests/vague4-inventaire.test.mjs` | EXÉCUTÉ — sonde G. Le document est marqué `ARCHIVÉ`, renvoie au manifeste 01→55 et au test actif ; le relevé 43 fichiers / 4 échecs reste lisible comme historique. |
| H20-11 | CORRIGÉ | `patisgest-app/.env.example`, `patisgest-app/tests/trial-lock.test.mjs` | `patisgest-app/tests/vague4-inventaire.test.mjs` | EXÉCUTÉ — sonde G. Le « 87 actions » figé est remplacé par « mesuré par `inventaire-surface.mjs` » ; 29 fichiers `use server`, 89 actions, 72 appels `getSessionContext` dans 35 fichiers. Les prompts/audits historiques gardent la citation sans être des docs exécutables. |
| H20-12 | DIFFÉRÉ | — | — | [STATIQUE UNIQUEMENT] — `ci.yml:115` soumet l’E2E à `workflow_dispatch` ; aucun run PR/push main ni navigateur distant observé. `npm run test:e2e` existe mais n’a pas été lancé. |

## 7. Éléments externes lus, sans mutation

- **Supabase** (`evepzygucfxarpdnflzv`) : `ACTIVE_HEALTHY`, PostgreSQL 17.12,
  40 tables public, 0 table sans RLS, 123 policies, 77 fonctions `SECURITY DEFINER`,
  `schema_version 53`. `EXPLAIN` sur volumes minuscules (`ventes 8`, `lots 13`,
  `mouvements 7`, `utilisateurs 3`) et politiques/grants lus en lecture seule.
  Aucune insertion, aucun `UPDATE`, aucune application de SQL 54/55.
- **Vercel** : aperçu `dpl_8NUt8YcoRDLdMuXrbPqUuVXJWMSK` READY sur `14ae7c0`,
  production `dpl_5Adbh8YbYDYjUyYP1fzy26jfsdy3` READY sur `da5857d`. Noms
  d’environnement seulement ; aucun déploiement déclenché.
- **Google Drive** : dossier `rapport-patisgest`
  (`10IZw_nja02RJO9r-L7DWE8mtwFMUUk9t`) et `index.html` existant ; ce rapport y
  est déposé après validation de la chaîne. Roadmap et architecture v4 lues
  partiellement pour repérer les dérives documentaires.
- **Figma** : `get_team_projects` refusé par le scope, styles/composants vides,
  aucune clé de fichier trouvée dans Drive ; aucune maquette exploitable.

## 8. Limites et reports

- `[STATIQUE UNIQUEMENT]` : PostgreSQL/Supabase/PostgREST/Auth réels, concurrence
  réelle, navigateur, Playwright, mobile 360 px, FCP, secrets de production,
  état de la base pilote, staging, CI distante, E2E `workflow_dispatch`.
- Les 39 `DIFFÉRÉ` conservent une limite explicite : benchmarks de volume,
  profiling React, anonymisation complète, brute force, heartbeat, rollback à
  chaud, dérives documentaires exhaustives et restauration réelle.
- Le harnais PGlite n’est pas un déploiement Supabase : `auth.*`, `pgcrypto`,
  `rls_auto_enable()` et `creer_of` y sont stubbés de façon explicite.
- `simulation` n’est plus comptée comme une alerte livrée : sans fournisseur
  SMS/WhatsApp configuré, `runOfflineDisconnectAlerts()` retourne désormais
  `ok:false` avec `alertsFailed`.
- Aucun `SXX.md`, aucune PR, aucun changement d’env/secrets, aucun commit de
  `.cache/`, aucun déploiement.

## 9. Conclusion

Les 91 hypothèses `H13`…`H20` sont classées sans inventer de bug : 15 corrections
sont prouvées par sondes avant/après et par la chaîne npm complète ; 37 sont
réfutées avec preuve exécutée ou lecture ciblée ; 39 restent différées avec leur
limite exacte. Le plan appliqué et ce rapport sont prêts pour relecture.
