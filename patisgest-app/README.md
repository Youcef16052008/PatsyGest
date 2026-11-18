# PâtisGest App — pilote Sprint 2 (démonstration + socle Supabase)

Application Next.js 16 pour pâtisseries artisanales : connexion Supabase à trois rôles
(propriétaire / labo / vendeur), isolement client par RLS, et modules Sprint 2.

> **Démo et pilote connecté** : la démonstration manipule uniquement des données
> fictives dans le navigateur. En mode Supabase, la caisse, les stocks et la
> production utilisent les écritures et les contrôles de rôle existants. Cette
> refonte ne demande pas de migration supplémentaire. Respecter la procédure
> du [guide pilote](../GUIDE-PILOTE.md) avant d’utiliser des données réelles.

## Interface

Depuis le bouton **Apparence** de l’en-tête ou **Paramètres → Apparence** :

- **Atelier** : accueil illustré, indicateurs du jour et raccourcis.
- **Pilotage** : suivi des ventes sur 7 ou 14 jours et alertes de stock.
- **Mise en place** : tableau des fournées à lancer, en cours et terminées.
- **Comptoir** : caisse directement sur l’accueil.
- **Essentiel** : une prochaine action, ou le guide *Premiers pas* lorsqu’il est disponible.

Chaque interface garde son propre mode clair/sombre dans ce navigateur. Changer
l’apparence ne change ni les données ni les droits. Dans Stocks, la recherche
accepte le nom, le code ou le numéro d’un lot en stock : cliquer sur une ligne
pour voir ses détails. En caisse, choisir le site et le produit, vérifier la
quantité et le TTC, puis enregistrer la vente (un produit par ticket). En démo,
ce bouton simule la vente et le ticket est sans valeur fiscale.

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

**Pilote déjà en migration 18** : avant de déployer les correctifs et le guide B,
appliquer `supabase/19-confidentialite-familles-recettes.sql` puis
`supabase/20-creation-fournisseur.sql`. Le guide est proposé uniquement au
propriétaire et au labo en mode Supabase. Il suit les six enregistrements
existants dans l'établissement, pas les brouillons ni la file hors ligne.
Pour le retest sur un établissement de test, voir [le guide pilote, étape 6](../GUIDE-PILOTE.md#étape-6--vérifier-et-chronométrer-le-guide-b).

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
npm test               # tests unitaires et régressions (Node ≥ 22)
npm run test:smoke     # tests HTTP : gardes de routes, login/démo, cookie forgé, logout
npm run build          # build de production (celui que Vercel exécute)
```

Le test de fumée démarre son propre `next dev` sur le port 3411 (variable `SMOKE_PORT`
pour le changer). Arrêtez le serveur de développement avant de lancer ce test.

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
src/lib/fefo-cost.ts                       → coût FEFO pur (ordre congelé/DLC/réception, tests dedans)
src/lib/quality-alerts.ts                  → rappels qualité HACCP purs (tests dedans)
src/lib/cost-sheet.ts                      → formules RC-01..RC-10 gravées (tests dedans)
src/lib/sale-queue.ts                      → file de ventes hors-ligne + store React (tests dedans)
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
  Les recettes et paramètres de coûts sont réservés au propriétaire et au labo (RLS 17/19).
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

### Dossier gâteau et migration 22

`supabase/22-cake-production.sql` est appliquée au projet pilote `evepzygucfxarpdnflzv` sous la version `20261118161819 cake_production_22`. Elle n'est pas appliquée automatiquement sur d'autres bases : la lancer après 21 et après sauvegarde. Sans elle, les nouvelles options de production du module Cake Design sont indisponibles. Ne pas publier le nouveau parcours connecté avant d'avoir vérifié la migration sur un environnement de test.

Un nouveau devis demande une version de recette active, un site et une quantité exprimée dans l'unité du rendement de cette recette : le nombre de parts n'est pas supposé égal à la quantité de produit fini. La confirmation, après un acompte d'au moins 30 % du HT, crée atomiquement un OF planifié avec besoins calculés côté serveur ; le stock n'est consommé qu'au lancement. Un devis ancien non confirmé peut recevoir cette association manuellement. Les dossiers déjà confirmés sans OF ne sont pas modifiés ni rapprochés automatiquement.

Le ticket, le plafond de paiement et le solde avant livraison utilisent le TTC arrondi au centime. Les versements historiques sont conservés comme montants enregistrés : contrôler manuellement les dossiers existants à TVA non nulle, notamment ceux déjà marqués livrés, avant toute utilisation réelle. Ces écrans ne constituent pas une validation fiscale ou comptable. Un dossier avec OF lié ne peut être marqué produit qu'après finition de l'OF et création d'un lot. L'annulation d'un tel dossier est volontairement bloquée : aucun parcours d'annulation/compensation de l'OF n'est encore fourni, donc une procédure administrative doit être définie avant utilisation en pilote.

Les tests locaux incluent un PostgreSQL embarqué avec schéma minimal et la fonction réelle de calcul des besoins de la migration 12 ; ils ne remplacent pas une vérification sur une base de test avec les vraies recettes, RLS, restaurations et opérations concurrentes.

### Accueils et contrôles demandés — travail en cours

L'accueil propriétaire compare les ventes TTC enregistrées sur deux périodes de sept jours, montre les produits sous leur seuil et les déclarations de clôture par boutique. Il ne calcule pas le bénéfice et ne décide pas de la fermeture définitive d'un établissement ; charges, dettes, jours d'ouverture et rapprochement réel ne sont pas tous disponibles. L'accueil laboratoire affiche quantités, seuils et fournées, sans y charger de ventes en mode connecté.

**Non terminé / ne pas utiliser comme garantie de confidentialité :** les autorisations existantes donnent encore au laboratoire accès aux coûts et prix dans d'autres écrans et via Supabase ; le mode démo stocke toutes ses données dans le navigateur. Le contrôle d'activation des modules par compte n'est pas encore implémenté, et les modules qualité, traçabilité et transferts restent accessibles. Une revue des politiques RLS, colonnes, RPC `SECURITY DEFINER`, actions serveur, sauvegardes et flux de saisie est indispensable avant de considérer ces restrictions appliquées. La PR est à maintenir en brouillon jusqu'à ces vérifications.
