# Tranche 10/20 — Etat Client, Hydratation, Caches & Coherence UI-Serveur

**Couche** : Couche 3 — Contrats & etat client · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S10.md`.

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
| `audit/10-etat-client-hydratation-caches.md` | 171 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/layout.tsx` | 42 | layout racine: providers et metadata |
| `patisgest-app/src/components/advanced-mode-toggle.tsx` | 27 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/appearance.tsx` | 204 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/cash-workspace.tsx` | 57 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/dashboard-workspace.tsx` | 101 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/locale-provider.tsx` | 65 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/owner-day-overview.tsx` | 56 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/owner-motion-control.tsx` | 23 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/pilot-dashboard.tsx` | 490 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/workspace-icons.tsx` | 39 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/workspace-ui.tsx` | 26 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/appearance.ts` | 118 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/apparence-licence-photos.test.mjs` | 93 | test a auditer pour cette tranche |
| `patisgest-app/tests/appearance.test.mjs` | 93 | test a auditer pour cette tranche |
| `patisgest-app/tests/design-refinement.test.mjs` | 34 | test a auditer pour cette tranche |
| `patisgest-app/tests/workspace-daily-ux.test.mjs` | 41 | test a auditer pour cette tranche |
| `patisgest-app/tests/workspace-nav.test.mjs` | 44 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/app/(app)/layout.tsx` → **T01** (`garde de session allowLocked (symboles initialBundle/DemoWorkspaceProvider -> T10)`) : preuve de traçage uniquement.
- `patisgest-app/src/components/demo-workspace.tsx` → **T16** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/coquille-hors-ligne.tsx` → **T11** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/catalogue-cache.ts` → **T11** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/network-status-pill.tsx` → **T11** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/service-worker.tsx` → **T11** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/trial-guard-client.tsx` → **T01** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/credits-workspace.tsx` → **T06** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/(app)/[module]/page.tsx` → **T02** (`garde d'acces aux modules et roles`) : preuve de traçage uniquement.
- Le stockage local/PWA (T11), le build et les secrets (T17), les composants métier (T05/T06).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/apparence-licence-photos.test.mjs` (93 lignes) — propriété T10.
- `patisgest-app/tests/appearance.test.mjs` (93 lignes) — propriété T10.
- `patisgest-app/tests/design-refinement.test.mjs` (34 lignes) — propriété T10.
- `patisgest-app/tests/workspace-daily-ux.test.mjs` (41 lignes) — propriété T10.
- `patisgest-app/tests/workspace-nav.test.mjs` (44 lignes) — propriété T10.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H10-01** — `patisgest-app/src/app/(app)/layout.tsx:75` — `initialBundle={(trialStatus?.signedBundle as unknown as ServerLicenseBundle | undefined)}` : props serveur (token + publicJwk + payload) pousses dans un composant client. Inventorier exactement ce qui part dans le bundle.
- **H10-02** — `patisgest-app/src/app/(app)/layout.tsx:83` — `serverLocked ? null : demo ? <DemoWorkspaceProvider> : children` : le masquage UI est-il double d'un refus serveur pour TOUTES les actions (getSessionContext) ?
- **H10-03** — `patisgest-app/src/components/demo-workspace.tsx:20` — `setData(upgradeState(JSON.parse(event.newValue) as State))` sur l'evenement `storage` : verifier la race entre deux onglets, la corruption JSON et l'absence de versionnage.
- **H10-04** — `patisgest-app/src/components/coquille-hors-ligne.tsx:50` — `window.localStorage.getItem("patisgest.session.v1")` puis `JSON.parse` (l.61) : l'identite locale est lisible par tout script ; verifier qu'aucune donnee d'un autre compte n'est rendue dans le DOM.
- **H10-05** — `patisgest-app/src/lib/catalogue-cache.ts:140` — `getCatalogueSnapshot()` met en cache un objet MODULE-LEVEL : si `enregistrerIdentite` echoue (l.205 catch), `cacheLu` reste true et l'ancien catalogue peut etre servi au nouveau compte.
- **H10-06** — `patisgest-app/src/components/network-status-pill.tsx:9` — Boucle sur TOUT `window.localStorage` + `JSON.parse(raw)` (l.14) a chaque snapshot : verifier le cout, la levee d'exception sur valeur corrompue et la fuite d'information dans le DOM.
- **H10-07** — `patisgest-app/src/components/service-worker.tsx:60` — `controller?.postMessage("SKIP_WAITING")` puis `window.location.reload()` (l.61) : verifier la condition de garde et l'absence de boucle de rechargement.
- **H10-08** — `patisgest-app/src/components/trial-guard-client.tsx:84` — Polling `fetch("/api/presence/heartbeat")` : verifier l'invalidation de cache, la race de navigation et le comportement hors ligne (l.82).
- **H10-09** — `patisgest-app/src/components/credits-workspace.tsx:48` — `useSyncExternalStore` + `localStorage` + `setItem` (l.81) : verifier la desynchronisation optimiste si la Server Action echoue apres l'ecriture locale.
- **H10-10** — `patisgest-app/src/app/(app)/[module]/page.tsx:410` — `Promise.all` de RPC (`cake_options_production`, `cake_liens_production`, ...) : verifier quelles donnees de couts sont serialisees vers les composants client pour un role vendeur.
- **H10-11** — `patisgest-app/src/components/coquille-hors-ligne.tsx:86` — `() => null as unknown as boolean` : cast du snapshot serveur de `useSyncExternalStore`. Verifier l'effet sur l'hydratation (serveur null -> client booleen).

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

- Écrire `audit/rapports/S10.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S10-F001`, `S10-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

