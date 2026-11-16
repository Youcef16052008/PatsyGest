# PâtisGest — Dossier final : analyse, site et passage en logiciel

## 1. Analyse de vos fichiers envoyés

| Fichier | Rôle | Verdict |
|---|---|---|
| `audit.html` | **Le cœur du projet** : audit comparatif complet des 5 cahiers des charges PâtisGest (classement, 27 modules notés, bugs d'algorithme, exactitude réglementaire, version fusionnée recommandée + roadmap) | ✅ C'est la spécification de référence. Tout le logiciel final en découle |
| `page.tsx` | Page d'accueil Next.js qui redirige vers `/audit.html` | ✅ Simple passerelle, conservée dans l'esprit |
| `layout.tsx`, `globals.css` | Structure + styles Tailwind | ✅ Base saine |
| `package.json`, `tsconfig.json`, `next.config.ts`, `eslint`, `postcss` | Stack Next.js 16 + React 19 + Tailwind 4 + Drizzle + PostgreSQL | ✅ Stack moderne, idéale pour la **V2 multi-utilisateur** |
| `index.ts` (db), `drizzle.config.json`, `schema.ts` | Connexion PostgreSQL via Drizzle ; schéma **vide** (`export {}`) | ⚠️ À remplir en V2 (tables ci-dessous) |
| `route.ts` | Route test `SELECT 1` (vérifie que la BDD répond) | ✅ Utile pour le diagnostic |

**Conclusion** : vous aviez une fondation Next.js/PostgreSQL vide + un excellent audit métier.
Il manquait le logiciel lui-même → c'est le fichier **`PâtisGest-Final.html`** créé pour vous.

## 2. Le fichier final : `PâtisGest-Final.html`

Un **logiciel complet dans un seul fichier** (135 Ko, aucune dépendance, fonctionne hors-ligne).
Il implémente la **version fusionnée recommandée** de votre audit, avec les **formules corrigées**
(les bugs des 5 réponses ont été éliminés) :

- **Règle d'or** : alerte, jamais blocage (un manquant n'empêche ni de vendre ni de produire)
- **Articles à 3 niveaux** : matière → semi-fini → produit fini
- **Lots obligatoires + FEFO multi-lots** (DLC la plus proche d'abord)
- **Coût de revient VRAI** : matière au lot + emballage + MO chargée + énergie + frais généraux, **sans TVA**
- **Parage ↑ consommation / cuisson ↓ rendement**, marge sur HT, clôture en **6 flux**
- **Recettes versionnées** (famille + version figée), **snapshot figé** dans chaque OF
- **14 allergènes + INCO** (ordre décroissant), **HACCP-lite**, **traçabilité amont/aval + rappel lot**
- **Cake Design Studio** (configurateur, acompte bloquant, rétroplanning, CGV)
- **Import ticket Z** (doublons détectés), retours/avoirs, multi-sites + transferts
- **Garde-fous** : alertes ×10/÷10 et prix > 2× la référence
- **Sauvegarde JSON + exports CSV** (mouvements, ventes, comptable)

### Les 16 écrans (couvrent les 27 modules de l'audit)

Tableau de bord · Articles & Stocks · Achats & Fournisseurs · Recettes & Coûts ·
Production (OF) · Ventes & Caisse · Clôture & Pertes · Cake Design Studio ·
HACCP & Qualité · Étiquettes & Allergènes · Traçabilité · Planning ·
Simulation prix · Sites & Transferts · Données & Exports · Guide

### L'utiliser comme SITE (étape 1)

1. **En local** : double-cliquez sur `PâtisGest-Final.html` → ça s'ouvre dans le navigateur.
2. **En ligne (gratuit)** : glissez le fichier sur Netlify Drop / Vercel / GitHub Pages →
   vous obtenez une adresse `https://...` utilisable sur PC, tablette et téléphone.
3. **Comme appli (PWA)** : sur la tablette du labo, ouvrez l'adresse puis
   « Ajouter à l'écran d'accueil » → icône PâtisGest, fonctionne hors-ligne.
4. Données de démonstration incluses (pâtisserie à Oran, 33 articles, 13 recettes aux
   marges saines 17-29%). Pour repartir de zéro : écran Données & Exports → Tout effacer.
5. **Sauvegardez** chaque semaine : bouton 💾 en haut → fichier JSON à garder sur clé USB.

## 3. Le transformer en LOGICIEL (étape 2)

### Option A — Logiciel Windows (recommandé, dossier `patisgest-desktop/` fourni)

```bash
# 1. Installez Node.js LTS depuis https://nodejs.org
# 2. Puis dans un terminal :
cd patisgest-desktop
npm install
npm start        # → PâtisGest s'ouvre comme un vrai logiciel
npm run dist     # → fabrique PâtisGest-Setup.exe à installer partout
```

### Option B — Garder le fichier unique comme « logiciel portable »

Le fichier HTML **est déjà** un logiciel autonome : copiez-le sur clé USB,
il fonctionne sur tout PC sans installation ni internet.

### Option C — V2 multi-utilisateur avec votre stack (Next.js + PostgreSQL)

Votre stack est prête. Tables à créer dans `src/db/schema.ts`
(correspondance exacte avec le fichier final) :

```
sites, fournisseurs, articles(niveau, unite, seuil, pv_ht, tva),
lots(article, numero, qte_init, qte_rest, pu, dlc, site, fournisseur),
mouvements(article, lot, type, qte, site, ref, motif, pu),
recette_familles(produit), recette_versions(snapshot JSONB),
ordres_fabrication(snapshot JSONB, besoins JSONB, consommations JSONB),
ventes(lignes JSONB), imports_z, retours, clotures(lignes JSONB),
cakes, releve_temperatures, nettoyages, non_conformites,
transferts, taches_planning, allergenes(article, codes[])
```

Recopiez ensuite les fonctions du fichier final (`coutVersion`, `consumeFEFO`,
`margeVersion`, `clotureStats`) en TypeScript : ce sont les mêmes règles,
déjà testées (marges vérifiées : 17-29% sur le jeu d'essai).

## 4. Fichiers livrés

- **`PâtisGest-Final.html`** — le logiciel (site + appli, 100% autonome) ← **fichier principal**
- **`PâtisGest-GUIDE.md`** — ce guide
- **`patisgest-desktop/`** — enveloppe Electron (`npm start` / `npm run dist`)

Bon travail avec PâtisGest ! 🧁
