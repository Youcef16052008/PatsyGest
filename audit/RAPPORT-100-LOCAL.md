# Rapport — 100 % du périmètre local réalisable

**Date** : 2026-11-27  
**Branche** : `arena/923a4433-patsygest`  
**Décision utilisateur** : `scope_100 = local_full`, `pr_final = keep_open`  
**PR** : #26 ouverte vers `main`, non fusionnée

## 1. Ce que signifie « 100 % » ici

La demande « termine tout le rest 100% » a été explicitement bornée à
**100 % du périmètre local réalisable** : B.2 complète, tests, garde-fous,
benchmarks PGlite et documentation. Les opérations qui exigent OCR,
déploiement, secrets/env, CI distante, base Supabase/Auth/PostgREST/Storage
réelle, concurrence PostgreSQL réelle, rollback à chaud ou décision
produit/juridique restent **documentées comme limites**, jamais présentées
comme « CORRIGÉ ». Les rapports historiques `audit/PLAN-APPLIQUE.md` et
`audit/RAPPORT-H13-H20.md` ne sont pas réécrits.

Bilan des 39 `DIFFÉRÉ` H13-H20 : **22 fermés localement**, **17 limites externes explicitement documentées**.

## 2. B.2 — couverture FR/AR exhaustive locale

- Catalogue FR statique : `src/lib/ui-catalog-fr.json` (**2 779** chaînes).
- Dictionnaire généré hors ligne : `src/lib/ui-text-ar-complet.ts` (**2 358** entrées) ; noyau validé prioritaire conservé dans `src/lib/i18n.ts` ; `UI_TEXT_AR` fusionné (**2 747** entrées).
- Génération hors ligne uniquement : modèles Argos/LibreTranslate `fr→en` et `en→ar` installés dans `/tmp`, lexique ArabTerm CC BY 4.0, **aucun appel réseau à l’exécution**. Les traductions techniques bruitées ont été écartées ou corrigées manuellement ; les noms propres et données de démo sont isolés dans `src/lib/i18n-data.ts`.
- `locale-provider.tsx` : `estDejaArabe()` ne considère comme déjà traduit qu’un texte sans lettre latine ; les chaînes mixtes AR + donnée FR sont désormais traduites.
- `tests/i18n-100.test.mjs` : catalogue, absence de résidu latin hors donnée, motifs dynamiques, déterminisme du dictionnaire.
- `tests/e2e/roadmap-vague4.spec.mjs` : **18 routes × 3 rôles + Mode Simple = 72 parcours AR RTL à 360 × 780**, `<details>` ouverts, texte + `title`/`aria-label`/`alt`, **0 libellé UI FR résiduel**, 0 débordement horizontal. Crawl de contrôle `/tmp/i18n-residus-finaux.json` : `TOTAL unique 0`.

## 3. Matrice des 39 DIFFÉRÉ H13-H20

