# Tranche 11/20 — Mode Hors-Ligne, PWA, Files d'Attente & Stockage Local

**Couche** : Couche 3 — Contrats & etat client · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S11.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**21 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/11-hors-ligne-pwa-files-locales.md` | 172 | prompt autonome MODE B de cette tranche |
| `patisgest-app/public/sw.js` | 154 | Service Worker et strategie de cache |
| `patisgest-app/src/app/hors-ligne/page.tsx` | 46 | coquille hors-ligne publique |
| `patisgest-app/src/app/manifest.ts` | 33 | manifest PWA |
| `patisgest-app/src/components/coquille-hors-ligne.tsx` | 213 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/network-status-pill.tsx` | 94 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/service-worker.tsx` | 68 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/catalogue-cache.ts` | 298 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/file-attente-cloture.ts` | 66 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/of-queue.ts` | 93 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/sale-queue.ts` | 264 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/catalogue-cache.test.mjs` | 86 | test a auditer pour cette tranche |
| `patisgest-app/tests/catalogue-hors-ligne.test.mjs` | 121 | test a auditer pour cette tranche |
| `patisgest-app/tests/catalogue-local.mjs` | 36 | adaptateur local du catalogue hors-ligne |
| `patisgest-app/tests/cloture-file-attente.test.mjs` | 48 | test a auditer pour cette tranche |
| `patisgest-app/tests/deconnexion-locale.test.mjs` | 99 | test a auditer pour cette tranche |
| `patisgest-app/tests/file-attente-cloture.test.mjs` | 60 | test a auditer pour cette tranche |
| `patisgest-app/tests/of-queue.test.mjs` | 61 | test a auditer pour cette tranche |
| `patisgest-app/tests/sale-queue.test.mjs` | 173 | test a auditer pour cette tranche |
| `patisgest-app/tests/service-worker-scope.test.mjs` | 102 | test a auditer pour cette tranche |
| `patisgest-app/tests/service-worker-securite.test.mjs` | 82 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/components/cash-closing-quick.tsx` → **T06** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- La cohérence UI↔serveur (T10), l’idempotence serveur (T07), la fiabilité des catches (T13).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/catalogue-cache.test.mjs` (86 lignes) — propriété T11.
- `patisgest-app/tests/catalogue-hors-ligne.test.mjs` (121 lignes) — propriété T11.
- `patisgest-app/tests/catalogue-local.mjs` (36 lignes) — propriété T11.
- `patisgest-app/tests/cloture-file-attente.test.mjs` (48 lignes) — propriété T11.
- `patisgest-app/tests/deconnexion-locale.test.mjs` (99 lignes) — propriété T11.
- `patisgest-app/tests/file-attente-cloture.test.mjs` (60 lignes) — propriété T11.
- `patisgest-app/tests/of-queue.test.mjs` (61 lignes) — propriété T11.
- `patisgest-app/tests/sale-queue.test.mjs` (173 lignes) — propriété T11.
- `patisgest-app/tests/service-worker-scope.test.mjs` (102 lignes) — propriété T11.
- `patisgest-app/tests/service-worker-securite.test.mjs` (82 lignes) — propriété T11.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H11-01** — `patisgest-app/public/sw.js:69` — `if (request.method !== "GET") return;` : aucune interception des POST / Server Actions. Prouver que la file d'attente est bien le seul mecanisme de reprise et qu'elle n'est pas contournee.
- **H11-02** — `patisgest-app/public/sw.js:80` — Navigation -> coquille : verifier qu'aucune reponse HTML authentifiee n'entre dans CACHE_COQUILLE ou CACHE_ASSETS, y compris via le sous-domaine boutique (l.145).
- **H11-03** — `patisgest-app/public/sw.js:24` — `contenuAssetValide` compare l'extension au Content-Type : tester un `/appearance/x.png` servi en `text/html` (empoisonnement de cache) et l'absence de verification d'origine sur `response.redirected`.
- **H11-04** — `patisgest-app/public/sw.js:56` — Purge `caches.delete(name)` de tout `patisgest-*` a l'activation : verifier le risque de suppression d'un cache encore utilise par un autre onglet/compte.
- **H11-05** — `patisgest-app/src/lib/sale-queue.ts:37` — `const MAX = 200` : verifier la politique exacte quand la file est pleine (perte silencieuse ? ecrasement ?) et le message a l'utilisateur.
- **H11-06** — `patisgest-app/src/lib/catalogue-cache.ts:100` — `ageCatalogue(c, maintenant) > 14` : une horloge client avancee/retardee fait accepter un catalogue perime ou refuser un catalogue frais. Montrer le calcul.
- **H11-07** — `patisgest-app/src/lib/catalogue-cache.ts:205` — `catch { /* quota plein : le hors-ligne restera indisponible */ }` : echec d'enregistrement de l'identite sans signal UI. Verifier la consequence sur appareil partage.
- **H11-08** — `patisgest-app/src/lib/of-queue.ts:29` — `return [...without, op].slice(-MAX)` avec MAX=100 : rejeu concurrent de deux onglets, perte des plus anciens OF. Decrire la sequence et l'absence de verrou inter-onglets.
- **H11-09** — `patisgest-app/src/lib/file-attente-cloture.ts:42` — `if (Array.isArray(parse)) tickets += parse.length;` et `illisible` (l.44-48) : verifier que JSON corrompu ou d'une autre version n'est pas compte comme zero ticket.
- **H11-10** — `patisgest-app/src/components/cash-closing-quick.tsx:56` — `localStorage.getItem("patisgest.caisse_soir."+today)` : la cle de jour est calculee cote client (UTC vs Alger). Verifier le blocage de cloture du mauvais jour.
- **H11-11** — `patisgest-app/src/app/manifest.ts:9` — Manifest PWA : verifier `start_url`, `scope`, `display` et l'absence de donnees de tenant dans le manifeste servi a tous.
- **H11-12** — `patisgest-app/src/lib/sale-queue.ts:40` — `queuedSaleLines` gere les anciennes entrees mono-produit : verifier le versionnage `patisgest.saleQueue.v1` et l'absence de migration d'un format corrompu.

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

- Écrire `audit/rapports/S11.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S11-F001`, `S11-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

