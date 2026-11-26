# Tranche 17/20 — Build, Configuration, Secrets & Supply Chain

**Couche** : Couche 5 — Ops, supply chain, verite des tests · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S17.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**17 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `.gitignore` | 30 | configuration de build/runtime et secrets |
| `audit/17-build-config-secrets-supply-chain.md` | 161 | prompt autonome MODE B de cette tranche |
| `patisgest-app/.env.example` | 96 | configuration de build/runtime et secrets |
| `patisgest-app/.gitignore` | 12 | configuration de build/runtime et secrets |
| `patisgest-app/eslint.config.mjs` | 7 | configuration de build/runtime et secrets |
| `patisgest-app/next-env.d.ts` | 7 | configuration de build/runtime et secrets |
| `patisgest-app/next.config.ts` | 24 | configuration de build/runtime et secrets |
| `patisgest-app/package-lock.json` | 7089 | configuration de build/runtime et secrets |
| `patisgest-app/package.json` | 47 | configuration de build/runtime et secrets |
| `patisgest-app/postcss.config.mjs` | 7 | configuration de build/runtime et secrets |
| `patisgest-app/scripts/db-push-disabled.mjs` | 4 | garde anti db:push |
| `patisgest-app/src/lib/licence-mode.ts` | 37 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/preview-guard.ts` | 26 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/db-push-guard.test.mjs` | 20 | test a auditer pour cette tranche |
| `patisgest-app/tests/preview-guard.test.mjs` | 79 | test a auditer pour cette tranche |
| `patisgest-app/tests/preview-http.mjs` | 59 | sonde du garde-fou de preview hors glob npm test |
| `patisgest-app/tsconfig.json` | 43 | configuration de build/runtime et secrets |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/trial-crypto.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Le runtime applicatif (T13), les workflows CI (T18), les gardes d’aperçu côté rendu (T10).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/db-push-guard.test.mjs` (20 lignes) — propriété T17.
- `patisgest-app/tests/preview-guard.test.mjs` (79 lignes) — propriété T17.
- `patisgest-app/tests/preview-http.mjs` (59 lignes) — propriété T17.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H17-01** — `patisgest-app/next.config.ts:7` — `PATISGEST_PREVIEW_BLOCKED: process.env.VERCEL_ENV === "preview" ? "1" : "0"` : valeur FIGEE AU BUILD. Correler avec preview-guard.ts:19-20 et le cas de promotion d'un build preview en production.
- **H17-02** — `patisgest-app/next.config.ts:10` — `NEXT_PUBLIC_PATISGEST_MODE_GRATUIT: process.env.PATISGEST_MODE_GRATUIT ?? "1"` alors que `licence-mode.ts:24` lit `NEXT_PUBLIC_PATISGEST_MODE_GRATUIT` : verifier la chaine de noms et le defaut fail-open.
- **H17-03** — `patisgest-app/src/lib/licence-mode.ts:25` — `if (brut === undefined) return true;` : en l'absence de variable, le mode gratuit est actif -> aucun verrou de licence. Verifier les consequences en production.
- **H17-04** — `patisgest-app/src/lib/trial-crypto.ts:26` — `serverSeed()` : 4 replis de secrets puis une graine publique. Verifier quels deploiements ont au moins PATISGEST_MASTER_KEY et si un jeton signe avec la graine de dev est accepte.
- **H17-05** — `patisgest-app/.env.example:20` — `VITRINE_SECRET_ANTI_ABUS=` (vide par defaut) : comportement fail-open de l'anti-abus (vitrine-anti-abus.ts:15). Verifier qu'aucun secret n'est committe ailleurs dans le depot.
- **H17-06** — `patisgest-app/.env.example:41` — `SUPABASE_SERVICE_ROLE_KEY=` : verifier par grep l'absence de valeur reelle dans le depot et la separation des secrets de build/runtime.
- **H17-07** — `patisgest-app/package.json:16` — `--test tests/*.test.mjs` : le glob n'inclut NI tests/e2e/*.spec.mjs, NI tests/integration/*.mjs, NI smoke-http.mjs, NI preview-http.mjs. Mesurer la couverture reelle (voir 00-INDEX.md).
- **H17-08** — `patisgest-app/package.json:22` — 9 dependances en `^` (supabase-js, nodemailer, postgres, react...) avec `package-lock.json` verrouille : verifier `npm ci` et `npm audit --omit=dev` (ci.yml:46) et la reproductibilite du build.
- **H17-09** — `patisgest-app/scripts/db-push-disabled.mjs:3` — `console.error(...); process.exitCode = 1;` : garde anti-Drizzle. Verifier qu'aucun autre script ou workflow n'applique un schema non revu.
- **H17-10** — `patisgest-app/.gitignore:6` — `.env*.local`, `.env`, `*.pem` : verifier que .env.example, les artefacts de dev (design-studio) et les rapports d'audit ne contiennent pas de secret.
- **H17-11** — `patisgest-app/next.config.ts:19` — `allowedDevOrigins: process.env.E2B_SANDBOX_ID ? [...] : []` : config conditionnee a une variable de sandbox ; verifier le comportement hors de ce contexte.
- **H17-12** — `patisgest-app/package.json:6` — `engines.node >=22.15.0` vs `ci.yml:42` `node-version: '22'` : verifier la version exacte resolue par le runner et les flags `--experimental-strip-types` (l.16).

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

- Écrire `audit/rapports/S17.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S17-F001`, `S17-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

