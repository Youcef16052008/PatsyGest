# Tranche 06/20 — Machines a Etats, Workflows & Invariants Metier

**Couche** : Couche 2 — Logique metier & integrite · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S06.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**74 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/06-machines-etat-workflows.md` | 229 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/avoir-form.tsx` | 130 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cake-forms.tsx` | 328 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cake-operations.tsx` | 56 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cash-closing-quick.tsx` | 264 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/closing-operations.tsx` | 359 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cloture-form.tsx` | 231 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/commande-forms.tsx` | 177 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/credits-workspace.tsx` | 445 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/fournisseur-form.tsx` | 31 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/kitchen-lab-screen.tsx` | 381 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/lab-cake-form.tsx` | 16 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/lab-workspace.tsx` | 67 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/of-forms.tsx` | 241 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/onboarding-panel.tsx` | 49 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/planning-forms.tsx` | 53 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/planning-operations.tsx` | 33 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/production-board.tsx` | 44 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/production-workspace.tsx` | 58 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/quality-alerts-panel.tsx` | 45 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/quality-forms.tsx` | 122 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/quality-operations.tsx` | 24 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recall-form.tsx` | 147 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recipe-operations.tsx` | 62 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/restock-request-quick-form.tsx` | 169 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/simulation-form.tsx` | 101 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/simulation-operations.tsx` | 25 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sprint2-operations.tsx` | 68 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/stock-write-forms.tsx` | 103 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/tomorrow-lab-panel.tsx` | 717 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/trace-operations.tsx` | 39 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/transfer-form.tsx` | 57 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/z-import-form.tsx` | 90 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/z-import-operations.tsx` | 27 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-achats.ts` | 90 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-cakes.ts` | 172 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-clotures.ts` | 118 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-free-recipes.ts` | 171 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-haccp.ts` | 138 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-of.ts` | 125 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-onboarding.ts` | 104 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-planning.ts` | 195 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-rappel.ts` | 95 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-recettes.ts` | 107 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/onboarding-server.ts` | 27 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/onboarding.ts` | 85 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/patisgest-store.ts` | 649 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/quality-alerts.ts` | 139 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-lab-private-server.ts` | 49 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-lab-server.ts` | 324 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-lab.ts` | 538 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/tomorrow-recipe-guard.ts` | 22 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/07-of-production.sql` | 455 | migration 07: OF: cycle de vie, contraintes de statut, transitions |
| `patisgest-app/supabase/09-journaux-ecritures.sql` | 423 | migration 09: clotures, non-conformites, cakes: machines a etats |
| `patisgest-app/supabase/10-achats-commandes.sql` | 211 | migration 10: achats/commandes: cycle commande -> reception |
| `patisgest-app/supabase/11-import-z.sql` | 222 | migration 11: import Z: invariant (date, caisse, numero Z) |
| `patisgest-app/supabase/13-rappel-blocage-lots.sql` | 266 | migration 13: rappel/blocage de lots: invariant de consommation |
| `patisgest-app/supabase/45-recettes-libres.sql` | 63 | migration 45: recettes libres: cycle de vie et suppression |
| `patisgest-app/supabase/47-onboarding-pack-dz.sql` | 68 | migration 47: onboarding pack DZ: donnees initiales |
| `patisgest-app/supabase/49-wave3-wave4.sql` | 47 | migration 49: wave3/wave4: workflows additionnels |
| `patisgest-app/tests/cake-dossier.test.mjs` | 41 | test a auditer pour cette tranche |
| `patisgest-app/tests/cake-production-db.test.mjs` | 75 | test a auditer pour cette tranche |
| `patisgest-app/tests/lots-batch.test.mjs` | 57 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-cout-partiel-brouillon.test.mjs` | 46 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-cout-partiel-main.test.mjs` | 27 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-perte-experimentale.test.mjs` | 171 | test a auditer pour cette tranche |
| `patisgest-app/tests/onboarding.test.mjs` | 81 | test a auditer pour cette tranche |
| `patisgest-app/tests/quality-alerts.test.mjs` | 102 | test a auditer pour cette tranche |
| `patisgest-app/tests/store.test.mjs` | 596 | test a auditer pour cette tranche |
| `patisgest-app/tests/unicite-lot.test.mjs` | 78 | test a auditer pour cette tranche |
| `patisgest-app/tests/usabilite-parcours.test.mjs` | 84 | test a auditer pour cette tranche |
| `patisgest-app/tests/wave1-features.test.mjs` | 82 | test a auditer pour cette tranche |
| `patisgest-app/tests/wave2-features.test.mjs` | 95 | test a auditer pour cette tranche |
| `patisgest-app/tests/wave3-wave4.test.mjs` | 90 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/supabase/26-vitrine-publique.sql` → **T04** (`migration 26: vitrine publique: vue catalogue et donnees exposees`) : preuve de traçage uniquement.
- Les verrous/idempotence (T07), les types/contraintes SQL (T08), le store démo comme doublon (T16).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/cake-dossier.test.mjs` (41 lignes) — propriété T06.
- `patisgest-app/tests/cake-production-db.test.mjs` (75 lignes) — propriété T06.
- `patisgest-app/tests/lots-batch.test.mjs` (57 lignes) — propriété T06.
- `patisgest-app/tests/of-cout-partiel-brouillon.test.mjs` (46 lignes) — propriété T06.
- `patisgest-app/tests/of-cout-partiel-main.test.mjs` (27 lignes) — propriété T06.
- `patisgest-app/tests/of-perte-experimentale.test.mjs` (171 lignes) — propriété T06.
- `patisgest-app/tests/onboarding.test.mjs` (81 lignes) — propriété T06.
- `patisgest-app/tests/quality-alerts.test.mjs` (102 lignes) — propriété T06.
- `patisgest-app/tests/store.test.mjs` (596 lignes) — propriété T06.
- `patisgest-app/tests/unicite-lot.test.mjs` (78 lignes) — propriété T06.
- `patisgest-app/tests/usabilite-parcours.test.mjs` (84 lignes) — propriété T06.
- `patisgest-app/tests/wave1-features.test.mjs` (82 lignes) — propriété T06.
- `patisgest-app/tests/wave2-features.test.mjs` (95 lignes) — propriété T06.
- `patisgest-app/tests/wave3-wave4.test.mjs` (90 lignes) — propriété T06.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H06-01** — `patisgest-app/src/lib/patisgest-store.ts:492` — `allowed: Record<CakeStatus,CakeStatus[]>` : transitions du mode demo uniquement. Comparer avec la machine a etats SQL de `09-journaux-ecritures.sql:363-412` et reperer les transitions autorisees d'un cote seulement.
- **H06-02** — `patisgest-app/supabase/09-journaux-ecritures.sql:18` — `CHECK (statut IN ('ouverte','cloturee','Ouverte','Cloturee'))` : 4 valeurs dont deux casse/accent. Verifier `maj_non_conformite` (l.205, 216) et le risque de blocage d'une NC historique.
- **H06-03** — `patisgest-app/supabase/07-of-production.sql:22` — `add constraint ordres_fabrication_statut_valid check (...)` : verifier que `terminer_of` (l.377) verrouille la ligne (l.370 `for update`) et refuse un OF deja `termine`.
- **H06-04** — `patisgest-app/supabase/07-of-production.sql:425` — `v_new_statut := case when v_of.qte_realisee + p_qte >= v_of.qte_prevue` : une quantite superieure au prevu est-elle acceptee ? Montrer le calcul et l'effet sur le lot produit.
- **H06-05** — `patisgest-app/supabase/09-journaux-ecritures.sql:9` — `CREATE UNIQUE INDEX clotures_revision_unique` : verifier la composition exacte de la cle, la valeur par defaut de `revision` et le comportement des NULL dans un index unique.
- **H06-06** — `patisgest-app/src/lib/patisgest-store.ts:383` — `if (previous.length && !revise) throw` : la regle de revision des clotures n'existe que dans le store demo ; prouver son equivalent cote RPC `saisir_cloture`.
- **H06-07** — `patisgest-app/supabase/13-rappel-blocage-lots.sql:129` — RPC `rappel_lot` (security definer, l.129) : verifier qu'un lot rappele ne peut plus etre consomme par FEFO (21-prix-demain-panier.sql:598) ni vendu.
- **H06-08** — `patisgest-app/src/lib/tomorrow-lab.ts:312` — `if (!["planifie","encours","partiel"].includes(o.statut)) continue;` : les OF termines sont exclus du plan ; verifier les demandes de reassort orphelines et les effets de bord non annules.
- **H06-09** — `patisgest-app/src/lib/actions-clotures.ts:82` — Validation `fondInitial`/`especesComptees` : verifier la presence de NaN, la note tronquee a 250 (l.93) et la coherence avec `parseClosingInput` (journal-input.ts:83).
- **H06-10** — `patisgest-app/supabase/26-vitrine-publique.sql:179` — `drop constraint cakes_statut_valid` puis `add constraint` (l.187) : verifier que la nouvelle liste couvre l'origine vitrine et que les statuts existants restent valides.
- **H06-11** — `patisgest-app/src/lib/actions-cakes.ts:43` — `if (!Number.isFinite(prixHt) || prixHt <= 0)` et `tvaPct` 0..100 : `nbParts` (l.36) n'est pas valide ici. Tracer jusqu'a la RPC creer_cake et la contrainte SQL.
- **H06-12** — `patisgest-app/src/lib/actions-of.ts:59` — `duplicate: true` sur reference client : verifier que l'etat 'OF deja enregistre' n'est pas confondu avec un OF reellement cree (T07 audite le verrou, T06 l'invariant d'etat).

