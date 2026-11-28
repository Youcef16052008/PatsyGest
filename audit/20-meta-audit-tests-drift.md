# Tranche 20/20 — Meta-Audit des Tests & Derive Code-Documentation

**Couche** : Couche 5 — Ops, supply chain, verite des tests · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S20.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**68 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `AUDIT-CONFORMITE-CDC-CODE.md` | 508 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `ETUDE-MARCHE-PATISSERIES-DZ-2026.md` | 129 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `GUIDE-PILOTE.md` | 285 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `NOTE-COUT-MINIMAL.md` | 200 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `NOTE-HEBERGEMENT.md` | 270 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PLAN-AMELIORATION-PATISGEST.md` | 214 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PROTOCOLE-QUALIFICATION-MATERIELLE.md` | 252 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/01-Cahier-des-Charges-PatisGest-v4.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/01-Cahier-des-Charges-PatisGest-v4.md` | 427 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/02-Architecture-Technique-PatisGest-v4.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/02-Architecture-Technique-PatisGest-v4.md` | 328 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.md` | 176 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/04-Plan-Attaque-1-Pilote.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/04-Plan-Attaque-1-Pilote.md` | 138 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/05-Kit-Phase0-Terrain.docx` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/05-Kit-Phase0-Terrain.md` | 122 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `PâtisGest-Documents/06-Maquettes-Onboarding.pdf` | 0 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `README.md` | 59 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `audit/00-INDEX.md` | 888 | index maitre et matrice de propriete |
| `audit/20-meta-audit-tests-drift.md` | 238 | prompt autonome MODE B de cette tranche |
| `audit/MODE-A-CONSOLIDE-UN-SEUL-FICHIER.md` | 0 | artefact de transmission unique: index + 20 prompts en un seul Markdown (L=0, genere apres metriques) |
| `design-studio/README.md` | 46 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `design-studio/tests/model.test.mjs` | 58 | test du prototype |
| `patisgest-app/AGENTS.md` | 9 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/AUDIT-PHASE-1.md` | 159 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/CHECKLIST-60.md` | 107 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/PLAN-CLOTURE.md` | 174 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/README.md` | 337 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/SECURITE-COMPTES.md` | 138 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/APPLICATION-39-42.md` | 176 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md` | 131 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/EQUIPE-MODULE-INACTIF.md` | 130 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/ETAT-RESTAURATION.md` | 32 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/RI-04-unicite-lot.md` | 127 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/SAUVEGARDE-EXPERIMENTALE.md` | 42 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/VALIDATION-CONFIDENTIALITE-ROLES.md` | 205 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/VUES-ROLES-ABSENTES.md` | 191 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/migrations/snapshots/pilote-v38-2026-11-23.md` | 59 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/tests/audit-catalogue.sql` | 25 | catalogue SQL d audit |
| `patisgest-app/tests/e2e/README.md` | 58 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/tests/e2e/bootstrap-ci.mjs` | 174 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/caisse.spec.mjs` | 28 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/helpers.mjs` | 24 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/seed.mjs` | 50 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/stock.spec.mjs` | 47 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/transfert.spec.mjs` | 29 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/e2e/vitrine.spec.mjs` | 31 | harnais E2E (hors glob npm test) |
| `patisgest-app/tests/fixtures/pilote-vitrine/README.md` | 5 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `patisgest-app/tests/harness-execution.mjs` | 94 | harnais de tests: mocks de session et de client DB |
| `patisgest-app/tests/inventaire-rpc.json` | 9 | inventaire / catalogue de tests |
| `patisgest-app/tests/inventaire-surface.json` | 171 | inventaire / catalogue de tests |
| `patisgest-app/tests/inventaire-surface.mjs` | 26 | inventaire statique des points d entree |
| `patisgest-app/tests/inventaire-surface.test.mjs` | 9 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/label-model.test.mjs` | 64 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/liste-courses.test.mjs` | 135 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/mocks/next-stubs.mjs` | 33 | harnais / fixture de test |
| `patisgest-app/tests/mocks/register-hooks.mjs` | 43 | harnais / fixture de test |
| `patisgest-app/tests/retrait-mode-carte-db.test.mjs` | 63 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/smoke-http.mjs` | 442 | script HTTP hors glob npm test |
| `patisgest-app/tests/support/fixture-of-cout.mjs` | 17 | harnais / fixture de test |
| `patisgest-app/tests/support/serie-main.mjs` | 33 | harnais / fixture de test |
| `patisgest-app/tests/tomorrow-recipe-guard.test.mjs` | 15 | test non apparie: meta-audit des assertions |
| `patisgest-app/tests/vitrine.test.mjs` | 293 | test non apparie: meta-audit des assertions |
| `revue/CHECKLIST-DEPLOIEMENT.md` | 405 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/DOSSIER-PILOTES-COMMERCIAL.md` | 91 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/PLAN-DE-COMMIT.md` | 310 | affirmation documentaire non fiable (DRIFT a confronter au code) |
| `revue/PROCEDURE-RESTAURATION-PILOTE.md` | 94 | affirmation documentaire non fiable (DRIFT a confronter au code) |

