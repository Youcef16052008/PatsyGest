# Plan d’amélioration PâtisGest — Édition Pâtisseries Algériennes

Ce document transforme le diagnostic produit et les retours terrain en une feuille de route concrète, directement alignée sur l’architecture actuelle de `patisgest-app/` (Next.js 16, React 19, Supabase, mode Démo `localStorage`, PWA hors-ligne).

> **Rappel de prudence déploiement (`NOTE-IMPORTANTE-PATISGEST.md`)** :
> Aucune migration SQL ne doit être poussée en aveugle sur la base pilote sans vérification préalable de l’état réel du catalogue et sauvegarde testée. Chaque évolution doit fonctionner **en mode Démo local** ET **en mode Supabase connecté**, avec tests unitaires, RLS et vérification mobile `360 px`.

---

## Vue d’ensemble de la feuille de route

| Vague | Contenu | Priorité | Objectif métier |
| :--- | :--- | :--- | :--- |
| **Vague 1 — Socle Critique** | **A.1 → A.6** | **Nécessaire (P1)** | Rendre le logiciel fiable, sans jargon, multi-appareils et prêt pour de vrais clients en boutique. |
| **Vague 2 — Contrôle & Labo** | **B.6 + B.5 + B.7** | **Fort impact (P2)** | Donner au patron la maîtrise totale à distance (alertes prix employé, bilan WhatsApp) et une tablette labo ultra claire. |
| **Vague 3 — Spécial DZ** | **B.1 + B.3** | **Différenciant (P3)** | Catalogue visuel pâtisserie algérienne + mode Ramadan/Aïd/Mariages avec liste de courses marché automatique. |
| **Vague 4 — Échelle & Confort** | **B.2 + B.4** | **Expansion (P4)** | Bilinguisme Français / Arabe (RTL) et pré-remplissage des factures fournisseurs par photo. |

---

## VAGUE 1 — CE QUI EST NÉCESSAIRE (Priorité 1 — Indispensable avant déploiement clients)

### A.1 — Synchroniser les « Recettes libres » en base de données (Supabase)
- **Problème actuel** : `src/lib/free-recipes.ts` et `src/components/free-recipes-workspace.tsx` enregistrent les recettes libres uniquement dans `localStorage` (`patisgest.free_recipes.v1.<scope>`). Le patron ne retrouve pas sur son téléphone ce qu’il a saisi sur le PC de la boutique.
- **Évolution base de données** :
  - Nouvelle migration SQL créant `public.recettes_libres` :
    - `id uuid primary key`
    - `client_id uuid not null references clients(id)`
    - `nom text not null`, `categorie text`, `parts integer not null default 1`, `frais_fixes_da numeric(12,2) not null default 0`, `prix_vente_da numeric(12,2)`
    - `ingredients jsonb not null default '[]'` (`[{ id, nom, quantite, unite, prixAchatDa, articleStockId? }]`)
    - `statut_prix text default 'valide'` (`valide` | `a_verifier_patron` — prépare B.6)
    - `cree_par uuid`, `modifie_par uuid`, `created_at`, `updated_at`
  - RLS strict isolé par `client_id` + droits lecture/écriture patron (et proposition par employé pour B.6).
- **Évolution applicative** :
  - Ajouter `src/lib/actions-free-recipes.ts` (lecture/écriture Supabase + fallback Démo `localStorage`).
  - Migration douce à la connexion : si le navigateur contient des recettes locales non encore dans Supabase, proposer un bouton **« Synchroniser mes X recettes locales vers le cloud »**.
- **Critère d’acceptation** : une recette créée sur PC apparaît instantanément sur mobile ; zéro perte hors-ligne.

---

### A.2 — Supprimer tout jargon `HT` / `TVA` en Mode Simple
- **Problème actuel** : plusieurs écrans affichent encore `DA HT`, `Prix HT` ou `TVA %` alors qu’une pâtisserie algérienne vend au détail en **DA tout compris** :
  - `src/components/cake-forms.tsx` (`Prix HT (DA)`, `acompte 30 % HT minimum`, `TVA %`)
  - `src/components/cake-operations.tsx` (`Coût HT (DA)`, `(DA HT)`)
  - `src/components/cake-ticket.tsx` (`Prix HT`, `TVA %`)
  - `src/components/article-guide.tsx` (`Prix de vente HT (DA)`, `TVA (%)`)
  - `src/components/demo-module.tsx` (`Prix unitaire HT`)
  - `src/components/coquille-hors-ligne.tsx` (`DA HT`)
