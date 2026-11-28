# Plan de commit — branch `arena/f6f43597-patsygest`

> **État :** 89 fichiers en working tree (88 de code/documentation + ce plan),
> **rien n'est commité ni poussé**, index vide.
> Ce plan a été **exécuté à blanc dans un clone jetable** : les 11 commits
> s'appliquent dans cet ordre et `tsc --noEmit` passe après **chacun** d'eux.
> Vous pouvez donc commiter au fil de l'eau sans jamais laisser la branch rouge.

Copier-coller depuis la racine du dépôt. Les chemins contenant des parenthèses
ou des crochets sont déjà entre guillemets simples.

---

## 1. `chore(ci): rejouer la chaîne de migrations sur la pile jetable`

```bash
git add .github/workflows/ci.yml .github/workflows/sauvegarde-free.yml
git commit -m "chore(ci): rejouer la chaîne de migrations sur la pile jetable"
```

`parcours-e2e` ne peut pas passer sur `main` (il exige une pile Supabase
jetable avec données de seed) : il est restreint à `workflow_dispatch` avec
préconditions explicites, et les jobs qui ont besoin d'une base vivent dans
`supabase-isole.yml`. `main` reste vert.

---

## 2. `feat(caisse): portée du ticket d'idempotence (site, source, contenu)`

```bash
git add patisgest-app/supabase/52-caisse-ticket-scope.sql \
        patisgest-app/migrations/repetition.json \
        patisgest-app/tests/caisse-ticket-scope-db.test.mjs \
        patisgest-app/tests/migrations-repetition.test.mjs
git commit -m "feat(caisse): portée du ticket d'idempotence (site, source, contenu)"
```

**⚠️ Ce commit contient une migration à appliquer à la main** — voir
« Étapes manuelles » plus bas. `CREATE OR REPLACE` uniquement, aucun `DROP`.

---

## 3. `feat(session): rafraîchissement borné et marqueur de session périmée`

```bash
git add patisgest-app/src/lib/proxy-session.ts \
        patisgest-app/src/proxy.ts \
        patisgest-app/tests/proxy-session.test.mjs
git commit -m "feat(session): rafraîchissement borné et marqueur de session périmée"
```

Budget ~2500 ms ; au-delà, l'en-tête `x-patisgest-session-stale: 1` est émis
proprement au lieu d'attendre indéfiniment. Hors ligne : échec rapide.

---

## 4. `fix(preview): ne jamais bloquer la production après une promotion`

```bash
git add patisgest-app/src/lib/preview-guard.ts \
        patisgest-app/tests/preview-guard.test.mjs
git commit -m "fix(preview): ne jamais bloquer la production après une promotion"
```

Un build né en `preview` puis promu en production gardait le drapeau figé à
`"1"` : toutes les routes rendaient 503 **définitivement**. L'environnement
d'exécution redevient la seule source de vérité.

---

## 5. `refactor(permissions): centraliser la garde propriétaire et fermer la vitrine par défaut`

```bash
git add patisgest-app/src/lib/permissions.ts \
        patisgest-app/src/lib/vitrine-permissions.ts \
        patisgest-app/tests/vitrine-permissions.test.mjs \
        patisgest-app/src/lib/actions-caisse.ts \
        patisgest-app/src/lib/actions-donnees.ts \
        patisgest-app/src/lib/actions-equipe.ts \
        patisgest-app/src/lib/actions-etablissement.ts \
        patisgest-app/src/lib/actions-onboarding.ts \
        patisgest-app/src/lib/actions-price-alerts.ts \
        patisgest-app/src/lib/actions-restauration.ts \
        patisgest-app/src/lib/actions-sites.ts \
        patisgest-app/src/app/api/export/route.ts \
        patisgest-app/src/app/api/export/comptable/route.ts \
        patisgest-app/src/app/api/sauvegarde/route.ts \
        patisgest-app/tests/securite.test.mjs
git commit -m "refactor(permissions): centraliser la garde propriétaire et fermer la vitrine par défaut"
```

`estProprietaireSeul()` remplace 16 comparaisons en dur. `peutVitrine()` ne
lève plus de `TypeError` sur une action inconnue (`__proto__`, `toString`…) :
elle renvoie `false`. Les deux assertions de `securite.test.mjs` ont été
**renforcées** (garde réelle exigée, hors commentaire).

---

## 6. `refactor(actions): scinder actions-journaux par domaine`

