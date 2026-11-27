# PLAN-APPLIQUE.md — exécution du plan de remédiation

> Branche `arena/923a4433-patsygest`, base `da5857d`. Les 231 pistes `H01-01`…`H20-12`
> sont traitées comme des **hypothèses** : aucune modification produit n'est faite
> sans preuve directe dans le code exécutable. README, commentaires et noms de tests
> ne sont pas des preuves de comportement.
>
> **Portée des vagues** : les `VAGUE 1`/`VAGUE 2`/`VAGUE 3` de ce fichier sont les
> vagues d'hypothèses de remédiation (`H01`…`H04`, `H05`…`H08`, puis `H09`…`H12`).
> Elles ne doivent pas être confondues avec les `VAGUE 1`…`VAGUE 4` fonctionnelles
> du `PLAN-AMELIORATION-PATISGEST.md` (`A.1`…`A.6`, `B.5`…`B.7`, `B.1`/`B.3`, etc.).
> Les fonctionnalités produit du roadmap ne sont pas implémentées ici.

## ÉTAPE 0 — baseline exécutée

Commandes exécutées dans `patisgest-app`, toutes `exit 0` :

| Commande | Résultat brut |
|---|---|
| `npm run typecheck` | `tsc --noEmit` sans erreur |
| `npm run lint` | `eslint .` sans erreur |
| `npm test` | `1..785`, `# tests 788`, `# pass 781`, `# fail 0`, `# skipped 3`, `# todo 4`, `# duration_ms 240587.581657` |
| `npm run build` | exit 0, route list jusqu'à `ƒ /vitrine/[slug]`, `ƒ Proxy (Middleware)` |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |

Logs : `/tmp/baseline_{typecheck,lint,test,build,audit}.log`, codes dans `/tmp/baseline_codes.txt`.
Aucun échec de build et aucune CVE critique/haute à prioriser dans la VAGUE 1.

## VAGUE 1 — P0 sécurité / sessions / RLS / multi-tenant / anti-abus

Périmètre : **47 hypothèses**, `H01-01`…`H04-12`. Vérification directe dans les fichiers
exécutables, puis sonde PGlite sur la chaîne de migrations principale. Aucune base
Supabase/PostgreSQL de déploiement, aucun PostgREST/Auth réel, aucun navigateur ni
Playwright n'a été utilisé : ces validations restent `[STATIQUE UNIQUEMENT]`.

### Correctifs livrés

1. **H01-05** — `src/lib/trial-crypto.ts:26-53` refuse la graine publique en production.
   Test ajouté dans `tests/trial-license.test.mjs` : **14/15 avant**, **15/15 après**.
2. **H04-01 / H04-03** — `src/lib/vitrine-anti-abus.ts:11-23` et
   `src/app/(vitrine)/vitrine/[slug]/commander/actions.ts:64-89` : secret anti-abus
   obligatoire en production, et toute erreur/absence de la RPC de vérification par
   source fait échouer la commande. Nouveau test `tests/commande-vitrine-anti-abus.test.mjs` :
   **1/3 avant**, **3/3 après**. Le harnais `tests/mocks/register-hooks.mjs:31-39`
   résout désormais l'alias `@/…` sans faux module.
3. **H04-06** — nouvelle migration **54** (jamais réécriture de la 38 appliquée) :
   `pg_advisory_xact_lock` sur `(client_id, source_hash)` avant purge/insert/comptage.
   Manifest `migrations/repetition.json` et test de la chaîne mis à jour ; un test de
   non-régression accepte désormais `version >= 54` lors du rejeu de 53.
   `tests/anti-abus-vitrine-db.test.mjs` : **7/8 avant**, **8/8 après**. La concurrence
   réelle PostgreSQL/Supabase reste `[STATIQUE UNIQUEMENT]`.

### Vérifications obligatoires de la vague

Chaîne exécutée après les correctifs : `npm run typecheck && npm run lint && npm test && npm run build`.

| Commande | Code | Fin de sortie brute |
|---|---:|---|
| `npm run typecheck` | 0 | `tsc --noEmit` sans erreur |
| `npm run lint` | 0 | `eslint .` sans erreur |
| `npm test` | 0 | `1..790`, `# tests 793`, `# pass 786`, `# fail 0`, `# skipped 3`, `# todo 4`, `# duration_ms 242976.633834` |
| `npm run build` | 0 | route list + `ƒ Proxy (Middleware)` |

Logs : `/tmp/vague1_{typecheck,lint,test,build}.log`, codes `/tmp/vague1_codes.txt`.

### Sonde PGlite VAGUE 1

Après la chaîne 01→54 : `tablesWithoutRls=[]`, `secdefWithoutSearchPath=[]`,
privilèges table `anon` = `vitrine_catalogue SELECT`, fonctions `anon` =
`patisgest_demander_commande` + `patisgest_verifier_source_vitrine`,
`vendre_panier.search_path=""` avec `anon=false`, `moduleEmpty.empty_allowed=false`,
`moduleEmpty.null_allowed=false`. PGlite n'est pas un déploiement Supabase.

### Tableau récapitulatif