- **Action** :
  - En **Mode Simple** (par défaut, `advancedMode === false`) :
    - Tous les libellés deviennent **`Prix (DA)`**, **`Coût (DA)`**, **`Acompte (DA)`**, **`Reste à payer (DA)`**.
    - La TVA est masquée et mise par défaut à `0` (ou gérée silencieusement en arrière-plan si l’établissement a activé la facturation avec TVA dans *Paramètres → Mode Avancé*).
    - Les tickets clients en mode simple affichent un total clair en **`DA`**, sans décomposition fiscale anxiogène.
  - En **Mode Avancé** (`advancedMode === true`) : conserver l’affichage `HT / TVA / TTC` pour les clients B2B/facturation.
- **Critère d’acceptation** : aucune occurrence visible de `HT` ou `TVA` dans les parcours Mode Simple (`Tableau de bord`, `Caisse`, `Commandes & Gâteaux`, `Recettes & Coûts`, `Stocks & Achats`, `Hors-ligne`).

---

### A.3 — Gestion simple des Crédits clients & Acomptes à encaisser (« Carnet / Kridi »)
- **Problème actuel** : les acomptes de gâteaux existent dans `cakes`, mais les ventes comptoir aux habitués, cafés ou entreprises qui paient à la semaine ne disposent pas d’un suivi simple.
- **Évolution base de données** :
  - Nouvelle table `public.credits_clients` (ou extension contrôlée des paiements) :
    - `id`, `client_id`, `nom_debiteur text not null`, `telephone text`, `type_compte text` (`particulier` | `cafe_entreprise`), `montant_total_da`, `montant_regle_da`, `date_echeance`, `note`, `vente_id`, `cake_id`, `statut` (`ouvert` | `solde`), `created_at`.
  - Mode de règlement supplémentaire en caisse (`pos-cart.ts`, `demo-caisse.tsx`, `sale-composer.tsx`) : **`À crédit (Carnet)`** (exigeant nom + téléphone du client).
- **Évolution UI** :
  - Onglet / filtre **`Crédits & Acomptes à encaisser`** accessible directement depuis le **Dashboard** (sous le KPI Commandes/Reste à encaisser) et dans **Caisse / Commandes**.
  - Actions en 1 clic : **`Encaisser un versement`**, **`Solder tout`**, **`Relancer par WhatsApp`** (message poli pré-rempli via `src/lib/whatsapp.ts`).
- **Critère d’acceptation** : le patron voit à tout moment le total exact qui lui est dû (acomptes gâteaux + crédits cafés/clients) et encaisse un versement en 2 clics.

---

### A.4 — Bilan de caisse connecté au serveur en 1 clic depuis le Dashboard
- **Problème actuel** : `src/components/cash-closing-quick.tsx` calcule l’écart espèces attendues vs comptées, mais enregistre seulement dans `localStorage` (`patisgest.caisse_soir.<date>`), sans écrire dans la table Supabase `clotures`.
- **Action** :
  - Créer une action serveur dédiée (`validerComptageTiroir` dans `src/lib/actions-journaux.ts`) appelant la RPC `saisir_cloture` (ou une RPC légère dédiée si les flux produits ne sont pas saisis) pour sauvegarder `fond_initial`, `especes_comptees`, `ecart`, `date`, `site_id` dans `clotures`.
  - Mettre à jour `CashClosingQuickWidget` pour afficher un vrai état serveur (`Enregistré en base ✓` + horodatage) et conserver le mode local si mode Démo ou hors-ligne.
- **Critère d’acceptation** : le patron saisit le montant compté le soir sur le Dashboard → clic sur **« Valider le comptage »** → l’état passe à `Clôture validée ✓` et reste visible sur tous ses appareils.

---