---

### Protocole forensique obligatoire (7 étapes, À EXÉCUTER DANS L'ORDRE avant tout verdict)

1. **Reconstruction depuis le code seul** — décris en ≤ 15 lignes l'architecture réelle, les frontières
   de confiance et les invariants critiques (mathématiques, sécurité, état, concurrence) déduits
   **uniquement des fichiers assignés**. Tout commentaire lu = affirmation hostile à vérifier.
2. **Traçage de flux (Taint & Execution Tracing)** — 3 à 5 chemins de bout en bout (nominal, entrée
   hostile, panne réseau/DB, exécution concurrente, rejeu/retry), chaque saut cité `fichier:ligne`,
   de l'entrée HTTP/CLI/Job jusqu'au sink DB/fichier/réseau. Ne jamais supposer une protection « ailleurs ».
3. **Analyse adversariale multi-personas** — attaquant externe / utilisateur authentifié malveillant ;
   utilisateur pressé (double-clic, onglets multiples, horloge déréglée, réseau instable) ; opérateur à
   3 h du matin (timeout, base lente/en pause, déploiement partiel, logs muets) ; système sous charge /
   temps long (×100, minuit, changement d'année, quota plein).
4. **Matrice de concurrence & d'échec** — pour CHAQUE écriture critique : niveau d'isolation, mécanisme
   de verrouillage réel (`FOR UPDATE`, contrainte `UNIQUE`, ou absence), et état exact après échec à
   mi-parcours. Indiquer `N/A (lecture seule)` si la tranche n'a aucune écriture.
5. **Exécution vérifiable & honnêteté radicale** — exécute les commandes réelles que l'environnement
   permet (`npm test`, `npm run typecheck`, `npm run lint`, harnais PGlite si disponible), cite la
   **sortie brute**. Tout le reste doit être marqué **`[STATIQUE UNIQUEMENT]`**. Ne jamais prétendre
   avoir lancé une DB, un navigateur ou un outil non lancé.
6. **Audit anti-tautologie des tests existants** — pour chaque test clé : *si j'introduis le bug, ce
   test échoue-t-il vraiment ?* Distinguer **« aucun test »** de **« test présent mais incapable
   d'échouer / mock mensonger »**. Un test vert ne prouve rien.
7. **Passe 2 obligatoire (chasse aux angles morts)** — relis tous les fichiers assignés une seconde
   fois, en cherchant spécifiquement : valeurs par défaut fail-open, `null`/`NaN`/`undefined`,
   troncatures silencieuses, comportements implicites du framework/SQL, casts masquant la réalité.
   Indique en fin de rapport ce que la Passe 2 a **ajouté, confirmé ou réfuté**.

---

### Format de sortie standardisé (identique aux 20 tranches)

1. **Synthèse exécutive** — maturité réelle (code, pas promesses), verdict partiel, top 1–3 risques,
   actions immédiates.
2. **Modèle réel, Invariants & Hypothèses réfutées** — architecture/invariants avec `fichier:ligne` ;
   liste courte des pistes vérifiées et **réfutées avec preuve** (ce qui est sain ne doit pas être critiqué).
3. **Constats (Findings)** — un bloc par défaut, identifiant `SXX-F001` :
   `ID`, `Titre`, `Sévérité` (Critique/Haute/Moyenne/Basse/Informationnelle),
   `Statut de preuve` (`PROUVÉ-EXÉCUTION`/`PROUVÉ-STATIQUE`/`RISQUE-POTENTIEL`/`DRIFT-DOC`),
   `Confiance`, `Catégorie`, `Localisation` (`chemin:lignes` + symbole exact), `Preuve` (extrait exact /
   trace / calcul arithmétique complet), `Défaut (Cause racine)`, `Impact réel`, `Reproduction`
   (étapes, payload, requête ou séquence concurrente exacte), `Correctif minimal recommandé`,
   `Exemple corrigé`, `Test de régression (« qui mord »)` (échoue avant, passe après).
4. **Angles morts de couverture de tests** — deux sous-listes distinctes : (a) comportements critiques
   **sans aucun test**, (b) tests existants **faibles/tautologiques/découplés du runtime** (mocks mensongers).
5. **Plan de tests ciblé** — Unitaire · Intégration · E2E · Sécurité/Abus · Concurrence/Idempotence ·
   Performance/Limites · Panne/Reprise · Régression, avec entrées exactes, résultats attendus et
   réutilisation du harnais existant (`tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`,
   PGlite, `tests/integration/*`).
6. **Plan d'action priorisé** — `P0` bloquant avant production, `P1` avant prochaine release,
   `P2` amélioration structurelle, `P3` hygiène.
7. **Verdict final & Note de Passe 2** — **un seul** verdict parmi
   `Prêt pour la production (ce périmètre)` / `Prêt après correctifs P0 listés` /
   `Non livrable en l'état (ce périmètre)`, justification factuelle, puis bilan de la Passe 2.

---

### Règles non négociables

- **Preuve ou silence** : n'invente jamais de bug. Une zone saine se dit en 2 lignes, puis on passe.
- **Calculs explicites** : tout constat arithmétique ou de limite montre le calcul exact.
- **Zéro modification produit** : aucun fichier applicatif modifié ; seuls les livrables d'audit sont
  écrits. Un test jetable isolé en `/tmp` est toléré s'il est **explicitement signalé**.
- **Impact avant style** : intégrité, sécurité et panne silencieuse avant toute préférence cosmétique.
- **Transparence totale** : chaque limite d'environnement (DB absente, navigateur absent, secrets absents)
  est déclarée explicitement dans le rapport.
- **Propriété exclusive** : ne produis aucun constat sur un fichier listé en *Exclusions* ; cite-le
  uniquement comme preuve de traçage et renvoie le constat à sa tranche propriétaire.

### Limites d’environnement à déclarer dans le rapport

- Aucune base Supabase/PostgreSQL réelle dans ce sandbox (`psql`/`pg_isready` absents,
  `PATSYGEST_PG_URL` absent, aucun secret de production) → les preuves DB sont
  `[STATIQUE UNIQUEMENT]` sauf si la tranche lance elle-même un harnais PGlite.
- Aucun navigateur Playwright/Chromium installé → pas d’E2E réel.
- Résultats déjà mesurés en MODE A et réutilisables tels quels : `npm test` = 788 tests / 781 pass /
  0 fail / 3 skipped / 4 todo / 248 936 ms ; `npm run typecheck` = 0 erreur ; `npm run lint` = 0 erreur ;
  `npm ci` = 402 paquets. `npm run build`, `npm audit`, E2E et DB réelle = **non exécutés**.

### Livrable

- Écrire `audit/rapports/S06.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S06-F001`, `S06-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

