# Tranche 13/20 — Fiabilite Runtime, Gestion d'Erreurs & Reprise sur Panne

**Couche** : Couche 4 — Fiabilite, performance, structure · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S13.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**5 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `audit/13-fiabilite-runtime-erreurs.md` | 155 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/error.tsx` | 13 | boundary d'erreur espace connecte |
| `patisgest-app/src/app/error.tsx` | 13 | boundary d'erreur globale |
| `patisgest-app/src/lib/erreurs-db.ts` | 71 | module lib: responsabilite de la tranche |
| `patisgest-app/tests/erreurs-db.test.mjs` | 97 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- `patisgest-app/src/lib/auth.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/export/route.ts` → **T12** (`export CSV generique`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/notifications-alerte.ts` → **T19** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/invitation-mail.ts` → **T02** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/trial-server.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/proxy-session.ts` → **T01** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/api/sauvegarde/route.ts` → **T18** (`generation de sauvegarde JSON`) : preuve de traçage uniquement.
- `patisgest-app/src/lib/actions-caisse.ts` → **T05** (`module lib: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/components/service-worker.tsx` → **T11** (`composant UI: responsabilite de la tranche`) : preuve de traçage uniquement.
- `patisgest-app/src/app/(app)/parametres/page.tsx` → **T02** (`parametres: modules, equipe, sites, roles`) : preuve de traçage uniquement.
- Les erreurs métier des actions (T05/T06), la supervision/alertes (T19), le harnais de tests (T20).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/erreurs-db.test.mjs` (97 lignes) — propriété T13.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (11)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H13-01** — `patisgest-app/src/lib/auth.ts:182` — `catch { return null; }` : une panne DB devient 'pas de session' -> redirect /connexion au lieu d'un 503. Decrire l'experience operateur a 3 h du matin.
- **H13-02** — `patisgest-app/src/app/api/export/route.ts:79` — `catch { ... 503 "Supabase est inaccessible" }` : verifier l'absence de log/telemetrie et la distinction entre erreur reseau, RLS et bug applicatif.
- **H13-03** — `patisgest-app/src/lib/notifications-alerte.ts:124` — `catch` -> `{ ok:false, error }` : verifier que `sendSmsAndWhatsAppAlerts` (l.179) et `runOfflineDisconnectAlerts` (connectivite-cron.ts:159) ne comptent pas un echec d'envoi comme une alerte livree.
- **H13-04** — `patisgest-app/src/lib/invitation-mail.ts:26` — `catch { return "echec"; } finally { transport.close(); }` : l'action d'invitation (actions-equipe.ts:142) annonce-t-elle le succes malgre l'echec SMTP ?
- **H13-05** — `patisgest-app/src/lib/trial-server.ts:54` — `statutEnVol = lireStatutEssaiServeur().finally(() => { statutEnVol = null; })` : verifier le comportement si le RPC reste pendant (tous les rendus partagent la promesse) et l'absence de timeout.
- **H13-06** — `patisgest-app/src/lib/proxy-session.ts:68` — `Promise.race([travail, budget])` avec `clearTimeout` en `finally` (l.80-82) : verifier qu'aucun rejet non traite ni minuteur fantome ne subsiste, et le sens de `perime` (l.77).
- **H13-07** — `patisgest-app/src/app/api/sauvegarde/route.ts:78` — `catch { 503 }` : verifier l'etat a mi-parcours (tables deja lues, reponse partiellement ecrite) et l'absence de sauvegarde vide silencieuse.
- **H13-08** — `patisgest-app/src/lib/actions-caisse.ts:209` — `catch { return { erreur: "Supabase est inaccessible...", reessayer: true }; }` : un vendeur qui retry apres un commit reussi mais une reponse perdue doit-il rejouer ? Correler avec l'idempotence par ticket.
- **H13-09** — `patisgest-app/src/components/service-worker.tsx:40` — `catch {}` sur l'enregistrement du Service Worker : verifier l'absence de nettoyage des listeners et le signal utilisateur.
- **H13-10** — `patisgest-app/src/lib/erreurs-db.ts:37` — `(e!.message as string).trim()` : verifier le cas d'une erreur non-Error (string, objet PostgREST, null) et la non-divulgation du message brut.
- **H13-11** — `patisgest-app/src/app/(app)/parametres/page.tsx:66` — Multiples `catch` (l.66, 98, 123, 150, 229) : cartographier pour chaque panne partielle ce qui reste affiche et ce qui est tu.

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

- Écrire `audit/rapports/S13.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S13-F001`, `S13-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

