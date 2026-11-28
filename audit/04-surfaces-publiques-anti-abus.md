# Tranche 04/20 — Surfaces Publiques, Anti-Abus & Securite Web

**Couche** : Couche 1 — Securite & frontieres de confiance · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S04.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**33 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/04-surfaces-publiques-anti-abus.md` | 189 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(vitrine)/layout.tsx` | 33 | layout public vitrine |
| `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts` | 109 | Server Action anonyme de commande |
| `patisgest-app/src/app/(vitrine)/vitrine/[slug]/page.tsx` | 145 | rendu public par slug |
| `patisgest-app/src/app/estimation/page.tsx` | 55 | calculateur public sans compte |
| `patisgest-app/src/components/vitrine-commande.tsx` | 129 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/vitrine-form.tsx` | 255 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-vitrine.ts` | 301 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/domaines.ts` | 172 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-anti-abus.ts` | 22 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine-slug.ts` | 54 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/vitrine.ts` | 150 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/whatsapp.ts` | 94 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/25-domaines-boutiques.sql` | 196 | migration 25: domaines boutiques, sous-domaines, vitrine |
| `patisgest-app/supabase/26-vitrine-publique.sql` | 267 | migration 26: vitrine publique: vue catalogue et donnees exposees |
| `patisgest-app/supabase/27-commandes-vitrine.sql` | 249 | migration 27: commandes vitrine anonymes, plafond global |
| `patisgest-app/supabase/32-garde-prix-vitrine-rattrapage.sql` | 75 | migration 32: garde de prix vitrine (rattrapage) |
| `patisgest-app/supabase/38-anti-abus-vitrine-source.sql` | 120 | migration 38: anti-abus vitrine par source (plafond) |
| `patisgest-app/tests/domaines.test.mjs` | 76 | test a auditer pour cette tranche |
| `patisgest-app/tests/fixtures/pilote-vitrine/25-domaines-boutiques.sql` | 196 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/26-vitrine-publique.sql` | 267 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/27-commandes-vitrine.sql` | 249 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/28-fermeture-anon.sql` | 102 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/29-fermeture-public-fonctions.sql` | 73 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/30-edition-vitrine-rpc.sql` | 153 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/fixtures/pilote-vitrine/31-publication-vitrine.sql` | 98 | fixture SQL de la surface publique vitrine |
| `patisgest-app/tests/securite.test.mjs` | 335 | test a auditer pour cette tranche |
| `patisgest-app/tests/serie-main-vitrine-commande.test.mjs` | 28 | test a auditer pour cette tranche |
| `patisgest-app/tests/serie-main-vitrine-db.test.mjs` | 32 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-anti-abus.test.mjs` | 34 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-perimetre.test.mjs` | 77 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-permissions.test.mjs` | 126 | test a auditer pour cette tranche |
| `patisgest-app/tests/vitrine-slug.test.mjs` | 78 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/app/api/health/route.ts` → **T19** (`healthcheck public`) : preuve de traçage uniquement.
- Les RPC de calcul et de vente (T05/T07), le CSS et le bundle (T14), le Service Worker (T11).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/domaines.test.mjs` (76 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/25-domaines-boutiques.sql` (196 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/26-vitrine-publique.sql` (267 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/27-commandes-vitrine.sql` (249 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/28-fermeture-anon.sql` (102 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/29-fermeture-public-fonctions.sql` (73 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/30-edition-vitrine-rpc.sql` (153 lignes) — propriété T04.
- `patisgest-app/tests/fixtures/pilote-vitrine/31-publication-vitrine.sql` (98 lignes) — propriété T04.
- `patisgest-app/tests/securite.test.mjs` (335 lignes) — propriété T04.
- `patisgest-app/tests/serie-main-vitrine-commande.test.mjs` (28 lignes) — propriété T04.
- `patisgest-app/tests/serie-main-vitrine-db.test.mjs` (32 lignes) — propriété T04.
- `patisgest-app/tests/vitrine-anti-abus.test.mjs` (34 lignes) — propriété T04.
- `patisgest-app/tests/vitrine-perimetre.test.mjs` (77 lignes) — propriété T04.
- `patisgest-app/tests/vitrine-permissions.test.mjs` (126 lignes) — propriété T04.
- `patisgest-app/tests/vitrine-slug.test.mjs` (78 lignes) — propriété T04.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H04-01** — `patisgest-app/src/lib/vitrine-anti-abus.ts:15` — `if (!secret || secret.length < 32) return null;` : sans secret (valeur par defaut de .env.example:20), le plafond par source est desactive et seul le plafond global de 27 subsiste. Quantifier l'abus possible.
- **H04-02** — `patisgest-app/src/lib/vitrine-anti-abus.ts:16` — `x-forwarded-for?.split(",")[0]` : en-tete controllabe par le client chez certains proxys. Un attaquant change la valeur -> nouveau HMAC -> contournement du plafond par source.
- **H04-03** — `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts:73` — Les erreurs `CODES_FONCTION_ABSENTE` (PGRST202/42883) de la verification de source sont ignorees : si la migration 38 n'est pas installee, la commande passe sans aucun plafond par source.
- **H04-04** — `patisgest-app/src/app/(vitrine)/vitrine/[slug]/commander/actions.ts:33` — `sousDomaine` est lu dans le FormData, pas dans l'en-tete Host : un visiteur peut soumettre un autre slug. Prouver que la RPC 27 (l.63-69 de la migration) lie bien la boutique cible au domaine.
- **H04-05** — `patisgest-app/supabase/27-commandes-vitrine.sql:105` — Idempotence par `cle_navigateur` fournie par le client (actions.ts:40) : verifier l'enumeration, la reutilisation d'une cle d'autrui et l'absence de limite de taille cote SQL.
- **H04-06** — `patisgest-app/supabase/38-anti-abus-vitrine-source.sql:75` — `insert ...` (l.75) AVANT le `select count(*)` (l.77) sans verrou : deux requetes concurrentes peuvent toutes deux passer le plafond. Decrire la sequence exacte.
- **H04-07** — `patisgest-app/supabase/38-anti-abus-vitrine-source.sql:88` — `grant execute ... to anon, authenticated, service_role` : verifier qu'il s'agit bien de la SEULE fonction anon restante apres 29, et que son corps n'expose aucune donnee d'un autre tenant.
- **H04-08** — `patisgest-app/src/lib/domaines.ts:51` — `hote.endsWith(".vercel.app") || hote.endsWith(".e2b.app")` classe ces hotes comme 'application' : analyser le spoofing Host et l'interaction avec `src/proxy.ts:25-29`.
- **H04-09** — `patisgest-app/src/lib/domaines.ts:158` — `CHEMINS_APPLICATION.some(p => normalise === p || normalise.startsWith(p))` : `/api/...` sur un sous-domaine boutique n'est PAS reecrit. Verifier quelles routes API restent joignables depuis l'origine publique.
- **H04-10** — `patisgest-app/src/app/api/health/route.ts:15` — Sonde GET publique sans DB : verifier l'absence de donnee de tenant, l'absence d'effet de bord et le comportement quand la base est en pause (200 mensonger).
- **H04-11** — `patisgest-app/supabase/26-vitrine-publique.sql:208` — `create or replace view public.vitrine_catalogue` : lire la liste exacte des colonnes (l.212-225) et prouver qu'aucun cout, marge, prix de revient ou identifiant interne n'est expose a anon.
- **H04-12** — `patisgest-app/src/lib/domaines.ts:87` — Validation du sous-domaine par regex DNS (1-63, ASCII) : verifier les entrees avec port, point final, unicode/punycode et leur effet sur la reecriture de proxy.ts:34-37.

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

- Écrire `audit/rapports/S04.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S04-F001`, `S04-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

