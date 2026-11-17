# HANDOFF — Revue indépendante du travail Arena (PR #2)

> **Pour l'agent suivant** : ce document te permet d'analyser le dépôt, de
> **revoir et vérifier** le livré contre le plan, sans relire toute
> l'historique de conversation. Branche : `arena/97d398f3-patsygest` →
> **PR #2 (draft → mergée)**, projet Supabase `evepzygucfxarpdnflzv`,
> prod Vercel `patsy-gest-all-intelligence.vercel.app`.

## 1. Le plan (références normatives)

| Source | Contenu |
|---|---|
| `PâtisGest-Documents/01-Cahier-des-Charges-PatisGest-v4.md` | §4 **RC-01..RC-10** (formules gravées — toute écart = bug bloquant), RG-04.x, NF-08 (tests auto RC à100 %), CA-04 (5 recettes au centime) |
| `PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.md` | Sprints : S2 modules+persistance · **S3 recettes & coûts** (fiche RC +10 recettes au centime) · **S4 production+caisse** (MOD-05, MOD-06, ticket80 mm, file offline caisse+OF,0 doublon) · S5 qualité+onboarding · S6 durcissement |
| `patisgest-app/SPRINT2.md` | Inventaire Restant Sprint2 — **bouclé** (sous-recettes, traçabilité, simulation, rappels qualité, Cake Design) |
| `patisgest-app/SPRINT3.md` | **Bouclé** : RC-01..10 +10 recettes au centime + fiche interactive + caisse offline + ticket80 mm + RC-07/08 réels |
| `patisgest-app/SPRINT4.md` | **Bouclé (constructible)** : MOD-05 vérifié, idempotence OF, file OF offline, état synchro double file |

**Critères humains NON couverts par la sandbox** (ne pas les déclarer faits) :
E2E navigateur avec Auth réelle sur URL prod (login pilote), « journée sans
internet synchronisée » en vrai navigateur, « 3 pâtissiers retrouvent leurs
coûts à la main ». Tant que ces E2E ne sont pas faits : **ne pas dire
« production-ready »** (contrainte utilisateur explicite).

## 2. Portes (gates) — à relancer pour vérifier

```bash
cd patisgest-app
npm ci                      # node_modules peut disparaître entre sessions
npm run typecheck           # attendu :0 error
npm run lint                # attendu :0 error
npm run test                # attendu :154/154 (node:test, PAS vitest)
npm run build               # attendu : Compiled successfully
npm run test:smoke          # attendu :6/6 (lance son propre serveur3411)
```

Dernier état vert : commit `171702c` (Vercel SUCCESS sur chaque commit).

## 3. Base de données — état distant (source de vérité = Supabase)

Les migrations **05→17** ont été appliquées **à distance** (connector
Supabase, `execute_query`) ET sont rejouables depuis `patisgest-app/supabase/`
(01..17). Points de contrôle à re-vérifier en SQL (TX `begin; … rollback;`) :

| # | Vérification attendue |
|---|---|
| M-a | `creer_of(Mill v2, qte12)` → besoins exacts `{SF-CPA1, SF-PFE1.2, MP-SUC0.15}` kg (régression seed) |
| M-b | Sous-recette : **scénario constructif** (la v1 du croissant seedée est plate : 3 kg farine + 0,8 beurre + 0,3 sucre + 1,2 L lait). Créer `RF-SOUSSUCRE` (1 kg sucre) + un `creer_version` croissant v2 à 40 pcs avec 3 lignes : farine **450 `g`** (conversion g→kg), sucre 0,05 kg **direct**, sucre 0,05 kg **via `subVersionId`** → `patisgest_besoins_de_version` doit rendre **`MP-FAR=0.45 kg`** et **`MP-SUC=0.10 kg`** (fusion) |
| M-c | Anti-cycle : `creer_version` avec sub→propre famille → `'Cycle de sous-recettes detecte.'` ; auto-réf → `'Auto-reference…'` ; conversion manquante → `'Conversion d unite manquante…'` ; vendeur → `'Role non autorise.'` |
| M-d | `rappel_lot` : transfert réel → transferts départ/arrivée + descendant miroir ; `bloquer_lot(descendants=true)` → les2 bloqués ; déblocage → source OFF, miroir **reste** bloqué ; vendeur rappel OK / bloquer refusé |
| M-e | `editer_cake` : OK sur `devis`, refusé après `payer` ; `accepter_cgv` → `cgv_accepted_at` non nul + version |
| M-f | **Idempotence OF** : `creer_of(..., 'REF-X')` ×2 → **1 seul OF** (`duplicate:true` au2e appel) |
| M-g | RLS : `conversions` insert labo ✓ / vendeur refusé ; `parametres_couts` idem |
| M-h | Résidus nuls après chaque matrice (compter `mouvements/transferts/lots_bloques/OF` avant/après) |