## 2. Exclusions (hors périmètre)

- `patisgest-app/package.json` → **T17** (`configuration de build/runtime et secrets`) : preuve de traçage uniquement.
- `patisgest-app/tests/chaine-rejouable.test.mjs` → **T18** (`test a auditer pour cette tranche`) : preuve de traçage uniquement.
- `patisgest-app/tests/concurrence-transfert-reel.test.mjs` → **T07** (`test a auditer pour cette tranche`) : preuve de traçage uniquement.
- `patisgest-app/.env.example` → **T17** (`configuration de build/runtime et secrets`) : preuve de traçage uniquement.
- Les fichiers applicatifs (T01–T19) : n’auditer ici que les corps d’assertions, mocks, harnais et docs.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `design-studio/tests/model.test.mjs` (58 lignes) — propriété T20.
- `patisgest-app/tests/audit-catalogue.sql` (25 lignes) — propriété T20.
- `patisgest-app/tests/e2e/README.md` (58 lignes) — propriété T20.
- `patisgest-app/tests/e2e/bootstrap-ci.mjs` (174 lignes) — propriété T20.
- `patisgest-app/tests/e2e/caisse.spec.mjs` (28 lignes) — propriété T20.
- `patisgest-app/tests/e2e/helpers.mjs` (24 lignes) — propriété T20.
- `patisgest-app/tests/e2e/seed.mjs` (50 lignes) — propriété T20.
- `patisgest-app/tests/e2e/stock.spec.mjs` (47 lignes) — propriété T20.
- `patisgest-app/tests/e2e/transfert.spec.mjs` (29 lignes) — propriété T20.
- `patisgest-app/tests/e2e/vitrine.spec.mjs` (31 lignes) — propriété T20.
- `patisgest-app/tests/fixtures/pilote-vitrine/README.md` (5 lignes) — propriété T20.
- `patisgest-app/tests/harness-execution.mjs` (94 lignes) — propriété T20.
- `patisgest-app/tests/inventaire-rpc.json` (9 lignes) — propriété T20.
- `patisgest-app/tests/inventaire-surface.json` (171 lignes) — propriété T20.
- `patisgest-app/tests/inventaire-surface.mjs` (26 lignes) — propriété T20.
- `patisgest-app/tests/inventaire-surface.test.mjs` (9 lignes) — propriété T20.
- `patisgest-app/tests/label-model.test.mjs` (64 lignes) — propriété T20.
- `patisgest-app/tests/liste-courses.test.mjs` (135 lignes) — propriété T20.
- `patisgest-app/tests/mocks/next-stubs.mjs` (33 lignes) — propriété T20.
- `patisgest-app/tests/mocks/register-hooks.mjs` (43 lignes) — propriété T20.
- `patisgest-app/tests/retrait-mode-carte-db.test.mjs` (63 lignes) — propriété T20.
- `patisgest-app/tests/smoke-http.mjs` (442 lignes) — propriété T20.
- `patisgest-app/tests/support/fixture-of-cout.mjs` (17 lignes) — propriété T20.
- `patisgest-app/tests/support/serie-main.mjs` (33 lignes) — propriété T20.
- `patisgest-app/tests/tomorrow-recipe-guard.test.mjs` (15 lignes) — propriété T20.
- `patisgest-app/tests/vitrine.test.mjs` (293 lignes) — propriété T20.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H20-01** — `patisgest-app/package.json:16` — Glob `--test tests/*.test.mjs` : execution REELLE mesuree en MODE A = 788 tests, 781 pass, 0 fail, 3 skipped, 4 todo, ~249 s, sur 129 fichiers `node:test`, 873 appels test/it dans le glob, 6 scripts `.mjs` a la racine hors glob et 21 au total sous `tests/`. Verifier les 129 fichiers.
- **H20-02** — `patisgest-app/tests/chaine-rejouable.test.mjs:20` — `test.todo(...)` avec un corps complet et une assertion `assert.deepEqual(echecs, [])` : test present mais INCAPABLE d'echouer. Mesurer l'ecart entre la suite verte et la verite de la chaine de migrations.
- **H20-03** — `patisgest-app/tests/concurrence-transfert-reel.test.mjs:19` — `const sansBase = test.skip` : la seule preuve de concurrence sur PostgreSQL reel est conditionnelle a une variable d'environnement absente hors CI.
- **H20-04** — `patisgest-app/tests/harness-execution.mjs:35` — `mock.module(authUrl, { namedExports: { ...permissions, getSessionContext: async () => etat.session } })` : tous les tests d'actions remplacent la vraie session. Prouver qu'aucun test ne valide la chaine auth reelle.
- **H20-05** — `patisgest-app/tests/harness-execution.mjs:71` — `new Proxy(b, { get(cible, prop) { ... return (...args) => { appels.push(...); return proxy; } } })` : toute methode inexistante est acceptee. Un test peut donc passer avec un appel `.eq()` oublie.
- **H20-06** — `patisgest-app/tests/mocks/register-hooks.mjs:28` — `specifier === 'server-only' -> data:text/javascript,export default undefined` : la garde de bundler est neutralisee dans les tests ; verifier qu'aucun test ne certifie l'absence d'import serveur cote client.
- **H20-07** — `patisgest-app/tests/inventaire-surface.test.mjs:8` — `assert.deepEqual(await surface(), expected)` : test de conformite a un fichier JSON COMMITE, pas a un risque. Verifier qui regenere l'inventaire (`inventaire-surface.mjs:24 --update`) et la tautologie possible.
- **H20-08** — `patisgest-app/tests/inventaire-surface.mjs:20` — `source.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)` : ne detecte pas les fonctions exportees en const/arrow ni les actions non async. Comparer avec le nombre reel de points d'entree.
- **H20-09** — `README.md:1` — Affirmation documentaire (hypothese hostile) : confronter CHAQUE affirmation de README.md, patisgest-app/README.md, SECURITE-COMPTES.md, AGENTS.md, AUDIT-CONFORMITE-CDC-CODE.md, revue/*.md et PâtisGest-Documents/*.md au code executable. Produire le tableau DRIFT.
- **H20-10** — `patisgest-app/migrations/CHAINE-NON-REJOUABLE.md:1` — Document annoncant '43 fichiers, 4 echecs' : le code reel contient 53 migrations main + 28 brouillons + 7 fixtures. Mesurer la derive et l'impact sur la procedure de restauration.
- **H20-11** — `patisgest-app/.env.example:34` — Le commentaire affirme '87 actions' verrouillees : compter REELLEMENT les fichiers `"use server"` et les appels `getSessionContext()` et signaler l'ecart en DRIFT-DOC.
- **H20-12** — `patisgest-app/tests/e2e/caisse.spec.mjs:1` — Parcours E2E soumis a `if: github.event_name == 'workflow_dispatch'` (ci.yml:115) : jamais executes sur PR ni sur push main. Evaluer la couverture E2E effective de la release.

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

- Écrire `audit/rapports/S20.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S20-F001`, `S20-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

