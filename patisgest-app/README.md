# PâtisGest App — pilote Sprint 2 (démonstration + socle Supabase)

Application Next.js 16 pour pâtisseries artisanales : connexion Supabase à trois rôles
(propriétaire / labo / vendeur), isolement client par RLS, et modules Sprint 2.

> **État honnête** : les modules interactifs (FEFO, recettes, OF, transferts, Z, clôture,
> HACCP, Cake Design, traçabilité, planning, simulation) sont des **démonstrations
> locales** stockées dans le `localStorage` du navigateur. Les pages des comptes Supabase
> réels affichent des tables **lecture seule**. Les écritures transactionnelles Supabase,
> le rapprochement caisse/clôture et le rappel réel ne sont pas encore implémentés —
> voir `SPRINT2.md` pour la liste complète et les limites. Ce pilote n'est **pas** prêt
> pour des données réelles.

## Mise en route

### 1. Base de données (Supabase)

Exécuter **une fois** dans Supabase → SQL Editor, dans l'ordre :

1. `supabase/01-socle.sql` — tables `clients`, `utilisateurs`, `sites` + RLS
   *(ne pas relancer sur une base déjà initialisée)*.
2. `supabase/02-seed-pilote.sql` — client, sites et comptes de démonstration.
3. `supabase/03-sprint2-modules.sql` — 17 tables métier + politiques de lecture.
4. `supabase/04-securite-lecture.sql` — retrait des politiques d'écriture larges.
5. `supabase/05-ecritures-articles-lots.sql` — écritures réelles articles/lots/mouvements
   (rôles propriétaire + labo, isolement strict par client, réception atomique RPC).
6. `supabase/06-ventes-caisse-fefo.sql` — ventes de caisse via la RPC `vendre_article`
   (FEFO atomique, idempotence par ticket, tous les rôles authentifiés).
7. `supabase/07-of-production.sql` — cycle OF via `creer_of` / `demarrer_of` /
   `terminer_of` (besoins figés côté serveur, FEFO au lancement, coût connu à la clôture).
