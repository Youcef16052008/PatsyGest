# Tranche 01/20 — Authentification, Sessions, Identites & Tokens

**Couche** : Couche 1 — Securite & frontieres de confiance · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S01.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**37 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/01-authentification-sessions.md` | 185 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/layout.tsx` | 87 | garde de session allowLocked (symboles initialBundle/DemoWorkspaceProvider -> T10) |
| `patisgest-app/src/app/(auth)/connexion/login-form.tsx` | 146 | formulaire login/signup |
| `patisgest-app/src/app/(auth)/connexion/page.tsx` | 32 | page de connexion |
| `patisgest-app/src/app/(auth)/rejoindre/page.tsx` | 37 | acceptation d'invitation |
| `patisgest-app/src/app/api/licence/statut/route.ts` | 29 | statut de licence |
| `patisgest-app/src/app/api/presence/heartbeat/route.ts` | 74 | heartbeat + signature du bundle |
| `patisgest-app/src/app/page.tsx` | 14 | racine: routage selon raison de session |
| `patisgest-app/src/components/client-logout.tsx` | 51 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/rejoindre-equipe.tsx` | 32 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/trial-guard-client.tsx` | 162 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/trial-lock-screen.tsx` | 129 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-auth.ts` | 52 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-licence.ts` | 442 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-rejoindre.ts` | 48 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/auth-session.ts` | 41 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/auth.ts` | 204 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/deconnexion-locale.ts` | 26 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/master-auth.ts` | 88 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pilot-account.ts` | 7 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/pilot-accounts.ts` | 42 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/proxy-session.ts` | 83 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/supabase/client.ts` | 9 | client Supabase: session / privileges |
| `patisgest-app/src/lib/supabase/server.ts` | 35 | client Supabase: session / privileges |
| `patisgest-app/src/lib/trial-crypto.ts` | 117 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/trial-lock-client.ts` | 391 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/trial-server.ts` | 130 | module lib: responsabilite de la tranche |
| `patisgest-app/src/proxy.ts` | 98 | proxy: rotation de cookies via getUser()/setAll (symbole deciderRoutage -> T04) |
| `patisgest-app/supabase/51-essai-abonnement-connectivite.sql` | 363 | migration 51: essai, abonnement, presence: jetons et licence |
| `patisgest-app/tests/auth-session.test.mjs` | 36 | test a auditer pour cette tranche |
| `patisgest-app/tests/invitation-mail.test.mjs` | 27 | test a auditer pour cette tranche |
| `patisgest-app/tests/master-auth.test.mjs` | 188 | test a auditer pour cette tranche |
| `patisgest-app/tests/pilot-account.test.mjs` | 13 | test a auditer pour cette tranche |
| `patisgest-app/tests/proxy-session.test.mjs` | 112 | test a auditer pour cette tranche |
| `patisgest-app/tests/trial-license.test.mjs` | 256 | test a auditer pour cette tranche |
| `patisgest-app/tests/trial-lock-demo.test.mjs` | 118 | test a auditer pour cette tranche |
| `patisgest-app/tests/trial-lock.test.mjs` | 282 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- Tous les fichiers SQL de RLS/`GRANT` (T03) : ne pas auditer, citer uniquement pour la parité.
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/auth-session.test.mjs` (36 lignes) — propriété T01.
- `patisgest-app/tests/invitation-mail.test.mjs` (27 lignes) — propriété T01.
- `patisgest-app/tests/master-auth.test.mjs` (188 lignes) — propriété T01.
- `patisgest-app/tests/pilot-account.test.mjs` (13 lignes) — propriété T01.
- `patisgest-app/tests/proxy-session.test.mjs` (112 lignes) — propriété T01.
- `patisgest-app/tests/trial-license.test.mjs` (256 lignes) — propriété T01.
- `patisgest-app/tests/trial-lock-demo.test.mjs` (118 lignes) — propriété T01.
- `patisgest-app/tests/trial-lock.test.mjs` (282 lignes) — propriété T01.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H01-01** — `patisgest-app/src/lib/auth.ts:122` — `if (!essaiActif()) return { ctx, raison: null }` : le mode gratuit (defaut) court-circuite toute lecture de licence. Verifier l'activation reelle du verrou serveur quand PATISGEST_MODE_GRATUIT=0 et la liste des actions qui appellent getSessionContext().
- **H01-02** — `patisgest-app/src/lib/auth.ts:126` — `lireStatutEssaiPartage().catch(() => null)` : echec ouvert assume. Une panne ou un timeout du RPC de licence leve le verrou ; determiner si un client peut provoquer cette panne a volonte.
- **H01-03** — `patisgest-app/src/lib/auth.ts:153` — `Promise.race([supabase.auth.getUser(), timer 1500 ms])` : au-dela de 1,5 s la session devient `null` sans distinction entre 'pas de session' et 'Auth indisponible'. Mesurer l'effet sur une connexion lente.
- **H01-04** — `patisgest-app/src/lib/auth.ts:136` — `demoEnabled() && pilotCookie` : cookie HMAC-SHA256 `payload.signature`, expire par `expires > Date.now()` (l.145), sans jti, sans rotation, sans revocation. Verifier le rejeu et le changement d'utilisateur sur appareil partage.
- **H01-05** — `patisgest-app/src/lib/trial-crypto.ts:32` — Graine de repli publique `"patisgest-ephemeral-dev-seed-change-in-production"` quand aucun des 4 secrets n'est defini : les jetons de licence ECDSA sont alors reproductibles par quiconque connait le depot.
- **H01-06** — `patisgest-app/src/lib/master-auth.ts:34` — `createHmac("sha256", masterKey())` : la cle de signature du cookie Master est le mot de passe lui-meme, dont la longueur minimale n'est que 16 caracteres (l.16). Verifier l'absence de rotation et la duree de 12 h (l.39).
- **H01-07** — `patisgest-app/src/proxy.ts:45` — `if (!url || !anonKey) return supabaseResponse;` : configuration absente = laisser passer. Etablir la chaine complete des gardes qui empechent neanmoins l'acces aux donnees dans ce cas.
- **H01-08** — `patisgest-app/src/proxy.ts:50` — Court-circuit `NODE_ENV !== "production" && PATISGEST_DEMO_MODE === "true" && cookie present` AVANT getUser() : la simple presence d'un cookie non verifie suffit a sauter le rafraichissement de session.
- **H01-09** — `patisgest-app/src/lib/supabase/server.ts:28` — `catch { /* Appele depuis un Server Component */ }` sur cookieStore.set : la rotation de session est avalee. Correler avec le marqueur `x-patisgest-session-stale` pose par proxy.ts:85.
- **H01-10** — `patisgest-app/src/app/api/presence/heartbeat/route.ts:15` — `getSessionContext({ allowLocked: true })` : un compte verrouille peut atteindre cette route, qui signe et renvoie un bundle de licence (l.42-69). Verifier que ce n'est pas une issue d'escalade.
- **H01-11** — `patisgest-app/src/lib/actions-auth.ts:31` — `if (!demoEnabled()) redirect("/connexion");` puis HMAC du cookie (l.34-37) : tracer login/logout, fixation de session et destruction du cookie cote navigateur (client-logout.tsx).
- **H01-12** — `patisgest-app/src/app/(app)/layout.tsx:33` — `getSessionContextDetaille({ allowLocked: true })` : le layout est la seule garde de rendu ; prouver que CHAQUE Server Action revalide la session et le role sans se fier au layout.

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

- Écrire `audit/rapports/S01.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S01-F001`, `S01-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

