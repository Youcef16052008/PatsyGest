# Benchmark PGlite 100 000 lignes — preuve locale

**Date** : 2026-11-27  
**Branche** : `arena/923a4433-patsygest`  
**Commande** : `npm run test:bench:pglite`  
**Test** : `patisgest-app/tests/pglite-benchmark.test.mjs`

## Périmètre et borne

Ce benchmark est **local et reproductible** : il rejoue la chaîne `01→57` dans
PGlite (56 fichiers, `app_schema_version = 57`), insère des volumes synthétiques
et vérifie les plans d'exécution. Il ne certifie **ni** un PostgreSQL/Supabase de
production, **ni** la concurrence réelle, **ni** Auth/PostgREST/Storage, **ni** un
déploiement, **ni** un `workflow_dispatch` distant. Les rôles `authenticated` et
`auth.uid()` sont simulés explicitement par `tests/support/chaine-active.mjs`.

## Volumes et résultats de la chaîne finale

| Mesure | Résultat |
|---|---|
| Chaîne active | 56 fichiers, version 57, dernier `57-onboarding-pack-dz-rpc.sql` |
| Insertion `ventes` | 100 000 lignes en **9 068,6 ms** |
| `ANALYZE ventes` | **100,4 ms** |
| `count(*)` jour témoin | 274 lignes en **2,2 ms** |
| `EXPLAIN (ANALYZE, BUFFERS)` ventes | `Index Only Scan using ventes_client_date_idx`, **0,654 ms**, `shared hit=276` |
| Insertion `lots` | 100 000 lignes en **11 737,6 ms** |
| Insertion `mouvements` | 100 000 lignes en **9 778,8 ms** |
| Insertion `utilisateurs` | 100 000 lignes + 1 propriétaire en **8 188,7 ms** |
| Plan FEFO | `Index Only Scan using lots_fefo_idx`, 10 lignes, `Heap Fetches: 10` |
| Plan mouvements | `Index Only Scan using mouvements_client_date_idx`, 274 lignes |
| Vues `security_barrier` | ≥ 9 vues présentes dans `pg_class.reloptions` |
| Policies `RESTRICTIVE` | ≥ 5 policies présentes dans `pg_policies` |
| `OFFSET 20 000 LIMIT 500` | `Index Scan using ventes_client_date_idx`, **19,61 ms**, `shared hit=20528` |
| RLS 100 001 utilisateurs | `set role authenticated` + `test.uid`, 1 ligne visible, `Index Only Scan using utilisateurs_auth_user_id_key` |
| Borne applicative | `src/lib/workspace-read.ts` : `const LIMITE_TOTALE = 20_000;` |

Ligne de preuve complète dans `/tmp/100-final/npm-test.log` :

```
[bench-pglite] ventes=9068.6ms analyze=100.4ms count=2.2ms lots=11737.6ms mouvements=9778.8ms utilisateurs=8188.7ms execution=0.654ms offset=19.61ms lignes=100000
```

## Points H13-H20 fermés localement

- **H15-01** : `ventes_client_date_idx` et `ventes_client_created_idx` présents ; `Index Only Scan` mesuré à 100 000 ventes.
- **H15-02** : `lots_fefo_idx` présent et utilisé par la requête FEFO à 100 000 lots.
- **H15-03 / H15-04** : coût d'`OFFSET 20 000` mesuré (19,61 ms) et borne `LIMITE_TOTALE = 20_000` verrouillée par test.
- **H15-05** : 100 000 mouvements + ≥ 9 vues `security_barrier`.
- **H15-06** : RLS simulée à 100 001 utilisateurs sous rôle `authenticated`, plan d'index vérifié.
- **H15-08** : ≥ 5 policies `RESTRICTIVE` inventoriées ; aucune écriture production exécutée.

Les assertions sont dans `tests/pglite-benchmark.test.mjs`. Le complément
applicatif (pagination 20 000 lignes, 1 000 versions de recette, RC-01, 100
dates du plan « Demain au labo », `JSON.parse`) est dans
`tests/h14-local-benchmarks.test.mjs`.

**Conclusion** : 100 % des vérifications de volume réalisables sans pile externe
sont exécutées et vertes. Le passage à une base pilote/production reste une
décision distincte, non exécutée.