### A.5 — Mode Hors-Ligne visible, rassurant et continu
- **Problème actuel** : la file d’attente `src/lib/sale-queue.ts` et le cache `src/lib/catalogue-cache.ts` existent déjà techniquement, ainsi que `/hors-ligne` (`coquille-hors-ligne.tsx`), mais l’utilisateur en boutique ne voit pas clairement s’il est protégé lorsqu’Internet coupe.
- **Action** :
  - Ajouter un composant léger `<NetworkStatusPill />` dans `src/app/(app)/layout.tsx` et dans le header de `Caisse` (`sale-composer.tsx` / `demo-caisse.tsx`) :
    - En ligne sans attente : discret ou pastille verte **`Connecté`**.
    - Hors-ligne : bandeau ambre rassurant **`Mode hors-ligne actif · Vos ventes sont sauvegardées sur cet appareil`**.
    - Dès retour réseau avec file > 0 : compteur **`X ticket(s) en attente · Synchroniser maintenant`** + auto-sync silencieuse idempotente.
- **Critère d’acceptation** : couper le réseau dans DevTools / téléphone permet d’encaisser des paniers complets sans erreur bloquante, avec resynchronisation automatique au retour du réseau.

---

### A.6 — Onboarding express en 2 minutes au premier lancement
- **Problème actuel** : `src/components/onboarding-panel.tsx` et `src/lib/onboarding.ts` affichent 6 étapes techniques séquentielles (*ingrédient → produit → fournisseur → recette → OF → vente*), trop longues pour un patron pressé qui démarre avec un écran vide.
- **Action** :
  - Remplacer par un assistant **« Démarrage express en 3 étapes »** (affiché uniquement quand la boutique a 0 produit) :
    1. **Ma boutique** : Nom de la pâtisserie + téléphone WhatsApp + logo/photo (facultatif).
    2. **Importer le Pack Pâtisserie Algérienne en 1 clic** : création automatique d’un catalogue prêt à l’emploi modifiable (Croissant, Pain au chocolat, Mille-feuille, Éclair chocolat, Baklawa amandes, Makrout, Kalb El Louz, Tartelette fruits, Gâteau anniversaire 10 parts) + 10 ingrédients courants (Farine, Beurre, Sucre, Œufs, Amandes, Miel, Chocolat, Crème).
    3. **Caisse prête !** : bouton direct **« Ouvrir ma caisse »** ou **« Ajuster mes prix »**.
  - Conserver un mode « Partir de zéro » discret pour ceux qui veulent tout saisir eux-mêmes.
- **Critère d’acceptation** : un nouveau compte passe de 0 donnée à une caisse fonctionnelle avec produits algériens en moins de 120 secondes.

---

## VAGUE 2 — CONTRÔLE PATRON, LABO & EXPÉRIENCE QUOTIDIENNE (Priorité 2)

### B.6 — Vue « Mode Écran Cuisine / Labo » + Saisie de prix employé avec Alerte Patron
- **Besoin terrain clé** :
  1. Sur la tablette du laboratoire, le pâtissier n’a besoin que des préparations du jour et de demain, sans voir le chiffre d’affaires ni les marges de la boutique.
  2. **Règle métier critique demandée** : les employés (labo ou vendeur) peuvent **saisir le prix d’un nouveau gâteau, nouvelle recette, tarte ou cake** (ou ajuster un prix pour ne jamais bloquer une vente/commande). **Dès qu’un employé saisit ou modifie un prix**, le propriétaire reçoit immédiatement une **notification / alerte de contrôle** lui signalant :
     - qu’un **nouveau gâteau / tarte / cake / recette** vient de recevoir un prix saisi par un employé,
     - et **alerte critique renforcée** si le **prix saisi semble anormalement bas** (ex. inférieur au coût matière estimé, marge < seuil minimal configuré ex. 25 % ou coefficient < 1,5, ou inférieur au prix plancher de la catégorie).
