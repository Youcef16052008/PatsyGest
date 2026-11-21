# 🧁 PâtisGest — Solution de Gestion de Pâtisserie

Solution de gestion tout-en-un pour ateliers et laboratoires de pâtisserie.

> **Attention : pas de mise en production commerciale générale en l'état.**
> `PâtisGest-Final.html` et l'application Electron qui l'encapsule sont des
> **démonstrations avec données fictives uniquement**, pas des registres de vente,
> de stock ou de production. Ne pas leur confier de données réelles. La
> restauration et les migrations du pilote doivent être vérifiées avant toute
> intervention ; voir [l'état des phases 0 et 1](patisgest-app/ETAT-PHASES-0-1.md)
> et le [rapport consolidé](RAPPORT-CONSOLIDE-ET-PLAN.md).

## 📁 Structure du projet

| Dossier / fichier | Description |
|---|---|
| `PâtisGest-Final.html` | **Prototype v1.0** : logiciel autonome en 1 fichier (16 écrans interactifs). Fonctionne directement dans le navigateur sans connexion. |
| `PâtisGest-GUIDE.md` | Guide de référence : analyse technique, architecture et correspondance Next.js. |
| `PâtisGest-Documents/` | **Documentation projet v4.0** (Word + Markdown) : Cahier des charges, Architecture, Roadmap, Plan pilote, Kit terrain. |
| `patisgest-app/` | **Application Next.js** : interface web, authentification Supabase, base de données PostgreSQL & Drizzle ORM. |
| `patisgest-desktop/` | **Application Bureau Electron** : encapsule le prototype en application Windows de bureau. |
| `LISEZ-MOI.md` | Guide de démarrage initial. |
| [`HANDOFF-EN.md`](HANDOFF-EN.md) | **Handoff in English** — what the storefront (vitrine) work does, why, what it deliberately does not do, and the traps that cost time. Start here if you are new to the project. |
| `HANDOFF.md` | Passation en français (livraison antérieure, PR #4). |

## 🚀 Démarrage rapide

### 1. Prototype interactif (Sans installation)
Double-cliquez sur `PâtisGest-Final.html` pour tester l'application directement dans votre navigateur (tablette ou desktop).

### 2. Application Web (`patisgest-app`)
```bash
cd patisgest-app
npm install
cp .env.example .env.local
npm run dev
```
Consultez le fichier `patisgest-app/README.md` pour la configuration complète de la base de données Supabase.

### 3. Application Bureau (`patisgest-desktop`)
```bash
cd patisgest-desktop
npm install
npm start
```

## 📚 Documentation
Retrouvez les spécifications complètes dans le dossier `PâtisGest-Documents/` :
- `01-Cahier-des-Charges-PatisGest-v4.md`
- `02-Architecture-Technique-PatisGest-v4.md`
- `03-Roadmap-Plan-Projet-PatisGest-v4.md`
- `04-Plan-Attaque-1-Pilote.md`
- `05-Kit-Phase0-Terrain.md`
