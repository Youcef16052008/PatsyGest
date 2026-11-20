# Plan de correction — PâtisGest

Source : `revue/REVUE-CODE-PATISGEST.md` (constats F-01 à F-20, analyse des rapports externes en §8).
Branche : `arena/27fe0740-patsygest` (base `2fba72c`).

## Règles de travail

- **Pas d'édition des migrations déjà appliquées au pilote** (`01`–`31`). Leur empreinte SHA-256 est figée dans `migrations/repetition.json` et les fixtures pilote doivent rester identiques à `main`. Toute correction passe par une migration **ajoutée** (`32`, puis suivantes), qui corrige le corps installé avec des gardes strictes (refus si le corps n'est pas celui attendu).
- Chaque correction a : un test qui **échoue avant** le correctif et **passe après**, et `npm test` vert.
- Aucune migration n'est appliquée au pilote automatiquement. L'application d'une migration sur le pilote reste une décision humaine, après relecture.
- Les décisions métier sont signalées explicitement et ne sont pas tranchées seul.

## Phase 1 — Bloquants avant toute mise en production

| # | Constat | Action | Fichiers | Statut |
|---|---|---|---|---|
| 1.1 | **F-03** FEFO inversé | `sortFefo` aligné sur le SQL (`congele asc` : non congelé d'abord). Test de la DLC plus proche d'un lot congelé ajouté. | `src/lib/fefo-cost.ts`, `tests/fefo-cost.test.mjs` | **Fait** |
| 1.2 | **F-01** vente à 0 DA | Panier : ligne à `prixHT ≤ 0` ⇒ `valide=false` (avant : `valide` ignorait le prix) ; message visible au caissier. SQL : `vendre_panier` refuse `pv_ht <= 0` (migration `32`). | `src/lib/pos-cart.ts`, `src/components/sale-composer.tsx`, `supabase/32-…sql`, `tests/pos-cart-prix-nul.test.mjs`, `tests/phase1-rattrapage-db.test.mjs` | **Fait** |
| 1.3 | **F-18** (rapport B-005) migration 27 cassée | Migration `32` remplace la sélection `s.nom` par `s.subdomain` dans le corps installé. Reproduit avant, vérifié après. | `supabase/32-…sql`, `tests/phase1-rattrapage-db.test.mjs` | **Fait** (corps installé ; `27` non modifiée) |
| 1.4 | **F-02** restauration : un doublon fait perdre la table | `on conflict (id) do nothing` + compteurs `insere`/`ignore` par table, contrôle `version = 1`. Test : doublon + nouvelles lignes ⇒ nouvelles lignes insérées. | `supabase/33-restauration-sans-perte.sql`, `tests/phase1-f02-f20-db.test.mjs` | **Fait** (migration `33`, hors fixture pilote, à relire avant application) |
| 1.5 | **F-04** dates UTC | `jourLocal()` avec `Africa/Algiers`, propagé à 9 fichiers `src/**` ; test de minuit. | `src/lib/workspace-data.ts`, composants, `tests/revue-corrections.test.mjs` | **Fait côté application.** RPC `at time zone 'Africa/Algiers'` : **non fait** |
| 1.6 | **F-20** (rapport B-004) coût d'OF partiel compté N fois | Diviseur `v_of.qte_prevue` au lieu de `p_qte`. | `supabase/34-cout-of-partiel.sql`, `tests/phase1-f02-f20-db.test.mjs` | **Fait** (migration `34`). **Décision** : OF déjà valorisés **non recalculés** (choix utilisateur). Les OF concernés restent à lister (requête lecture seule à fournir) |
| 1.7 | **F-19** (rapport B-001) application ↔ schéma | Code labo/vendeur interrogeant des vues absentes du chemin déployable. **Décision** : masquer derrière un drapeau (choix utilisateur). | `src/lib/permissions.ts` (`ROLES_LABO_VENDEUR_ACTIFS = false`), `src/lib/actions-equipe.ts`, `src/lib/actions-rejoindre.ts`, `src/app/(app)/layout.tsx`, `tests/revue-corrections.test.mjs` | **Fait (drapeau).** Conséquence : un compte labo/vendeur existant est bloqué. `app_schema_version` non fait |

### Points à faire valider avant d'aller plus loin

1. **F-03, sens du tri** : le commentaire du code disait « congelé d'abord », mais le SQL réel trie les lots non congelés en premier. J'ai aligné le JS sur le SQL, car c'est ce qui s'exécute en base. Confirmer que c'est bien l'intention métier.
2. **F-01, articles existants à prix 0** : **traité.** 12 articles du pilote ont reçu un prix aléatoire entier dans ]0 ; 50] DA (choix utilisateur). Trace : `revue/donnees-prix-zero-pilote.sql`. 9 de ces 12 sont des matières premières : à corriger à la main si leur prix de vente doit être réel.
3. **Ordre des migrations sur le pilote** : `32` modifie le corps de `vendre_panier`. Le brouillon `128` remplace aussi cette fonction par correspondance de texte ; il devra être **régénéré après `32`**, sinon il échouera (« Corps inattendu »). Même chose pour `127` (sans risque : il ne fait rien si `subdomain` est déjà sélectionné).

