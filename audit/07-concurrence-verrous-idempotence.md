# Tranche 07/20 — Concurrence, Verrous, Isolation SQL & Idempotence

**Couche** : Couche 2 — Logique metier & integrite · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S07.md`.

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
| `audit/07-concurrence-verrous-idempotence.md` | 170 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/components/client-ref-field.tsx` | 17 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/seller-blind-closing.tsx` | 237 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-stock.ts` | 229 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/client-ref.ts` | 13 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/lots-batch.ts` | 63 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/sale-session.ts` | 37 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/05-ecritures-articles-lots.sql` | 157 | migration 05: ecritures articles/lots: policies + RPC receptionner_lot |
| `patisgest-app/supabase/08-transferts.sql` | 168 | migration 08: transfert de stock: verrous et race de quantite |
| `patisgest-app/supabase/16-creer-of-idempotent.sql` | 151 | migration 16: creer_of idempotent: cle client et conflit |
| `patisgest-app/supabase/37-transfert-client-ref.sql` | 144 | migration 37: transfert + reference client: idempotence |
| `patisgest-app/supabase/43-unicite-lot.sql` | 76 | migration 43: unicite des lots: index unique et NULL |
| `patisgest-app/supabase/44-retrait-mode-carte.sql` | 55 | migration 44: retrait du mode carte: contraintes et rejeu |
| `patisgest-app/supabase/53-caisse-ticket-scope.sql` | 293 | migration 53: portee du ticket de caisse: idempotence stricte |
| `patisgest-app/tests/caisse-collision-db.test.mjs` | 61 | test a auditer pour cette tranche |
| `patisgest-app/tests/caisse-ticket-scope-db.test.mjs` | 174 | test a auditer pour cette tranche |
| `patisgest-app/tests/concurrence-transfert-reel.test.mjs` | 175 | test a auditer pour cette tranche |
| `patisgest-app/tests/sale-session.test.mjs` | 46 | test a auditer pour cette tranche |
| `patisgest-app/tests/transfert-client-ref-db.test.mjs` | 135 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/supabase/21-prix-demain-panier.sql` → **T05** (`migration 21: prix demain/panier: vendre_panier, FEFO, arrondis`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-caisse.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/supabase/27-commandes-vitrine.sql` → **T04** (`migration 27: commandes vitrine anonymes, plafond global`) : preuve de traçage uniquement.
- `patisgest-app/supabase/31-publication-vitrine.sql` → **T03** (`migration 31: publication vitrine: verrous et droits`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/sale-queue.ts` → **T11** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-of.ts` → **T06** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- Les arrondis (T05), les transitions d’état (T06), la chaîne de migrations (T18).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/caisse-collision-db.test.mjs` (61 lignes) — propriété T07.
- `patisgest-app/tests/caisse-ticket-scope-db.test.mjs` (174 lignes) — propriété T07.
- `patisgest-app/tests/concurrence-transfert-reel.test.mjs` (175 lignes) — propriété T07.
- `patisgest-app/tests/sale-session.test.mjs` (46 lignes) — propriété T07.
- `patisgest-app/tests/transfert-client-ref-db.test.mjs` (135 lignes) — propriété T07.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H07-01** — `patisgest-app/supabase/53-caisse-ticket-scope.sql:34` — Le fichier porte une mention 'Non appliquee au pilote' (affirmation hostile). Verifier dans `migrations/repetition.json` que 53 figure dans `main_hors_serie` (chaine de 52 fichiers) et determiner, SANS preuve de production, quelle version de `vendre_panier` est reellement installee sur le pilote.
- **H07-02** — `patisgest-app/supabase/21-prix-demain-panier.sql:512` — `revoke/grant` de `vendre_panier` : lire la clause de recherche du ticket existant dans le corps (avant 53) et montrer le cas 'meme ticket, autre site / autre contenu' decrit en 53:4-15.
- **H07-03** — `patisgest-app/src/lib/actions-caisse.ts:106` — `pTicket = input.ticket ?? crypto.randomUUID()` : meme cle + payload different. Verifier `sameSaleReplay` (l.161) et la condition de confirmation du doublon (l.144-145).
- **H07-04** — `patisgest-app/src/lib/actions-caisse.ts:118` — Repli `vendre_article` sur PGRST202/42883 : verifier que la cle d'idempotence `p_ticket` est conservee et que le mode de paiement n'est pas perdu (l.125-130).
- **H07-05** — `patisgest-app/src/lib/actions-caisse.ts:93` — `sameSaleSession(ctx, formData.get("expectedClientId"), formData.get("expectedAuthUserId"))` : valeurs declaratives issues du formulaire. Prouver qu'elles ne constituent PAS une autorisation et tracer la vraie frontiere.
- **H07-06** — `patisgest-app/supabase/27-commandes-vitrine.sql:208` — `for update` dans la RPC de commande : identifier la ligne verrouillee, le niveau d'isolation par defaut (READ COMMITTED) et le resultat de deux depots simultanes avec la meme cle navigateur.
- **H07-07** — `patisgest-app/supabase/31-publication-vitrine.sql:54` — `for update` : verifier l'ordre de prise de verrous entre publication et edition (30) pour detecter un interblocage.
- **H07-08** — `patisgest-app/src/lib/client-ref.ts:12` — `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}` : cle d'idempotence non cryptographique, sensible a l'horloge dereglee et aux collisions. Comparer avec la contrainte UNIQUE de 16-creer-of-idempotent.sql.
- **H07-09** — `patisgest-app/supabase/21-prix-demain-panier.sql:452` — `for update` sur les lots FEFO : verifier l'ordre deterministe annonce en l.414 ('zero interblocage') et le cas de deux ventes concurrentes sur le meme lot.
- **H07-10** — `patisgest-app/supabase/16-creer-of-idempotent.sql:26` — RPC idempotente `security definer` : lire le `on conflict`/verrou reel et tester la meme cle avec un payload different (article, quantite, date).
- **H07-11** — `patisgest-app/src/lib/sale-queue.ts:37` — `const MAX = 200` : deux onglets rejouant la file en parallele, quota plein, navigateur ferme a mi-parcours. Decrire la perte ou le doublon exact et le mecanisme de retrait.
- **H07-12** — `patisgest-app/src/lib/actions-of.ts:40` — Reference client issue de la file hors-ligne : prouver l'existence d'une contrainte UNIQUE en base (ou son absence) et le comportement sous rejeu apres coupure reseau.

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

- Écrire `audit/rapports/S07.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S07-F001`, `S07-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

