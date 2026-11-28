# Tranche 12/20 — Fichiers, Medias, Imports/Exports & Contenu Externe

**Couche** : Couche 3 — Contrats & etat client · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S12.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**47 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/12-fichiers-medias-imports-exports.md` | 188 | prompt autonome MODE B de cette tranche |
| `design-studio/public/assets/croissant.webp` | 0 | media / police du prototype |
| `design-studio/public/assets/eclair.webp` | 0 | media / police du prototype |
| `design-studio/public/assets/fraunces-OFL.txt` | 93 | media / police du prototype |
| `design-studio/public/assets/fraunces.woff2` | 0 | media / police du prototype |
| `design-studio/public/assets/hero.webp` | 0 | media / police du prototype |
| `design-studio/public/assets/manrope-OFL.txt` | 93 | media / police du prototype |
| `design-studio/public/assets/manrope.woff2` | 0 | media / police du prototype |
| `design-studio/public/assets/pain.webp` | 0 | media / police du prototype |
| `design-studio/public/assets/studio.svg` | 0 | media / police du prototype |
| `design-studio/public/assets/tarte.webp` | 0 | media / police du prototype |
| `patisgest-app/public/appearance/croissant.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/eclair.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/fraunces-OFL.txt` | 93 | media / asset statique |
| `patisgest-app/public/appearance/fraunces.woff2` | 0 | media / asset statique |
| `patisgest-app/public/appearance/hero.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/manrope-OFL.txt` | 93 | media / asset statique |
| `patisgest-app/public/appearance/manrope.woff2` | 0 | media / asset statique |
| `patisgest-app/public/appearance/owner-patisserie.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/pain.webp` | 0 | media / asset statique |
| `patisgest-app/public/appearance/tarte.webp` | 0 | media / asset statique |
| `patisgest-app/public/icons/apple-touch-icon.png` | 0 | media / asset statique |
| `patisgest-app/public/icons/icon-192.png` | 0 | media / asset statique |
| `patisgest-app/public/icons/icon-512.png` | 0 | media / asset statique |
| `patisgest-app/public/recettes/baklawa.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/croissant.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/eclair.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/layer-cake.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/mille-feuille.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/pain-chocolat.webp` | 0 | media / asset statique |
| `patisgest-app/public/recettes/tarte-citron.webp` | 0 | media / asset statique |
| `patisgest-app/scripts/coffre-sauvegarde.mjs` | 66 | chiffrement du coffre de sauvegarde |
| `patisgest-app/src/app/api/export/comptable/route.ts` | 170 | export comptable CSV |
| `patisgest-app/src/app/api/export/route.ts` | 82 | export CSV generique |
| `patisgest-app/src/components/export-panel.tsx` | 102 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/invoice-photo-intake.tsx` | 317 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/label-maker.tsx` | 120 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/product-photo-picker.tsx` | 154 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-photos.ts` | 34 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/csv.ts` | 141 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/export-comptable.ts` | 174 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/invoice-photo-parser.ts` | 104 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/label-model.ts` | 108 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pastry-visuals.ts` | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/recipe-photo.ts` | 33 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/52-recettes-photos.sql` | 41 | migration 52: photos de recettes: colonne et contenu externe |
| `patisgest-app/tests/coffre-sauvegarde.test.mjs` | 42 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- La validation des entrées (T09), la PII et l’audit (T19), la chaîne de restauration (T18).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/coffre-sauvegarde.test.mjs` (42 lignes) — propriété T12.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H12-01** — `patisgest-app/src/lib/csv.ts:32` — `INVISIBLES` + `FORMULE` : verifier la couverture reelle de U+200B, U+202E, U+2066-2069, U+FEFF, tab/CR et le cas d'un champ commencant par plusieurs invisibles.
- **H12-02** — `patisgest-app/src/lib/csv.ts:39` — `if (FORMULE.test(s)) s = "'" + s;` AVANT l'echappement RFC (l.40) : verifier qu'une valeur `=..."...` reste injective et que l'apostrophe n'est pas interpretee par Excel en locale FR.
- **H12-03** — `patisgest-app/src/app/api/export/route.ts:72` — Headers de reponse : verifier la presence du BOM UTF-8 (`csv.ts:19`), du separateur `;`, du `Content-Disposition` et de l'absence de troncature des lignes.
- **H12-04** — `patisgest-app/src/lib/recipe-photo.ts:28` — `^data:image/(jpeg|png|webp);base64,A[A-Za-z0-9+/=]*$` : la regex verifie un PREFIXE de contenu, pas les magic bytes. Forger une charge utile base64 valide mais non image et tracer son stockage.
- **H12-05** — `patisgest-app/src/lib/recipe-photo.ts:14` — `MAX_DATA_URL_BYTES = 220_000` : verifier que la limite est appliquee cote serveur (actions-photos.ts) et non seulement dans le composant, et le comportement au-dela.
- **H12-06** — `patisgest-app/src/components/product-photo-picker.tsx:129` — `accept="image/*"` cote navigateur : verifier la chaine de validation serveur (compressImageFileToDataUrl, sanitizeRecipePhoto, RPC) et le refus des SVG/XSS.
- **H12-07** — `patisgest-app/scripts/coffre-sauvegarde.mjs:35` — `scryptSync(password, salt, 32, {N:32768,...})` + `cipher.setAAD(header)` (l.37) : verifier l'authentification du header, le tag GCM (l.42) et la limite MAX_DATA_SIZE.
- **H12-08** — `patisgest-app/scripts/coffre-sauvegarde.mjs:60` — `await link(temp, output)` : atomicite et refus de sortie preexistante ; verifier le nettoyage `key?.fill(0)` / `rm(tempDir)` (l.61-64) en cas d'echec.
- **H12-09** — `patisgest-app/supabase/52-recettes-photos.sql:13` — `add column if not exists photo_url text` : verifier l'absence de contrainte de taille/format cote DB et l'exposition de cette colonne aux roles vendeur/anon.
- **H12-10** — `patisgest-app/src/lib/invoice-photo-parser.ts:94` — `id: `${Date.now()}-${parsed.length}`` : collision d'identifiants sur deux lignes parsees a la meme milliseconde. Verifier l'impact sur la deduplication.
- **H12-11** — `patisgest-app/src/app/api/export/comptable/route.ts:66` — Codes 413/500/409 selon les anomalies : verifier que l'export comptable ne livre jamais un fichier partiel quand une lecture echoue en cours de route.
- **H12-12** — `patisgest-app/src/lib/csv.ts:47` — `valeur instanceof Date -> toISOString()` : verifier la locale, le separateur decimal (l.14-15) et la conversion des `number` en virgule decimale pour Excel FR.

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

- Écrire `audit/rapports/S12.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S12-F001`, `S12-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