| ID | Décision locale | Preuve / garde-fou | Résultat ou raison de la limite |
|---|---|---|---|
| `H13-01` | **LIMITE EXTERNE DOCUMENTÉE** | — | Décision produit + vraie panne Supabase à 3 h du matin ; non reproductible sans environnement externe. |
| `H13-09` | **LIMITE EXTERNE DOCUMENTÉE** | — | Cycle réel de Service Worker / navigateur : aucun SW n’est exécuté dans le dépôt. |
| `H13-11` | **LIMITE EXTERNE DOCUMENTÉE** | — | Panne partielle Supabase réelle et rendu React sous incident ; décision UX externe. |
| `H14-03` | **FERMÉ LOCAL** | `tests/h14-local-benchmarks.test.mjs`, `tests/pglite-benchmark.test.mjs` | Pagination 20 000 lignes en 41 appels + OFFSET 20 000 mesuré à 100 000 ventes. |
| `H14-04` | **FERMÉ LOCAL** | `tests/h14-local-benchmarks.test.mjs` | 100 dates cibles du plan « Demain au labo » exécutées, 10,1 ms. |
| `H14-05` | **LIMITE EXTERNE DOCUMENTÉE** | — | Profilage React réel / recalcul par frappe dans un navigateur : non mesurable sans client réel. |
| `H14-06` | **LIMITE EXTERNE DOCUMENTÉE** | — | Lighthouse / FCP caisse à 360 px : métrique navigateur de production, pas de benchmark Node local. |
| `H14-07` | **FERMÉ LOCAL** | `tests/h14-local-benchmarks.test.mjs` | RC-01 sur 10 000 lignes (1,8 ms) et bornes `LIMITES_LECTURE` verrouillées. |
| `H14-08` | **FERMÉ LOCAL** | `tests/h14-local-benchmarks.test.mjs` | 1 000 versions / 5 000 lignes d’ingrédients, 0,5 ms, sans conversion manquante. |
| `H14-09` | **FERMÉ LOCAL** | `tests/h14-local-benchmarks.test.mjs`, `tests/pglite-benchmark.test.mjs` | Garde des 4 requêtes de courses + mesure du coût d’agrégation/offset. |
| `H14-10` | **FERMÉ LOCAL** | `tests/h14-local-benchmarks.test.mjs` | `JSON.parse` 100 × brouillon 44,5 Kio en 16,2 ms, sans navigateur. |
| `H15-01` | **FERMÉ LOCAL** | `tests/pglite-benchmark.test.mjs`, `audit/BENCHMARK-PGLITE-100K.md` | 100 000 ventes, `Index Only Scan using ventes_client_date_idx`, 0,654 ms. |
| `H15-02` | **FERMÉ LOCAL** | `tests/pglite-benchmark.test.mjs`, `audit/BENCHMARK-PGLITE-100K.md` | 100 000 lots, `Index Only Scan using lots_fefo_idx`. |
| `H15-03` | **FERMÉ LOCAL** | `tests/pglite-benchmark.test.mjs` | `OFFSET 20 000 LIMIT 500` mesuré à 19,61 ms ; borne 20 000 vérifiée. |
| `H15-04` | **FERMÉ LOCAL** | `tests/h14-local-benchmarks.test.mjs`, `tests/pglite-benchmark.test.mjs` | Sonde de pagination et coût d’offset mesurés localement. |
| `H15-05` | **FERMÉ LOCAL** | `tests/pglite-benchmark.test.mjs` | 100 000 mouvements et ≥ 9 vues `security_barrier` inventoriées. |
| `H15-06` | **FERMÉ LOCAL** | `tests/pglite-benchmark.test.mjs` | RLS simulée à 100 001 utilisateurs sous `authenticated`, plan d’index vérifié. |
| `H15-08` | **FERMÉ LOCAL** | `tests/pglite-benchmark.test.mjs` | ≥ 5 policies `RESTRICTIVE` inventoriées ; aucune écriture production. |
| `H16-01` | **LIMITE EXTERNE DOCUMENTÉE** | — | Deux implémentations démo/serveur coexistent ; choisir la source de vérité est un arbitrage produit. |
| `H16-02` | **LIMITE EXTERNE DOCUMENTÉE** | — | `demoTomorrowPlan` et `tomorrow-lab.ts` coexistent ; un cas métier divergent doit être tranché par le produit. |
| `H16-03` | **LIMITE EXTERNE DOCUMENTÉE** | — | `demoMercurialeFor` et `actions-couts.ts` coexistent ; divergence de variation de prix non arbitrée. |
| `H16-05` | **FERMÉ LOCAL** | `src/lib/vitrine.ts`, `tests/h13-h20-local-guards.test.mjs` | Validation runtime des lignes PostgREST ; aucune valeur `undefined` dans la vitrine. |
| `H16-06` | **FERMÉ LOCAL** | `src/lib/export-comptable-lignes.ts`, `src/app/api/export/comptable/route.ts`, `tests/vague3-exports.test.mjs` | Ligne malformée refusée en 500 sans CSV partiel. |
| `H16-09` | **FERMÉ LOCAL** | `src/lib/tomorrow-lab-private-server.ts`, `tests/tomorrow-active-version.test.mjs` | `choisirVersionsActives()` extraite et testée : version maximale active par produit. |
| `H17-12` | **FERMÉ LOCAL** | `.github/workflows/ci.yml`, `.github/workflows/supabase-isole.yml`, `tests/h13-h20-local-guards.test.mjs` | Node épinglé à `22.22.3` dans les 5 jobs ; test de non-régression. |
| `H18-02` | **LIMITE EXTERNE DOCUMENTÉE** | — | Concurrence PostgreSQL réelle conditionnelle à `PATSYGEST_PG_URL` ; 3 tests restent `skipped`. |
| `H18-07` | **FERMÉ LOCAL** | `tests/sauvegarde.test.mjs` | Seuil 4 Mio déjà couvert par un fichier synthétique `MAX_OCTETS_SAUVEGARDE + 1`. |
| `H18-10` | **LIMITE EXTERNE DOCUMENTÉE** | — | Rollback à chaud sur pilote : opération externe explicitement hors bornes. |
| `H19-03` | **LIMITE EXTERNE DOCUMENTÉE** | — | Compatibilité RGPD / conservation 10 ans vs effacement : arbitrage juridique, aucune anonymisation production. |
| `H19-04` | **LIMITE EXTERNE DOCUMENTÉE** | — | Anonymisation complète des colonnes personnelles sur une base réelle non exécutée. |
| `H19-08` | **LIMITE EXTERNE DOCUMENTÉE** | — | Intention produit pour `last_seen_at:null` non documentée ; aucune règle alternative tranchée. |
| `H19-09` | **LIMITE EXTERNE DOCUMENTÉE** | — | Limitation de débit / brute force sur déploiement réel non testée. |
| `H19-10` | **LIMITE EXTERNE DOCUMENTÉE** | — | Heartbeat de surveillance du workflow et run `workflow_dispatch` distant non observés. |
| `H20-03` | **LIMITE EXTERNE DOCUMENTÉE** | — | Test de concurrence sur PostgreSQL réel toujours conditionnel à une URL externe. |
| `H20-05` | **FERMÉ LOCAL** | `tests/h13-h20-local-guards.test.mjs` | Test négatif : un `.eq()` oublié fait échouer l’assertion de séquence. |
| `H20-06` | **FERMÉ LOCAL** | `tests/h13-h20-local-guards.test.mjs` | `server-only` neutralisé uniquement sous test ; aucun composant `use client` ne l’importe. |
| `H20-07` | **FERMÉ LOCAL** | `tests/h13-h20-local-guards.test.mjs` | Inventaire recalculé comparé au JSON + action synthétique détectée (anti-tautologie). |
| `H20-09` | **FERMÉ LOCAL** | `audit/MATRICE-DERIVE-DOCS.md`, `tests/h13-h20-local-guards.test.mjs` | Matrice exhaustive des 5 dérives documentaires, vérifiée par test. |
| `H20-12` | **LIMITE EXTERNE DOCUMENTÉE** | — | E2E soumis à `workflow_dispatch` distant ; aucun run PR/push ni navigateur distant déclenché. |

