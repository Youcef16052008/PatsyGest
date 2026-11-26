# Tranche 02/20 — Autorisation, Matrice des Roles & Isolation Multi-Tenant

**Couche** : Couche 1 — Securite & frontieres de confiance · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S02.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**26 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/02-autorisation-rbac-tenant.md` | 173 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/[module]/page.tsx` | 455 | garde d'acces aux modules et roles |
| `patisgest-app/src/app/(app)/parametres/page.tsx` | 349 | parametres: modules, equipe, sites, roles |
| `patisgest-app/src/app/master/page.tsx` | 144 | entree de l'espace Master privilegie |
| `patisgest-app/src/components/equipe-settings.tsx` | 106 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/master-portal.tsx` | 515 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/modules-settings.tsx` | 14 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/sites-settings.tsx` | 31 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/workspace-nav.tsx` | 64 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-equipe.ts` | 162 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-modules.ts` | 21 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-sites.ts` | 32 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/equipe-experimental.ts` | 20 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/invitation-mail.ts` | 27 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/modules-access.ts` | 14 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/permissions.ts` | 128 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/supabase/admin.ts` | 23 | client Supabase: session / privileges |
| `patisgest-app/src/lib/vitrine-permissions.ts` | 99 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/workspace-nav.ts` | 36 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/actions-caisse-surface.test.mjs` | 45 | test a auditer pour cette tranche |
| `patisgest-app/tests/actions-roles-execution.test.mjs` | 193 | test a auditer pour cette tranche |
| `patisgest-app/tests/equipe-experimental.test.mjs` | 68 | test a auditer pour cette tranche |
| `patisgest-app/tests/matrice-app-schema.test.mjs` | 150 | test a auditer pour cette tranche |
| `patisgest-app/tests/modules-access-db.test.mjs` | 42 | test a auditer pour cette tranche |
| `patisgest-app/tests/modules-access.test.mjs` | 110 | test a auditer pour cette tranche |
| `patisgest-app/tests/permissions.test.mjs` | 83 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/actions-licence.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les policies RLS, `SECURITY DEFINER` et `GRANT`/`REVOKE` (T03) : lire pour la parité, ne pas auditer.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/actions-caisse-surface.test.mjs` (45 lignes) — propriété T02.
- `patisgest-app/tests/actions-roles-execution.test.mjs` (193 lignes) — propriété T02.
- `patisgest-app/tests/equipe-experimental.test.mjs` (68 lignes) — propriété T02.
- `patisgest-app/tests/matrice-app-schema.test.mjs` (150 lignes) — propriété T02.
- `patisgest-app/tests/modules-access-db.test.mjs` (42 lignes) — propriété T02.
- `patisgest-app/tests/modules-access.test.mjs` (110 lignes) — propriété T02.
- `patisgest-app/tests/permissions.test.mjs` (83 lignes) — propriété T02.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H02-01** — `patisgest-app/src/lib/permissions.ts:51` — `canAccessModule` : `role === "proprietaire"` retourne true pour n'importe quelle cle, meme inconnue de MODULE_ROLES. Verifier la parite avec les cles de `acces_modules` et les policies de la migration 23.
- **H02-02** — `patisgest-app/src/lib/permissions.ts:67` — `canReadCosts` = proprietaire seul. Comparer avec `50-roles-permissions-vues.sql:123` (policies vendeur) et avec les RPC SECURITY DEFINER de couts : la meme regle est-elle appliquee cote base ?
- **H02-03** — `patisgest-app/src/lib/modules-access.ts:11` — `if (error || !Array.isArray(data) ...) return null` : en panne DB la navigation est reduite (fail-closed) mais les actions serveur, elles, ne consultent pas ce Set. Prouver ou refuter le contournement par appel direct.
- **H02-04** — `patisgest-app/src/app/(app)/[module]/page.tsx:140` — Garde `canAccessModule` + `coutsAutorises` au rendu, et `catch { /* refuser si la verification est indisponible */ }` en l.151. Verifier le chemin d'une action invoquee directement sans passer par la page.
- **H02-05** — `patisgest-app/src/lib/actions-licence.ts:52` — `createAdminClient()` (service_role, bypass RLS) dans une Server Action : tracer l'appelant, la garde `verifyMasterCredentials` (l.208) et `requireMasterSession` pour chaque usage (l.240, 328, 366, 408).
- **H02-06** — `patisgest-app/src/lib/supabase/admin.ts:15` — `if (!url || !serviceKey) return null;` : verifier que TOUS les appelants transforment ce null en refus explicite plutot qu'en degradation silencieuse.
- **H02-07** — `patisgest-app/src/lib/actions-equipe.ts:19` — Garde `estProprietaireSeul(ctx.role)` sur une seule export ; verifier que les exports des l.49, 64, 77, 94, 138, 157 portent la meme garde et un filtre client_id.
- **H02-08** — `patisgest-app/src/lib/actions-sites.ts:25` — `.eq("client_id", ctx.clientId)` sur UPDATE, mais INSERT (l.26) prend `client_id` du contexte : tester l'IDOR avec un `id` d'un autre tenant et prouver le role exact de la RLS.
- **H02-09** — `patisgest-app/src/lib/vitrine-permissions.ts:55` — Matrice `PERMISSIONS`/`peutVitrine` : verifier que chaque export de actions-vitrine.ts appelle cette matrice et que les RPC SQL correspondantes la re appliquent.
- **H02-10** — `patisgest-app/src/app/(app)/parametres/page.tsx:98` — `catch { modulesError=true; sitesError=true; equipeError=true; }` : une seule panne RPC marque trois domaines indisponibles. Verifier l'absence de contournement et la lisibilite pour l'operateur.
- **H02-11** — `patisgest-app/src/app/master/page.tsx:1` — Entree de l'espace Master : prouver la chaine `page -> master-portal -> actions-licence -> admin client` et l'absence d'appel direct non authentifie.

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

- Écrire `audit/rapports/S02.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S02-F001`, `S02-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