**Ne pas** relancer `01-socle.sql` ni reseeder aveuglément : le projet
`evepzygucfxarpdnflzv` est muté (rôles, seeds, index). inspecter avant DDL.

RLS de test (recette éprouvée) :
```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<uuid utilisateur>';
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
<statement>;
reset role; rollback;
```

## 4. Revue livrable par livrable (plan → code → tests)

### Sprint2 — Restant (5 items, tous livrés)
1. **Sous-recettes & conversions** — migration **12** : `conversions` (RLS4), `patisgest_convertir` (interne), `creer_famille`, `creer_version` (lignes article|subVersionId, anti-cycle **BFS profondeur≤3**, conversions exigées), `activer_version`, `patisgest_besoins_de_version` (expansion récursive + parage + fusion), `creer_of` réécrit. Repo : `supabase/12-sous-recettes-conversions.sql` (+ `07-of-production.sql` mis à jour). App : `version-input.ts`, `actions-recettes.ts`, `version-form.tsx`, branche `recettes`.
2. **Traçabilité & rappel** — migration **13** : `lots.bloque_motif`, `rappel_lot` (cascade ventes/OF/transferts/descendants max3, tous rôles), `bloquer_lot` (motif requis, propagation optionnelle, déblocage jamais propagé). App : `actions-rappel.ts`, `recall-form.tsx`, branche `tracabilite`.
3. **Simulation réelle** : RPC `simuler_recette` (version active → besoins étendus) + `fefo-cost.ts` + `simulation-form.tsx`.
4. **Rappels qualité** : `quality-alerts.ts` (pur) + `quality-alerts-panel.tsx` (tous rôles).
5. **Cake Design complet** — migration **14** : `tva_pct`, `cgv_accepted_at/_version`, `editer_cake` (devis seul), `accepter_cgv` + édition/CGV/ticket dans `cake-forms.tsx` + `cake-ticket.tsx`.

### Sprint3 — Recettes & coûts (roadmap S7-S8)
- `src/lib/cost-sheet.ts` : **RC-01..RC-10** pures + `aggregatePertes` (clôtures réelles).
- **Tests AVANT écrans** (exigé par la roadmap) : `tests/cost-sheet.test.mjs` (12), **`tests/rc-reference.test.mjs` (10 recettes de référence au centime, écart<0,005 DA/portion)**.
- Migration **15** `parametres_couts` (taux horaire + charges, RLS3) + `cost-sheet-form.tsx` / `actions-couts.ts` (fiche RC-01→RC-10 interactive, source des pertes réelle/saisie affichée).
- **Caisse offline** : `sale-queue.ts` (queue-first, store `useSyncExternalStore`), `sale-form.tsx` (État synchro + indicateur online), **ticket80 mm** `sale-ticket.tsx`, `sellProduct` accepte le **ticket client** (idempotent via `vendre_article`).

### Sprint4 — Production + caisse (roadmap S9-S10)
- **MOD-05 vérifié existant** : snapshot serveur, `demarrer_of` (FEFO), `terminer_of` partiel (`partiel` tant que réalisée < prévue).
- Migration **16** : `ordres_fabrication.client_ref` + index unique partiel → `creer_of(..., p_client_ref)` **idempotent** (matrice double appel =1 OF).
- **File OF offline** : `of-queue.ts` + `of-forms.tsx` queue-first + État synchro (même patron caisse).
- `tests/of-queue.test.mjs` (5, dont flux « journée sans internet →0 doublon »).

## 5. Chiffres à retrouver (rejouer `npm test`)

**260 tests** (vérifié fichier par fichier) : store47 · stock-input10 ·
journal-input15 · purchase-input6 · z-input6 · price-alerts6 · reconciliation5 ·
label-model5 · version-input6 · cost-sheet10 · rc-reference13 · fefo-cost6 ·
quality-alerts8 · sale-queue6 · of-queue5 · permissions3 · **allergenes11** ·
**csv12** · **onboarding8** · **erreurs-db8** · **securite17** · **rls-probe12** · **etablissement15** ·
**sauvegarde19** · **erreurs-db9** ·
smoke **10/10** (séparé, dont `/api/export` et `/api/sauvegarde`).

> ⚠️ Correction de revue (2026-11-17) : la version précédente listait
> `cost-sheet13`/`rc-reference11` et omettait `version-input6` — le total
> annoncé (154) était juste mais la répartition était fausse
> (13+11+6+6+… = 156). Chiffres ci-dessus mesurés fichier par fichier.

## 6. Incidents connus (ne pas refaire, à connaître)

