# Tranche 16/20 — Architecture, Maintenabilite, Typage & Code Mort

**Couche** : Couche 4 — Fiabilite, performance, structure · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S16.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**14 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/16-architecture-maintenabilite.md` | 162 | prompt autonome MODE B de cette tranche |
| `design-studio/public/app.css` | 375 | module autonome du studio de maquettes |
| `design-studio/public/icons.mjs` | 33 | module autonome du studio de maquettes |
| `design-studio/public/index.html` | 26 | module autonome du studio de maquettes |
| `design-studio/public/model.mjs` | 103 | module autonome du studio de maquettes |
| `design-studio/public/studio.css` | 164 | module autonome du studio de maquettes |
| `design-studio/public/studio.mjs` | 271 | module autonome du studio de maquettes |
| `design-studio/public/views.mjs` | 263 | module autonome du studio de maquettes |
| `design-studio/serve.mjs` | 38 | module autonome du studio de maquettes |
| `patisgest-app/src/components/demo-caisse.tsx` | 201 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-dashboard.tsx` | 241 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-module.tsx` | 267 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/demo-workspace.tsx` | 41 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/demo-workspace.ts` | 527 | module lib: responsabilite de la tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/actions-couts.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/vitrine.ts` → **T04** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/export/comptable/route.ts` → **T12** (`export comptable CSV`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/tomorrow-lab-private-server.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-haccp.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/patisgest-store.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-simulation.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les règles métier elles-mêmes (T05/T06) : n’auditer ici que duplication, typage et code mort.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- **Aucun fichier de test en propriété** : documenter explicitement cet angle mort dans la section 4 du rapport.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H16-01** — `patisgest-app/src/lib/demo-workspace.ts:335` — `createDemoWorkspace` : une seconde implementation de la logique metier (patisgest-store.ts:240). Lister les regles dupliquees et celles qui divergent (arrondis, statuts, Z).
- **H16-02** — `patisgest-app/src/lib/demo-workspace.ts:220` — `demoTomorrowPlan` vs `tomorrow-lab.ts:244` : deux moteurs de planification. Comparer les formules de besoin et reperer la derive.
- **H16-03** — `patisgest-app/src/lib/demo-workspace.ts:158` — `demoMercurialeFor` vs `actions-couts.ts:444` : deux calculs de variation de prix. Montrer un cas ou les resultats different.
- **H16-04** — `patisgest-app/src/lib/actions-couts.ts:215` — `supabase as unknown as ClientLots` : cast structurel non verifie sur un client PostgREST. Verifier les methodes reellement presentes au runtime.
- **H16-05** — `patisgest-app/src/lib/vitrine.ts:98` — `(data ?? []) as unknown as LigneVitrine[]` : cast sur une jointure PostgREST ; comparer avec la garde de `connectivite-cron.ts:33` (exemple de code sain).
- **H16-06** — `patisgest-app/src/app/api/export/comptable/route.ts:110` — `as unknown as` sur les lignes de ventes : verifier qu'aucun champ obligatoire n'est suppose present sans validation.
- **H16-07** — `design-studio/serve.mjs:15` — Serveur HTTP autonome (port 4173) absent des scripts package.json : determiner s'il est un module mort toujours exposable et s'il sert des donnees reelles.
- **H16-08** — `design-studio/public/views.mjs:1` — Prototype UI de 25 072 octets dupliquant les ecrans de src/components : verifier s'il est importe par l'application (non) et s'il est maintenu en parallele.
- **H16-09** — `patisgest-app/src/lib/tomorrow-lab-private-server.ts:33` — Ligne unique dense (`for(const v of allVersions) if(...)`) : verifier la lisibilite, la correction du choix de version active et l'absence de test dedie.
- **H16-10** — `patisgest-app/src/lib/actions-haccp.ts:38` — `client_id: ctx!.clientId` : assertion non-null apres `getSessionContext()` ; verifier la garde sur ctx et le risque de TypeError en cas de session expiree.
- **H16-11** — `patisgest-app/src/lib/patisgest-store.ts:616` — Deduplication d'import Z implementee uniquement dans le store demo : verifier l'equivalent SQL/RPC et la divergence des deux regles.
- **H16-12** — `patisgest-app/src/lib/actions-simulation.ts:67` — `supabase as unknown as ClientLots` (meme cast qu'en actions-couts.ts:215) : duplication d'un contournement de typage, a factoriser ou a remplacer par un contrat reel.

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

- Écrire `audit/rapports/S16.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S16-F001`, `S16-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

