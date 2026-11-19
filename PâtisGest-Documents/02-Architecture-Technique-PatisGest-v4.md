# PâtisGest — Architecture technique v4.0

**Cible : Algérie · Solo-développeur + IA · Hybride cloud + hors-ligne**
**Statut :** VALIDÉ pour démarrage · **Date :** novembre 2026

## 1. Vision & principes

1. **Simplicité d'abord** : un seul langage (TypeScript), un seul déploiement (monolithe
   modulaire), zéro serveur à administrer (services managés).
2. **Hors-ligne par conception** : la boutique tourne sans internet ; le cloud synchronise.
3. **Alerte, jamais blocage** : invariant d'architecture — aucune erreur réseau/stock
   ne perd une vente ou une production (file d'attente + idempotence).
4. **Données inviolables** : mouvements immuables, snapshots figés, journal d'audit.
5. **Coût infra ~0 DA** au démarrage, puis proportionnel aux clients (pas de gouffre).

## 2. Vue d'ensemble

```
TABLETTE / PC BOUTIQUE (PWA)              CLOUD                       PILOTAGE
┌──────────────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ PWA Next.js (français)   │      │ Vercel : App     │      │ Supabase :       │
│ • 16 écrans              │◄────►│ Next.js 16       │◄────►│ Postgres + Auth  │
│ • Base locale (file      │ HTTPS│ (monolithe)      │      │ + Stockage       │
│   d'attente offline)     │      │                  │      │ (sauvegardes)    │
│ • Impression ticket/     │      └──────────────────┘      └──────────────────┘
│   étiquette (USB/réseau) │               ▲
└──────────────────────────┘               │ V4 : Tauri desktop (même PWA emballée)
                                           │ V4 : SATIM CIB/EDAHABIA (abonnements)
```

**Flux nominal :** la PWA écrit en local puis synchronise (file de commandes) ;
le serveur valide, applique les règles (FEFO, coûts, TVA) et renvoie l'état.
**Flux dégradé :** sans réseau, tout le quotidien reste utilisable ; synchro au retour.

## 3. Stack détaillée (et pourquoi)

| Couche | Choix | Pourquoi (solo + DZ) |
|---|---|---|
| Langage unique | **TypeScript** | 1 seul langage à maîtriser, erreurs détectées tôt |
| App + API | **Next.js 16 (monolithe)** | Déjà en place ; pages + API dans un seul projet ; PWA native |
| Base cloud | **Supabase (Postgres managé)** | 0 administration, sauvegardes incluses, Auth + temps réel inclus, offre gratuite puis ~1 500 DA/mois |
| Accès données | **Drizzle ORM** | Déjà en place, léger, typé, migrations simples |
| Hébergement app | **Vercel** | Déploiement en 1 clic depuis Git, HTTPS auto, gratuit puis ~3 000 DA/mois |
| Hors-ligne | **PWA + base locale chiffrée + file outbox** | Quotidien sans internet (exigence H2 du CDC) |
| Impression | Navigateur + imprimantes ticket/étiquette réseau | Aucun pilote spécifique en V1 |
| Desktop (V4) | **Tauri** (pas Electron) | 10× plus léger, même code PWA emballé |
| Paiement (V4) | **SATIM** (CIB / EDAHABIA) | Standard algérien pour l'abonnement en ligne |
| Code source | **GitHub privé** | Sauvegarde + historique + déploiement auto |

**Refusés (et pourquoi) :** microservices (ingérables en solo), 2ᵉ langage (Python/Go :
complexité inutile), Kubernetes/serveur VPS (administration), MongoDB (les règles
métier exigent du relationnel strict), Electron en V1 (lourd).

## 4. Modèle de données (référence)

> Descriptions métier — le SQL de création sera généré depuis Drizzle au démarrage.
> Règle d'or : **`client_id` partout + isolation stricte** (un client ne voit que ses données).

### 4.1 Tables principales (par module)

| Table | Contenu clé | Liens |
|---|---|---|
| clients | Pâtisserie (NIF, NIS, RC, adresse, offre) | parent de tout |
| utilisateurs | Compte, rôle (propriétaire/labo/vendeur), site | → clients |
| sites | Labo, boutique(s) | → clients |
| fournisseurs | Nom, contact, délai, score | → clients |
| articles | Code, nom, **niveau** (matière/semi-fini/produit/emballage/consommable), unité, seuil, PV HT, TVA | → clients |
| lots | N° lot, article, qté initiale/restante, PU, **DLC/DDM**, site, fournisseur, statut, congelé, bloqué | → articles, sites |
| mouvements | Article, lot, type (entrée/sortie/écart/ajustement), qté signée, site, réf, **motif**, PU, auteur, date | → articles, lots |
| historique_prix | Article, date, PU, fournisseur | → articles |
| bons_commande (+lignes) | Fournisseur, date, statut, lignes (article, qté, PU, reçu) | → fournisseurs |
| recette_familles | Nom, produit fini cible | → articles |
| recette_versions | Famille, n°, rendement, ingrédients (JSON validé), parages, cuisson, MO, énergie, emballage, FG, active, **figée si utilisée** | → familles |
| ordres_fabrication | N°, recette+version, quantités prévue/réalisée, site, dates, statut, **snapshot**, besoins, consommations, manquants, lots produits, coûts prévu/réel | → versions, sites |
| ventes | N°, ticket, date, site, source (caisse/Z), lignes (article, qté, PU HT, TVA, lots), totaux HT/TTC, manquants | → sites |
| imports_z | Date, site, caisse, lignes mappées, total, doublon oui/non | → sites, ventes |
| retours_avoirs | Date, client, motif, lignes, remise en stock oui/non | → sites |
| clotures | Date, site, lignes 6 flux par produit | → sites |
| cakes_devis | Client, événement, parts, options (coût+temps), prix, acompte, statut, CGV, rétroplanning | → clients |
| temperatures | Date, équipement, valeur, seuil, conforme, agent | → sites |
| nettoyages | Date, zone, fait, agent | → sites |
| non_conformites | Date, type, description, lot, action, statut | → lots |
| allergenes_articles | Article → codes allergènes + traces | → articles |
| transferts | Date, origine, destination, motif, lignes | → sites |
| taches_planning | Date, tâche, OF, durée, responsable, fait | → sites |
| file_synchro | Commandes hors-ligne (UUID client, type, charge, statut, tentatives) | → clients |
| journal_audit | Qui, quoi, quand, avant/après (ventes, stocks, clôtures) | → clients |

### 4.2 Règles d'intégrité (non négociables)

- RI-01 : `client_id` NOT NULL sur toutes les tables + **filtrage systématique** (test auto).
- RI-02 : mouvements et snapshots **jamais modifiés ni supprimés** (correction = contre-écriture).
- RI-03 : recette_version figée dès qu'un OF la référence (verrou applicatif + test).
- RI-04 : unicité (client, code article), (client, n° lot), (client, n° ticket), (client, date, site, total Z).
- RI-05 : montants en centimes (entiers) — **jamais de flottants** pour l'argent.
- RI-06 : conservation 10 ans (archivage annuel, purge interdite avant).

### 4.3 Volumes cibles (dimensionnement)

1 boutique ≈ 30 articles, 500 lots/an, 15 000 tickets/an, 5 000 mouvements/an → **< 50 Mo/an**.
100 clients ≈ 5 Go : largement dans l'offre de base Supabase. Aucun partitionnement avant 3 ans.
## 5. API (contrat applicatif)

API REST interne consommée uniquement par la PWA (pas d'API publique en V1).
Principes : pagination partout, horodatage serveur faisant foi, erreurs en français.

| Domaine | Opérations |
|---|---|
| Référentiel | CRUD articles, fournisseurs, sites, équipements, zones |
| Stocks | créer lot, corriger (motif), inventaire, consulter FEFO |
| Achats | CRUD bons de commande, réceptionner (→ lots) |
| Recettes | CRUD familles/versions, dupliquer, activer, fiche coût |
| Production | créer OF, lancer (→ consommations), valider (partiel/total) |
| Ventes | encaisser (→ ticket + déductions), importer Z, avoir |
| Clôture | saisir/lire clôtures, stats 30 jours |
| Cake | CRUD devis, encaisser acompte, avancer statut |
| Qualité | saisir T°/nettoyage/NC, registres |
| Étiquettes | allergènes matières, calcul produits, rendu étiquette |
| Traçabilité | amont/aval d'un lot, simulation de rappel |
| Synchro | pousser la file (batch), tirer les mises à jour (delta) |
| Admin | paramètres, sauvegarde, restauration, exports, journal |

## 6. Hors-ligne & synchronisation (cœur de l'hybride)

### 6.1 Principe : file de commandes idempotentes (outbox)

1. Chaque action hors-ligne crée une **commande** locale avec **UUID client unique**.
2. Au retour réseau, la file est poussée **dans l'ordre** ; le serveur ignore les UUID déjà vus
   (rejouer 2 fois = appliqué 1 fois → **zéro doublon**, même si l'utilisateur réessaie).
3. Le serveur renvoie les deltas (nouveaux lots, prix, recettes) depuis le dernier point connu.

### 6.2 Périmètre (rappel décision D5)

- **Autorisé hors-ligne :** caisse, OF (lancer/valider), T°, nettoyage, clôture, inventaire,
  consultation (stocks, recettes, planning du jour mis en cache le matin).
- **Interdit hors-ligne :** exports comptables, clôture de NC, suppression, restauration,
  changement de recette active (bouton grisé + explication).

### 6.3 Conflits : addition, signalés, jamais bloquants

Deux vendeurs déduisent le même lot ? Les déductions **s'additionnent** (le stock peut
passer transitoirement négatif), un **avertissement de conflit** est créé avec les 2 pièces,
le propriétaire arbitre (régularisation tracée). Aucune vente n'est perdue ni refusée.

### 6.4 Garde-fous réseau

Bouton « état de synchro » permanent (à jour / X en attente / erreur) ; file limitée à
7 jours (alerte au-delà) ; reprise automatique exponentielle (1 min → 1 h).

## 7. Sécurité

| Couche | Mesures V1 |
|---|---|
| Comptes | E-mail + mot de passe fort (12 car. min), verrouillage après 5 essais, sessions 12 h |
| Rôles | Propriétaire / labo / vendeur (matrice MOD-15) ; vendeur = caisse + lecture |
| Isolement | `client_id` injecté côté serveur depuis la session (jamais depuis le client) + tests auto |
| Transport | HTTPS partout (TLS managé Vercel/Supabase) |
| Secrets | Variables d'environnement, jamais dans le code ni dans Git |
| Base locale | Chiffrée (clé par appareil), effaçable à distance (V2) |
| Sauvegarde | Quotidienne auto cloud (30 j) + export client ; restauration testée mensuellement |
| Journal | Audit 10 ans (ventes, stocks, clôtures, connexions) |
| Conformité | Minimisation (loi 18-07), export/suppression sur demande, registre des traitements (V2) |

**Avant la V1 commerciale :** revue de sécurité (check-list 25 points fournie en Roadmap),
test d'intrusion léger externe si budget, mentions légales + CGU rédigées.

## 8. Hébergement, domaines & coûts (DZD)

| Poste | Choix | Coût |
|---|---|---|
| App + API | Vercel **Pro** (obligatoire dès qu'un client paie : Hobby est réservé au non-commercial) | 20 $/mois ≈ 4 900 DA |
| Base + Auth | Supabase **Pro** (le Free met le projet en pause après 7 jours sans requête et n'a aucune sauvegarde automatique) | 25 $/mois ≈ 6 100 DA |
| Domaine | `patisgest.dz` (via NIC Algérie, RC requis) + `patisgest.com` en repli | ~3 000–5 000 DA/an |
| E-mail transactionnel | Resend / Brevo (offre gratuite) — **SMTP custom obligatoire** : le SMTP intégré de Supabase plafonne à 2 e-mails/h, même en Pro | 0 DA |
| Sauvegardes | Incluses (quotidiennes, 7 jours) + export client `GET /api/sauvegarde` | 0 DA (le poste « stockage objet 50 Go » devient inutile) |
| **Total pilote (1 à 5 pilotes)** | Free + Hobby | **0 DA** |
| **Total commercial** | | **≈ 11 000 DA/mois** |

À 50 clients Solo (2 900 DA) : MRR 145 000 DA, charge d'infra **7,6 %**.
Quotas Pro inclus et suffisants : 8 GB de base (≈ 2 ans à 100 boutiques pleine
charge), 100 GB de fichiers, 250 GB d'egress, 100 000 comptes.
Analyse complète et chiffrage : [`NOTE-HEBERGEMENT.md`](../NOTE-HEBERGEMENT.md).

## 9. Environnements & méthode solo

- **3 environnements :** local (PC dev) → préproduction (recette) → production.
  Déploiement = `git push` → build + tests auto → mise en ligne (Vercel).
- **Branches :** `main` (production) + branches courtes par fonctionnalité ; pas de commit
  direct un vendredi soir avant une démo pilote. ☺
- **Qualité :** tests auto sur RC-01..RC-10 + FEFO + synchro (bloquants) ;
  recette manuelle sur tablette réelle avant chaque mise en prod.

## 10. Observabilité & support (version solo)

Erreurs centralisées (Sentry gratuit), journaux Vercel/Supabase, page de statut simple,
sauvegarde de la file d'attente visible côté boutique. Support pilotes : WhatsApp dédié
+ intervention sous 24 h ouvrées (contrat pilote, cf. Roadmap).

## 11. Évolutions prévues (sans refonte)

| Version | Ajout | Impact architecture |
|---|---|---|
| V2 | Import Z auto (fichiers caisse), code-barres | +1 parseur, +1 champ code-barres |
| V3 | Multi-sites avancé, hors-ligne complet | File étendue, conflits multi-sites (même moteur) |
| V4 | Desktop **Tauri**, paiement **SATIM**, arabe, nutritionnel | Même PWA emballée ; +1 connecteur paiement |
| V5+ | API publique partenaires, 2ᵉ pays | Versionnage API, table `pays_regles` |

## 12. Décisions d'architecture (registre)

| # | Décision | Options rejetées | Raison |
|---|---|---|---|
| A1 | Monolithe Next.js | Microservices | Solo : 1 déploiement, 1 langage, 0 orchestration |
| A2 | Supabase Postgres | VPS autohébergé | 0 administration, sauvegardes + auth incluses |
| A3 | Outbox + UUID (synchro) | Synchro temps réel pur | Idempotence = zéro doublon, prouvé par test |
| A4 | Conflits additifs | Verrouillage / dernier-gagnant | Jamais de vente perdue (invariant produit) |
| A5 | Montants en centimes | Flottants | Zéro erreur d'arrondi monétaire |
| A6 | PWA avant desktop natif | Electron V1 | 1 code, tablette + PC, Tauri en V4 si besoin |
| A7 | Pas d'Event Sourcing | ES + CQRS | Sur-ingénierie (défaut des réponses n°4/n°5 auditées) |

*— Fin de l'architecture technique v4.0 —*
