# Tranche 09/20 — Contrats API, Validation d'Entrees & Serialisation

**Couche** : Couche 3 — Contrats & etat client · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S09.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**18 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/09-contrats-api-validation.md` | 168 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/etablissement-form.tsx` | 137 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/express-onboarding.tsx` | 195 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-etablissement.ts` | 58 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/etablissement.ts` | 139 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/i18n.ts` | 81 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/journal-input.ts` | 295 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pagination.ts` | 44 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/purchase-input.ts` | 75 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/stock-input.ts` | 190 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/version-input.ts` | 90 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-format.ts` | 26 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/z-input.ts` | 51 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/journal-input.test.mjs` | 139 | test a auditer pour cette tranche |
| `patisgest-app/tests/pagination.test.mjs` | 53 | test a auditer pour cette tranche |
| `patisgest-app/tests/purchase-input.test.mjs` | 67 | test a auditer pour cette tranche |
| `patisgest-app/tests/stock-input.test.mjs` | 149 | test a auditer pour cette tranche |
| `patisgest-app/tests/z-input.test.mjs` | 38 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/app/api/export/route.ts` → **T12** (`export CSV generique`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/export/comptable/route.ts` → **T12** (`export comptable CSV`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-cakes.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-credits.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts` → **T04** (`Server Action anonyme de commande`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/erreurs-db.ts` → **T13** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les fichiers/export CSV (T12), la performance DB (T15), les états client (T10).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/journal-input.test.mjs` (139 lignes) — propriété T09.
- `patisgest-app/tests/pagination.test.mjs` (53 lignes) — propriété T09.
- `patisgest-app/tests/purchase-input.test.mjs` (67 lignes) — propriété T09.
- `patisgest-app/tests/stock-input.test.mjs` (149 lignes) — propriété T09.
- `patisgest-app/tests/z-input.test.mjs` (38 lignes) — propriété T09.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H09-01** — `patisgest-app/src/app/api/export/route.ts:60` — `> 20 000 lignes` -> 413 : verifier qu'aucune troncature silencieuse ne precede (l.54-59) et que le comptage est exact avec la pagination de `pagination.ts`.
- **H09-02** — `patisgest-app/src/lib/pagination.ts:29` — `while (lignes.length < limiteTotale) { const offset = lignes.length; ... }` : PostgREST `range(debut, fin)` est INCLUSIF. Montrer le decalage d'une ligne si `lirePage` interprete `quantite` comme un nombre de lignes.
- **H09-03** — `patisgest-app/src/lib/pagination.ts:39` — `const sonde = await lirePage(limiteTotale, 1)` : verifier le cas ou la sonde renvoie une ligne deja incluse et la normalisation des codes d'erreur (l.33-34).
- **H09-04** — `patisgest-app/src/lib/z-input.ts:22` — Limite 50 000 caracteres et 100 lignes cote parseur : verifier que `actions-caisse.ts:239` (import Z) applique les MEMES bornes avant l'appel RPC.
- **H09-05** — `patisgest-app/src/lib/journal-input.ts:96` — `lignes.push(line as unknown as ClosingLineInput)` : cast qui affirme une forme non verifiee. Injecter un champ supplementaire et tracer sa propagation jusqu'au JSONB de `saisir_cloture`.
- **H09-06** — `patisgest-app/src/app/api/export/comptable/route.ts:110` — `ventesLecture.lignes as unknown as {...}[]` : mass-assignment/cast ; verifier la normalisation des erreurs et des codes HTTP (l.64-92).
- **H09-07** — `patisgest-app/src/lib/actions-cakes.ts:36` — `Number(formData.get("nbParts"))` sans `Number.isInteger` : comparer avec la validation de la commande anonyme (commander/actions.ts:56) et la contrainte SQL.
- **H09-08** — `patisgest-app/src/lib/actions-credits.ts:90` — `input.nomDebiteur.trim()` sans longueur maximale, alors que `note` est tronquee a 400 (l.109) : verifier la limite cote DB et la reponse d'erreur normalisee.
- **H09-09** — `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts:53` — `/^\d{4}-\d{2}-\d{2}$/` valide la FORME mais pas la date reelle (2026-02-30) ni le passe : verifier le refus cote RPC 27 et le message renvoye au visiteur.
- **H09-10** — `patisgest-app/src/lib/erreurs-db.ts:37` — `${(e!.message as string).trim()}` : normalisation des erreurs Postgres ; verifier qu'aucun detail technique (contrainte, schema, SQLSTATE brut) ne remonte a un visiteur anonyme.
- **H09-11** — `patisgest-app/src/lib/stock-input.ts:154` — `if (fromSiteId === toSiteId) throw` : verifier que les deux UUID sont valides (l.47) et rattaches au meme client avant l'appel RPC transferer_article.

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

- Écrire `audit/rapports/S09.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S09-F001`, `S09-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

