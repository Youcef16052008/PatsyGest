# 🧁 PâtisGest — Solution de Gestion de Pâtisserie

Solution de gestion tout-en-un pour ateliers et laboratoires de pâtisserie.

> **Attention : pas de mise en production commerciale générale en l'état.**
> Les jeux de démonstration et les parcours hors ligne travaillent sur des
> **données fictives uniquement** : ce ne sont pas des registres de vente, de
> stock ou de production. Ne pas leur confier de données réelles.
>
> Avant toute intervention sur le pilote :
> - lire l'état réel du projet dans [`PLAN-AMELIORATION-PATISGEST.md`](PLAN-AMELIORATION-PATISGEST.md) ;
> - vérifier la rejouabilité des migrations : `cd patisgest-app && npm test`
>   (`chaine-rejouable`, `migrations-repetition`) ; la restauration n'est
>   **pas** certifiée par le dépôt ;
> - suivre [`revue/CHECKLIST-DEPLOIEMENT.md`](revue/CHECKLIST-DEPLOIEMENT.md)
>   pour l'ordre exact des migrations et la vérification après déploiement.

## 📁 Structure du projet

| Dossier / fichier | Description |
|---|---|
| [`patisgest-app/`](patisgest-app/) | **Application Next.js 16** — c'est le produit. Interface web, Server Actions, Supabase (PostgreSQL + Auth + Storage). |
| [`patisgest-app/README.md`](patisgest-app/README.md) | Configuration de l'application, variables d'environnement, commandes. |
| [`patisgest-app/AGENTS.md`](patisgest-app/AGENTS.md) | Règles de travail sur le dépôt (spécificités Next 16, conventions, pièges). |
| [`PâtisGest-Documents/`](PâtisGest-Documents/) | **Documentation projet v4** (.md et .docx) : cahier des charges, architecture, roadmap, plan pilote, kit terrain. |
| [`PLAN-AMELIORATION-PATISGEST.md`](PLAN-AMELIORATION-PATISGEST.md) | Plan d'amélioration et état d'avancement. |
| [`GUIDE-PILOTE.md`](GUIDE-PILOTE.md) | Mise en service chez le pilote. |
| [`NOTE-HEBERGEMENT.md`](NOTE-HEBERGEMENT.md) · [`NOTE-COUT-MINIMAL.md`](NOTE-COUT-MINIMAL.md) | Hébergement et coûts. |
| [`PROTOCOLE-QUALIFICATION-MATERIELLE.md`](PROTOCOLE-QUALIFICATION-MATERIELLE.md) | Recette matérielle (tablette, imprimante, scan). |
| [`revue/CHECKLIST-DEPLOIEMENT.md`](revue/CHECKLIST-DEPLOIEMENT.md) | **Checklist de déploiement** : pré-déploiement, migration manuelle, vérifications, retour arrière. |

## 🚀 Démarrage rapide

### Application web
```bash
cd patisgest-app
npm ci
cp .env.example .env.local   # puis renseigner les valeurs Supabase
npm run dev
```
Node **≥ 22.15** est requis (la suite de tests utilise
`--experimental-test-module-mocks`). Voir
[`patisgest-app/README.md`](patisgest-app/README.md) pour la configuration
Supabase complète.

### Vérifier avant de livrer
```bash
cd patisgest-app
npm run typecheck && npm run lint && npm test && npm run build
```

## 📚 Documentation
Spécifications complètes dans `PâtisGest-Documents/` :

- [`01-Cahier-des-Charges-PatisGest-v4.md`](PâtisGest-Documents/01-Cahier-des-Charges-PatisGest-v4.md)
- [`02-Architecture-Technique-PatisGest-v4.md`](PâtisGest-Documents/02-Architecture-Technique-PatisGest-v4.md)
- [`03-Roadmap-Plan-Projet-PatisGest-v4.md`](PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.md)
- [`04-Plan-Attaque-1-Pilote.md`](PâtisGest-Documents/04-Plan-Attaque-1-Pilote.md)
- [`05-Kit-Phase0-Terrain.md`](PâtisGest-Documents/05-Kit-Phase0-Terrain.md)
