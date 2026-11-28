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


## VAGUE 4 — fiabilité runtime, erreurs et performance applicative (`H13`…`H14`)

Périmètre : **21 hypothèses**, `H13-01`…`H14-10`. Bilan : **6 CORRIGÉ / 4 RÉFUTÉ / 11 DIFFÉRÉ**.

### Chaîne de vérification après correctifs

| Commande | Code | Résultat brut |
|---|---:|---|
| `npm run typecheck` | 0 | tsc --noEmit sans erreur |
| `npm run lint` | 0 | eslint . sans erreur |
| `npm test` | 0 | 1..871 ; # tests 874 ; # pass 868 ; # fail 0 ; # skipped 3 ; # todo 3 ; # duration_ms 276244.836011 |
| `npm run build` | 0 | Compiled successfully in 365ms ; 6/6 static pages ; ƒ Proxy (Middleware) |
| `npm audit --omit=dev` | 0 | found 0 vulnerabilities |
| `git diff --check` | 0 | aucune erreur d’espacement |

Chaîne exécutée dans `patisgest-app` : tous les codes sont `0`. `git diff --check` est également à `0`.


### Sondes « échoue avant / passe après »

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

Les huit sondes remettent temporairement les fichiers indiqués à `14ae7c0`, relancent le test ciblé, restaurent le contenu courant **octet pour octet**, puis relancent une troisième fois le même test. `tous_restaures=True`, `tous_apres_rc0=True`, `tous_avant_non_conformes=True`. La sonde H passe d’un `todo` inerte à deux tests actifs.


### Tableau récapitulatif VAGUE 4

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

## VAGUE 5 — base, scalabilité, architecture et maintenabilité (`H15`…`H16`)

Périmètre : **22 hypothèses**, `H15-01`…`H16-12`. Bilan : **2 CORRIGÉ / 7 RÉFUTÉ / 13 DIFFÉRÉ**. La sonde C couvre H15-07 et la sonde F couvre H16-10.


### Tableau récapitulatif VAGUE 5

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

## REST — build, CI, migrations, observabilité et méta-audit (`H17`…`H20`)

Périmètre : **48 hypothèses**, `H17-01`…`H20-12`. Bilan : **7 CORRIGÉ / 26 RÉFUTÉ / 15 DIFFÉRÉ**. Les sondes D, E, G et H couvrent les correctifs de cette section.


### Tableau récapitulatif REST

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

### Bilan global et limites

| Statut | VAGUE 4 | VAGUE 5 | REST | Total |
|---|---:|---:|---:|---:|
| CORRIGÉ | 6 | 2 | 7 | **15** |
| RÉFUTÉ | 4 | 7 | 26 | **37** |
| DIFFÉRÉ | 11 | 13 | 15 | **39** |
| Total | 21 | 22 | 48 | **91** |

- Les 39 `DIFFÉRÉ` ne sont pas des correctifs démontrés : benchmark 100 000 lignes,
  FCP/mobile 360 px, navigateur/Playwright, concurrence PostgreSQL réelle, profilage
  React, anonymisation RGPD complète, brute force/rate limiting, heartbeat de cron,
  CI distante, E2E `workflow_dispatch`, rollback à chaud et dérives documentaires
  exhaustives restent ouverts.
- Aucun `SXX.md` n’est créé : ces rapports appartiennent aux prompts MODE B
  `audit/13`…`audit/20`, pas au plan de remédiation appliqué.
- Aucune migration SQL n’est ajoutée ni réécrite ; `app_schema_version` du dépôt
  reste à 55. Le projet Supabase réel lu en lecture seule est à `schema_version 53` :
  **SQL 54/55 n’ont pas été appliqués** au pilote ni à la production.
- Connecteurs Figma, Google Drive, Supabase et Vercel utilisés en lecture seule pour
  le cadrage ; aucune valeur secrète lue ni répétée, aucun déploiement, aucune PR.
- Le seul changement externe prévu est l’upload de `audit/RAPPORT-H13-H20.md`
  dans le dossier Drive `rapport-patisgest` (`10IZw_nja02RJO9r-L7DWE8mtwFMUUk9t`).