- **Conception détaillée** :
  - **1. Écran Labo épuré (`/labo` ou vue dédiée rôle `labo` / tablette)** :
    - Affiche uniquement : **À préparer aujourd’hui** et **À préparer demain** (gâteaux sur commande + fournées).
    - Grosses cartes tactiles avec 3 boutons statut : `En préparation` → `Cuisson / Déco` → `Prêt boutique ✓`.
    - Aucun chiffre de CA, bénéfice ou caisse visible.
  - **2. Saisie de prix par l’employé (`role !== 'proprietaire'`)** :
    - Accessible depuis la création rapide de recette/tarte/cake ou fiche produit rapide.
    - Lorsqu’un employé enregistre un prix (`prix_saisi_da`), l’article/recette est immédiatement utilisable pour ne pas ralentir l’atelier, mais marqué `prix_statut = 'en_attente_validation'` et `prix_saisi_par`.
  - **3. Moteur de détection & Table `public.notifications_patron`** :
    - Champs : `id`, `client_id`, `type` (`nouveau_prix_employe` | `prix_trop_bas` | `marge_faible`), `severite` (`info` | `warning` | `critical`), `cible_type` (`recette_libre` | `article` | `cake`), `cible_id`, `nom_produit`, `prix_saisi_da`, `cout_estime_da`, `prix_conseille_da`, `auteur_id`, `auteur_nom`, `message`, `lu_at`, `traite_statut` (`en_attente` | `approuve` | `corrige`), `created_at`.
    - Règles automatiques (testables dans un module pur `src/lib/owner-price-guard.ts`) :
      - Tout prix créé/modifié par un non-propriétaire génère une alerte **`nouveau_prix_employe`**.
      - Si `cout_estime_da > 0` et `prix_saisi_da <= cout_estime_da * 1.2` (ou marge < seuil boutique, ou `prix_saisi_da < prix_plancher_categorie`) → niveau passe à **`critical` (`Prix très bas — Risque de perte !`)** avec comparaison claire : *Prix saisi : 800 DA vs Coût estimé : 720 DA (Conseillé ×2,5 : 1 800 DA)*.
  - **4. Interface Propriétaire (Cloche + Bandeau Dashboard + Action en 1 clic)** :
    - Badge rouge visible en haut du Dashboard Patron (`X prix saisi(s) à vérifier`).
    - Carte d’alerte actionnable :
      - Bouton **`Valider ce prix`**
      - Champ rapide + bouton **`Corriger à [ ___ DA ]`** (met à jour l’article/recette immédiatement)
      - Option (dans *Paramètres*) : **Envoyer aussi l’alerte par WhatsApp au patron** en cas d’alerte `critical` (prix très bas).

---

### B.5 — Envoi WhatsApp « Résumé du soir au Patron » & Ticket/Devis client
- **Action** :
  - Étendre `src/lib/whatsapp.ts` avec :
    - `whatsappDailyClosingUrl(phone, summary)` : génère un résumé propre (Date, Boutique, Total ventes DA, Espèces tiroir, Écart caisse, Reste à encaisser commandes/crédits, Commandes de demain).
    - `whatsappSaleReceiptUrl(phone, ticket)` : permet d’envoyer un reçu ou devis gâteau propre directement sur WhatsApp au client sans papier.
  - Intégrer le bouton **`Envoyer le bilan sur WhatsApp`** directement dans `CashClosingQuickWidget` après validation.

---

### B.7 — Look « Boulangerie Moderne » & Vue Mobile Patron 100 % pouce
- **Action** :
  - Uniformiser les cartes (`pg-card`), badges de statut (`Vert` = Payé/Prêt/Livré, `Orange` = Acompte partiel/En cours, `Rouge` = Rupture/Prix trop bas/Retard) et espacements dans `workspace.css`.
  - Ajouter en caisse un retour visuel net (flash vert/compteur panier animé) à l’ajout d’un produit.
  - Optimiser l’affichage mobile `< 480 px` du Dashboard Patron : les 4 KPIs principaux visibles dès le premier écran sans scroll excessif, gros boutons d’action accessibles au pouce.

---

## VAGUE 3 — DIFFÉRENCIATION 100 % PÂTISSERIE ALGÉRIENNE (Priorité 3)

### B.1 — Catalogue visuel Pâtisserie DZ & Photos depuis la caméra mobile
- **Action** :
  - Créer un jeu d’illustrations / photos par défaut pour les classiques algériens (Baklawa, Makrout, Griwech, Tcharek, Zlabia, Mille-feuille, Éclair, Tarte, Entremets, Layer Cake).
  - Ajouter un composant de prise de photo rapide (`<input type="file" accept="image/*" capture="environment">`) avec **compression WebP/JPEG côté navigateur** (< 150 Ko) puis stockage dans Supabase Storage (ou base64 léger en mode démo) pour illustrer chaque tuile en Caisse et dans Commandes & Gâteaux.

