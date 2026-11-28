# Tranche 05/20 — Moteurs de Calcul, Precision Numerique & Regles Financieres

**Couche** : Couche 2 — Logique metier & integrite · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S05.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**65 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/05-calculs-precision-financiere.md` | 228 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/cake-ticket.tsx` | 77 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/charge-capacite-panel.tsx` | 129 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cost-sheet-form.tsx` | 176 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/ingredient-impact-panel.tsx` | 480 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/owner-price-alerts.tsx` | 266 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/portion-estimator.tsx` | 977 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recon-panel.tsx` | 183 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-composer.tsx` | 539 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-credit-fields.tsx` | 58 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-form.tsx` | 496 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-history.tsx` | 72 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sale-ticket.tsx` | 154 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sales-chart.tsx` | 144 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/shop-advisor-panel.tsx` | 264 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-caisse.ts` | 364 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-couts.ts` | 538 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-credits.ts` | 206 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-price-alerts.ts` | 172 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-simulation.ts` | 105 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/cake-money.ts` | 6 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/cake-priority.ts` | 9 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/charge-capacite.ts` | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/cost-sheet.ts` | 294 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/credits.ts` | 153 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/fefo-cost.ts` | 132 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/free-recipes.ts` | 165 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/ingredient-impact.ts` | 541 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/main-oeuvre.ts` | 34 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/owner-price-guard.ts` | 119 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/portion-estimator.ts` | 687 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pos-cart.ts` | 359 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/price-alerts.ts` | 57 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/reconciliation.ts` | 288 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/shop-advisor.ts` | 404 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/06-ventes-caisse-fefo.sql` | 192 | migration 06: vente FEFO: arrondi, consommation de lots, totaux |
| `patisgest-app/supabase/12-sous-recettes-conversions.sql` | 442 | migration 12: sous-recettes et conversions: facteurs et couts |
| `patisgest-app/supabase/14-cake-edition-cgv-ticket.sql` | 152 | migration 14: edition cake, CGV, ticket: montants et acompte |
| `patisgest-app/supabase/15-parametres-couts.sql` | 25 | migration 15: parametres de couts: taux horaire, charges |
| `patisgest-app/supabase/21-prix-demain-panier.sql` | 1249 | migration 21: prix demain/panier: vendre_panier, FEFO, arrondis |
| `patisgest-app/supabase/22-cake-production.sql` | 203 | migration 22: production cake: couts et tickets |
| `patisgest-app/supabase/34-cout-of-partiel.sql` | 47 | migration 34: cout OF partiel: calcul des couts connus |
| `patisgest-app/supabase/41-avoirs-retours.sql` | 281 | migration 41: avoirs/retours: montants negatifs |
| `patisgest-app/supabase/46-credits-clients.sql` | 132 | migration 46: credits clients: soldes et reglements |
| `patisgest-app/tests/actions-credits.test.mjs` | 274 | test a auditer pour cette tranche |
| `patisgest-app/tests/avoirs-db.test.mjs` | 270 | test a auditer pour cette tranche |
| `patisgest-app/tests/charge-capacite.test.mjs` | 97 | test a auditer pour cette tranche |
| `patisgest-app/tests/cost-sheet.test.mjs` | 124 | test a auditer pour cette tranche |
| `patisgest-app/tests/credits.test.mjs` | 146 | test a auditer pour cette tranche |
| `patisgest-app/tests/csv.test.mjs` | 128 | test a auditer pour cette tranche |
| `patisgest-app/tests/export-comptable.test.mjs` | 104 | test a auditer pour cette tranche |
| `patisgest-app/tests/fefo-cost.test.mjs` | 123 | test a auditer pour cette tranche |
| `patisgest-app/tests/fefo-parite-db.test.mjs` | 30 | test a auditer pour cette tranche |
| `patisgest-app/tests/free-recipes-dashboard.test.mjs` | 60 | test a auditer pour cette tranche |
| `patisgest-app/tests/impression-ticket.test.mjs` | 69 | test a auditer pour cette tranche |
| `patisgest-app/tests/ingredient-impact.test.mjs` | 265 | test a auditer pour cette tranche |
| `patisgest-app/tests/main-oeuvre.test.mjs` | 31 | test a auditer pour cette tranche |
| `patisgest-app/tests/portion-estimator.test.mjs` | 178 | test a auditer pour cette tranche |
| `patisgest-app/tests/pos-cart-demain.test.mjs` | 270 | test a auditer pour cette tranche |
| `patisgest-app/tests/pos-cart-prix-nul.test.mjs` | 25 | test a auditer pour cette tranche |
| `patisgest-app/tests/pos-rounding.test.mjs` | 62 | test a auditer pour cette tranche |
| `patisgest-app/tests/price-alerts.test.mjs` | 60 | test a auditer pour cette tranche |
| `patisgest-app/tests/rc-reference.test.mjs` | 100 | test a auditer pour cette tranche |
| `patisgest-app/tests/reconciliation.test.mjs` | 75 | test a auditer pour cette tranche |
| `patisgest-app/tests/shop-advisor.test.mjs` | 127 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/export-comptable.ts` → **T12** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-free-recipes.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les contrats HTTP et la sérialisation (T09/T12), les verrous SQL (T07), les indexes (T15).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/actions-credits.test.mjs` (274 lignes) — propriété T05.
- `patisgest-app/tests/avoirs-db.test.mjs` (270 lignes) — propriété T05.
- `patisgest-app/tests/charge-capacite.test.mjs` (97 lignes) — propriété T05.
- `patisgest-app/tests/cost-sheet.test.mjs` (124 lignes) — propriété T05.
- `patisgest-app/tests/credits.test.mjs` (146 lignes) — propriété T05.
- `patisgest-app/tests/csv.test.mjs` (128 lignes) — propriété T05.
- `patisgest-app/tests/export-comptable.test.mjs` (104 lignes) — propriété T05.
- `patisgest-app/tests/fefo-cost.test.mjs` (123 lignes) — propriété T05.
- `patisgest-app/tests/fefo-parite-db.test.mjs` (30 lignes) — propriété T05.
- `patisgest-app/tests/free-recipes-dashboard.test.mjs` (60 lignes) — propriété T05.
- `patisgest-app/tests/impression-ticket.test.mjs` (69 lignes) — propriété T05.
- `patisgest-app/tests/ingredient-impact.test.mjs` (265 lignes) — propriété T05.
- `patisgest-app/tests/main-oeuvre.test.mjs` (31 lignes) — propriété T05.
- `patisgest-app/tests/portion-estimator.test.mjs` (178 lignes) — propriété T05.
- `patisgest-app/tests/pos-cart-demain.test.mjs` (270 lignes) — propriété T05.
- `patisgest-app/tests/pos-cart-prix-nul.test.mjs` (25 lignes) — propriété T05.
- `patisgest-app/tests/pos-rounding.test.mjs` (62 lignes) — propriété T05.
- `patisgest-app/tests/price-alerts.test.mjs` (60 lignes) — propriété T05.
- `patisgest-app/tests/rc-reference.test.mjs` (100 lignes) — propriété T05.
- `patisgest-app/tests/reconciliation.test.mjs` (75 lignes) — propriété T05.
- `patisgest-app/tests/shop-advisor.test.mjs` (127 lignes) — propriété T05.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H05-01** — `patisgest-app/src/lib/pos-cart.ts:77` — `round4 = n => Math.round((n + Number.EPSILON) * 10_000)/10_000` : EPSILON ajoute est negligible pour les grands nombres et biaise les negatifs. Comparer avec `numeric` PostgreSQL et la limite MAX_CART_QTE (l.15).
- **H05-02** — `patisgest-app/src/lib/pos-cart.ts:113` — Calcul BigInt `q.coefficient * prix.coefficient * BIGINT_HUNDRED` : avec qte=1e8 et prix=1e8, verifier le depassement de BIGINT et la parite avec `round(x,2)` de 21-prix-demain-panier.sql:503.
- **H05-03** — `patisgest-app/src/lib/pos-cart.ts:214` — `item.prixHT > 0` refuse le prix nul cote client : verifier que le serveur (21/53) applique la meme regle et qu'un panier forge via RPC n'encaisse pas 0 DA.
- **H05-04** — `patisgest-app/src/lib/cake-money.ts:3` — `prixHt * (1 + tvaPct/100)` en virgule flottante puis `Math.round(...)` : montrer un cas ou le resultat differe du `numeric` SQL (demi-centime, arrondi half-up).
- **H05-05** — `patisgest-app/src/lib/export-comptable.ts:71` — `arrondi2 = n => Math.round(n*100)/100` : pour les avoirs negatifs (l.88 `signe = -1`), Math.round(-x.5) arrondit vers le haut, pas comme PostgreSQL round(numeric,2). Calculer l'ecart sur un avoir a 0,005.
- **H05-06** — `patisgest-app/src/lib/actions-couts.ts:236` — `Math.round(lignes.reduce((s,l) => s+l.cout,0)*100)/100` : arrondi du total apres somme de floats ; comparer avec la somme d'arrondis par ligne et l'impact sur la marge.
- **H05-07** — `patisgest-app/src/lib/actions-simulation.ts:95` — `coutUnite: Math.round((total/qte)*10000)/10000` : verifier la garde sur qte (l.46) et le resultat si qte=0 ou NaN (Infinity/NaN serialise en JSON).
- **H05-08** — `patisgest-app/supabase/21-prix-demain-panier.sql:503` — `round(v_total_ht, 2)` / `round(v_total_ttc, 2)` : reconstruire le calcul ligne par ligne et le comparer a `computeCartTotals` (pos-cart.ts:251-253) sur un panier de 3 lignes a 4 decimales.
- **H05-09** — `patisgest-app/src/lib/actions-credits.ts:91` — `Math.round(Number(input.montantTotalDa)*100)/100` puis `regle > total` (l.93) : tester NaN, Infinity, montant negatif et la perte d'un centime sur un reglement partiel.
- **H05-10** — `patisgest-app/src/lib/pos-cart.ts:129` — `isValidCartQty` (0,0001..1e8, 4 decimales) cote client vs les controles de `53-caisse-ticket-scope.sql:79-88` (ticket, lignes, mode) : lister les entrees acceptees d'un cote et refusees de l'autre.
- **H05-11** — `patisgest-app/src/lib/actions-free-recipes.ts:102` — `prix_vente_da: Math.max(0, Math.round(...))` : un prix negatif saisi devient 0 en silence. Verifier la coherence avec le calcul de marge de free-recipes.ts.
- **H05-12** — `patisgest-app/src/lib/actions-couts.ts:444` — `Number(ancienRaw)` avec repli `Number.NaN` (l.444-445) puis garde `Number.isFinite` (l.446) : verifier le cas ou un seul des deux prix est vide et la division par l'ancien prix a 0.

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

- Écrire `audit/rapports/S05.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S05-F001`, `S05-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

