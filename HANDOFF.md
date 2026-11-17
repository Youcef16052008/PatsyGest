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

Les migrations **05→16** ont été appliquées **à distance** (connector
Supabase, `execute_query`) ET sont rejouables depuis `patisgest-app/supabase/`
(01..16). Points de contrôle à re-vérifier en SQL (TX `begin; … rollback;`) :

| # | Vérification attendue |
|---|---|
| M-a | `creer_of(Mill v2, qte12)` → besoins exacts `{SF-CPA1, SF-PFE1.2, MP-SUC0.15}` kg (régression seed) |
| M-b | Sous-recette : conversion `g→kg` + version SF → `creer_of(Croissant v2,40)` → `MP-FAR0.45` + `MP-SUC0.15` (fusion0.05+0.1) |
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

**154 tests** : store47 · stock-input10 · journal-input15 · purchase-input6 ·
z-input6 · price-alerts6 · reconciliation5 · label-model5 · **cost-sheet13** ·
**rc-reference11** · **fefo-cost6** · **quality-alerts8** · **sale-queue6** ·
**of-queue5** · smoke **6/6** (séparé).

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

- Démo (pilote, choix utilisateur) : `amina@patisserie.dz` (labo),
  `sara@patisserie.dz` (vendeur), `amine@patisserie.dz` (propriétaire),
  mdp `PatisGest2026!`.
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