```bash
git add patisgest-app/src/lib/journal-actions-communs.ts \
        patisgest-app/src/lib/actions-clotures.ts \
        patisgest-app/src/lib/actions-cakes.ts \
        patisgest-app/src/lib/actions-haccp.ts \
        patisgest-app/src/lib/actions-planning.ts \
        patisgest-app/src/lib/actions-journaux.ts \
        patisgest-app/src/components/cake-forms.tsx \
        patisgest-app/src/components/lab-cake-form.tsx \
        patisgest-app/src/components/quality-forms.tsx \
        patisgest-app/src/components/planning-forms.tsx \
        patisgest-app/src/components/restock-request-quick-form.tsx \
        patisgest-app/src/components/tomorrow-lab-panel.tsx \
        patisgest-app/src/components/seller-blind-closing.tsx \
        patisgest-app/src/components/cash-closing-quick.tsx \
        patisgest-app/src/components/cloture-form.tsx \
        patisgest-app/tests/inventaire-surface.json
git commit -m "refactor(actions): scinder actions-journaux par domaine"
```

L'ancien fichier de 559 lignes est supprimé (`git add` sur un chemin supprimé
enregistre bien la suppression). **Pas de barrel** : un module `"use server"`
ne peut pas ré-exporter, Next 16 refuse le build. Les composants importent
directement le module de domaine.

---

## 7. `feat(essai): verrou d'essai appliqué côté serveur`

```bash
git add patisgest-app/src/lib/auth.ts \
        patisgest-app/src/lib/trial-server.ts \
        patisgest-app/src/app/\(app\)/layout.tsx \
        patisgest-app/src/app/page.tsx \
        patisgest-app/src/app/\(auth\)/rejoindre/page.tsx \
        patisgest-app/src/app/api/licence/statut/route.ts \
        patisgest-app/src/app/api/presence/heartbeat/route.ts \
        patisgest-app/src/components/trial-guard-client.tsx \
        patisgest-app/tests/trial-lock.test.mjs \
        patisgest-app/tests/trial-lock-demo.test.mjs
git commit -m "feat(essai): verrou d'essai appliqué côté serveur"
```

Hybrid (a+). Le garde est dans `getSessionContext()` : les 87 actions
exportées échouent fermées **sans être modifiées**. Échec ouvert si la RPC de
licence échoue. `allowLocked: true` uniquement sur les issues de secours.

---

## 8. `fix(connectivite): garde de type sur les lignes et jointure en tableau`

```bash
git add patisgest-app/src/lib/connectivite-cron.ts \
        patisgest-app/tests/connectivite-lignes.test.mjs
git commit -m "fix(connectivite): garde de type sur les lignes et jointure en tableau"
```

Deux bugs mesurés : une ligne nulle annulait tout le balayage d'alertes, et la
jointure rendue en tableau faisait afficher « Établissement » au lieu du vrai
nom dans **toutes** les alertes de ce cas.

---

## 9. `feat: finitions pilote (santé, crédits, clôture, vitrine, session)`

```bash
git add patisgest-app/src/app/api/health/route.ts \
        patisgest-app/src/components/client-logout.tsx \
        patisgest-app/src/lib/auth-session.ts \
        patisgest-app/src/lib/deconnexion-locale.ts \
        patisgest-app/src/lib/file-attente-cloture.ts \
        patisgest-app/src/lib/vitrine-slug.ts \
        patisgest-app/src/lib/credits.ts \
        patisgest-app/src/lib/csv.ts \
        patisgest-app/src/lib/fefo-cost.ts \
        patisgest-app/src/lib/sale-session.ts \
        "patisgest-app/src/app/(vitrine)/vitrine/[slug]/page.tsx" \
        patisgest-app/tests/api-health.test.mjs \
        patisgest-app/tests/auth-session.test.mjs \
        patisgest-app/tests/credits.test.mjs \
        patisgest-app/tests/csv.test.mjs \
        patisgest-app/tests/fefo-cost.test.mjs \
        patisgest-app/tests/cost-sheet.test.mjs \
        patisgest-app/tests/sale-session.test.mjs \
        patisgest-app/tests/deconnexion-locale.test.mjs \
        patisgest-app/tests/file-attente-cloture.test.mjs \
        patisgest-app/tests/cloture-file-attente.test.mjs \
        patisgest-app/tests/vitrine-slug.test.mjs \
        patisgest-app/tests/actions-caisse-surface.test.mjs \
        patisgest-app/tests/actions-credits.test.mjs \
        patisgest-app/tests/master-auth.test.mjs \
        patisgest-app/tests/modules-access.test.mjs \
        patisgest-app/tests/trial-license.test.mjs
git commit -m "feat: finitions pilote (santé, crédits, clôture, vitrine, session)"
```

Commit volontairement large : ce sont des correctifs indépendants de faible
volume, chacun livré avec son test. Les séparer produirait 27 commits pour un
gain de relecture nul.