- **Reset local de branche entre sessions** : le HEAD local repasse à
  `ed96d74` (base) alors que le remote a tout. Symptôme : `git log` anormal,
  `git status` huge. **Recovery** : `git fetch origin arena/97d398f3-patsygest`
  puis `git reset origin/arena/97d398f3-patsygest` (**mixte**, garde l'arbre) —
  vérifier `git status` vide avant de committer. Jamais de `git push --force`.
- **`node_modules` disparaît** entre sessions → `npm ci`.
- **`execute_query` multi-statements** : ne retourne que le **dernier** résultat
  — mettre l'assertion en dernière position.
- Pièges SQL déjà rencontrés : `raise exception '%' , msg` (pas de concat),
  `with check` (pas `with_check`), JSON via `jsonb_build_*` (pas de concat avec
  `\"`), boucles plpgsql imbriquées : **une variable par niveau** (`v_outer`/`v_hit`
  — un bug de variable réutilisée a été corrigé dans `bloquer_lot`).
- **Bug corrigé à revérifier** : dans `creer_of`, le bloc idempotence avait été
  inséré *à l'intérieur* du `if role` (jamais exécuté) — état final correct dans
  `07-of-production.sql` + `16-creer-of-idempotent.sql` (matrice M-f verte).
- `next-env.d.ts` churn : le restaurer (`git checkout --`), ne jamais le committer.
- `read_file` échoue sur chemins avec `(app)` → bash/python.
- Tests : `npm test` = `node --test tests/*.test.mjs` (**pas** vitest).
- Lint `react-hooks/set-state-in-effect` : utiliser `useSyncExternalStore`
  (cas `sale-form`/`of-forms`).

## 7. Accès & sécurité

- Démo (pilote, choix utilisateur) : `amina@patisserie.dz` (**propriétaire**),
  `sara@patisserie.dz` (**labo**), `amine@patisserie.dz` (**vendeur**),
  mdp `PatisGest2026!`.

  > ⚠️ Correction de revue (2026-11-17) : le handoff précédent inversait
  > sara (labo) et amine (vendeur). Source de vérité = `02-seed-pilote.sql`
  > lignes 4-6 et 81-83, confirmée en SQL sur `public.utilisateurs`.
- **Rotation de la clé service_role : REPORTÉE à la fin du projet** (décision
  utilisateur) — ne pas la tourner maintenant, ne jamais l'imprimer/commiter.
- Pas de `PATISGEST_DEMO_MODE` en prod ; la démo locale reste opt-in.
- Sandbox : pas de route vers `*.supabase.co`/`*.vercel.app` → utiliser les
  connectors Supabase/Vercel, pas de curl direct.

## 8. Ordre suggéré de revue

1. `git log --oneline b9f34a5~5..171702c` —5 commits S2-fin→S4 (PR #2 complet :
   depuis `44ed69a` recon + `dc46b45` étiquette).
2. Relancer les **gates** (§2) — doit être vert à154/154.
3. Relancer **2 matrices SQL** au choix (§3, M-b et M-f sont les plus
   significatives : expansion sous-recette + idempotence OF).
4. Relire `cost-sheet.ts` ligne à ligne contre le tableau RC du cahier §4 —
   c'est le cœur « tout écart est un bug bloquant ».
5. Vérifier que rien ne prétend « production-ready » (SPRINT*.md, PR, README).
6. E2E restants à faire par l'utilisateur : §1 fin.

---

## 9. Résultats de la revue indépendante (2026-11-17, branche `arena/a08c81da-patsygest`)

### 9.1 Portes (§2) — toutes revérifiées vertes

| Porte | Résultat |
|---|---|
| `npm ci` | OK |
| `npm run typecheck` | **0 erreur** |
| `npm run lint` | **0 erreur** |
| `npm test` | **154/154**, 0 échec |
| `npm run build` | **Compiled successfully** (5 routes) |
| `npm run test:smoke` | **6/6** |

### 9.2 `cost-sheet.ts` vs cahier §4 — conforme

RC-01..RC-10 relus ligne à ligne : formules identiques au tableau gravé
(parage, cuisson, total, MO chargée, coût/portion **sans TVA**, marge **sur HT**,
taux de perte, manque à gagner, FEFO délégué à `fefo-cost.ts`, garde-fous
non bloquants). Les **10 recettes de référence ont été recalculées à la main**
(R1..R10, `tests/rc-reference.test.mjs`) : les valeurs attendues sont des
valeurs dérivées des formules, pas des copies de la sortie du code. **Aucun écart.**

### 9.3 Matrices SQL — 8/8 conformes (rejouées en TX + rollback)

| # | Verdict | Preuve mesurée |
|---|---|---|
| M-a | ✅ | Millefeuille v2 × 12 → `SF-CPA=1`, `SF-PFE=1.2`, `MP-SUC=0.15` kg |
| M-b | ✅ | 450 `g` → **0.4500 kg** ; sucre 0,05+0,05 → **0.1000 kg** (fusion, 2 lignes) |
| M-c | ✅ | cycle, auto-référence, conversion manquante, vendeur → 4 refus exacts |
| M-d | ✅ | rappel : `transferts=2`, `descendants=1` ; blocage propagé aux 2 ; après déblocage **source=false / miroir=reste true** ; vendeur rappel OK, blocage refusé |
| M-e | ✅ | `editer_cake` OK en `devis`, refusé en `acompte` (« Edition possible uniquement depuis le devis ») ; `accepter_cgv` → `cgv_accepted_at` non nul + `cgv_version='2026-11'` |
| M-f | ✅ | 2 appels `creer_of(...,'REF-MF-001')` → **même `of_id`**, `duplicate:true` au 2e, 1 seul OF |
| M-g | ✅ | `conversions`/`parametres_couts` : insert labo OK, vendeur refusé par RLS |
| M-h | ✅ | résidus nuls : OF=2, mouvements=0, transferts=0, lots bloqués=0, versions=2 (état seed) |

Production Vercel : `dpl_CYJsfVea…` **READY / PROMOTED**, alias
`patsy-gest-all-intelligence.vercel.app`, commit `5b21144` (= base de cette branche).
`ssoProtection` désormais `null` (la protection SSO signalée en SPRINT2 est levée).

### 9.4 ✅ Écart RLS — confidentialité des coûts (**corrigé**, migration 17)

Vérifié en SQL, **non couvert par les tests** :

```
select_pc        on parametres_couts  for select using (client_id = patisgest_mon_client())
recette_versions_tenant_read on recette_versions for select using (client_id IN (...))
```

Les deux policies SELECT ne filtrent que le **tenant**, pas le **rôle**.
Un compte **vendeur** lit donc :

```
parametres_couts_lus=1   (taux horaire + charges %)
recette_versions_lues=2  (mo_min=30.00, énergie, frais généraux, emballage)
```

C'est exactement le risque déjà écrit dans `SPRINT2.md` §7 (« Les politiques
actuelles isolent les clients mais ne restreignent pas encore la lecture des
coûts par rôle »). La mention « RLS3 » dans `SPRINT3.md` désigne 3 *policies*
(select/insert/update), **pas** une restriction par rôle — la formulation prête
à confusion. L'IHM masque les coûts au vendeur, mais la donnée restait lisible
par l'API REST avec le JWT du vendeur.

