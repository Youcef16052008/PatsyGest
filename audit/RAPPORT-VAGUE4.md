# Rapport d’exécution — VAGUE 4 et suite de la roadmap

**Date** : 2026-11-26
**Branche** : `arena/923a4433-patsygest`
**PR** : #26 ouverte vers `main`, non fusionnée
**Demande** : « Toute la suite de la roadmap » (`B.2`, `B.4`, migrations planifiées A–D, vérification live/mobile 360 px).

Ce rapport complète les livraisons H13–H20 déjà validées. Il ne remplace pas
`audit/RAPPORT-H13-H20.md`, qui reste le relevé historique déposé dans Google
Drive. Les documents d’audit livrés précédemment n’ont pas été réécrits.

---

## 1. Résumé

| Élément | Résultat |
|---|---|
| B.2 FR/AR + RTL | Dictionnaire symétrique, cookie immédiat, profil Supabase `utilisateurs.langue`, SSR `dir="rtl"`, traductions cuisine/caisse/ticket/dashboard/navigation. |
| B.4 facture fournisseur par photo | Capture `image/*`, compression et aperçu, pré-remplissage des lignes, **validation humaine obligatoire**, entrée en stock explicite, photo conservée à côté des lignes. |
| Migration A `recettes_libres` | Déjà livrée (`45-recettes-libres.sql`) ; RLS multi-tenant prouvée à nouveau. |
| Migration B `credits_clients` | Déjà livrée (`46-credits-clients.sql`) ; RLS multi-tenant prouvée à nouveau. |
| Migration C alertes prix | Déjà livrée (`48-notifications-patron.sql`, verrouillée par `50-roles-permissions-vues.sql`) ; employé déclenche, ne s’auto-valide pas, patron approuve. |
| Migration D onboarding DZ | Complétée par `57-onboarding-pack-dz-rpc.sql` : RPC SQL `importer_pack_patisserie_dz` idempotente, 24 articles, propriétaire seul, `client_id` issu de `auth.uid()`. |
| Chaîne SQL | `migrations/repetition.json` : 34 entrées `main_hors_serie`, 56 fichiers de schéma, `01→57`, `app_schema_version = 57`. |
| Live + mobile 360 px | HTTP 4/4, navigateur 5/5 avec Chromium headless 158, viewport 360 × 780. |

Aucune migration historique n’a été réécrite. SQL 56 (profil langue) et SQL 57
(pack DZ) sont additifs et idempotents.

---

## 2. Fichiers livrés

### Produit
- `patisgest-app/supabase/56-profil-langue.sql` — SHA `2c68399dab39e49c7b178b16ab61fcbd39199f31a34a8391b708f71e128461b1`.
- `patisgest-app/supabase/57-onboarding-pack-dz-rpc.sql` — SHA `885745d7e2d10c6636882dbf577700663e05270645ca729af40a0df4f05bb38d`.
- `patisgest-app/src/lib/actions-locale.ts`, `src/lib/locale-profil.ts`, `src/lib/i18n.ts`.
- `src/app/layout.tsx`, `src/components/locale-provider.tsx`, `src/components/sale-ticket.tsx`, `src/components/invoice-photo-intake.tsx`.
- `migrations/repetition.json` : empreintes 56/57 et version de chaîne.

### Tests et harnais
- `tests/roadmap-vague4.test.mjs` : 5 tests purs/câblage B.2, B.4 et pack DZ.
- `tests/roadmap-vague4-db.test.mjs` : 5 tests PGlite sur la chaîne 01→57.
- `tests/roadmap-live-http.mjs` : 4 tests SSR/HTTP, démarre son propre `next dev` démo.
- `tests/e2e/roadmap-vague4.spec.mjs` : 5 parcours 360 px, démarre son propre serveur démo.
- `tests/support/chaine-active.mjs` : `creerChaineActive()` réutilisable, façade `appliquerChaineActive()` conservée.
- `tests/e2e/helpers.mjs` : support optionnel d’un Chromium local hors CDN.
- `tests/inventaire-surface.json` : 30 fichiers `use server`, 90 actions mesurées.
- `tests/impression-ticket.test.mjs` : assertions ticket adaptées au dictionnaire FR/AR.
- `package.json` : scripts `test:roadmap`, `test:roadmap:live`, `test:roadmap:e2e`.
- `tests/e2e/README.md`, `migrations/CHAINE-NON-REJOUABLE.md`, `tests/e2e/bootstrap-ci.mjs` et références de chaîne portées à 57.

### Documentation
- `PLAN-AMELIORATION-PATISGEST.md` : suivi d’exécution VAGUE 4 et résultats.
- `audit/RAPPORT-VAGUE4.md` : présent rapport.

---

## 3. Preuves SQL et RLS (PGlite)

`creerChaineActive()` applique réellement les 56 fichiers du manifeste jusqu’à
`app_schema_version = 57`. Les adaptations PGlite restent explicites :
`auth.uid()` stubbé, `rls_auto_enable()` vide, `creer_of()` minimal,
`clotures.revision` ajouté avant 09 et `pgcrypto` retiré. PGlite n’est pas une
preuve de déploiement Supabase réel.

