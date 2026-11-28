# Tranche 14/20 — Performance Applicative, Complexite & Ressources

**Couche** : Couche 4 — Fiabilite, performance, structure · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S14.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**12 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/14-performance-applicative.md` | 159 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/tableau-de-bord/page.tsx` | 92 | assemblage des donnees du tableau de bord |
| `patisgest-app/src/app/appearance.css` | 153 | feuille de style: taille de bundle |
| `patisgest-app/src/app/globals.css` | 5 | feuille de style: taille de bundle |
| `patisgest-app/src/app/refinement.css` | 87 | feuille de style: taille de bundle |
| `patisgest-app/src/app/workspace.css` | 1011 | feuille de style: taille de bundle |
| `patisgest-app/src/components/free-recipes-workspace.tsx` | 900 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/dashboard-insights.ts` | 134 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/owner-day.ts` | 41 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/dashboard-insights.test.mjs` | 38 | test a auditer pour cette tranche |
| `patisgest-app/tests/owner-day.test.mjs` | 90 | test a auditer pour cette tranche |
| `patisgest-app/tests/performance-dashboard.test.mjs` | 174 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/workspace-read.ts` → **T15** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/tomorrow-lab.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/portion-estimator.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/ingredient-impact.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/courses-server.ts` → **T15** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/portion-estimator.tsx` → **T05** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les plans de requête et indexes (T15), les casts et la duplication (T16).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/dashboard-insights.test.mjs` (38 lignes) — propriété T14.
- `patisgest-app/tests/owner-day.test.mjs` (90 lignes) — propriété T14.
- `patisgest-app/tests/performance-dashboard.test.mjs` (174 lignes) — propriété T14.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (10)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H14-01** — `patisgest-app/src/lib/dashboard-insights.ts:11` — `articles.filter(...).map(a => lots.filter(...).reduce(...))` : complexite O(A x L). Calculer le nombre d'operations pour A=1 000 et L=5 000 (5 000 000).
- **H14-02** — `patisgest-app/src/lib/dashboard-insights.ts:36` — Second motif O(A x L) dans `productVelocity` : verifier si les deux fonctions sont appelees dans le meme rendu (tableau-de-bord) et si les resultats sont memoises.
- **H14-03** — `patisgest-app/src/lib/workspace-read.ts:24` — `LIMITE_TOTALE = 20_000`, `PAGE_SIZE = 500` (l.8), boucle `while` (l.28) : 40 requetes SEQUENTIelles par rendu. Mesurer la latence a 20 000 lignes.
- **H14-04** — `patisgest-app/src/lib/tomorrow-lab.ts:346` — Boucles imbriquees sur `sameDowDates` et `byDate` (l.358) : evaluer le cout a volume x100 et le passage a minuit/changement d'annee.
- **H14-05** — `patisgest-app/src/components/free-recipes-workspace.tsx:131` — Composant de 900 lignes avec plusieurs `useSyncExternalStore`/`localStorage` (l.111, 141, 223) : reperer les rendus couteux et les recalculs a chaque frappe.
- **H14-06** — `patisgest-app/src/app/workspace.css:1` — 1 011 lignes / 87 697 octets de CSS : verifier l'inclusion dans le bundle critique et l'impact sur le First Contentful Paint de la caisse.
- **H14-07** — `patisgest-app/src/lib/portion-estimator.ts:368` — Boucle sur `input.lignes` dans un module de 687 lignes couple a un composant de 977 lignes : verifier la complexite et l'absence de memoisation.
- **H14-08** — `patisgest-app/src/lib/ingredient-impact.ts:198` — Trois Maps puis boucles sur `current.ingredients` (l.212) : verifier la charge memoire sur 5 000 lots et 1 000 versions de recettes.
- **H14-09** — `patisgest-app/src/lib/courses-server.ts:46` — `Promise.all` de 4 requetes dont deux `.limit(5000)` (l.60, 67) : verifier la memoire et le cout de l'agregation en JS (l.83-111).
- **H14-10** — `patisgest-app/src/components/portion-estimator.tsx:95` — `useSyncExternalStore` lisant `localStorage` a chaque snapshot : verifier la stabilite de l'objet retourne (boucle de rendu) et le cout de `JSON.parse`.

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

- Écrire `audit/rapports/S14.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S14-F001`, `S14-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

