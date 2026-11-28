# Tranche 19/20 — Observabilite, Auditabilite, PII & Exploitation

**Couche** : Couche 5 — Ops, supply chain, verite des tests · **Mode** : MODE B (exécution de la tranche) · **Prompt autonome** : oui.
**Index maître** : `audit/00-INDEX.md` · **Rapport attendu** : `audit/rapports/S19.md`.

> **Rappel de la loi fondamentale** : ne jamais lire un `README`, un guide, un commentaire, un JSDoc
> ou un nom de test pour décider du fonctionnement. Ces éléments sont des **affirmations hostiles** ;
> toute contradiction avec le code exécutable doit être signalée en constat `DRIFT-DOC` avec `fichier:ligne`.
> Ne jamais supposer qu’un appelant a authentifié, filtré le tenant, validé le type ou verrouillé la ligne :
> tracer la chaîne réelle de l’entrée HTTP/CLI/Job jusqu’au sink DB/fichier/réseau.

---

## 1. Fichiers assignés (propriété exclusive)

**22 fichiers**. Aucun autre fichier du dépôt n’appartient à cette tranche.

| Fichier | Lignes | Responsabilité / symbole |
|---|---:|---|
| `.github/workflows/cron-connectivite.yml` | 79 | tache planifiee et alertes |
| `audit/19-observabilite-audit-pii.md` | 168 | prompt autonome MODE B de cette tranche |
| `patisgest-app/src/app/(app)/mentions-legales/page.tsx` | 139 | mentions legales et donnees personnelles |
| `patisgest-app/src/app/api/cron/connectivite/route.ts` | 36 | route cron et authentification Bearer |
| `patisgest-app/src/app/api/health/route.ts` | 20 | healthcheck public |
| `patisgest-app/src/components/donnees-personnelles-panel.tsx` | 142 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/journal-audit-panel.tsx` | 147 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/components/telephone-alerte-form.tsx` | 54 | composant UI: responsabilite de la tranche |
| `patisgest-app/src/lib/actions-donnees.ts` | 113 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/connectivite-cron.ts` | 204 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/journal-actions-communs.ts` | 32 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/journal-audit.ts` | 123 | module lib: responsabilite de la tranche |
| `patisgest-app/src/lib/notifications-alerte.ts` | 275 | module lib: responsabilite de la tranche |
| `patisgest-app/supabase/40-journal-audit.sql` | 258 | migration 40: journal d'audit immuable et triggers |
| `patisgest-app/supabase/42-donnees-personnelles.sql` | 236 | migration 42: donnees personnelles: export et anonymisation |
| `patisgest-app/supabase/48-notifications-patron.sql` | 142 | migration 48: notifications patron: alertes et journal |
| `patisgest-app/tests/api-health.test.mjs` | 45 | test a auditer pour cette tranche |
| `patisgest-app/tests/connectivite-lignes.test.mjs` | 122 | test a auditer pour cette tranche |
| `patisgest-app/tests/donnees-personnelles-db.test.mjs` | 193 | test a auditer pour cette tranche |
| `patisgest-app/tests/essai-master-connectivite.test.mjs` | 211 | test a auditer pour cette tranche |
| `patisgest-app/tests/journal-audit-db.test.mjs` | 222 | test a auditer pour cette tranche |
| `patisgest-app/tests/journal-audit.test.mjs` | 83 | test a auditer pour cette tranche |

## 2. Exclusions (hors périmètre)

- Les objets SQL d’audit en tant que privilèges (T03), la conformité des tests (T20).
- **Tout autre fichier du dépôt** : hors périmètre, propriété de la tranche indiquée dans `audit/00-INDEX.md`.

## 3. Tests à auditer

- `patisgest-app/tests/api-health.test.mjs` (45 lignes) — propriété T19.
- `patisgest-app/tests/connectivite-lignes.test.mjs` (122 lignes) — propriété T19.
- `patisgest-app/tests/donnees-personnelles-db.test.mjs` (193 lignes) — propriété T19.
- `patisgest-app/tests/essai-master-connectivite.test.mjs` (211 lignes) — propriété T19.
- `patisgest-app/tests/journal-audit-db.test.mjs` (222 lignes) — propriété T19.
- `patisgest-app/tests/journal-audit.test.mjs` (83 lignes) — propriété T19.

> **Découpage par symbole avec T20** : T20 possède les **corps d’assertions, les mocks et l’inventaire**
> (`tests/harness-execution.mjs`, `tests/mocks/*`, `tests/inventaire-*`). Cette tranche possède le
> **comportement testé**. Un constat « test incapable d’échouer » sur un test listé ci-dessus
> appartient à T20 ; cette tranche doit toutefois signaler l’angle mort et le risque métier associé.
> Harnais à réutiliser : `npm test` (`package.json:16`, glob `tests/*.test.mjs`), PGlite,
> `tests/harness-execution.mjs`, `tests/mocks/register-hooks.mjs`, `tests/integration/*`.

## 4. Hypothèses techniques ancrées (12)

Chaque hypothèse est **ancrée sur une ligne réellement observée** (vérifiée à la génération de l’index).
Une hypothèse n’est **pas** un constat : elle doit être confirmée ou **réfutée avec preuve** dans le rapport.

- **H19-01** — `patisgest-app/supabase/40-journal-audit.sql:108` — `create trigger journal_audit_immuable` : lire l'evenement exact (BEFORE/AFTER, INSERT/UPDATE/DELETE) et prouver qu'un proprietaire ne peut ni modifier ni effacer une ligne d'audit.
- **H19-02** — `patisgest-app/supabase/40-journal-audit.sql:126` — `create policy journal_audit_lecture_proprietaire` + `grant select` (l.123) : verifier le predicat de tenant et qu'un labo/vendeur ne lit pas les actions d'autrui.
- **H19-03** — `patisgest-app/supabase/40-journal-audit.sql:158` — `insert ... (acteur_email, ...)` : PII conservee en clair et 'survit a la suppression du compte' (l.65). Verifier la compatibilite avec l'anonymisation de la migration 42.
- **H19-04** — `patisgest-app/supabase/42-donnees-personnelles.sql:173` — `set client_nom = 'Client anonymise (' || v_ref || ')', telephone = null` : verifier TOUTES les autres colonnes identifiantes (email, adresse, notes, reference) et les tables liees avant de conclure a une anonymisation reelle.
- **H19-05** — `patisgest-app/supabase/42-donnees-personnelles.sql:87` — L'export inclut `c.telephone` (l.87) et `u.email` (l.97) : verifier le filtre de tenant de `exporter_donnees_personnelles` et l'absence de fuite inter-clients.
- **H19-06** — `patisgest-app/src/app/api/health/route.ts:15` — `{ ok:true, ... }` sans aucune sonde DB : un 200 est renvoye meme si Supabase est en pause. Evaluer la detection de panne silencieuse (ci.yml:184 utilise cette route pour le E2E).
- **H19-07** — `patisgest-app/src/lib/connectivite-cron.ts:75` — `cutoffIso = new Date(Date.now() - thresholdMin*60_000)` : horloge du serveur Next vs `last_seen_at` ecrit par la DB. Verifier le decalage et les faux positifs/negatifs d'alerte.
- **H19-08** — `patisgest-app/src/lib/connectivite-cron.ts:128` — `if (!u.last_seen_at) continue;` : un compte jamais vu n'est jamais considere comme deconnecte -> aucune alerte. Verifier si c'est le comportement voulu pour un nouveau pilote.
- **H19-09** — `patisgest-app/src/app/api/cron/connectivite/route.ts:9` — `CRON_SECRET` absent ou < 12 caracteres -> 401 (fail-closed), mais repli `getMasterSession()` (l.22) : verifier la surface d'appel et l'absence de brute force sur ce secret.
- **H19-10** — `.github/workflows/cron-connectivite.yml:30` — Garde `CRON_SECRET` >= 12 : verifier l'alerting si le workflow lui-meme ne s'execute plus (pas de heartbeat de surveillance du cron).
- **H19-11** — `patisgest-app/supabase/48-notifications-patron.sql:35` — `grant select, insert, update, delete ... to authenticated, service_role` : verifier les policies (l.38-57) et qu'un vendeur ne peut pas marquer une alerte prix traitee.
- **H19-12** — `patisgest-app/src/lib/notifications-alerte.ts:147` — `params.fetchImpl(params.webhookUrl, {...})` sans timeout ni AbortSignal : verifier le SSRF via variable d'environnement et le blocage du cron sur un webhook lent.

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

- Écrire `audit/rapports/S19.md` en suivant **strictement** le format § ci-dessus (7 sections).
- Préfixer chaque constat par `S19-F001`, `S19-F002`, …
- Ne modifier **aucun** fichier applicatif. Signaler tout test jetable créé en `/tmp`.
- Terminer par un **seul** verdict et le bilan de Passe 2.

