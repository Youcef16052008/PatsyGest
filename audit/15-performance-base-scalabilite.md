# Tranche 15/20 — Performance Base de Donnees & Scalabilite

**Couche** : Couche 4 — Fiabilite, performance, structure · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S15.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**10 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/15-performance-base-scalabilite.md` | 153 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/liste-courses-panel.tsx` | 132 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/stock-list.tsx` | 85 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/stock-workspace.tsx` | 98 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/courses-server.ts` | 128 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/liste-courses.ts` | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/stock-overview.ts` | 17 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/workspace-data.ts` | 138 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/workspace-read.ts` | 196 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/24-index-exploitation.sql` | 113 | migration 24: index d'exploitation et plans de requete |

## 2. Exclusions (hors périmètre)

- `patisgest-app/supabase/50-roles-permissions-vues.sql` → **T03** (`migration 50: roles/permissions/vues: parite et RLS`) : preuve de traçage uniquement.
- `patisgest-app/supabase/04-securite-lecture.sql` → **T03** (`migration 04: policies de lecture tenant generees dynamiquement`) : preuve de traçage uniquement.
- `patisgest-app/supabase/23-controle-modules.sql` → **T03** (`migration 23: controle des modules: policies restrictives + gardes RPC`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/export/route.ts` → **T12** (`export CSV generique`) : preuve de traçage uniquement.
- La complexité JS (T14), les policies RLS en tant que règles de sécurité (T03).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- **Aucun fichier de test en propriété** : documenter explicitement cet angle mort dans la section 4 du rapport.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (10)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H15-01** — `patisgest-app/supabase/24-index-exploitation.sql:32` — `create index ventes_client_date_idx` : verifier l'ordre des colonnes vs les predicats reels `eq(client_id) + date_vente between ... order by id` et l'absence d'index sur `id` pour le tri.
- **H15-02** — `patisgest-app/supabase/24-index-exploitation.sql:54` — `lots_fefo_idx ... where qte_rest > 0 and not bloque` : verifier que l'`order by congele, dlc nulls last, date_reception, id` de FEFO peut utiliser l'index partiel.
- **H15-03** — `patisgest-app/src/lib/workspace-read.ts:163` — `for (let offset = 0; offset < 20_000; offset += PAGE_SIZE)` + `.range(offset, offset+499)` : pagination par OFFSET sur gros volumes, cout croissant et risque de doublons sous ecritures concurrentes.
- **H15-04** — `patisgest-app/src/lib/workspace-read.ts:37` — `const sonde = await page(LIMITE_TOTALE, LIMITE_TOTALE);` : verifier le plan de la requete a offset 20 000 et le cout d'une sonde systematique.
- **H15-05** — `patisgest-app/supabase/50-roles-permissions-vues.sql:135` — Vues `security_barrier` avec `patisgest_mon_role()` : evaluer le cout d'appel de la fonction par ligne sur une table de 100 000 mouvements.
- **H15-06** — `patisgest-app/supabase/04-securite-lecture.sql:9` — Policy `client_id in (select client_id from public.utilisateurs where auth_user_id = auth.uid())` : verifier si le sous-predicat est evalue une fois (InitPlan) ou par ligne, et l'index sur `utilisateurs.auth_user_id`.
- **H15-07** — `patisgest-app/src/lib/courses-server.ts:52` — `.limit(500)` / `.limit(5000)` sans pagination ni garde de depassement : troncature silencieuse des besoins de production au-dela du plafond.
- **H15-08** — `patisgest-app/supabase/23-controle-modules.sql:132` — Policies RESTRICTIVE avec `exists(select 1 from unnest(string_to_array(...)))` : mesurer le surcout par INSERT/UPDATE sur les tables de mouvements.
- **H15-09** — `patisgest-app/src/lib/workspace-read.ts:112` — Repli `legacy` : une seconde requete de 50 ventes est executee apres la premiere. Identifier la condition exacte et le cas N+1.
- **H15-10** — `patisgest-app/src/app/api/export/route.ts:60` — Export plafonne a 20 000 lignes : verifier le plan de la requete, l'absence de `count(*)` couteux et le comportement multi-tenant sous charge.

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

- Écrire `audit/rapports/S15.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S15-F001`, `S15-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

