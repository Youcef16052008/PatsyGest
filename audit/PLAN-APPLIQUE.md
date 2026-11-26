# PLAN-APPLIQUE.md — exécution du plan de remédiation

> Branche `arena/923a4433-patsygest`, base `da5857d`. Les 231 pistes `H01-01`…`H20-12`
> sont traitées comme des **hypothèses** : aucune modification produit n'est faite
> sans preuve directe dans le code exécutable. README, commentaires et noms de tests
> ne sont pas des preuves de comportement.
>
> **Portée des vagues** : les `VAGUE 1`/`VAGUE 2` de ce fichier sont les vagues
> d'hypothèses de remédiation (`H01`…`H04`, puis `H05`…`H08`). Elles ne doivent
> pas être confondues avec les `VAGUE 1`…`VAGUE 4` fonctionnelles du
> `PLAN-AMELIORATION-PATISGEST.md` (`A.1`…`A.6`, `B.5`…`B.7`, etc.). Les
> fonctionnalités produit de la VAGUE 2 du roadmap ne sont pas implémentées ici.

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