## 4. Benchmarks et garde-fous ajoutés

- `tests/pglite-benchmark.test.mjs` + `npm run test:bench:pglite` : chaîne 01→57, 100 000 ventes/lots/mouvements/utilisateurs, `Index Only Scan`, FEFO, RLS, `OFFSET 20 000`, policies restrictives et vues `security_barrier`. Détail : `audit/BENCHMARK-PGLITE-100K.md`.
- `tests/h14-local-benchmarks.test.mjs` : pagination, 100 dates du plan, 1 000 versions, RC-01, brouillon `JSON.parse`, bornes de lecture.
- `tests/h13-h20-local-guards.test.mjs` : harnais négatif, inventaire anti-tautologie, matrice documentaire, pin CI Node, `server-only`, PostgREST vitrine/export, version active.
- `tests/tomorrow-active-version.test.mjs`, `tests/vague3-exports.test.mjs` : gardes ciblées H16-09 / H16-06.
- `audit/MATRICE-DERIVE-DOCS.md` : clôture H20-09.

## 5. Chaîne complète exécutée

| Commande | Résultat |
|---|---|
| `npm run typecheck` / `npm run lint` | rc0 |
| `npm test` | `1..902`, **905 tests / 899 pass / 0 fail**, 3 skipped, 3 todo, `285240 ms` |
| `npm run test:roadmap` | **11/11** |
| `npm run test:roadmap:live` | **4/4** |
| `npm run test:roadmap:e2e` | **7/7** (dont le parcours exhaustif 18 routes × 4 sessions) |
| `npm run build` | Next 16.4.6, `Compiled successfully in 3.1s`, 6/6 pages |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| `git diff --check` | rc0 |

Logs : `/tmp/100-final/*.log` (hors dépôt). Benchmark PGlite dans la chaîne :
`ventes=9068.6ms … execution=0.654ms offset=19.61ms lignes=100000`.

## 6. Bornes conservées

- Aucun OCR image→données ; B.4 reste photo + texte collé/saisi + validation humaine + entrée en stock.
- SQL 54/55/56/57 **non appliqués** au pilote ni à la production ; `schema_version 53` observé en lecture seule antérieurement.
- PGlite, mocks et E2E démo locale ne certifient ni Supabase réel, ni Auth/PostgREST/Storage, ni concurrence PostgreSQL, ni CI distante.
- Aucun déploiement, aucun changement d’env/secrets, aucune mutation Supabase/Vercel/Figma/Drive, aucun rollback à chaud, aucun `workflow_dispatch` distant.
- `src/lib/schema-version.ts` reste `VERSION_SCHEMA_REQUISE=37` ; `bootstrap-ci.mjs` attend `schemaVer=57`.
- PR #26 **ouverte**, non fusionnée, conformément à `pr_final = keep_open`.

**Conclusion** : le périmètre `local_full` est livré à 100 % avec preuves
exécutables. Les 17 limites externes ne sont pas des restes implicites : elles
sont nommées, expliquées et volontairement non franchies.