Tests exécutés :

1. **Profil langue** — défaut `fr`, contrainte `fr|ar`, RPC
   `enregistrer_langue_utilisateur` limite l’écriture à la ligne du compte
   authentifié, langue invalide et appel non authentifié rejetés.
2. **Pack DZ** — `importer_pack_patisserie_dz('mixte','ifu_0')` insère 24
   articles ; second appel `imported = 0` ; activité `boulangerie` + TVA réelle
   insère 13 articles et calcule `PF-PCM` à `45,87 DA HT` / `9 %` ; un vendeur
   est refusé ; une activité inconnue est refusée.
3. **Isolement A/B** — sous rôle `authenticated`, l’établissement B ne voit
   aucune recette libre, aucun crédit et aucune alerte prix de A ; B ne voit
   que ses 13 articles du pack.
4. **Alerte prix** — un vendeur insère une notification, ne peut pas appeler
   `traiter_alerte_prix_patron`, le propriétaire approuve et la ligne passe à
   `approuve` avec `traite_par` = propriétaire.
5. **Chaîne cassée** — corrompre `01-socle.sql` fait toujours échouer
   `chaine-rejouable.test.mjs`.

---

## 4. Preuves HTTP et mobile 360 px

### HTTP (`npm run test:roadmap:live`, 4/4)
- `/api/health`, `/connexion`, `/estimation`, `/hors-ligne` en 200.
- Routes protégées sans session : 307 vers `/connexion`.
- 15 routes du workspace en SSR 200 avec session démo ; module inconnu 404.
- Cookie `patisgest.lang=ar` ⇒ `<html lang="ar" dir="rtl">` et libellé arabe ;
  `fr` ou valeur invalide ⇒ `ltr`.
- Cookie Mode Simple rendu dans `/parametres` ; la coquille SSR de `/caisse`
  n’affiche aucun `HT`.

### Navigateur (`npm run test:roadmap:e2e`, 5/5)
Chromium 158 headless local, viewport **360 × 780**, `isMobile`/`hasTouch`.
Le CDN Playwright ayant échoué (`ECONNRESET`), le harnais accepte
`PATISGEST_CHROMIUM_PATH`, `PATISGEST_CHROMIUM_LIBS` et
`PATISGEST_CHROMIUM_FONTS` ; ces artefacts restent hors dépôt.

- Dashboard arabe RTL, KPI traduits, bascule FR/AR/FR, aucun débordement horizontal.
- Caisse tactile : tuile produit et bouton d’encaissement ≥ 44 px, vente,
  ticket arabe `المجموع`, aucun `TOTAL`, aucun débordement.
- B.4 : photo PNG 1×1, aperçu, deux lignes pré-remplies, mention de
  vérification humaine, total estimé, validation explicite, confirmation
  « 2 ligne(s) validée(s) », aucun débordement.
- Mode Simple : après ajout d’un produit, texte visible sans `HT`, cible tactile ≥ 44 px.
- Coupure réseau : `navigator.onLine = false`, bandeau « Mode hors-ligne actif »,
  puis retour en ligne.

---

## 5. Chaîne complète

| Commande | Résultat |
|---|---|
| `npm run typecheck` | rc0 |
| `npm run lint` | rc0 |
| `npm test` | `1..881`, 884 tests, 878 pass, 0 fail, 3 skipped, 3 todo, `238775.159214 ms` |
| `npm run test:roadmap` | 10/10 |
| `npm run test:roadmap:live` | 4/4 |
| `npm run test:roadmap:e2e` | 5/5 |
| `npm run build` | Next 16.4.6, `Compiled successfully in 806ms`, 6/6 pages, `ƒ Proxy (Middleware)` |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| `git diff --check` | rc0 |

Logs locaux : `/tmp/vague4-chain-final/*.log` (hors dépôt, non persistants).

---

## 6. État externe et limites

- Projet Supabase réel observé précédemment en lecture seule : `schema_version 53`.
  **SQL 54/55/56/57 ne sont pas appliqués** au pilote ni à la production.
- `src/lib/schema-version.ts` conserve son garde-fou minimal `VERSION_SCHEMA_REQUISE=37`.
- Aucun déploiement, aucun changement d’env/secrets, aucune écriture
  Supabase/Vercel/Figma, aucune mutation du dossier Drive après l’upload
  H13–H20 déjà livré. La PR #26 est ouverte et enrichie, sans fusion.
- PGlite ne certifie ni concurrence PostgreSQL réelle, ni Auth/PostgREST/Storage
  Supabase, ni CI distante. Les parcours E2E utilisent le mode démo local, pas
  la pile Supabase CLI complète.
- Restent hors périmètre : benchmark 100 000 lignes, FCP réel, RGPD complet,
  rollback à chaud, exécution `workflow_dispatch` distante et E2E complet sur
  pile Supabase locale.

**Conclusion** : la VAGUE 4 demandée est livrée et validée localement sur le
dépôt, avec une chaîne de migrations rejouable 01→57 et des preuves HTTP/mobile
360 px. La mise en production reste une décision distincte, non exécutée.