**Correctif appliqué** — `supabase/17-confidentialite-couts-rls.sql`
(appliquée à distance via `create_migration`) et miroir dans le code :

| Niveau | Avant | Après |
|---|---|---|
| RLS `parametres_couts` SELECT | tenant seul | + `patisgest_mon_role() in ('proprietaire','labo')` |
| RLS `recette_versions` SELECT | tenant seul | + même garde rôle (policy renommée `recette_versions_cost_read`) |
| RPC `simuler_recette` (SECURITY DEFINER, contourne la RLS) | aucun contrôle de rôle | refus explicite hors propriétaire/labo |
| `ficheCoutReal` / `simulerReal` (actions serveur) | aucun contrôle de rôle | `canReadCosts(ctx.role)` |
| Navigation | `/recettes` + `/simulation` affichés à tous | masqués au vendeur |
| Rendu module `simulation` | `select('*')` sur les tables de coûts pour tous | conditionné à `canReadCosts` |

Bonus de surface trouvés en chemin, corrigés dans la même migration :

- `creer_of(uuid,uuid,numeric,date)` (4 args) — surcharge historique encore
  joignable **par `anon`**, qui créait un OF **sans l'idempotence `client_ref`**
  de la migration 16 : supprimée (l'app n'appelle que la version 5 args).
- `rls_auto_enable()` — utilitaire de DDL exécutable par `anon`/`authenticated` :
  révoqué.
- Le droit par défaut `=X` (PUBLIC) rendait `creer_of` 5 args exécutable par
  `anon` malgré le `grant` nominatif : révoqué aussi.

Mesures après migration, avec le JWT du vendeur :
`parametres_couts=0` · `recette_versions=0` · `simuler_recette → « Role non
autorise »`. Non-régression vérifiée : propriétaire et labo lisent toujours
(`rv=2`, `mo_min=30.00`), l'écriture des paramètres fonctionne, M-f (idempotence
OF, `same_id=true`, 1 seul OF) et la caisse vendeur (`vendre_article`,
`totalTTC=101.15`) sont intacts.

Nouveau test de garde : `tests/permissions.test.mjs` (3) sur
`src/lib/permissions.ts` — module pur extrait de `auth.ts` (qui importe
`next/headers`, donc non testable par `node --test`). La règle est ainsi
vérifiée automatiquement au lieu de dépendre de la RLS seule.

### 9.5 Autres constats de documentation