---

### B.3 — Mode « Saison & Fêtes Algériennes » (Ramadan, Aïd, Mariages)
- **Action** :
  - Nouvel outil rapide dans `Recettes & Coûts` / `Commandes` : **« Préparer une fête / Commande de masse »**.
  - Le pâtissier coche ses besoins (ex. *20 kg Baklawa*, *15 kg Makrout*, *400 Tcharek*, *10 plateaux Kalb El Louz*).
  - L’application multiplie les ingrédients de ses recettes et sort immédiatement :
    1. **La liste de courses consolidée pour le marché** (*« 14 kg amandes, 9 kg miel, 6 kg smen, 12 kg semoule… »*).
    2. **Le budget total d’achat estimé (DA)** et la **marge globale prévue**.
    3. Un bouton **`Envoyer la liste sur WhatsApp`** (au fournisseur ou à l’acheteur).

---

## VAGUE 4 — ÉCHELLE & AUTOMATISATION AVANCÉE (Priorité 4)

### B.2 — Interface bilingue Français / Arabe (RTL)
- **Action** :
  - Introduire un dictionnaire i18n léger (`fr` / `ar`) stocké dans un cookie + profil utilisateur, activant `dir="rtl"` sur `<html>` quand l’arabe est choisi.
  - Traduire en priorité absolue :
    1. Le **Mode Écran Cuisine / Labo** (statuts, unités `غ / كغ / ل`, boutons),
    2. La **Caisse rapide** et les **tickets clients**,
    3. Le **Dashboard Patron** et les libellés d’alerte.
  - Prévoir des libellés simples et naturels compréhensibles par les équipes en Algérie.

---

### B.4 — Saisie de facture fournisseur par photo (Pré-remplissage assisté)
- **Action** :
  - Dans `Stocks & Achats`, bouton **`Scanner / Photographier un bon fournisseur`**.
  - Upload photo → extraction structurée des lignes (Désignation, Quantité, Prix unitaire DA) → **écran de validation obligatoire par l’utilisateur** avant enregistrement du lot et mise à jour des prix d’achat dans les recettes liées.
  - Fonctionnement progressif : en cas d’écriture manuscrite illisible, conservation de la photo attachée à l’achat + saisie rapide ligne par ligne à côté de l’image.

---

## Architecture SQL & Sécurité à prévoir (Synthèse technique)

Toutes les nouvelles tables suivront strictement les règles déjà établies dans `patisgest-app/supabase/` :
1. **Isolation multi-tenant (`client_id`)** : chaque table possède `client_id uuid not null references clients(id)` et une politique RLS stricte vérifiant `client_id = auth_client_id()`.
2. **Idempotence & Audit** : les actions sensibles (validation de caisse, validation/correction d’un prix employé, encaissement crédit) journalisent l’auteur et l’horodatage.
3. **Compatibilité Démo / Hors-ligne** : chaque module conserve une abstraction de stockage (`DemoWorkspace` / `localStorage`) pour que le mode essai gratuit et les coupures réseau fonctionnent sans Supabase.

### Nouvelles migrations SQL planifiées (numérotation à caler après réconciliation pilote)
- **Migration A — `recettes_libres.sql`** : table `recettes_libres` + RLS.
- **Migration B — `credits_clients.sql`** : table `credits_clients` + RPC `enregistrer_reglement_credit` + mode `credit` dans `ventes`.
- **Migration C — `notifications_patron_prix.sql`** : table `notifications_patron` + colonnes `prix_statut` / `prix_saisi_par` + fonction de détection prix bas/nouveau produit + RPC `traiter_alerte_prix_patron`.
- **Migration D — `onboarding_pack_dz.sql`** : RPC idempotente `importer_pack_patisserie_dz` (articles + ingrédients de base).

---

## Plan de vérification & tests par vague

