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

**Montée en charge (avant ~15 comptes)** : exécuter
`supabase/24-index-exploitation.sql`. Il crée 18 index composites par
`client_id` là où les écrans et les RPC FEFO filtrent réellement. Sur le pilote
(1 établissement) ils sont inutiles ; dès que plusieurs boutiques partagent les
mêmes tables, leur absence transforme chaque écran en balayage complet. Sur une
base déjà volumineuse, remplacer chaque `create index` par
`create index concurrently` hors transaction pour ne pas bloquer la caisse.
Coût d'infrastructure et arbitrage Free/Pro : [`../NOTE-HEBERGEMENT.md`](../NOTE-HEBERGEMENT.md).

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

### 5. Hors-ligne (NF-02)

La caisse fonctionne sans réseau : service worker (`public/sw.js`, JS pur,
sans dépendance), manifeste PWA (`/manifest.webmanifest`) et catalogue de
secours (`src/lib/catalogue-cache.ts`).

- **Ce qui est mis en cache** : l'écran `/caisse`, `/tableau-de-bord` et
  `/connexion`, les assets Next, les polices, les icônes.
- **Ce qui ne l'est jamais** : les server actions, `/api/*` et les données de
  coût. Une vente doit toujours être validée par le serveur.
- **Catalogue de secours** : produits, sites et identité du ticket sont
  conservés dans le navigateur ; ils ne servent que si le serveur ne répond
  pas, et sont **refusés au-delà de 14 jours** (mieux vaut une erreur claire
  qu'un prix périmé encaissé comme s'il était juste). Le stock n'est jamais
  restauré depuis le cache.
- **Synchronisation** : automatique au retour du réseau, plus un contrôle
  toutes les 30 s ; idempotence par numéro de ticket, donc aucun doublon.

Tester en local (le SW est désactivé en développement, volontairement) :

```bash
npm run build && npm start
# puis, dans l'onglet Réseau des DevTools : « Offline » et recharger /caisse
```

Limite connue : une **navigation directe vers une page jamais visitée** hors
ligne affichera l'erreur du navigateur. Les écrans listés ci-dessus sont, eux,
toujours disponibles.

### 6. Vitrine publique (site web du client)

Chaque boutique peut publier un site : `elyasmine.patisgest.dz` (ou
`/vitrine/elyasmine` sur le domaine de l'application). C'est un **catalogue
public**, pas un accès à l'application.

Migrations : `25-domaines-boutiques.sql` (sous-domaines), `26-vitrine-publique.sql`
(champs + vue `vitrine_catalogue`), `27-commandes-vitrine.sql` (RPC publiques),
`28-fermeture-anon.sql` (droits).

**Ce qu'un visiteur anonyme peut faire — et rien d'autre :**

| Action | `anon` | vendeur | labo | propriétaire |
|---|---|---|---|---|
| Lire le catalogue (`vitrine_catalogue`) | oui | oui | oui | oui |
| Déposer une demande de commande | oui (RPC) | — | — | — |
| Accepter / refuser une demande | non | oui | oui | oui |
| Changer une photo | non | **non** | oui | oui |
| Modifier la fiche (nom, description, ordre) | non | **non** | oui | oui |
| Ajouter / supprimer une recette | non | **non** | **non** | oui |
| Publier / dépublier la vitrine | non | non | non | oui |

Les règles de rôle vivent dans `src/lib/vitrine-permissions.ts` (pur, testé) ;
la base les revalide (RLS + RPC).

**Dédoublonnage :** deux recettes de même **nom** ne donnent qu'une entrée.
La clé `patisgest_cle_nom()` ignore accents, casse et ponctuation (« Éclair »,
« éclair » et « ECLAIR » = un seul gâteau). Les ingrédients ne sont pas
comparés : c'est la règle métier demandée.

**Ce qui n'est jamais publié :** aucune colonne de coût (matières, MO,
énergie, emballage, frais généraux), aucun ingrédient, aucune marge. Un
prix de vente à 0 sort à `null` et s'affiche « prix sur demande » — jamais
« 0 DA ».

**Traitement d'une demande :** le visiteur dépose un besoin (recette, date,
parts, téléphone). Le statut initial est `demande`, le prix n'est pas fixé
par lui. Un vendeur *accepte* (→ la demande devient un `devis` à chiffrer)
ou *refuse* (→ `annule`). Aucun paiement ne circule sur la vitrine.

**Idempotence :** la clé `cakes.cle_vitrine` est tirée par le navigateur et
unique par établissement ; un double clic ou une reprise réseau renvoie la
même demande au lieu d'en créer une seconde. Garde-fou anti-flood : 30
demandes par heure et par établissement, sans stocker d'IP.

**Routage :** `middleware.ts` classe l'hôte avec `resoudreHote()`. Un
sous-domaine boutique réécrit `/` vers `/vitrine/<slug>` (même origine,
pas de redirection). `/connexion`, `/tableau-de-bord`, `/api/*` et
`/parametres` restent ceux de l'application : le gérant gère sa boutique
depuis l'adresse de sa vitrine.

**Mise en service par le client (Paramètres → Vitrine) :**

1. réserver un sous-domaine (`ma-boutique`) — propriétaire seul ;
2. cocher « Publiée » sur les recettes à montrer, régler nom affiché, description, ordre ;
3. « Mettre en ligne » — refusé si aucune recette n'est publiée, ou sans adresse.

Le visiteur remplit ensuite un formulaire de commande sur la vitrine. La clé
d'idempotence est tirée une fois par page : un double clic renvoie la même
demande. Ces demandes apparaissent dans Cake Design avec le statut `demande`.

Migrations 31 : publication par RPC, car la policy `sites_update_staff`
autorise propriétaire **et** labo — un `update` direct aurait laissé le
laboratoire publier un site.

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
