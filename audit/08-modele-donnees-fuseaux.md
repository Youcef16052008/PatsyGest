# Tranche 08/20 — Modele de Donnees, Contraintes, Fuseaux Horaires & Integrite Referentielle

**Couche** : Couche 2 — Logique metier & integrite · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S08.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**19 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/08-modele-donnees-fuseaux.md` | 173 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/article-guide.tsx` | 68 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/fetes-planner.tsx` | 209 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/guide-form.tsx` | 130 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/module-guide.tsx` | 141 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/recette-guide.tsx` | 125 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/version-form.tsx` | 169 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/allergenes.ts` | 177 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/fetes-dz.ts` | 210 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pack-patisserie-dz.ts` | 61 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/02-seed-pilote.sql` | 85 | migration 02: seed pilote: types de donnees et compatibilite de schema |
| `patisgest-app/supabase/03-sprint2-modules.sql` | 253 | migration 03: creation des tables Sprint 2, contraintes et valeurs par defaut |
| `patisgest-app/supabase/36-dates-algiers.sql` | 89 | migration 36: fuseau Africa/Algiers sur les defaults de dates |
| `patisgest-app/tests/allergenes.test.mjs` | 140 | test a auditer pour cette tranche |
| `patisgest-app/tests/dates-algiers-db.test.mjs` | 77 | test a auditer pour cette tranche |
| `patisgest-app/tests/etablissement.test.mjs` | 132 | test a auditer pour cette tranche |
| `patisgest-app/tests/schema-complet.test.mjs` | 244 | test a auditer pour cette tranche |
| `patisgest-app/tests/schema-version-db.test.mjs` | 58 | test a auditer pour cette tranche |
| `patisgest-app/tests/version-input.test.mjs` | 74 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/journal-audit.ts` → **T19** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-caisse.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/supabase/11-import-z.sql` → **T06** (`migration 11: import Z: invariant (date, caisse, numero Z)`) : preuve de traçage uniquement.
- `patisgest-app/supabase/26-vitrine-publique.sql` → **T04** (`migration 26: vitrine publique: vue catalogue et donnees exposees`) : preuve de traçage uniquement.
- `patisgest-app/supabase/25-domaines-boutiques.sql` → **T04** (`migration 25: domaines boutiques, sous-domaines, vitrine`) : preuve de traçage uniquement.
- `patisgest-app/supabase/43-unicite-lot.sql` → **T07** (`migration 43: unicite des lots: index unique et NULL`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/stock-input.ts` → **T09** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/patisgest-store.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/csv.ts` → **T12** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les calculs (T05), les exports CSV (T12), les indexes (T15).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/allergenes.test.mjs` (140 lignes) — propriété T08.
- `patisgest-app/tests/dates-algiers-db.test.mjs` (77 lignes) — propriété T08.
- `patisgest-app/tests/etablissement.test.mjs` (132 lignes) — propriété T08.
- `patisgest-app/tests/schema-complet.test.mjs` (244 lignes) — propriété T08.
- `patisgest-app/tests/schema-version-db.test.mjs` (58 lignes) — propriété T08.
- `patisgest-app/tests/version-input.test.mjs` (74 lignes) — propriété T08.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H08-01** — `patisgest-app/src/lib/journal-audit.ts:82` — `quandAudit(iso, fuseau = "Africa/Algiers")` vs `journal-input.ts:43` `new Date().toISOString().slice(0,10)` (UTC) : a 23h30 a Alger, la date 'aujourd'hui' differe. Montrer le calcul du decalage.
- **H08-02** — `patisgest-app/src/lib/actions-caisse.ts:242` — `date > new Date().toISOString().slice(0,10)` : un import Z du jour local peut etre refuse ou accepte a tort autour de minuit UTC. Comparer avec `36-dates-algiers.sql:23`.
- **H08-03** — `patisgest-app/supabase/36-dates-algiers.sql:47` — `alter table ... set default (now() at time zone 'Africa/Algiers')::date` : verifier la liste des colonnes traitees et celles qui gardent un default UTC.
- **H08-04** — `patisgest-app/supabase/11-import-z.sql:8` — `create table z_imports` : types `numeric not null default 0`, `jsonb not null default '[]'`, `timestamptz default now()`. Verifier les colonnes nullable et les FK vers clients/sites.
- **H08-05** — `patisgest-app/supabase/26-vitrine-publique.sql:197` — `create unique index ... (client_id, cle_vitrine) where cle_vitrine is not null` : les NULL ne sont pas contraints -> doublons de fiches non publiees. Quantifier le cas.
- **H08-06** — `patisgest-app/supabase/25-domaines-boutiques.sql:79` — `create unique index sites_subdomain_unique` et l.82 `sites_custom_domain_unique` : verifier la gestion des NULL et le comportement d'un sous-domaine reattribue a un autre tenant.
- **H08-07** — `patisgest-app/supabase/43-unicite-lot.sql:62` — `create unique index lots_reception_unique` : lire la composition (client_id, article_id, site_id, numero, date_reception ?) et le traitement des valeurs NULL.
- **H08-08** — `patisgest-app/src/lib/stock-input.ts:105` — `const today = new Date().toISOString().slice(0,10); if (s < today) throw` : DLC/livraison saisie en heure locale. Montrer le rejet indu entre 23h et 00h UTC.
- **H08-09** — `patisgest-app/src/lib/patisgest-store.ts:407` — `isValidDate` base sur `new Date(date).toISOString().slice(0,10)` : compatibilite ascendante des donnees demo et des dates historiques au changement d'annee.
- **H08-10** — `patisgest-app/supabase/02-seed-pilote.sql:1` — Seed visant `auth.users` (exclu du test de chaine rejouable) : verifier les types, les FK et la compatibilite avec 01-socle.sql sur une base vierge.
- **H08-11** — `patisgest-app/src/lib/csv.ts:136` — `DATE_ISO.test(v) && ... new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v` : verifier les annees bissextiles, les dates avant 1970 et les fuseaux.

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

- Écrire `audit/rapports/S08.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S08-F001`, `S08-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