| ID | Statut (CORRIGÉ / RÉFUTÉ / DIFFÉRÉ) | Fichiers modifiés | Test ajouté | Vérification (EXÉCUTÉ ou [STATIQUE UNIQUEMENT]) |
|---|---|---|---|---|
| H01-01 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/licence-mode.ts:23-27`, `src/lib/auth.ts:122-128`, `tests/trial-lock.test.mjs:29` : le mode gratuit est un interrupteur explicite ; avec `=0`, le verrou serveur est actif. |
| H01-02 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/trial-server.ts:68-71,127-129`, `src/lib/auth.ts:126-128`, `tests/trial-lock.test.mjs:153-177` : RPC sans paramètre client ; l'échec ouvert est couvert par des tests et ne donne pas accès à une DB elle-même en panne. |
| H01-03 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/auth.ts:153-158,182-184` : timeout et exception renvoient `null`, donc échec fermé ; la confusion est un défaut d'observabilité, pas une élévation de privilège. |
| H01-04 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/lib/auth.ts:61-63,136-149` : rejeu/rotation absent, mais `demoEnabled()` interdit le mode démo en production ; durcissement session locale différé. |
| H01-05 | CORRIGÉ | `patisgest-app/src/lib/trial-crypto.ts` | `patisgest-app/tests/trial-license.test.mjs` | EXÉCUTÉ — `src/lib/trial-crypto.ts:26-53` : plus aucune signature avec la graine publique en production ; test `14/15` avant, `15/15` après. |
| H01-06 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/lib/master-auth.ts:15-17,33-49,56-82` : clé min. 16, cookie 12 h, HMAC et expiry vérifiés ; rotation/version de secret nécessite un déploiement d'exploitation. |
| H01-07 | RÉFUTÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/proxy.ts:45-47`, `src/lib/supabase/server.ts:15-17`, `src/lib/auth.ts:151-184`, `src/lib/vitrine.ts:70-72` : sans config, la session et la vitrine échouent fermé ; `/api/health` reste la seule sonde publique. |
| H01-08 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/proxy.ts:50-52`, `src/lib/auth.ts:61-63` : le court-circuit démo exige `NODE_ENV !== "production"` ; il est inactif en production. |
| H01-09 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/lib/supabase/server.ts:23-31`, `src/proxy.ts:81-86`, `src/lib/proxy-session.ts:50-82` : rotation gérée par le proxy et marqueur posé, mais aucun consommateur applicatif du marqueur ; observabilité différée. |
| H01-10 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/app/api/presence/heartbeat/route.ts:15-18,23-29,42-70`, `src/lib/auth.ts:108` : `allowLocked` sert l'issue de secours ; le bundle signé est construit depuis la réponse DB, aucune valeur fournie par le client. |
| H01-11 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/actions-auth.ts:18-21,40-51`, `src/components/client-logout.tsx:40-45` : cookie pilote supprimé au login Supabase, cookies `sb-*` et données locales effacés à la déconnexion. |
| H01-12 | RÉFUTÉ | — | — | `[STATIQUE UNIQUEMENT]` — inventaire exécuté : 91 exports `use server`, 70 appels `getSessionContext`, 3 fichiers sans appel direct ; `src/lib/actions-rejoindre.ts:11-17` vérifie `auth.getUser()`, `src/lib/courses-server.ts:33-41` reste sous RLS, et l'action vitrine est publique par conception. |
| H02-01 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/permissions.ts:51-55`, `supabase/23-controle-modules.sql:15-20,117-141` : le propriétaire a tous les modules, mais les policies restrictives SQL restent la source de vérité pour les écritures. |
| H02-02 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/lib/permissions.ts:66-68`, `supabase/50-roles-permissions-vues.sql:95-133`, `supabase/17-confidentialite-couts-rls.sql:60-68` : règles UI et SQL observées, mais parité exhaustive de tous les RPC/vues de coûts non démontrée. |
| H02-03 | RÉFUTÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/lib/modules-access.ts:6-13`, `supabase/23-controle-modules.sql:117-141` : la navigation échoue fermé et les writes directs rencontrent les policies de module. |
| H02-04 | RÉFUTÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/app/(app)/[module]/page.tsx:139-151`, `src/lib/actions-equipe.ts:16-20`, `src/lib/actions-sites.ts:12-13` : les actions revalident la session/rôle ; aucune protection uniquement visuelle. |
| H02-05 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/actions-licence.ts:225-243,321-329,360-367,398-409` : les quatre usages Master exigent `getMasterSession()` ; `src/lib/actions-licence.ts:52-53` est l'inscription publique, sans donnée Master. |
| H02-06 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/supabase/admin.ts:13-16`, `src/lib/actions-licence.ts:241-243,329,367,409`, `src/lib/connectivite-cron.ts:63-72`, `src/app/master/page.tsx:19-23,124-132` : tout `null` devient refus explicite ou liste vide après garde Master. |
| H02-07 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/actions-equipe.ts:16-20,47,62,73,90,112,136,155` : chaque export passe par `clientProprietaire()`. |
| H02-08 | RÉFUTÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/lib/actions-sites.ts:12-13,25-26`, `supabase/01-socle.sql:72-76` : UPDATE filtre `client_id`, INSERT le prend du contexte, RLS isole le reste. |
| H02-09 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/vitrine-permissions.ts:55-70`, `src/lib/vitrine.ts:141-145`, `src/lib/actions-vitrine.ts:37-41,96-100,146-150,191-195,226-230,267-271`, `supabase/30-edition-vitrine-rpc.sql:46-61` : matrice appliquée puis revalidée côté SQL. |
| H02-10 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/app/(app)/parametres/page.tsx:90-98` : une panne RPC marque trois domaines indisponibles, sans contournement ; granularité d'erreur/UX différée. |
| H02-11 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/app/master/page.tsx:124-132`, `src/lib/master-auth.ts:56-82`, `src/lib/actions-licence.ts:225-243` : `chargerDonneesMaster()` n'est appelé qu'après session Master valide. |
| H03-01 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — `supabase/01-socle.sql:51-54,67-69` : `clients_select_own` et `utilisateurs_select_own` lient la lecture à `auth.uid()`. |
| H03-02 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — `tablesWithoutRls=[]` sur `relkind in ('r','p')` après 01→54 ; `supabase/04-securite-lecture.sql:5-10` pose les policies de lecture. |
| H03-03 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — `supabase/03-sprint2-modules.sql:248-251`, `supabase/04-securite-lecture.sql:6-10` : les policies sont `drop if exists` puis recréées ; la chaîne s'applique sans doublon bloquant. |
| H03-04 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — privilèges table `anon` = `vitrine_catalogue SELECT` seulement ; `supabase/28-fermeture-anon.sql:36-50` et révocations des migrations suivantes. |
| H03-05 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — `secdefWithoutSearchPath=[]` ; fonctions exécutables par `anon` = `patisgest_demander_commande`, `patisgest_verifier_source_vitrine` ; `supabase/29-fermeture-public-fonctions.sql:31-44`. |
| H03-06 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite catalogue) — `supabase/50-roles-permissions-vues.sql:135-150,287-294` : vues `security_barrier`, prédicat `client_id`/rôle, `revoke ... from public, anon` et grant `authenticated` ; policies sous-jacentes `:95-133`. |
| H03-07 | RÉFUTÉ | — | — | EXÉCUTÉ — `supabase/17-confidentialite-couts-rls.sql:61-68,99-100` : le grant final `authenticated` est intentionnel, le corps refuse les rôles non propriétaire/labo et lie la recette à `v_client`. |
| H03-08 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — `supabase/23-controle-modules.sql:132-138` ; `string_to_array('', '|')` et `NULL` donnent `exists=false` : politiques restrictives fail-closed. |
| H03-09 | RÉFUTÉ | — | — | EXÉCUTÉ — `supabase/30-edition-vitrine-rpc.sql:38-61,77-85` : `search_path=''`, session/tenant vérifiés avant UPDATE, rôle limité à propriétaire/labo. |
| H03-10 | RÉFUTÉ | — | — | EXÉCUTÉ — `supabase/39-limites-tenant-restauration-sites-vitrine.sql:124-126,169-207` : `search_path=''`, identifiants de `format()` issus du catalogue système, `p_dump`/`p_client` passés par `USING`. |
| H03-11 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — `vendre_panier` : `prosecdef=true`, `search_path=""`, `anon=false`, `authenticated=true`, `service_role=true` ; `supabase/53-caisse-ticket-scope.sql:284`. |
| H03-12 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — `supabase/26-vitrine-publique.sql:130-150,196-197` : policies ALL/SELECT par `client_id`, index unique `(client_id, cle_vitrine)`. |
| H04-01 | CORRIGÉ | `patisgest-app/src/lib/vitrine-anti-abus.ts`, `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts`, `patisgest-app/.env.example`, `patisgest-app/tests/mocks/register-hooks.mjs` | `patisgest-app/tests/commande-vitrine-anti-abus.test.mjs` | EXÉCUTÉ — `src/lib/vitrine-anti-abus.ts:11-23`, `.../commander/actions.ts:64-73` : en production sans secret, refus avant tout RPC ; avant `1/3`, après `3/3`. |
| H04-02 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `src/lib/vitrine-anti-abus.ts:30-32` : première IP de `x-forwarded-for` ; le choix d'un en-tête réellement fiable dépend du proxy de déploiement, non vérifiable ici. |
| H04-03 | CORRIGÉ | `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts`, `patisgest-app/src/lib/vitrine-anti-abus.ts`, `patisgest-app/tests/mocks/register-hooks.mjs` | `patisgest-app/tests/commande-vitrine-anti-abus.test.mjs` | EXÉCUTÉ — `.../commander/actions.ts:81-89` : toute erreur de la RPC 38, y compris `PGRST202`/`42883`, refuse la commande ; avant `2` échecs, après `0`. |
| H04-04 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `.../commander/actions.ts:33,43-45,77-86`, `supabase/27-commandes-vitrine.sql:55-60,73-81` : le slug vient du FormData ; la RPC lie bien la boutique publiée, mais un slug tiers peut être soumis. Liaison signée au contexte de route différée. |
| H04-05 | RÉFUTÉ | — | — | EXÉCUTÉ — `supabase/27-commandes-vitrine.sql:105-118`, `supabase/26-vitrine-publique.sql:196-197`, `.../commander/actions.ts:60-62` : taille 8–64 bornée et unicité par `(client_id, cle_vitrine)` ; réutilisation d'une clé d'autrui non démontrée comme énumérable. |
| H04-06 | CORRIGÉ | `patisgest-app/supabase/54-anti-abus-vitrine-verrou.sql`, `patisgest-app/migrations/repetition.json`, `patisgest-app/tests/migrations-repetition.test.mjs`, `patisgest-app/tests/anti-abus-vitrine-db.test.mjs`, `patisgest-app/tests/caisse-ticket-scope-db.test.mjs`, `patisgest-app/tests/migrations-historique.mjs` | `patisgest-app/tests/anti-abus-vitrine-db.test.mjs` (H04-06) | EXÉCUTÉ (PGlite) — `supabase/54-...sql:61-69` verrou avant insert/comptage ; avant `7/8`, après `8/8`. Concurrence PostgreSQL/Supabase réelle : `[STATIQUE UNIQUEMENT]`. |
| H04-07 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — `supabase/38-anti-abus-vitrine-source.sql:46-88` : deux fonctions `anon` désormais, la seconde ne retourne que `void` et vérifie le site publié ; aucune colonne d'un autre tenant. |
| H04-08 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/domaines.ts:50-52,62-94`, `src/proxy.ts:25-38` : un Host `.vercel.app`/`.e2b.app` est classé application et ne déclenche aucune réécriture boutique ; l'accès aux données reste soumis à session. |
| H04-09 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/domaines.ts:112-125,150-171` ; toutes les routes `/api/*` non-health exigent session/secret : `src/app/api/export/route.ts:21-31`, `sauvegarde/route.ts:24-31`, `licence/statut/route.ts:10-19`, `presence/heartbeat/route.ts:15-18`, `cron/connectivite/route.ts:20-27`. |
| H04-10 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/app/api/health/route.ts:15-19`, `tests/api-health.test.mjs:15-45` : sonde sans DB, sans donnée de tenant et sans effet de bord ; le 200 est documenté comme « process vivant ». |
| H04-11 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — colonnes finales `vitrine_catalogue` = `cle_nom,nom,description,photo_vitrine,ordre_vitrine,etablissement,boutique,subdomain,custom_domain,prix_ht,tva,unite` ; `supabase/26-...sql:225-239` et migration 39 retirent `client_id`, aucun coût/marge. |
| H04-12 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/domaines.ts:35-41,83-91`, `tests/domaines.test.mjs:14-18,68-75` : port et point final normalisés, label unicode/sous-domaine imbriqué rejeté. |

### Limites et reports

- `DIFFÉRÉ` n'est pas un correctif : la ligne cite la preuve `fichier:ligne` et la raison
  du report (configuration d'exploitation, durcissement de session, observabilité,
  parité exhaustive de rôles SQL ou liaison signée du slug de vitrine).
- Les tests `EXÉCUTÉ` sont Node/PGlite. Les comportements suivants restent
  `[STATIQUE UNIQUEMENT]` : concurrence PostgreSQL/Supabase réelle, PostgREST/Auth réels,
  en-têtes de proxy de production, navigation navigateur/Playwright, secrets et état du
  projet pilote.
- Aucune migration déjà appliquée n'a été réécrite. La migration 54 est additive,
  enregistrée dans `migrations/repetition.json`, et la suite PGlite la rejoue.

---

## VAGUE 2 — calculs, états, concurrence et dates métier (`H05`…`H08`)

Périmètre : **47 hypothèses**, `H05-01`…`H08-11`. Cette vague couvre les tranches
d'audit 05 à 08, **pas** la VAGUE 2 fonctionnelle du roadmap (`B.6`, `B.5`, `B.7`).
Bilan : **6 CORRIGÉ**, **9 DIFFÉRÉ**, **32 RÉFUTÉ**. Aucune migration déjà
appliquée n'a été réécrite : les migrations 54 et 55 sont additives et enregistrées
dans `migrations/repetition.json`.

### Correctifs livrés

1. **H05-11** — `src/lib/actions-free-recipes.ts:92-109` : un prix de recette négatif
   ou non fini est refusé avant tout accès à la base ; `0` reste la sentinelle
   « prix non renseigné ». `tests/vague2-actions.test.mjs` : **0/2 avant**, **2/2 après**
   sur le couple H05-11 / H07-04.
2. **H07-04** — `src/lib/actions-caisse.ts:126-139` : le repli pré-21 `vendre_article`
   conserve `p_ticket` mais force « especes ». Tout autre mode est désormais refusé
   explicitement au lieu d'encaisser un faux tiroir ; le repli « especes » reste
   couvert par le même test de non-régression.
3. **H08-01 / H08-02 / H08-08** — 20 fichiers applicatifs remplacent
   `toISOString().slice(0, 10)` par `jourLocal()`, `plusJours()`, `dateIsoValide()`
   ou `dateMetierPasFuture()` depuis `src/lib/workspace-data.ts:20-38`. Les parsers
   exposent un paramètre `maintenant` injectable pour tester minuit UTC sans attendre.
   `tests/vague2-preuves.test.mjs` : **10/11 avant**, **11/11 après** sur la sonde
   dates + chaîne SQL.
4. **H08-03** — nouvelle migration **55** `supabase/55-dates-algiers-rattrapage.sql` :
   après 36, les migrations 41, 47 et 50 avaient réintroduit `current_date` dans
   `enregistrer_avoir` et `valider_tiroir_jour`. La migration reprend les définitions
   installées, remplace l'occurrence par `(now() at time zone 'Africa/Algiers')::date`,
   refuse toute vue publique résiduelle et porte `app_schema_version` à 55 avec `greatest`.
   SHA-256 du fichier : `7b65a87d079697f58a8082319e7f1bcc5672a9e6dfd3d103f9618c6bd453e4b3`.
   Restaurer le manifeste à HEAD fait échouer la sonde : **10/11 avant**, **11/11 après**.
5. **Chaîne de rejeu** — `migrations/repetition.json` contient 32 entrées
   `main_hors_serie` (`24`…`55`) ; `tests/migrations-repetition.test.mjs`,
   `tests/migrations-historique.mjs`, `tests/caisse-ticket-scope-db.test.mjs` et
   `tests/anti-abus-vitrine-db.test.mjs` acceptent désormais une version `>= 55`.
6. **H01-05 / H04-01 / H04-03 / H04-06** — les correctifs de la VAGUE 1 sont
   conservés dans le même arbre de travail et revalidés par la suite complète.

### Vérifications obligatoires de la vague

Chaîne exécutée après les correctifs, dans `patisgest-app` :

| Commande | Code | Fin de sortie brute |
|---|---:|---|
| `npm run typecheck` | 0 | `tsc --noEmit` sans erreur |
| `npm run lint` | 0 | `eslint .` sans erreur |
| `npm test` | 0 | `1..803`, `# tests 806`, `# pass 799`, `# fail 0`, `# skipped 3`, `# todo 4`, `# duration_ms 310826.800745` |
| `npm run build` | 0 | route list + `ƒ Proxy (Middleware)` |
| `npm audit --omit=dev --no-fund --audit-level=high` | 0 | `found 0 vulnerabilities` |

Logs : `/tmp/vague2_{typecheck,lint,test,build,audit}.log`, codes
`/tmp/vague2_codes.txt`. Tests ciblés : `tests/vague2-preuves.test.mjs` **11/11**,
`tests/vague2-actions.test.mjs` **2/2**. Preuve « échoue avant / passe après » :
`A=1/0` (`actions-free-recipes.ts` + `actions-caisse.ts`), `B=1/0`
(`journal-input.ts` + `stock-input.ts` + `actions-caisse.ts`), `C=1/0`
(`migrations/repetition.json`).

### Sonde PGlite VAGUE 2

`tests/vague2-preuves.test.mjs` rejoue la chaîne 01→55. La sonde utilise deux
shims explicites déjà présents dans les harnais de migration : une définition
minimale de `creer_of` avant 07 et l'ajout de `clotures.revision` avant 09. Elle
n'est donc pas une preuve de déploiement vierge sans ces shims.

Résultats observés : `0` fonction publique, `0` défaut de colonne et `0` vue
publique contenant `current_date` ; `enregistrer_avoir` et `valider_tiroir_jour`
contiennent `Africa/Algiers` ; `app_schema_version >= 55`. La sonde vérifie aussi
les définitions de `vendre_panier`, `patisgest_publier_vitrine`,
`patisgest_traiter_demande`, `maj_non_conformite`, `saisir_cloture`,
`patisgest_terminer_of_interne`, `bloquer_lot` et `rappel_lot`, ainsi que les
contraintes `sites_subdomain_unique` et `lots_reception_unique`. PGlite n'est pas
un déploiement Supabase/PostgreSQL réel.

### Tableau récapitulatif

| ID | Statut (CORRIGÉ / RÉFUTÉ / DIFFÉRÉ) | Fichiers modifiés | Test ajouté | Vérification (EXÉCUTÉ ou [STATIQUE UNIQUEMENT]) |
|---|---|---|---|---|
| H05-01 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `src/lib/pos-cart.ts:77,128-129,196-257` : `round4` ne reçoit que des quantités finies positives à 4 décimales ; 1000 valeurs et les bornes 0,0001 à 1e8 sont testées. |
| H05-02 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — qte 1e8 × prix 1e8 donne 10^16 des deux côtés ; `decimalExact` et `arrondirRatioPositif` restent en BigInt. |
| H05-03 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — `vendre_panier` installé contient `v_art.pv_ht <= 0` et non `v_art.pv_ht < 0` ; le client `pos-cart.ts:214` applique la même règle. |
| H05-04 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — 5 cas de demi-centime et de TVA 0, 9, 19 % concordent avec `round(numeric, 2)` ; `cake-money.ts:3-5` compense l'EPSILON relatif. |
| H05-05 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `export-comptable.ts:88-115` arrondit le montant positif avant d'appliquer `signe = -1` ; un avoir à 0,005 donne `-0.01` et non `-0`. |
| H05-06 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `fefo-cost.ts:118-125` arrondit chaque coût de ligne au centime avant somme ; `actions-couts.ts:237` et `actions-simulation.ts:86` ne somment que des centimes déjà arrondis. |
| H05-07 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `actions-simulation.ts:48-49` refuse 0, négatif, NaN, Infinity et > 1e8 avant `total / qte` à la ligne 96. |
| H05-08 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — panier de 3 lignes à 4 décimales : `computeCartTotals` et la somme de `round(numeric, 2)` ligne par ligne concordent au centime. |
| H05-09 | RÉFUTÉ | — | — | EXÉCUTÉ — `tests/actions-credits.test.mjs:115-139` refuse vide, 0, négatif, NaN, Infinity et acompte supérieur au total ; `tests/credits.test.mjs:75-87` couvre l'accumulation au centime. |
| H05-10 | DIFFÉRÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — divergence mesurée : `0.00005` est refusé par `isValidCartQty` mais `round(numeric, 4)` le rend `0.0001`. Le client est plus strict ; alignement explicite côté RPC différé, sans correctif produit. |
| H05-11 | CORRIGÉ | `patisgest-app/src/lib/actions-free-recipes.ts` | `patisgest-app/tests/vague2-actions.test.mjs` | EXÉCUTÉ — prix négatif ou non fini refusé avant `from()` ; `0` accepté comme sentinelle ; avant `0/2`, après `2/2` sur le fichier d'actions. |
| H05-12 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `ingredient-impact.ts:389-397` borne l'ancien prix et renvoie `variationPct = null` quand `ancienPu = 0` ; aucune division par zéro. |
| H06-01 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `patisgest-store.ts:492` et `supabase/09-journaux-ecritures.sql:363-412` inventoriés ; la parité exhaustive de toutes les transitions démo et SQL n'a pas été exécutée. |
| H06-02 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — `maj_non_conformite` normalise l'historique par `lower(nc.statut)` ; `supabase/09-journaux-ecritures.sql:15-18` accepte les quatre valeurs historiques sans bloquer la mise à jour. |
| H06-03 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — `terminer_of` verrouille l'OF par `for update` et refuse tout statut autre que `encours` ou `partiel` (`supabase/07-of-production.sql:368-379`). |
| H06-04 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — `supabase/07-of-production.sql:381-384` lève « Quantite superieure au reste a produire » avant création du lot ; la définition installée contient `p_qte > v_rest`. |
| H06-05 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `supabase/09-journaux-ecritures.sql:8-10` suppose `clotures.revision` déjà présente avec défaut 1 ; la sonde PGlite ajoute un shim avant 09. Le comportement des NULL dans l'index unique et l'état réel du pilote restent non prouvés. |
| H06-06 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — `saisir_cloture` contient `p_revise`, refuse une seconde clôture sans correction et incrémente `max(revision) + 1` (`supabase/21-prix-demain-panier.sql:996-1001,1049-1055`). |
| H06-07 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — `bloquer_lot` pose `bloque = true`, `rappel_lot` reste stable, et `vendre_panier` contient `not l.bloque` dans sa sélection FEFO. |
| H06-08 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `tomorrow-lab.ts:312` inventorié ; les demandes de réassort orphelines et l'annulation des effets de bord n'ont pas été rejouées. |
| H06-09 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `actions-clotures.ts:82-93` valide les deux montants finis et tronque la note à 250 ; `journal-input.ts:39-47` valide le calendrier et le jour métier injectable. |
| H06-10 | RÉFUTÉ | — | — | EXÉCUTÉ — `supabase/26-vitrine-publique.sql:175-189` ne remplace la contrainte que si `demande` manque, puis couvre `demande`, `devis`, `acompte`, `confirme`, `produit`, `livre`, `annule`. |
| H06-11 | RÉFUTÉ | — | — | EXÉCUTÉ — `src/lib/actions-cakes.ts:42-44` valide `nbParts` entier de 1 à 10000, prix et TVA ; `supabase/14-cake-edition-cgv-ticket.sql:60-64` répète la garde côté RPC. |
| H06-12 | RÉFUTÉ | — | — | EXÉCUTÉ — `actions-of.ts:54-61` distingue `duplicate: true` avec message « déjà enregistré » de la création ; `tests/of-queue.test.mjs:39-60` rejoue un double envoi sans second OF. |
| H07-01 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `migrations/repetition.json` contient bien 53, 54 et 55, et `tests/migrations-repetition.test.mjs` l'exige ; la version réellement installée sur le projet pilote et le commentaire « Non appliquée au pilote » de 53 ne sont pas vérifiables ici. |
| H07-02 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite) — `tests/caisse-ticket-scope-db.test.mjs:66-110` couvre rejeu strict, panier scindé équivalent, autre site, ticket import Z, contenu différent et mode différent ; 53 lève « Ticket deja utilise pour une autre vente ». |
| H07-03 | RÉFUTÉ | — | — | EXÉCUTÉ — `tests/sale-session.test.mjs:18-22` : `sameSaleReplay` refuse mode différent, lignes manquantes, doublons d'article et payload non tableau ; `actions-caisse.ts:153-179` exige une vente relue avant confirmation. |
| H07-04 | CORRIGÉ | `patisgest-app/src/lib/actions-caisse.ts` | `patisgest-app/tests/vague2-actions.test.mjs` | EXÉCUTÉ — `p_ticket` est conservé dans le repli ; un mode non `especes` est refusé sans appeler `vendre_article`, tandis que `especes` reste fonctionnel. |
| H07-05 | RÉFUTÉ | — | — | EXÉCUTÉ — `sameSaleSession` (`sale-session.ts:10-19`) ne sert qu'à détecter un ancien onglet ; `actions-caisse.ts:84-96` utilise `getSessionContext()` puis RLS et rôle comme vraie frontière. |
| H07-06 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | `[STATIQUE UNIQUEMENT]` — `patisgest_traiter_demande` verrouille la ligne cake par `for update` (`supabase/27-commandes-vitrine.sql:205-208`) ; deux dépôts PostgreSQL réellement concurrents ne sont pas exécutés. |
| H07-07 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite définitions) — `patisgest_enregistrer_fiche_vitrine` ne verrouille pas et `patisgest_publier_vitrine` verrouille ; l'ordre concurrent annoncé comme interblocage n'existe pas dans les définitions installées. |
| H07-08 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `client-ref.ts:9-12` privilégie `crypto.randomUUID()` mais conserve un repli horloge et `Math.random()` si l'API crypto est absente ; durcissement échoué-fermé différé. |
| H07-09 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite définitions) — `vendre_panier` contient `order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc`, `for update` et `not l.bloque` ; concurrence réelle non exécutée. |
| H07-10 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `supabase/16-creer-of-idempotent.sql:13-14,77-86` pose un index unique partiel et relit `client_ref`, mais sans `on conflict` ni verrou advisory ; même clé avec payload différent et concurrence réelle différés. |
| H07-11 | RÉFUTÉ | — | — | EXÉCUTÉ — `tests/sale-queue.test.mjs:117-133` sérialise trois onglets et conserve un ticket si l'écriture de retrait échoue ; `sale-queue.ts:201-225` refuse d'écrire une file invalide ou pleine. |
| H07-12 | RÉFUTÉ | — | — | EXÉCUTÉ — `ofs_client_ref_uniq` (`supabase/16-creer-of-idempotent.sql:13-14`) et `tests/of-queue.test.mjs:39-60` prouvent l'idempotence hors ligne ; `actions-of.ts:41-52` transmet la référence validée. |
| H08-01 | CORRIGÉ | 20 fichiers `src/lib` et `src/components` | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `jourLocal(2026-11-26T23:30:00Z) = 2026-11-27`; `journal-audit.ts`, `journal-input.ts`, `cloture-form.tsx` et les autres points de saisie utilisent la date d'Alger. |
| H08-02 | CORRIGÉ | `patisgest-app/src/lib/actions-caisse.ts`, `patisgest-app/src/components/z-import-form.tsx` | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `dateMetierPasFuture` remplace la comparaison UTC de `importZReal`; une date Z du 27 est acceptée à 23 h 30 UTC et celle du 28 refusée. |
| H08-03 | CORRIGÉ | `patisgest-app/supabase/55-dates-algiers-rattrapage.sql`, `patisgest-app/migrations/repetition.json`, 4 tests de chaîne | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — après 01→55 : 0 fonction, 0 défaut, 0 vue avec `current_date`; `enregistrer_avoir` et `valider_tiroir_jour` utilisent Africa/Algiers; version `>= 55`. |
| H08-04 | RÉFUTÉ | — | — | EXÉCUTÉ (PGlite sur chaîne) — `supabase/11-import-z.sql:8-24` : `client_id` et `site_id` NOT NULL avec FK, `date_z` NOT NULL, `lignes`, `total_ht` et `total_ttc` NOT NULL, `vente_id` nullable avec `on delete set null`, RLS activée. |
| H08-05 | DIFFÉRÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — deux `cle_vitrine = NULL` coexistent, comme le permet l'index partiel de 26. Plusieurs brouillons non publiés sont acceptés ; une contrainte sur les brouillons différée, pas de fuite de tenant observée. |
| H08-06 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — `lower(subdomain)` unique globalement, index partiel sur les valeurs non NULL; une réattribution à un autre client est rejetée par `duplicate key`. |
| H08-07 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ (PGlite) — `lots_reception_unique` couvre `client_id`, `article_id`, `site_id`, `numero`, avec exclusion intentionnelle des miroirs `ref like 'TR-%'`; un doublon direct est rejeté. |
| H08-08 | CORRIGÉ | `patisgest-app/src/lib/stock-input.ts`, `patisgest-app/src/components/of-forms.tsx`, `patisgest-app/src/components/commande-forms.tsx` | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — DLC et date prévue comparent au jour d'Alger; `parseOfFinishInput` accepte le 27 à 23 h 30 UTC et refuse le 26. |
| H08-09 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `patisgest-store.ts:407` parse `AAAA-MM-JJ` comme UTC par spécification; `dateIsoValide` et `plusJours` couvrent 2024-02-29, 1969-12-31, 2026-02-30 et 2026-12-31 vers 2027-01-01. |
| H08-10 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `supabase/02-seed-pilote.sql:19-30` cible `auth.users` et reste exclue de la chaîne rejouable; aucun Supabase Auth réel ni schéma `auth` complet n'a été exécuté. |
| H08-11 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `csv.ts:134-142` valide avec `T00:00:00Z`, sans heure locale; année bissextile et date avant 1970 acceptées, 2026-02-30 refusée. |

### Limites et reports

- Les 9 lignes `DIFFÉRÉ` ne sont pas des correctifs : parité exhaustive démo/SQL,
  shim `clotures.revision`, réassort orphelin, alignement des décimales client/SQL,
  état réel du pilote, repli `client-ref` sans crypto, concurrence `creer_of`,
  contrainte des brouillons `cle_vitrine` NULL et seed `auth.users`.
- `EXÉCUTÉ` signifie Node, tests mockés ou PGlite. Restent `[STATIQUE UNIQUEMENT]` :
  PostgreSQL/Supabase réels, PostgREST, Auth, concurrence réelle, navigateur,
  Playwright, mobile 360 px, secrets de production, état de la base pilote,
  staging et CI distante.
- Aucun rapport MODE B `audit/rapports/SXX.md` n'est créé par cette vague : ces
  rapports appartiennent aux prompts `audit/01`…`audit/20`, pas au plan de
  remédiation appliqué.
- Le garde-fou applicatif `src/lib/schema-version.ts:7` exige toujours un schéma
  minimal 37; la sonde PGlite vérifie désormais `>= 55` après rejeu, sans
  transformer 37 en plafond.

---

## VAGUE 3 — contrats, état client, PWA, fichiers et médias (`H09`…`H12`)

Périmètre : **46 hypothèses**, `H09-01`…`H12-12`. Cette vague couvre les tranches
d'audit 09 à 12, **pas** la VAGUE 3 fonctionnelle du roadmap (`B.1`, `B.3`).
Bilan : **10 CORRIGÉ**, **12 DIFFÉRÉ**, **24 RÉFUTÉ**. Le point de départ est le
commit `7e6f474` ; le HEAD local a été réaligné sur l'origine sans écraser les
modifications de cette vague. Aucun fichier SQL de migration déjà appliqué n'a été
réécrit et aucune migration 56 n'a été ajoutée : les correctifs restent dans le
code applicatif et dans les tests.

### Correctifs livrés

1. **H09-01 / H09-02 / H09-03** — `src/lib/pagination.ts` : une page courte ne
   conclut plus « fin de collection » sans sonde à l'offset suivant ; une page
   qui dépasse la taille demandée, une sonde de plusieurs lignes, `data:null` ou
   `error` sont refusés. `src/app/api/export/comptable/route.ts` applique la même
   pagination sûre aux avoirs : 20 001 avoirs donnent 413 et une lecture en
   erreur ne produit aucun CSV. `tests/vague3-contrats.test.mjs` et
   `tests/vague3-exports.test.mjs` exécutent ces chemins.
2. **H09-09** — `src/lib/workspace-data.ts` expose `dateCommandeVitrineValide()` ;
   `src/app/(vitrine)/vitrine/[slug]/commander/actions.ts` refuse une date
   impossible, passée ou au-delà d'un an avant tout RPC, avec le jour métier
   d'Alger. `tests/commande-vitrine-anti-abus.test.mjs` et
   `tests/vague3-contrats.test.mjs` couvrent minuit UTC et `2026-02-30`.
3. **H10-06 / H11-09 / H11-12** — `src/lib/sale-queue.ts` publie la
   reconnaissance des clés `v1`/`v2` ; `src/lib/file-attente-cloture.ts` compte
   la file active `patisgest.saleQueue.v2.<identité JSON>`, signale toute clé
   `v2` inconnue et expose un snapshot stable pour `useSyncExternalStore`.
   `network-status-pill.tsx`, `cash-closing-quick.tsx` et `cloture-form.tsx`
   utilisent ce snapshot partagé et bloquent aussi une file illisible.
   `tests/file-attente-cloture.test.mjs` et `tests/cloture-file-attente.test.mjs`
   prouvent le comptage et la stabilité.
4. **H12-02** — `src/lib/csv.ts` double l'apostrophe initiale d'une valeur qui
   en possédait déjà une : `=1+1` et `'=1+1` ne produisent plus la même cellule.
   `tests/csv.test.mjs` verrouille l'injectivité, y compris avec guillemets RFC.
5. **H12-04 / H12-05 / H12-06** — `src/lib/recipe-photo.ts` vérifie le base64
   canonique et les octets magiques JPEG, PNG ou WebP ; `src/lib/actions-photos.ts`
   applique la même borne **côté serveur** avant le RPC ; `pastry-visuals.ts`,
   `product-photo-picker.tsx` et `sale-composer.tsx` ne rendent ni n'écrivent une
   valeur locale non vérifiée. `tests/vague3-photos-serveur.test.mjs` exécute la
   frontière serveur et le stockage local ; `tests/apparence-licence-photos.test.mjs`
   couvre les faux JPEG.
6. **H12-11** — `src/app/api/export/comptable/route.ts` remplace le
   `.limit(20000)` des avoirs par `lirePages` et conserve les codes 413, 409 et
   500 sans fichier partiel. `tests/vague3-exports.test.mjs` exécute les cinq
   issues de la route avec un faux client Supabase explicite.
7. **H10-11** — `src/components/coquille-hors-ligne.tsx` remplace le cast
   `null as unknown as boolean` par un snapshot serveur `false` de même type.
   C'est une correction de type, **pas** une preuve d'hydratation navigateur :
   l'hypothèse reste `DIFFÉRÉ`.
8. **Harnais de test** — `tests/mocks/next-stubs.mjs` rend `NextResponse`
   constructible afin que les routes CSV soient réellement appelées dans Node.
   Ce fichier n'est pas du code produit.

### Vérifications obligatoires de la vague

Chaîne exécutée après les correctifs, dans `patisgest-app` :

| Commande | Code | Fin de sortie brute |
|---|---:|---|
| `npm run typecheck` | 0 | `tsc --noEmit` sans erreur |
| `npm run lint` | 0 | `eslint .` sans erreur |
| `npm test` | 0 | `1..843`, `# tests 846`, `# pass 839`, `# fail 0`, `# skipped 3`, `# todo 4`, `# duration_ms 272436.246151` |
| `npm run build` | 0 | route list jusqu'à `ƒ /vitrine/[slug]`, `ƒ Proxy (Middleware)` |
| `npm audit --omit=dev --no-fund --audit-level=high` | 0 | `found 0 vulnerabilities` |

Logs : `/tmp/v3_{typecheck,lint,test,build,audit}.log`, codes `/tmp/v3-codes.txt`.
Tests ciblés : **77/77** sur les dix fichiers de la vague (`/tmp/v3-focused5.log`).
Le fichier ignoré `tsconfig.tsbuildinfo` généré par `tsc` a été supprimé.

### Preuves « échoue avant / passe après »

Six sondes restaurent temporairement les fichiers produit de `HEAD`, exécutent les
tests ciblés, puis restaurent les fichiers courants **octet pour octet**. Chaque
sonde exige `AVANT rc != 0` et `APRÈS rc = 0` ; `git status --porcelain` est
identique avant et après (`STATUT_FINAL_IDENTIQUE True`). Résumé brut dans
`/tmp/v3-probes-summary.log` :

| Sonde | Fichiers remis à HEAD | Tests | Avant | Après |
|---|---|---|---|---|
| A | `pagination.ts`, `export/comptable/route.ts` | contrats + exports | `rc=1`, `14/20` | `rc=0`, `20/20` |
| B | `csv.ts` | `csv.test.mjs` | `rc=1`, `13/14` | `rc=0`, `14/14` |
| C | `commander/actions.ts`, `workspace-data.ts` | anti-abus + contrats | `rc=1`, `3/5` (import absent) | `rc=0`, `15/15` |
| D | `recipe-photo.ts`, `pastry-visuals.ts`, `actions-photos.ts`, `product-photo-picker.tsx`, `sale-composer.tsx` | apparence + photos serveur | `rc=1`, `4/12` | `rc=0`, `12/12` |
| E | `sale-queue.ts`, `file-attente-cloture.ts`, `network-status-pill.tsx`, `cash-closing-quick.tsx`, `cloture-form.tsx` | file + clôture + état client | `rc=1`, `9/12` | `rc=0`, `18/18` |
| F | `coquille-hors-ligne.tsx` | état client | `rc=1`, `6/7` | `rc=0`, `7/7` |

La sonde F ne prouve qu'une correction de source : aucun navigateur n'a été
lancé. Les sondes A, B, C, D et E portent sur des fonctions ou routes réellement
exécutées par Node.

### Tableau récapitulatif

| ID | Statut (CORRIGÉ / RÉFUTÉ / DIFFÉRÉ) | Fichiers modifiés | Test ajouté | Vérification (EXÉCUTÉ ou [STATIQUE UNIQUEMENT]) |
|---|---|---|---|---|
| H09-01 | CORRIGÉ | `patisgest-app/src/lib/pagination.ts`, `patisgest-app/src/app/api/export/comptable/route.ts` | `patisgest-app/tests/vague3-contrats.test.mjs`, `patisgest-app/tests/vague3-exports.test.mjs` | EXÉCUTÉ — page courte suivie d'une ligne cachée, page surdimensionnée et 20 001 lignes refusées sans CSV ; sonde A `14/20` avant, `20/20` après. |
| H09-02 | RÉFUTÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — `range(offset, offset + limite - 1)` est déjà inclusif dans les deux routes ; un lecteur qui renvoie `limite + 1` lignes est désormais détecté par la garde supplémentaire. |
| H09-03 | RÉFUTÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — la sonde à `limiteTotale` ne relit pas une ligne incluse ; `raison` distingue `limite` de `lecture` et `messageUtilisateur` reste la normalisation des erreurs. |
| H09-04 | RÉFUTÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — `parseZCsv` applique 50 000 caractères et 100 lignes ; `actions-caisse.ts:258` appelle le même parseur avant `importer_z`. |
| H09-05 | RÉFUTÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — `parseClosingInput` ne copie que les six flux autorisés ; un champ `line0_injecte` ajouté au FormData n'apparaît pas dans la ligne. La propagation SQL est lue dans `21-prix-demain-panier.sql`, sans PGlite dédié. |
| H09-06 | RÉFUTÉ | — | `patisgest-app/tests/vague3-exports.test.mjs` | EXÉCUTÉ — une erreur de lecture des ventes donne 500 et aucun corps CSV ; le cast de `ventesLecture.lignes` est une assertion de type, pas une affectation de masse. |
| H09-07 | RÉFUTÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — `actions-cakes.ts:42` contient déjà `Number.isInteger(nbParts)` et les bornes 1 à 10 000 ; `14-cake-edition-cgv-ticket.sql` et `27-commandes-vitrine.sql` répètent la garde. |
| H09-08 | RÉFUTÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — `actions-credits.ts:101` applique `slice(0, 140)` avant l'insertion ; `46-credits-clients.sql:9` contrôle `char_length(trim(nom_debiteur)) between 1 and 140`. |
| H09-09 | CORRIGÉ | `patisgest-app/src/lib/workspace-data.ts`, `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts` | `patisgest-app/tests/commande-vitrine-anti-abus.test.mjs`, `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — `2026-02-30`, une date passée et `jourLocal() + 366` sont refusés avant tout RPC ; sonde C `3/5` avant, `15/15` après. |
| H09-10 | RÉFUTÉ | — | `patisgest-app/tests/erreurs-db.test.mjs` | EXÉCUTÉ — seul `P0001` renvoie le message métier épuré ; `XX999` et les contraintes techniques sont remplacés par un message générique, sans SQLSTATE brut. |
| H09-11 | RÉFUTÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — `parseTransferInput` valide les deux UUID, refuse deux sites identiques ; `tests/transfert-client-ref-db.test.mjs` et `08-transferts.sql` couvrent le rattachement au même client côté RPC. |
| H10-01 | DIFFÉRÉ | — | `patisgest-app/tests/vague3-etat-client.test.mjs` | `[STATIQUE UNIQUEMENT]` — `initialBundle` ne contient que `token`, `publicJwk` et `payload`, aucune clé privée ; le bundle réel livré au navigateur n'a pas été inspecté. |
| H10-02 | RÉFUTÉ | — | `patisgest-app/tests/trial-lock.test.mjs` | EXÉCUTÉ — `getSessionContextDetaille` renvoie `ctx:null` et `raison:"essai-verrouille"` ; le masquage UI n'est pas la seule barrière. |
| H10-03 | DIFFÉRÉ | — | `patisgest-app/tests/vague3-etat-client.test.mjs` | `[STATIQUE UNIQUEMENT]` — `demo-workspace.tsx` protège `JSON.parse` par `try/catch` et passe par `upgradeState`, mais la course de deux onglets et l'absence de versionnage n'ont pas été rejouées dans un navigateur. |
| H10-04 | RÉFUTÉ | — | `patisgest-app/tests/catalogue-hors-ligne.test.mjs` | EXÉCUTÉ — `cataloguePourIdentite` refuse `autre-compte`, `sans-identite`, `perime` et `illisible` avant tout rendu ; la coquille appelle cette fonction, pas le snapshot brut. |
| H10-05 | DIFFÉRÉ | — | `patisgest-app/tests/catalogue-hors-ligne.test.mjs` | `[STATIQUE UNIQUEMENT]` — `getCatalogueSnapshot()` garde un cache module-level et n'est importé par aucun composant ; aucune fuite de compte n'est donc observable dans l'UI exécutée. Le test ajouté verrouille le refus `autre-compte` après échec d'écriture de l'identité. |
| H10-06 | CORRIGÉ | `patisgest-app/src/components/network-status-pill.tsx`, `patisgest-app/src/lib/file-attente-cloture.ts` | `patisgest-app/tests/file-attente-cloture.test.mjs`, `patisgest-app/tests/vague3-etat-client.test.mjs` | EXÉCUTÉ — snapshot stable, file corrompue signalée et non confondue avec zéro, clés `v2` comptées ; sonde E `9/12` avant, `18/18` après. |
| H10-07 | DIFFÉRÉ | — | `patisgest-app/tests/service-worker-securite.test.mjs` | `[STATIQUE UNIQUEMENT]` — `if (!majPrete) return null` garde le rechargement, mais aucun cycle réel `SKIP_WAITING` puis `reload` n'a été exécuté. |
| H10-08 | DIFFÉRÉ | — | `patisgest-app/tests/vague3-etat-client.test.mjs` | `[STATIQUE UNIQUEMENT]` — `cache:"no-store"` et le retour anticipé hors ligne sont inventoriés ; la race de navigation et le polling réseau réel restent non exécutés. |
| H10-09 | RÉFUTÉ | — | `patisgest-app/tests/vague3-etat-client.test.mjs` | `[STATIQUE UNIQUEMENT]` — en mode cloud, `setCloudCredits` n'est appelée qu'après `res.ok && res.entry` ; aucun rendu React concurrent n'a été exécuté. |
| H10-10 | RÉFUTÉ | — | `patisgest-app/tests/vague3-etat-client.test.mjs` | EXÉCUTÉ (définitions SQL) — `cake_options_production` ne renvoie aucun champ de coût ; `[module]/page.tsx` transmet `peutVoir={canReadCosts(ctx.role)}` et `liste-courses-panel.tsx` retourne `null` sans droit. |
| H10-11 | DIFFÉRÉ | `patisgest-app/src/components/coquille-hors-ligne.tsx` | `patisgest-app/tests/vague3-etat-client.test.mjs` | `[STATIQUE UNIQUEMENT]` — le cast serveur est remplacé par `false` ; sonde F `6/7` avant, `7/7` après. L'effet d'hydratation réel reste non prouvé sans navigateur. |
| H11-01 | DIFFÉRÉ | — | `patisgest-app/tests/service-worker-securite.test.mjs` | `[STATIQUE UNIQUEMENT]` — `sw.js` n'intercepte que les GET ; aucun POST ni Server Action réel n'a été rejoué pour prouver que la file est le seul mécanisme de reprise. |
| H11-02 | RÉFUTÉ | — | `patisgest-app/tests/service-worker-securite.test.mjs` | `[STATIQUE UNIQUEMENT]` — navigation authentifiée, RSC et API sont exclus des caches ; seule `/hors-ligne` est mise en cache, sans donnée de compte. |
| H11-03 | RÉFUTÉ | — | `patisgest-app/tests/service-worker-securite.test.mjs` | `[STATIQUE UNIQUEMENT]` — `contenuAssetValide` refuse `response.redirected`, exige `response.type === "basic"` et compare l'extension au Content-Type ; un PNG servi en `text/html` n'entre pas dans le cache. |
| H11-04 | DIFFÉRÉ | — | `patisgest-app/tests/service-worker-securite.test.mjs` | `[STATIQUE UNIQUEMENT]` — la purge des caches `patisgest-*` à l'activation est inventoriée ; l'usage concurrent par un autre onglet ou un autre compte n'a pas été exécuté. |
| H11-05 | RÉFUTÉ | — | `patisgest-app/tests/sale-queue.test.mjs` | EXÉCUTÉ — à 200 tickets, `enqueueSale` lève « File pleine » et la file reste intacte ; aucune perte silencieuse ni écrasement. |
| H11-06 | DIFFÉRÉ | — | `patisgest-app/tests/catalogue-hors-ligne.test.mjs` | `[STATIQUE UNIQUEMENT]` — `ageCatalogue` utilise l'horloge client ; un cache de 14 jours est refusé avec `ageJours`, mais aucune horloge déréglée n'a été comparée à un serveur réel. |
| H11-07 | DIFFÉRÉ | — | `patisgest-app/tests/catalogue-hors-ligne.test.mjs` | `[STATIQUE UNIQUEMENT]` — l'échec d'`enregistrerIdentite` est avalé sans signal UI ; `cataloguePourIdentite` échoue fermé, mais l'absence d'avertissement utilisateur reste non testée dans un navigateur. |
| H11-08 | DIFFÉRÉ | — | `patisgest-app/tests/of-queue.test.mjs` | `[STATIQUE UNIQUEMENT]` — `slice(-MAX)` garde les 100 derniers OF et le test existant l'attend ; deux onglets réellement concurrents et l'absence de verrou inter-onglets restent non exécutés. |
| H11-09 | CORRIGÉ | `patisgest-app/src/lib/file-attente-cloture.ts`, `patisgest-app/src/lib/sale-queue.ts` | `patisgest-app/tests/file-attente-cloture.test.mjs` | EXÉCUTÉ — JSON corrompu, contenu non tableau, clé `v2` inconnue et stockage inaccessible donnent `illisible:true` ; le message combine tickets et illisible. |
| H11-10 | RÉFUTÉ | — | `patisgest-app/tests/vague2-preuves.test.mjs` | EXÉCUTÉ — `today` du tableau de bord est calculé avec `Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" })` puis passé en prop ; la clé locale n'est pas recalculée en UTC dans le composant. |
| H11-11 | RÉFUTÉ | — | `patisgest-app/tests/vague3-etat-client.test.mjs` | EXÉCUTÉ — `manifest()` renvoie `start_url:"/"`, `scope:"/"`, `display:"standalone"` et deux raccourcis ; aucune donnée de tenant n'apparaît dans le JSON. |
| H11-12 | CORRIGÉ | `patisgest-app/src/lib/sale-queue.ts`, `patisgest-app/src/lib/file-attente-cloture.ts` | `patisgest-app/tests/file-attente-cloture.test.mjs` | EXÉCUTÉ — `scopedQueueKey` et `categorieCleFileVente` partagent les préfixes `v1`/`v2` ; une clé `patisgest.saleQueue.v2.old` est signalée illisible au lieu d'être ignorée. |
| H12-01 | RÉFUTÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs`, `patisgest-app/tests/csv.test.mjs` | EXÉCUTÉ — U+200B, U+202E, U+2066 à U+2069, U+FEFF, tabulation et CR avant une formule sont neutralisés ; plusieurs invisibles consécutifs restent couverts. |
| H12-02 | CORRIGÉ | `patisgest-app/src/lib/csv.ts` | `patisgest-app/tests/csv.test.mjs` | EXÉCUTÉ — `cellule("=1+1")` et `cellule("'=1+1")` diffèrent ; sonde B `13/14` avant, `14/14` après. |
| H12-03 | RÉFUTÉ | — | `patisgest-app/tests/vague3-exports.test.mjs` | EXÉCUTÉ — les octets `EF BB BF`, le séparateur `;`, `Content-Disposition`, `Cache-Control:no-store` et les en-têtes triées sont vérifiés sur une vraie `Response` de route. |
| H12-04 | CORRIGÉ | `patisgest-app/src/lib/recipe-photo.ts` | `patisgest-app/tests/apparence-licence-photos.test.mjs`, `patisgest-app/tests/vague3-photos-serveur.test.mjs` | EXÉCUTÉ — base64 `AAAA…` refusé malgré le préfixe JPEG ; octets magiques JPEG, PNG et WebP acceptés ; sonde D `4/12` avant, `12/12` après. |
| H12-05 | CORRIGÉ | `patisgest-app/src/lib/actions-photos.ts` | `patisgest-app/tests/vague3-photos-serveur.test.mjs` | EXÉCUTÉ — faux JPEG, SVG, URL externe, charge de 230 000 octets et UUID invalide sont refusés avant `createClient()` ; un JPEG réel et la suppression `null` appellent le RPC. |
| H12-06 | CORRIGÉ | `patisgest-app/src/lib/pastry-visuals.ts`, `patisgest-app/src/components/product-photo-picker.tsx`, `patisgest-app/src/components/sale-composer.tsx` | `patisgest-app/tests/vague3-photos-serveur.test.mjs` | EXÉCUTÉ — snapshot local écartant les valeurs non image, sauvegarde locale refusant une charge invalide, et chaîne composant vers serveur lue explicitement `[STATIQUE UNIQUEMENT]`. |
| H12-07 | RÉFUTÉ | — | `patisgest-app/tests/coffre-sauvegarde.test.mjs` | EXÉCUTÉ — scrypt, AAD sur l'en-tête, tag AES-256-GCM et `MAX_DATA_SIZE` sont couverts par les tests existants du coffre. |
| H12-08 | RÉFUTÉ | — | `patisgest-app/tests/coffre-sauvegarde.test.mjs` | EXÉCUTÉ — roundtrip, refus de sortie préexistante, corruption, troncature, absence de fichier partiel, mode 0600 et nettoyage sont couverts. |
| H12-09 | DIFFÉRÉ | — | — | `[STATIQUE UNIQUEMENT]` — `52-recettes-photos.sql` impose `char_length(photo_url) <= 300000` et `45-recettes-libres.sql` active RLS avec `client_id = patisgest_mon_client()` ; aucune contrainte de format DB n'est ajoutée, le format est validé par le code exécuté. Aucune nouvelle sonde PGlite dédiée n'a été lancée. |
| H12-10 | RÉFUTÉ | — | `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — avec `Date.now()` figé, trois lignes de facture obtiennent trois identifiants distincts grâce à `parsed.length` ; aucune collision interne ni déduplication exécutée. |
| H12-11 | CORRIGÉ | `patisgest-app/src/app/api/export/comptable/route.ts` | `patisgest-app/tests/vague3-exports.test.mjs` | EXÉCUTÉ — 200, 409, 413, 500 et lecture courte des avoirs sont exercés ; 20 001 avoirs ne livrent aucun fichier partiel ; sonde A `14/20` avant, `20/20` après. |
| H12-12 | RÉFUTÉ | — | `patisgest-app/tests/csv.test.mjs`, `patisgest-app/tests/vague3-contrats.test.mjs` | EXÉCUTÉ — `Date` sort en ISO, `1234.5` en `1234,5`, sans séparateur de milliers ; BOM et CRLF sont couverts. |

### Limites et reports

- Les 12 lignes `DIFFÉRÉ` ne sont pas des correctifs démontrés : bundle navigateur,
  course de deux onglets, cache module-level inutilisé, cycle de rechargement du
  service worker, heartbeat réel, hydratation, reprise POST hors ligne, purge de
  cache concurrente, horloge client, signal UI d'identité, concurrence de la file
  OF et contrainte de format DB. La correction de type H10-11 est explicitement
  maintenue `DIFFÉRÉ`.
- `EXÉCUTÉ` signifie Node, routes appelées avec un faux client Supabase, modules
  purs ou harnais PGlite existants. Restent `[STATIQUE UNIQUEMENT]` : PostgreSQL,
  Supabase, PostgREST et Auth réels, concurrence réelle, navigateur, Playwright,
  mobile 360 px, secrets de production, état de la base pilote, staging et CI
  distante. Les applications connectées n'ont pas été appelées.
- Aucun rapport MODE B `audit/rapports/S09.md`…`S12.md` n'est créé : ces rapports
  appartiennent aux prompts `audit/09`…`audit/12`, pas au plan de remédiation
  appliqué. Aucune pull request n'est ouverte par cette vague.
- Aucune migration SQL n'est ajoutée ni réécrite ; `app_schema_version` reste à 55.
  Le harnais `next-stubs.mjs` est la seule modification de test rendant les routes
  CSV constructibles, sans changement du contrat produit.
