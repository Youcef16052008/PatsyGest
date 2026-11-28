# Tranche 03/20 — Securite Base de Donnees, Privileges & Execution Privilegiee

**Couche** : Couche 1 — Securite & frontieres de confiance · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S03.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**24 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/03-securite-base-rls.md` | 177 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/lib/rls-probe.ts` | 101 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/01-socle.sql` | 97 | migration 01: socle: tables, RLS, policies clients/utilisateurs/sites |
| `patisgest-app/supabase/04-securite-lecture.sql` | 12 | migration 04: policies de lecture tenant generees dynamiquement |
| `patisgest-app/supabase/17-confidentialite-couts-rls.sql` | 115 | migration 17: confidentialite des couts: RLS et revoke/grant |
| `patisgest-app/supabase/19-confidentialite-familles-recettes.sql` | 14 | migration 19: confidentialite familles de recettes: RLS |
| `patisgest-app/supabase/20-creation-fournisseur.sql` | 17 | migration 20: creation fournisseur: revoke INSERT + policy |
| `patisgest-app/supabase/23-controle-modules.sql` | 142 | migration 23: controle des modules: policies restrictives + gardes RPC |
| `patisgest-app/supabase/28-fermeture-anon.sql` | 102 | migration 28: fermeture des droits anon sur tables/sequences |
| `patisgest-app/supabase/29-fermeture-public-fonctions.sql` | 73 | migration 29: fermeture des droits PUBLIC sur les fonctions |
| `patisgest-app/supabase/30-edition-vitrine-rpc.sql` | 153 | migration 30: RPC d'edition vitrine: security definer et tenant |
| `patisgest-app/supabase/31-publication-vitrine.sql` | 98 | migration 31: publication vitrine: verrous et droits |
| `patisgest-app/supabase/39-limites-tenant-restauration-sites-vitrine.sql` | 245 | migration 39: limites tenant, restauration, sites et vitrine |
| `patisgest-app/supabase/50-roles-permissions-vues.sql` | 700 | migration 50: roles/permissions/vues: parite et RLS |
| `patisgest-app/tests/anti-abus-vitrine-db.test.mjs` | 103 | test a auditer pour cette tranche |
| `patisgest-app/tests/confidentialite-roles-db.test.mjs` | 192 | test a auditer pour cette tranche |
| `patisgest-app/tests/droits-execution-db.test.mjs` | 51 | test a auditer pour cette tranche |
| `patisgest-app/tests/integration/auth-postgrest.mjs` | 876 | pile Auth + PostgREST locale: privileges et RLS |
| `patisgest-app/tests/labo-confidentialite-db.test.mjs` | 53 | test a auditer pour cette tranche |
| `patisgest-app/tests/phase1-f02-f20-db.test.mjs` | 107 | test a auditer pour cette tranche |
| `patisgest-app/tests/phase1-rattrapage-db.test.mjs` | 99 | test a auditer pour cette tranche |
| `patisgest-app/tests/phase1-security-regressions.test.mjs` | 121 | test a auditer pour cette tranche |
| `patisgest-app/tests/rls-probe.test.mjs` | 92 | test a auditer pour cette tranche |
| `patisgest-app/tests/vues-roles-recette.test.mjs` | 62 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/supabase/03-sprint2-modules.sql` → **T08** (`migration 03: creation des tables Sprint 2, contraintes et valeurs par defaut`) : preuve de traçage uniquement.
- `patisgest-app/supabase/06-ventes-caisse-fefo.sql` → **T05** (`migration 06: vente FEFO: arrondi, consommation de lots, totaux`) : preuve de traçage uniquement.
- `patisgest-app/supabase/26-vitrine-publique.sql` → **T04** (`migration 26: vitrine publique: vue catalogue et donnees exposees`) : preuve de traçage uniquement.
- Les actions serveur et `permissions.ts` (T01/T02) : citer pour la chaîne d’appel, ne pas auditer.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/anti-abus-vitrine-db.test.mjs` (103 lignes) — propriété T03.
- `patisgest-app/tests/confidentialite-roles-db.test.mjs` (192 lignes) — propriété T03.
- `patisgest-app/tests/droits-execution-db.test.mjs` (51 lignes) — propriété T03.
- `patisgest-app/tests/integration/auth-postgrest.mjs` (876 lignes) — propriété T03.
- `patisgest-app/tests/labo-confidentialite-db.test.mjs` (53 lignes) — propriété T03.
- `patisgest-app/tests/phase1-f02-f20-db.test.mjs` (107 lignes) — propriété T03.
- `patisgest-app/tests/phase1-rattrapage-db.test.mjs` (99 lignes) — propriété T03.
- `patisgest-app/tests/phase1-security-regressions.test.mjs` (121 lignes) — propriété T03.
- `patisgest-app/tests/rls-probe.test.mjs` (92 lignes) — propriété T03.
- `patisgest-app/tests/vues-roles-recette.test.mjs` (62 lignes) — propriété T03.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H03-01** — `patisgest-app/supabase/01-socle.sql:51` — `create policy "clients_select_own"` : lire la clause USING exacte et verifier qu'elle ne permet pas a un utilisateur de lire un autre client via une jointure.
- **H03-02** — `patisgest-app/supabase/04-securite-lecture.sql:9` — `execute format('create policy %I on public.%I for select ...')` : la liste de tables est figee dans la migration ; comparer avec toutes les tables creees par 02..53 pour detecter les tables sans policy.
- **H03-03** — `patisgest-app/supabase/03-sprint2-modules.sql:251` — Seconde generation de policies tenant (meme motif) : verifier la divergence de perimetre entre 03 et 04 et le risque de policy dupliquee ou manquante.
- **H03-04** — `patisgest-app/supabase/28-fermeture-anon.sql:48` — `execute format('revoke all on public.%I from anon', r.relname)` : boucle sur l'etat a l'instant T. Verifier les tables creees APRES 28 (40, 42, 48, 51) et leurs droits anon.
- **H03-05** — `patisgest-app/supabase/29-fermeture-public-fonctions.sql:42` — `revoke all on function %s from public` : PostgreSQL accorde EXECUTE a PUBLIC par defaut. Verifier les fonctions creees apres 29 (40, 41, 42, 48, 51, 53) et l'heritage anon.
- **H03-06** — `patisgest-app/supabase/50-roles-permissions-vues.sql:135` — Vues `labo_*`/`vendeur_*` avec `security_barrier = true` : verifier que le predicat de role est aussi porte par la RLS de la table sous-jacente (sinon lecture directe possible).
- **H03-07** — `patisgest-app/supabase/17-confidentialite-couts-rls.sql:99` — `revoke all ... from public, anon, authenticated; grant execute ... to authenticated, service_role` (l.100) : revoke puis grant sur le meme role. Etablir l'effet net reel et la garde de role dans le corps de la fonction.
- **H03-08** — `patisgest-app/supabase/23-controle-modules.sql:132` — Policies RESTRICTIVE generees avec `unnest(string_to_array(%L,'|'))` : verifier le comportement quand la liste de modules est vide ou NULL (fail-open vs fail-closed).
- **H03-09** — `patisgest-app/supabase/30-edition-vitrine-rpc.sql:38` — `security definer` sur une RPC d'edition : tracer la garde `client_id = patisgest_mon_client()` et `patisgest_mon_role()` dans tout le corps.
- **H03-10** — `patisgest-app/supabase/39-limites-tenant-restauration-sites-vitrine.sql:124` — `security definer` : verifier `set search_path`, la garde de role et l'absence d'injection via les parametres textes.
- **H03-11** — `patisgest-app/supabase/06-ventes-caisse-fefo.sql:191` — `revoke execute ... from public, anon; grant ... to authenticated, service_role` : verifier que la version finale installee (21/53) conserve ces droits et que le `search_path` est vide (21:525).
- **H03-12** — `patisgest-app/supabase/26-vitrine-publique.sql:148` — `create policy vitrine_photos_lecture ... using (client_id = patisgest_mon_client())` : tester la lecture d'une photo d'un autre tenant et la presence d'une policy INSERT/UPDATE equivalente.

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

- Écrire `audit/rapports/S03.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S03-F001`, `S03-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