## Phase 2 — Avant la prochaine version

| # | Constat | Action |
|---|---|---|
| 2.1 | F-08 | **Ouvert, sans migration.** La forme `alter default privileges … in schema public` ne retire pas EXECUTE de PUBLIC (vérifié PGlite) ; la forme globale a un effet de bord non testable ici. |
| 2.2 | F-05 | Contrôle de `version` dans `restaurer_sauvegarde` ; erreurs par table. |
| 2.3 | F-06 | **Fait** : borne 99,99 testée. Erreurs de fiche typées : non faites. |
| 2.4 | F-12 | Une seule liste ordonnée `01→32` pour tests et déploiement ; brouillons dans un sous-dossier. Le manifeste doit inclure `32` (fait). |
| 2.5 | F-10 | **Partiel** : tickets à 0 DA comptés dans `ticketsZero` (testé). Alerte à l'écran : non faite. |
| 2.6 | — (rapport B-010) | **CI sur `pull_request` et `main`** : aucun workflow ne s'exécute avant merge aujourd'hui. Gates : `npm ci`, typecheck, lint, tests, build, tests de migration. |
| 2.7 | — (rapport B-011) | Sauvegarde : passer d'AES-CBC non authentifié à AES-GCM ou `age` ; restauration testée. |
| 2.8 | — (rapport B-007/B-008) | Transfert : `client_ref` et RPC transactionnelle ; anti-abus vitrine par source plutôt que compteur global. |
| 2.9 | — (rapport B-002) | Clés étrangères composites `(client_id, …)` après contrôle des données existantes. |

## Phase 3 — Amélioration ultérieure

F-09 (`plusJours` validé) **fait**, F-07 (`libellePrix` ≤ 0) **fait**, F-14 (regex CSV) **fait**, F-17 (`asOf` obligatoire ; `ingredient-impact` corrigé) **fait**, F-11 (`src/db/`, `drizzle-orm`, `drizzle-kit`, `postgres`, scripts `db:*` retirés) **fait**. Restent : F-13 (tiroir `{}` vs `'0'`), F-16 (séparer `insuffisantStock` / `insuffisantCout`), F-15 (filtre de période à l'export).

## Phase 4 — Optionnel

N+1 de la fiche de coût (480 → 1 requête), suite Playwright minimale sur les 4 parcours, lint textuel de `securite.test.mjs` remplacé par des tests d'exécution, `error.tsx` par segment.

## Hors périmètre de ce dépôt (ops / prototype)

DNS `*.patisgest.dz` et version déployée sur Vercel (à vérifier via le connecteur, non fait), migration Electron 33 → version supportée (`patisgest-desktop`, fin de support 28/04/2025), prototype HTML (`esc()`, import de sauvegarde, export CSV), test de restauration complète sur base représentative.

## Critère de sortie de la Phase 1

- Tous les tests de la Phase 1 passent, et `npm test` reste vert.
- F-01, F-02, F-03, F-04, F-18, F-19, F-20 sont soit corrigés et testés, soit ont une décision métier documentée.
- Les migrations `32` et suivantes sont relues avant application sur le pilote, et `128` est régénéré si nécessaire.
