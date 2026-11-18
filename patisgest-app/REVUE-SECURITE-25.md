# Revue sécurité — 25 points (Sprint 6, complétée)

`SPRINT6.md` annonçait cette revue comme **partielle**. Ce document la termine
et distingue clairement ce qui est **mesuré** de ce qui reste **non testé**.
Chaque point « mesuré » a une preuve reproductible (SQL, test automatisé, ou
chemin de code).

Exécutée le 2026-11-17 sur la base `evepzygucfxarpdnflzv`.

---

## A. Isolation multi-tenant (1-6)

| # | Point | Verdict | Preuve |
|---|---|---|---|
| 1 | RLS activée sur toutes les tables publiques | ✅ | 23/23 tables `relrowsecurity = true` |
| 2 | Chaque table a au moins une policy | ✅ | 23/23, entre 1 et 4 policies |
| 3 | Aucune policy `USING (true)` | ✅ | 0 ligne — requête sur `qual = 'true'` |
| 4 | Toute policy SELECT filtre le tenant | ✅ | filtrées par `client_id`/`id` via `auth.uid()` |
| 5 | `anon` (sans JWT) ne lit rien | ✅ **mesuré** | clients 0 · utilisateurs 0 · ventes 0 · parametres_couts 0 |
| 6 | `anon` ne peut pas écrire | ✅ **mesuré** | `insert into sites` → `42501` |

## B. Confidentialité des coûts (7-10)

| # | Point | Verdict | Preuve |
|---|---|---|---|
| 7 | `parametres_couts` lisible seulement par propriétaire/labo | ✅ | policy `select_pc` avec `patisgest_mon_role() IN (…)` |
| 8 | `recette_versions` (mo_min, énergie…) idem | ✅ | policy `recette_versions_cost_read` |
| 9 | `simuler_recette` refuse les autres rôles | ✅ | garde ajoutée en migration 17 (elle est `SECURITY DEFINER`) |
| 10 | Export CSV des coûts réservé | ✅ | `cout: true` sur les exports de versions et paramètres de coût ; les familles ne sont pas dans le catalogue CSV ; 403 mesuré en smoke |

La migration 19 étend la restriction de lecture aux familles de recettes. Elle
complète les redirections serveur de `/recettes` et `/simulation` et doit être
appliquée à la base pilote pour fermer également la lecture directe par son API.

## C. Fonctions `SECURITY DEFINER` (11-15)

| # | Point | Verdict | Preuve |
|---|---|---|---|
| 11 | Aucune exécutable par `anon` | ✅ | 24 `SECURITY DEFINER`, toutes `anon_peut = false` |
| 12 | Aucun droit PUBLIC résiduel (`=X`) | ✅ | `public_exec = 0` sur toutes |
| 13 | Les fonctions qui écrivent vérifient `auth.uid()` | ✅ | 21/24 ; les 3 autres sont inaccessibles au client (points 14-15) |
| 14 | Les fonctions internes sont inaccessibles au client | ✅ **mesuré** | `patisgest_besoins_de_version` et `patisgest_convertir` : ACL = `postgres` + `service_role` seulement |
| 15 | `rls_auto_enable()` (utilitaire DDL) révoquée | ✅ | révoquée en migration 17, ACL `postgres`+`service_role` |

> **Point 14, détail** : les 3 fonctions `SECURITY DEFINER` sans `auth.uid()`
> sont `patisgest_besoins_de_version`, `patisgest_convertir` et
> `rls_auto_enable`. Les deux premières prennent `p_client uuid` en
> paramètre. Si elles étaient exécutables par
> `authenticated`, n'importe quel compte pourrait lire les besoins matières ou
> les conversions d'un **autre** établissement. Elles ne le sont pas. C'est
> fragile par construction (la protection tient à l'ACL, pas au corps de la
> fonction) : **à surveiller**, et c'est désormais couvert par le point 14.

## D. Application (16-21)

| # | Point | Verdict | Preuve |
|---|---|---|---|
| 16 | Aucun secret dans `src/` | ✅ | `tests/securite.test.mjs` (10 → 15 invariants) |
| 17 | `.env` non versionné | ✅ | invariant sur `.gitignore` |
| 18 | Aucun `grant … to anon` dans les migrations | ✅ | invariant sur les 18 migrations |
| 19 | Messages d'erreur : seul `P0001` est affiché | ✅ | `messageUtilisateur` partout, 15 sites migrés |
| 20 | Garde de rôle **avant** la requête, pas après | ✅ | invariant : export évalué avant `.from(...)` |
| 21 | Navigation et rendu masquent les coûts au vendeur | ✅ | `canReadCosts` dans render + actions + nav |

## E. Sauvegarde / restauration (22-24)

| # | Point | Verdict | Preuve |
|---|---|---|---|
| 22 | Export réservé au propriétaire | ✅ | 401 sans session, 403 vendeur/labo (smoke) |
| 23 | Restauration : rôle vérifié **et** tenant vérifié | ✅ **mesuré** | vendeur/labo refusés ; autre tenant refusé ; ligne étrangère refusée ; sans JWT refusé (5/5) |
| 24 | Sauvegarde sans données d'authentification | ✅ | `utilisateurs` exclu et documenté dans le fichier |

## F. Ce qui reste NON testé (25)

| # | Point | Statut |
|---|---|---|
| 25 | Tests d'intrusion réels sur l'URL de production | ❌ **non fait** |

**Pourquoi** : la sandbox n'a pas de route vers `*.vercel.app`, et un test
d'intrusion suppose de manipuler de vrais JWT de session. Ce qui est mesuré
ci-dessus l'est en SQL sur la base réelle, avec `request.jwt.claims` simulé —
c'est fidèle à ce que fait PostgREST, mais **ce n'est pas** un test depuis
l'extérieur.

Restent également hors de portée (déjà listés en `HANDOFF.md` §10.4) :
E2E navigateur avec Auth réelle, journée réelle sans internet, coûts à
3 pâtissiers, CA-15 « < 1 h », check-list 60 cas.

---

## Verdict

**24 points sur 25 vérifiés**, dont 6 par mesure directe en base ou en smoke
test. Le 25ᵉ (intrusion réelle sur la prod) reste ouvert.

Cela **ne permet pas** de dire « production-ready » : une revue menée depuis
l'intérieur ne remplace pas un test depuis l'extérieur.