---

## 10. `test: stabiliser le harnais (next/server, module mocks)`

```bash
git add patisgest-app/tests/mocks/next-stubs.mjs \
        patisgest-app/tests/mocks/register-hooks.mjs \
        patisgest-app/tests/harness-execution.mjs \
        patisgest-app/package.json
git commit -m "test: stabiliser le harnais (next/server, module mocks)"
```

`next/server` devient résolvable hors bundler (nécessaire aux tests de route),
le proxy du faux client Supabase est corrigé, et `engines.node >= 22.15.0` est
déclaré (la suite utilise `--experimental-test-module-mocks`).

---

## 11. `docs: README réparé, matrice d'environnement, checklist de déploiement`

```bash
git add README.md patisgest-app/.env.example \
        revue/CHECKLIST-DEPLOIEMENT.md revue/PLAN-DE-COMMIT.md
git commit -m "docs: README réparé, matrice d'environnement, checklist de déploiement"
```

> Si vous commitez ce plan **avant** les autres, retirez `revue/PLAN-DE-COMMIT.md`
> de la commande ci-dessus. Le plan doit être le dernier commit, sinon il décrit
> un état qui n'existe pas encore.

Le README ne pointait pas vers 8 mais **13** références cassées, et décrivait
un projet qui n'existe plus (`PâtisGest-Final.html`, `patisgest-desktop/`,
`LISEZ-MOI.md`). 18 liens résolvent maintenant.

---

## Après le dernier commit

```bash
git status --porcelain          # doit être vide
git log --oneline -11
```

---

# Étapes manuelles hors Git

## A. Base Supabase du pilote — migration 52 (**bloquant**)

`52-caisse-ticket-scope.sql` n'est **pas** dans la chaîne automatique. À
appliquer à la main, en une transaction :

```sql
begin;
-- coller l'intégralité de patisgest-app/supabase/52-caisse-ticket-scope.sql
commit;
```

Vérification obligatoire ensuite (détail complet dans
`revue/CHECKLIST-DEPLOIEMENT.md` § 2.3) :

```sql
select version from public.app_schema_version where id = 1;          -- attendu 52
select count(*) from pg_proc
 where proname = 'vendre_panier' and pronamespace = 'public'::regnamespace;  -- attendu 1
```

**Avant** d'exécuter : sauvegarder le corps actuel de la fonction
(`select pg_get_functiondef('public.vendre_panier'::regproc);`) et prévenir le
pilote qu'aucune vente ne doit passer pendant l'opération.

## B. Variables d'environnement — Vercel (production)

Obligatoires : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `PATISGEST_MASTER_EMAIL`, `PATISGEST_MASTER_KEY`,
`CRON_SECRET`.

Recommandées : `VITRINE_SECRET_ANTI_ABUS` (≥ 32 caractères — sert **aussi** de
graine de repli pour la signature des licences), `PATISGEST_DOMAINE`,
`PATISGEST_MASTER_PHONE`, `PATISGEST_OFFLINE_ALERT_MINUTES`,
`PATISGEST_LICENSE_PRIVATE_JWK` **ou** `PATISGEST_LICENSE_PRIVATE_KEY`.

À **ne pas** définir : `NODE_ENV`, `VERCEL_ENV`, `PATISGEST_PREVIEW_BLOCKED`
(calculées). `PATISGEST_DEMO_MODE` doit être absente ou `false` en production.

## C. Variables — GitHub Actions (secrets du dépôt)

- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`
  (pour `supabase-isole.yml`, la pile jetable) ;
- identifiants de sauvegarde si `sauvegarde-free.yml` est activé.

Vérifier que `parcours-e2e` figure bien en `workflow_dispatch` et **non** sur
déclenchement `push` vers `main`.

## D. Contrôles après déploiement

1. `curl -sS https://<domaine>/api/health` → `200`, `{"ok":true,…}`,
   `Cache-Control: no-store`.
2. Parcours de fumée § 4.2 de la checklist — en particulier **rejouer un ticket
   de vente** (idempotence) et **réutiliser un ticket avec un contenu différent**
   (doit être refusé).
3. Storage Supabase : `buckets = 0` et `objets = 0` (l'application n'uploade
   rien ; un objet inattendu signale un composant non prévu).

## E. Non couvert par ce lot

- La **restauration** du pilote reste **non certifiée** :
  `revue/PROCEDURE-RESTAURATION-PILOTE.md` est prête mais jamais exécutée.
- Aucune reproduction de test sur une vraie base Supabase : les tests de la
  migration 52 sont statiques. La preuve d'exécution viendra de l'étape A.