À la fin de chaque vague implémentée :
1. **Qualité statique** : `npm run typecheck` (0 erreur) et `npm run lint` (0 avertissement).
2. **Tests unitaires (`node --test`)** :
   - Calculs purs : détection de prix bas/anormal (`owner-price-guard.test.mjs`), soldes crédits (`credits.test.mjs`), agrégation liste de courses fêtes (`fetes-courses.test.mjs`), formatage messages WhatsApp (`free-recipes-dashboard.test.mjs`).
3. **Tests SQL & isolation RLS (PGlite)** : vérifier qu’un employé peut soumettre un prix et déclencher l’alerte mais ne peut pas s’auto-valider en tant que patron, et qu’un établissement A ne voit jamais les recettes/crédits/alertes d’un établissement B.
4. **Tests parcours live & mobile (`360 px`)** : vérification SSR/HTTP sur toutes les routes, test visuel caisse tactile, vérification Mode Simple (zéro `HT` visible) et test coupure réseau hors-ligne.

---

## Suivi d’exécution — VAGUE 4 (branche `arena/923a4433-patsygest`)

| Élément | État | Preuve directe |
|---|---|---|
| **B.2 — FR/AR + RTL** | Complété | `src/lib/i18n.ts`, `src/components/locale-provider.tsx`, `src/app/layout.tsx` ; cookie + profil `utilisateurs.langue` (migration 56) ; traductions prioritaires cuisine, caisse, ticket et dashboard. |
| **B.4 — Facture fournisseur par photo** | Complété | `src/components/invoice-photo-intake.tsx` : capture `image/*`, pré-remplissage, **validation humaine obligatoire**, photo conservée à côté des lignes, entrée en stock démo/Supabase. |
| **Migration A — `recettes_libres`** | Déjà livrée | `supabase/45-recettes-libres.sql`, RLS `client_id`, tests `actions-free-recipes` et chaîne PGlite. |
| **Migration B — `credits_clients`** | Déjà livrée | `supabase/46-credits-clients.sql`, RPC `enregistrer_reglement_credit`, tests `credits`/`actions-credits`. |
| **Migration C — `notifications_patron_prix`** | Déjà livrée | `supabase/48-notifications-patron.sql` + verrouillage `supabase/50-roles-permissions-vues.sql`, RPC `traiter_alerte_prix_patron`. |
| **Migration D — onboarding DZ** | Complétée | `supabase/57-onboarding-pack-dz-rpc.sql` : RPC SQL `importer_pack_patisserie_dz` idempotente, isolée par `client_id`, propriétaire seul, pack de 24 articles ; l’action serveur existante reste le parcours démo/Supabase. |
| **Additif 56 — profil langue** | Ajouté | `supabase/56-profil-langue.sql`, RPC `enregistrer_langue_utilisateur`, manifeste et test PGlite actif. |
| **Additif 57 — RPC pack DZ** | Ajouté | `supabase/57-onboarding-pack-dz-rpc.sql`, `app_schema_version = 57`, chaîne PGlite 01→57 et test DB d’idempotence multi-tenant. |
| **Vérification live & mobile 360 px** | Exécutée localement | `npm run test:roadmap:live` 4/4, `npm run test:roadmap:e2e` 5/5 avec Chromium headless 158 et viewport 360 × 780 ; SSR/HTTP, RTL, ticket arabe, B.4, absence de débordement horizontal, Mode Simple sans `HT`, coupure réseau. |

Chaîne complète exécutée : `typecheck`/`lint` rc0, `npm test` **884 tests /
878 pass / 0 fail / 3 skipped / 3 todo**, `test:roadmap` 10/10,
`test:roadmap:live` 4/4, `test:roadmap:e2e` 5/5, build Next 16.4.6
(`Compiled successfully in 806ms`, 6/6 pages), `npm audit` 0 vulnérabilité et
`git diff --check` rc0. Le détail et les limites figurent dans
`audit/RAPPORT-VAGUE4.md`.

Aucune migration 54/55/56/57 n’est appliquée au pilote ni à la production :
`schema_version 53` observé en lecture seule. Aucun déploiement, aucun
changement d’env/secrets, aucune écriture Supabase/Vercel/Figma. La PR **#26**
reste ouverte vers `main`, sans fusion.