8. `supabase/08-transferts.sql` — transferts entre sites via `transferer_article`
   (FEFO au départ, lots miroirs à l'arrivée, stock insuffisant refusé).

Le jeu de données métier du projet pilote distant n'est pas intégralement reproduit par
le seed local.

### 2. Comptes

Les comptes `amina@patisserie.dz` (propriétaire), `sara@patisserie.dz` (labo) et
`amine@patisserie.dz` (vendeur) sont des **identifiants de démonstration publics**.
Les remplacer ou les désactiver avant toute utilisation réelle.

### 3. Variables d'environnement

```bash
cp .env.example .env.local
```

Seules deux variables sont nécessaires à l'application :
`NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(Supabase → Project Settings → API). Aucune clé service-role ni `DATABASE_URL`
n'est requise pour le fonctionnement (ces outils restent optionnels pour Drizzle).

Pour la démo locale sans réseau : `PATISGEST_DEMO_MODE=true` et un
`PATISGEST_DEMO_SECRET` aléatoire d'au moins 32 caractères.
Le mode démo est **désactivé en production** (`NODE_ENV`).

### 4. Lancer et vérifier

```bash
npm ci
npm run dev            # http://localhost:3000
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm test               # 106 tests unitaires (Node ≥ 22)
npm run test:smoke     # tests HTTP : gardes de routes, login/démo, cookie forgé, logout
npm run build          # build de production (celui que Vercel exécute)
```

Le test de fumée démarre son propre `next dev` sur le port 3411 (variable `SMOKE_PORT`
pour le changer).

## Déploiement (Vercel)

Le projet Vercel `patsy-gest` est lié à ce dépôt avec le **Root Directory
`patisgest-app`** (indispensable : le `package.json` est dans ce sous-dossier).
Variables d'environnement à définir dans Vercel → Settings → Environment Variables
(preview **et** production) :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Ne **jamais** définir `PATISGEST_DEMO_MODE` sur Vercel : le mode démo est verrouillé
hors production par le code, mais inutile et risqué de l'activer.

## Structure

```
src/app/page.tsx                        → aiguillage connexion / dashboard
src/app/(auth)/connexion/               → page de connexion (FR) + boutons démo
src/app/(app)/tableau-de-bord/          → tableau de bord (rôle, sites, liens modules)
src/app/(app)/[module]/page.tsx         → routes des 13 modules Sprint 2
src/lib/supabase/{client,server}.ts     → clients Supabase (navigateur / serveur)
src/lib/auth.ts                         → session : user Supabase ou cookie pilote local
src/lib/actions-auth.ts                 → connexion / démo / déconnexion
src/lib/patisgest-store.ts              → moteur de démonstration local (tests dedans)
src/lib/stock-input.ts                  → validation pure des saisies stocks (tests dedans)
src/lib/journal-input.ts                → validation pure clôture/qualité/planning/cakes (tests dedans)
src/lib/purchase-input.ts               → validation pure commandes multi-lignes/réceptions (tests dedans)
src/lib/z-input.ts                       → validation pure du format d'import Z (tests dedans)
src/lib/price-alerts.ts                   → alertes de variation de prix > 10 % (tests dedans)
src/lib/reconciliation.ts                 → rapprochement caisse/clôture (tests dedans)
src/lib/label-model.ts                    → modèle d'étiquette produit / allergènes (tests dedans)
src/lib/version-input.ts                   → validation pure des versions de recette (tests dedans)
src/lib/actions-stock.ts                → server actions d'écriture réelle (RLS)
src/lib/actions-caisse.ts               → vente réelle via RPC FEFO
src/lib/actions-of.ts                   → cycle OF réel (créer / lancer / clôturer)
src/components/stock-write-forms.tsx    → formulaires article / réception (page Stocks)
src/components/sale-form.tsx            → formulaire de vente (page Caisse)
src/components/of-forms.tsx             → formulaires OF (page Production)
src/components/transfer-form.tsx        → formulaire de transfert (page Transferts)
src/db/schema.ts                        → tables Drizzle (miroir du SQL)
supabase/01..08-*.sql                   → socle, seed, modules, lecture, écritures RLS
middleware.ts                           → rafraîchit la session Supabase
tests/store.test.mjs                    → tests unitaires du moteur local
tests/stock-input.test.mjs              → tests unitaires de validation des saisies
tests/smoke-http.mjs                    → tests HTTP de bout en bout
```

## Règles d'or

- **Isolement** : les lectures passent par le client Supabase serveur → la RLS
  (`client_id`) s'applique automatiquement. Ne JAMAIS filtrer côté navigateur seul.
- **Écritures** : le client Drizzle direct contourne la RLS — ne pas l'utiliser dans le
  code utilisateur sans frontière d'autorisation explicite. Les politiques d'écriture
  métier sont volontairement désactivées en attendant des procédures transactionnelles.
- **Rôles** : `proprietaire` (tout) / `labo` (stocks, prod) / `vendeur` (caisse + lecture).
  Les coûts ne sont pas encore restreints par rôle côté serveur.
- **Argent** : montants arrondis au centime (centimes entiers pour les versements Cake) ;
  le total d'un ticket Z est la somme exacte de ses lignes arrondies.
- **Démo vs réel** : toute donnée issue du mode démo vit dans le `localStorage` — ni
  synchronisée, ni sauvegardée, ni isolée entre utilisateurs d'un même navigateur.

## Commandes

| Commande | Usage |
|---|---|
| `npm run dev` | Développement local |
| `npm run build` / `npm start` | Build + production locale |
| `npm run typecheck` / `npm run lint` | Qualité (avant chaque commit) |
| `npm test` | Tests unitaires du moteur local |
| `npm run test:smoke` | Tests HTTP (gardes, login démo, logout) |
| `npm run db:studio` | Explorer la base (nécessite `DATABASE_URL`) |