- Le repo local est un **clone superficiel** (`git rev-list --count HEAD` = 1,
  `.git/shallow` = `5b21144`) : l'étape §8.1 (`git log … b9f34a5..171702c`) est
  **impossible** ici ; il faut `git fetch --unshallow` (ou relire la PR #2).
- `SPRINT3.md` §Tests annonce « RC formules(12) +10 recettes » ; le réel est
  **10** (`cost-sheet.test`) + **13** (`rc-reference.test`, dont 10 recettes).
  Total global correct, répartition approximative.
- Corrections appliquées dans ce handoff : §5 (répartition des 154 tests),
  §7 (rôles sara=labo / amine=vendeur), §3 M-b (scénario constructif).

### 9.6 Verdict

Le livré **tient le plan** sur les points vérifiables en sandbox : formules
gravées conformes, 10 recettes au centime justes, sous-recettes/conversions
exactes, idempotence OF réelle, cascade de rappel correcte, RLS de rôle correcte
en **écriture** — et, depuis la migration 17, en **lecture des coûts** aussi
(§9.4). Portes : typecheck 0 · lint 0 · **157/157** · build OK · smoke 6/6.

**Le pilote n'est toujours PAS « production-ready »** : E2E navigateur avec Auth
réelle sur l'URL prod, « journée sans internet » dans un vrai navigateur et
« 3 pâtissiers retrouvent leurs coûts à la main » restent à faire par
l'utilisateur (§1). Aucun de ces trois critères n'est couvrable en sandbox :
ils ne doivent pas être déclarés faits.

---

## 10. Sprints 5 & 6 — qualité/onboarding puis durcissement (2026-11-17)

> Décision de session : poursuivre **le plan** (roadmap S5 → S6) au lieu de
> s'arrêter au correctif RLS. Chaque livrable ci-dessous est accompagné de ce
> qui **reste humain** et ne doit pas être déclaré fait.

### 10.1 S5 — `patisgest-app/SPRINT5.md`

**MOD-10 (allergènes matières → produits)** — la vraie lacune fonctionnelle.
Avant, `articles.allergenes` était saisi **à la main** sur le produit fini.
Mesuré sur le jeu pilote : `PF-CRO` (Croissant) déclarait `gluten, lait,
oeufs` alors que sa recette v1 (farine, beurre, sucre, lait) **ne contient
aucun œuf**. Le calcul est désormais dérivé des matières :
`src/lib/allergenes.ts` (11 tests) — expansion récursive des sous-recettes
(profondeur 3, anti-cycle), normalisation des 14 allergènes légaux, et
distinction `manquants` (sous-déclaration = **bloquant**) / `enTrop`
(sur-déclaration = avertissement). Vérifié par SQL indépendant sur la base :
```
PF-CRO  déclare {gluten,lait,oeufs}  dérive {gluten,lait}   → 1 en trop
PF-MIL  déclare {gluten,lait,oeufs}  dérive {gluten,lait,oeufs} → conforme
```
Piège trouvé par le test : `œ`/`æ` sont des ligatures, **NFD ne les
décompose pas** (« Œufs » ne matchait jamais le slug `oeufs`).

**MOD-15 (exports CSV)** — `src/lib/csv.ts` (12 tests) + `/api/export`.
Format **Excel FR** (séparateur `;`, virgule décimale, **BOM UTF-8** — sans
lui, « é » devient « Ã© » chez le comptable), RFC 4180, et **injection de
formule neutralisée** (OWASP : `=`, `+`, `-`, `@`, tab, CR préfixés d'une
apostrophe). 11 tables ; les tables de coût sont réservées à
propriétaire/labo (UI **et** route, 403). Test de fumée réel : 401 sans
session, 403 vendeur sur `couts`/`recettes`.

**MOD-15 (onboarding)** — `src/lib/onboarding.ts` (8 tests) : 6 étapes dans
l'ordre US-15.3, compteurs réels sur le tableau de bord, prochaine action
mise en avant, `pretAVendre` (matières + produits + recette active + 1re
vente sont bloquantes ; fournisseurs et 1er OF recommandés seulement).

### 10.2 S6 — `patisgest-app/SPRINT6.md`

**Durcissement des messages d'erreur** — `src/lib/erreurs-db.ts` (8 tests).
Constat : 10 sites renvoyaient `${error.message}` brut, ce qui exposait
`duplicate key value violates unique constraint "ofs_client_ref_uniq"` ou
`permission denied for table parametres_couts` à l'écran. Règle unifiée :
seul `P0001` (nos `raise exception` métier, en français) est affiché ; les
codes techniques (23505, 42501, 42P01, PGRST…) donnent un message
actionnable + « contactez le support ». 5 helpers dupliqués fusionnés.

**Revue sécurité outillée** — `tests/securite.test.mjs` (10) verrouille les
régressions coûteuses : aucun secret/JWT en dur, `.env` ignoré, **aucune
migration ne fait `grant … to anon`**, migration 17 présente avec gardes,
`canReadCosts` dans le rendu/actions/navigation, tables de coût marquées
`cout:true`, garde évaluée **avant** la requête dans `/api/export`, et
`error.message` uniquement sous garde `P0001`.

**Mentions légales / CGU** — `/mentions-legales` (TVA 19/9, conservation
10 ans, loi 18-07, décret 13-378, rôles, mode hors-ligne) + lien en pied de
page. Rédigée comme **modèle** : validation comptable + juriste requise.

### 10.3 Portes après S5/S6 et la fin S6 (US-15.1 / US-15.2)

`npm run typecheck` 0 · `lint` 0 · `test` **239/239** · `build` OK
(8 routes dont `/api/export`, `/api/sauvegarde`, `/mentions-legales`, `/parametres`)
· `test:smoke` **10/10**.

### 10.4 Ce qui reste et ne doit PAS être déclaré fait

| Point | Statut |
|---|---|
| CA-15 « onboarding en < 1 h par un novice » | **non testé** (humain) |
| US-15.2 **restauration** « en 2 clics » | **livrée et prouvée** (voir §11) — migration 18 `restaurer_sauvegarde(jsonb)`, une transaction, garde propriétaire. **Volet humain restant** : la manipulation réelle dans un navigateur sur la prod |
| Check-list 60 cas (S6) | **partiellement exécutée** — 6 cas métier + matrice RLS 4 personas mesurés en base (`CHECKLIST-60.md`). **Reste** : les cas navigateur (Auth réelle, hors-ligne, impression) |
| Revue sécurité 25 points (S6) | **24/25** — voir `REVUE-SECURITE-25.md`. Le point 25 (intrusion réelle depuis l'extérieur sur l'URL de prod) reste **non fait** |
| Mentions légales | **modèle** — validation comptable/juriste requise |
| Formation 5 pilotes, 1 semaine d'encaissement réel | **hors sandbox** |
| E2E Auth réelle sur URL prod, journée sans internet | **hors sandbox** |

**Aucun de ces points ne permet de dire « production-ready ».**

👉 Le mode opératoire clic par clic de tous ces points est dans
[`GUIDE-PILOTE.md`](GUIDE-PILOTE.md) (7 étapes, ~2 h 30 hors journée réelle).


---

## 11. Fin de Sprint 6 — US-15.1 et US-15.2 (2026-11-17)

Deux écarts réels mesurés avant de coder, pas des cases à cocher.

### 11.1 US-15.1 — mentions légales de l'établissement

**Écart constaté** : le ticket de caisse titrait « PâtisGest — Caisse ». Ni
NIF, ni NIS, ni RC, ni adresse — alors que le §5 du cahier les exige sur
facture et ticket. `clients` portait déjà `nif/nis/rc`, mais **aucun écran ne
les éditait** : les valeurs seedées étaient définitives.

**Livré** : `src/lib/etablissement.ts` (validation NIF/NIS 15 chiffres, RC
wilaya/registre, en-tête, avertissements non bloquants) · `/parametres`
(édition propriétaire, lecture seule pour les autres rôles) ·
`sale-ticket.tsx` porte désormais l'en-tête légal complet via
`enteteTicket()`, et n'invente **jamais** un identifiant absent.

Politique retenue, conforme à « alerte, jamais blocage » : une identité
incomplète **n'empêche pas d'encaisser**, elle affiche un avertissement et le
ticket sort avec les mentions disponibles.

**Limite honnête** : les données du pilote ne sont pas conformes —
`NIF 123456789` et `NIS 987654321` font 9 chiffres, pas 15. L'application le
signale en rouge dans `/parametres`, mais **c'est au propriétaire de fournir
ses vrais identifiants**.

### 11.2 US-15.2 — restauration, et pourquoi une migration était nécessaire

**Découverte bloquante** : sur 22 tables, **11 n'ont aucune policy INSERT**
(`ventes`, `clotures`, `recette_versions`, `recette_familles`,
`ordres_fabrication`, `transferts`, `bons_commande`, `cakes`,
`historique_prix`, `fournisseurs`, `z_imports`) : elles s'écrivent par des RPC
`SECURITY DEFINER`. Une restauration par `INSERT` client aurait donc échoué au
milieu du parcours et laissé la base **à moitié restaurée** en annonçant un
succès partiel. C'est précisément le « données identiques » de CA-15.

**Livré** : migration **18** `public.restaurer_sauvegarde(jsonb)` —
`SECURITY DEFINER`, `search_path=''`, garde `proprietaire` explicite,
`revoke all … from public, anon`, une seule transaction, ordre topologique
imposé, refus de tout `client_id` étranger (au niveau du dump **et** de chaque
ligne). Côté app : `src/lib/sauvegarde.ts` (format versionné, empreinte
FNV-1a, 15 tests), `/api/sauvegarde` (export JSON propriétaire),
`actions-restauration.ts` (analyser → confirmer en tapant RESTAURER),
`SauvegardePanel`.

> ⚠️ **Cette preuve était incomplète** — voir §12 : `clients` n'était pas
> exporté et la restauration échouait sur une base vierge. Le scénario corrigé
> est en §12.4 (53 lignes / 15 tables, empreinte identique).

**CA-15 « sauvegarde → restauration = données identiques » (scénario initial,
8 tables, `clients` exclué) :** joué en transaction (rollback, base intacte
après coup — vérifié) :

| Étape | Résultat |
|---|---|
| Dump JSON (8 tables métier) | `articles16 · lots12 · sites2 · ventes2 · OF2 · versions2 · familles2 · clotures1` |
| Vidage total | `articles = 0` |
| `restaurer_sauvegarde(dump)` | 39 lignes réinsérées, 0 ignorée |
| Empreinte métier avant/après | **identiques** (`OUI`) |
| Rejeu du même dump | 0 insérée, 39 ignorées — **idempotent** |

Gardes testées en base, JWT simulé par `request.jwt.claims` :

| Cas | Résultat |
|---|---|
| vendeur | `Role non autorise : restauration reservee au proprietaire.` |
| labo | idem |
| propriétaire + dump d'un autre tenant | `Cette sauvegarde appartient a un autre etablissement.` |
| propriétaire + ligne `client_id` étranger | `Ligne etrangere detectee dans la table sites : restauration refusee.` |
| sans JWT | `Non authentifie.` |
| propriétaire + dump valide | accepté |

Vérifié aussi : `secdef=true`, `owner=postgres`, `anon` **sans** droit
d'exécution, `public_exec = 0`.

### 11.3 Ce que cette livraison ne prouve pas

- La restauration n'a **pas** été exercée dans un navigateur sur l'URL de
  production : seulement la logique, la RPC et les gardes (5/5) en base.
- La base de test a été vidée puis restaurée **dans une transaction annulée** ;
  une restauration réelle sur une base de production vierge reste à faire.
- `utilisateurs` n'est pas dans le dump (rattachés à `auth.users`) — les
  comptes se recréent côté Supabase Auth, c'est documenté dans le fichier.
- Les 3 critères humains de §10.4 restent ouverts.

---

## 12. Revue de mon propre travail (même jour) — 3 bugs livrés, corrigés

Relire ce qu'on vient de pousser vaut mieux que le relire jamais. Trois défauts
**réels** trouvés dans mon propre code de la §11, tous invisibles pour les tests
que j'avais écrits, parce que ces tests ne touchaient pas la base.

### 12.1 `clients` filtré sur `client_id` — la sauvegarde ne marchait pas

`clients` n'a **pas** de colonne `client_id` : sa clé est `id`, et ce sont les
21 autres tables qui la référencent par `client_id`. Ma route `/api/sauvegarde`
faisait `.eq("client_id", …)` sur **toutes** les tables, `clients` compris.
PostgREST répond alors `400 column clients.client_id does not exist`, que je
transformais en **500** : la sauvegarde échouait à chaque appel, et le message
ne disait pas pourquoi.

Correction : `colonneTenant(table)` dans `src/lib/sauvegarde.ts` (module pur,
testé), utilisée par la route. Deux tests de régression, dont un invariant de
sécurité qui refuse désormais tout `from("clients").…eq("client_id")` dans
`src/`.

### 12.2 `z_imports` restauré avant `ventes` — violation de clé étrangère

Mon ordre de restauration plaçait `z_imports` **avant** `ventes`, alors que
`z_imports.vente_id` référence `ventes.id`. Sur une base où les deux tables ont
des lignes, la restauration échouait. Mes tests ne l'ont pas vu : **je n'avais
testé que 8 tables sur les 15 peuplées**, et `z_imports` était vide.

`z_imports` est maintenant après `ventes`. Un test énumère **27 paires de FK**
relevées sur la base et vérifie que l'ordre les respecte toutes.

### 12.3 La restauration échoue sur une base vierge — `clients` est la racine

Conséquence du 12.1, et c'était plus grave que je ne l'avais écrit : puisque
`clients` n'était jamais exporté, une restauration sur base vide violait la clé
étrangère `articles.client_id → clients.id` dès la première table. Autrement
dit, **mon « CA-15 prouvé » de la §11.2 ne prouvait rien** : mes deux scripts de
test excluaient le vidage de `clients` pour rester dans une transaction
annulable — ce qui masquait exactement le cas « base vide » du critère.

`clients` est désormais exporté (colonne `id`), et la fonction SQL vérifie que
le client existe avant de restaurer, avec un message explicite au lieu d'une
violation de FK au milieu du parcours.

### 12.4 CA-15 refait, honnêtement, sur les 15 tables peuplées

Scénario rejoué en transaction annulée (base vérifiée intacte après) :

| Étape | Résultat |
|---|---|
| Dump | **53 lignes / 15 tables** (clients exclu de la restauration : racine préexistante) |
| Vidage | articles 0 · ventes 0 · lots 0 |
| `restaurer_sauvegarde(dump)` | **53 lignes réinsérées**, 0 ignorée |
| Empreinte métier par table, avant/après | **IDENTIQUE sur les 15 tables** |

Test de conflit partiel (le cas réel : base déjà utilisée) : seuls les lots
vidés → `insere={lots:12}`, `ignore={sites:2, articles:16}`, état final complet
sans doublon.

Test d'atomicité : un lot volontairement incomplet (colonne `pu` NULL) échoue
en `23502`, et la base reste **inchangée** (12 lots avant, 12 après).

### 12.5 Deux défauts d'usage corrigés

- **Panneau de restauration** : il fallait **re-sélectionner le fichier** entre
  « analyser » et « confirmer » — un `<input type="file">` se vide après envoi.
  Le fichier est maintenant gardé en état React, `FormData` construit à la
  main, bouton de confirmation désactivé tant que `RESTAURER` n'est pas tapé.
- **`23502`** (NOT NULL) tombait dans le message générique ; il dit maintenant
  « le fichier est incomplet ou a été modifié », sans jargon Postgres.

### 12.6 Ce que la revue confirme comme correct

- Seules `parametres_couts` et `recette_versions` ont un SELECT restreint par
  rôle, et ce sont **exactement** les deux tables marquées `cout: true` dans
  `TABLES_EXPORT` : un vendeur ne peut exporter aucune donnée de coût.
- Toutes les tables ont une policy SELECT ; les 11 tables sans INSERT passent
  bien par la RPC de restauration.
- Les 2 FK en `SET NULL` (`lots.fournisseur_id`, `mouvements.lot_id`) imposent
  `fournisseurs` avant `lots` : l'ordre le respecte.

### 12.7 Portes après correction

`typecheck` 0 · `lint` 0 · `test` **246/246** · `build` OK · `smoke` **10/10**.

**Ce qui reste faux malgré tout** : ces preuves tournent en transaction annulée
sur la base du pilote, pas sur une base de production réellement vierge, et
jamais dans un navigateur. La §10.4 reste la référence de ce qui n'est pas fait.

---

## 13. Check-list 60 cas : deux pièges de protocole, et une matrice RLS réelle

### 13.1 Deux tests RLS qui ne testaient rien

En écrivant la check-list, mes premiers tests ont « prouvé » deux fuites :
le labo modifiant le NIF de l'établissement, et le vendeur lisant les 2
recettes (donc `mo_min`). **Les deux étaient faux**, et la cause est
importante :

1. **La session du connecteur SQL est `postgres`, superutilisateur.** Elle
   contourne la RLS. Poser `request.jwt.claims` ne suffit pas.
2. **`set_config('role','none',true)` ne change pas de rôle** — PostgreSQL
   comprend « garde ton rôle actuel ». Il faut `authenticated` / `anon`.

Après correction, les deux écarts disparaissent. Le protocole correct est
encodé dans `src/lib/rls-probe.ts` (12 tests), avec un test qui **interdit**
explicitement `set_config('role','none')` pour que l'erreur ne revienne pas.

### 13.2 Matrice RLS des 4 personas (mesurée, 12/12 conformes)

| Persona | Coûts (pc/rv) | Insert stock | Maj identité |
|---|---|---|---|
| vendeur | **0 / 0** | **42501 refusé** | **0 ligne** |
| labo | 0 / **2** | accepté | **0 ligne** |
| propriétaire | 0 / **2** | accepté | **1 ligne** |
| anon | 0 | refusé | 0 |

### 13.3 Cas métier mesurés

Vente FEFO : `totalTTC` 202.30 pour 2 × 85 HT à 19 % — exact. Rejeu du même
ticket : `duplicate: true`, **même `sale_id`**, une seule vente, stock
inchangé. Vendeur sur `creer_of` : refusé en `P0001`.

**Cas 3, à trancher avec le pilote** : vendre plus que le stock disponible
**passe** et enregistre un `missing`. C'est un choix écrit dans la migration 06
(« écart sans lot, jamais de stock négatif ») et cohérent avec « alerte,
jamais blocage » — mais pour une gestion de stock stricte, c'est discutable.
L'UI le signale ; je ne tranche pas à la place du métier.

### 13.4 Portes

`typecheck` 0 · `lint` 0 · `test` **260/260** · `build` OK · `smoke` 10/10.

Reste non fait : les cas **navigateur** (Auth réelle, coupure réseau, impression
80 mm, onboarding chronométré). Ils sont dans `CHECKLIST-60.md` §4 et restent
la raison pour laquelle le produit n'est pas « production-ready ».
