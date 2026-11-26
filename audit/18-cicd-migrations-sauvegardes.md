# Tranche 18/20 — CI/CD, Migrations, Sauvegarde, Restauration & Rollback

**Couche** : Couche 5 — Ops, supply chain, verite des tests · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S18.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**53 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `.github/workflows/ci.yml` | 218 | CI/CD, sauvegarde, pile isolee |
| `.github/workflows/sauvegarde-free.yml` | 184 | CI/CD, sauvegarde, pile isolee |
| `.github/workflows/supabase-isole.yml` | 152 | CI/CD, sauvegarde, pile isolee |
| `audit/18-cicd-migrations-sauvegardes.md` | 205 | prompt autonome MODE B de cette tranche |
| `patisgest-app/migrations/propositions/cloture-of-perte-experimentale.sql` | 87 | chaine de migrations, manifeste, propositions et snapshots |
| `patisgest-app/migrations/repetition.json` | 433 | chaine de migrations, manifeste, propositions et snapshots |
| `patisgest-app/src/app/api/sauvegarde/route.ts` | 81 | generation de sauvegarde JSON |
| `patisgest-app/src/components/sauvegarde-panel.tsx` | 135 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-restauration.ts` | 100 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/sauvegarde.ts` | 253 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/schema-version.ts` | 36 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/18-restauration-sauvegarde.sql` | 156 | migration 18: sauvegarde/restauration: RPC et ordre de rejeu |
| `patisgest-app/supabase/33-restauration-sans-perte.sql` | 109 | migration 33: restauration sans perte: transaction et ordre |
| `patisgest-app/supabase/35-version-schema-app.sql` | 49 | migration 35: version de schema applicative et garde de deploiement |
| `patisgest-app/supabase/brouillons/101-confidentialite-labo.sql` | 126 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/102-cout-of-partiel.sql` | 25 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/103-gestion-sites.sql` | 10 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/104-equipe-fondations.sql` | 124 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/105-sites-lecture-brouillon.sql` | 42 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/106-sites-rpc-brouillon.sql` | 53 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/107-tracabilite-sites-brouillon.sql` | 34 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/108-reassort-sites-brouillon.sql` | 68 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/109-cake-sites-brouillon.sql` | 180 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/110-equipe-approbation-brouillon.sql` | 57 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/111-of-idempotence-sites-brouillon.sql` | 27 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/112-donnees-sans-site-brouillon.sql` | 49 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/113-equipe-affectations-revocation-brouillon.sql` | 75 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/114-equipe-admission-brouillon.sql` | 108 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/115-confidentialite-vendeur-lots-brouillon.sql` | 24 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/116-confidentialite-vendeur-of-brouillon.sql` | 20 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/117-rappel-perimetre-brouillon.sql` | 54 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/118-equipe-liste-invitations-brouillon.sql` | 16 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/119-equipe-mes-demandes-brouillon.sql` | 16 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/120-equipe-membres-revision-brouillon.sql` | 79 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/121-vendeur-sites-boutique-brouillon.sql` | 20 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/122-revocation-adresses-brouillon.sql` | 27 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/123-revocation-decisions-brouillon.sql` | 112 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/124-restauration-gardes-brouillon.sql` | 54 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/125-vitrine-perimetre-brouillon.sql` | 30 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/126-vitrine-photos-modules-brouillon.sql` | 51 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/127-vitrine-depot-schema-brouillon.sql` | 24 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/supabase/brouillons/128-caisse-collision-ticket-brouillon.sql` | 52 | brouillon SQL: separation brouillons/prod |
| `patisgest-app/tests/chaine-rejouable.test.mjs` | 55 | test a auditer pour cette tranche |
| `patisgest-app/tests/integration/auth-apres-restauration.mjs` | 32 | procedure de restauration isolee |
| `patisgest-app/tests/integration/empreinte-restauration.mjs` | 53 | procedure de restauration isolee |
| `patisgest-app/tests/integration/restauration-cli-isolee.sh` | 55 | procedure de restauration isolee |
| `patisgest-app/tests/integration/restauration-isolee.sh` | 35 | procedure de restauration isolee |
| `patisgest-app/tests/integration/verifier-restauration.mjs` | 33 | procedure de restauration isolee |
| `patisgest-app/tests/migrations-historique.mjs` | 26 | manifeste de la chaine de deploiement |
| `patisgest-app/tests/migrations-repetition.test.mjs` | 48 | test a auditer pour cette tranche |
| `patisgest-app/tests/revue-corrections.test.mjs` | 147 | test a auditer pour cette tranche |
| `patisgest-app/tests/sauvegarde.test.mjs` | 276 | test a auditer pour cette tranche |
| `revue/sauvegardes/vendre_panier-avant-53.pgsql` | 223 | artefact de rollback / sauvegarde SQL |

## 2. Exclusions (hors périmètre)

- `patisgest-app/tests/concurrence-transfert-reel.test.mjs` → **T07** (`test a auditer pour cette tranche`) : preuve de traçage uniquement.
- `patisgest-app/supabase/53-caisse-ticket-scope.sql` → **T07** (`migration 53: portee du ticket de caisse: idempotence stricte`) : preuve de traçage uniquement.
- Les corps SQL de sécurité (T03), la portée du ticket (T07), les PII omises (T19).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/chaine-rejouable.test.mjs` (55 lignes) — propriété T18.
- `patisgest-app/tests/integration/auth-apres-restauration.mjs` (32 lignes) — propriété T18.
- `patisgest-app/tests/integration/empreinte-restauration.mjs` (53 lignes) — propriété T18.
- `patisgest-app/tests/integration/restauration-cli-isolee.sh` (55 lignes) — propriété T18.
- `patisgest-app/tests/integration/restauration-isolee.sh` (35 lignes) — propriété T18.
- `patisgest-app/tests/integration/verifier-restauration.mjs` (33 lignes) — propriété T18.
- `patisgest-app/tests/migrations-historique.mjs` (26 lignes) — propriété T18.
- `patisgest-app/tests/migrations-repetition.test.mjs` (48 lignes) — propriété T18.
- `patisgest-app/tests/revue-corrections.test.mjs` (147 lignes) — propriété T18.
- `patisgest-app/tests/sauvegarde.test.mjs` (276 lignes) — propriété T18.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H18-01** — `patisgest-app/tests/chaine-rejouable.test.mjs:20` — `test.todo('les migrations de schema 01→43 se rejouent sur une base vierge')` : le seul test de rejouabilite de la chaine est DESACTIVE. Execution reelle : 4 todo, 0 fail.
- **H18-02** — `patisgest-app/tests/concurrence-transfert-reel.test.mjs:19` — `const sansBase = test.skip; const lancer = URL_ADMIN ? test : sansBase;` : sans PATSYGEST_PG_URL, le test de concurrence sur vrai PostgreSQL est ignore (3 skipped mesures).
- **H18-03** — `patisgest-app/tests/migrations-historique.mjs:23` — `chaineDeploiement()` = `plan.historique` + `plan.main_hors_serie` tries : verifier que 53 figure dans `migrations/repetition.json` et que le manifeste est la source de verite du deploiement.
- **H18-04** — `patisgest-app/supabase/53-caisse-ticket-scope.sql:36` — `begin; create or replace function public.vendre_panier(...)` : verifier la presence du `commit;`, l'idempotence du rejeu et la separation brouillons (101-128) / serie main.
- **H18-05** — `patisgest-app/supabase/18-restauration-sauvegarde.sql:153` — `revoke all ...; grant execute ... to authenticated, service_role` : verifier la transaction englobante, la garde de role et l'ordre de restauration de `sauvegarde.ts:25`.
- **H18-06** — `patisgest-app/src/lib/sauvegarde.ts:52` — `TABLES_EXCLUES` (12 entrees, l.53-64) : la sauvegarde JSON omet utilisateurs, equipe_*, vitrine_photos, storage. Verifier que l'utilisateur en est informe et la consequence d'une restauration.
- **H18-07** — `patisgest-app/src/lib/sauvegarde.ts:22` — `MAX_OCTETS_SAUVEGARDE = 4*1024*1024` + `api/sauvegarde/route.ts:69` -> 413 : au-dela, aucune sauvegarde n'est possible. Calculer le volume a partir duquel un pilote est sans filet.
- **H18-08** — `.github/workflows/sauvegarde-free.yml:128` — Garde 'sauvegarde suspecte' sur le nombre de tables, mais l.176 'Restauration reelle non testee par ce workflow' : etablir ce qui est prouve et ce qui ne l'est pas.
- **H18-09** — `.github/workflows/ci.yml:50` — `npm test` puis l.52 'Build sans acces ni secrets de production' : verifier que le build n'embarque aucune creance et que les migrations ne sont jamais appliquees au pilote depuis la CI.
- **H18-10** — `revue/sauvegardes/vendre_panier-avant-53.pgsql:1` — Artefact de rollback de `vendre_panier` : verifier qu'il est complet, rejouable et qu'une procedure de retour arriere a chaud est definie par le code (et non seulement decrite).
- **H18-11** — `patisgest-app/supabase/33-restauration-sans-perte.sql:29` — `security definer` : verifier l'ordre des DELETE/INSERT, la gestion des FK et le comportement a mi-parcours si une insertion echoue.
- **H18-12** — `patisgest-app/supabase/35-version-schema-app.sql:1` — Table `app_schema_version` + garde `(app)/layout.tsx:38-42` : verifier le refus explicite en cas de version decalee et l'absence de blocage silencieux.

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

- Écrire `audit/rapports/S18.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S18-F001`, `S18-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

