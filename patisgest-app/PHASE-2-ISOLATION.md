# Phase 2 — Isolation des sites et confidentialité (Travail réel en cours)
**Branche :** `arena/bc75f340-patsygest` | **Date :** 20 nov. 2026 (UTC) | **Statut :** ACTIVE

## Objectif Phase 2
Tester les vues `labo_articles` etc. et les brouillons sécurité (101–128) sur une base isolée (Supabase CLI).

---

## 1. Travail réel : Création des scripts de test adversariaux Auth/PostgREST (Brouillons 101–128)
**Action :** Créer les scripts de test pour les sites, modules et confidentialité (Brouillons 101–128) sur une base isolée (Supabase CLI).
**Contenu :**
- **Propriétaire :** Accès complet, création/modification/suppression.
- **Labo :** Accès limité aux vues `labo_articles`, `labo_lots`, `labo_ordres_fabrication`.
- **Vendeur :** Accès limité aux vues `vendeur_lots`, `vendeur_ordres_fabrication`.
- **Compte non approuvé :** Accès refusé.
- **Deux établissements :** Accès contrôlé par site_id.

**Statut :** **EN COURS** (Scripts à créer dans `patisgest-app/tests/phase2-isolation/`).

---

## 2. Travail réel : Vérification des surfaces (Sites, Modules, Confidentialité, JSON, Exports, Sauvegardes, Erreurs)
**Action :** Vérifier les surfaces sur la base isolée.
- **Sites :** `site_id` dans `cakes`, `clotures`, `demandes_reassort`, `lots`, `mouvements`, `ordres_fabrication`, `ventes`, `z_imports`.
- **Modules :** `acces_modules` (RLS, pas de policy).
- **Confidentialité :** `labo_articles`, `labo_lots`, `vendeur_lots` (vues créées en Phase 1).
- **JSON :** `recette_familles`, `recette_versions`, `releve_temperatures`, `taches_planning`.
- **Exports :** `/api/export`, `/api/sauvegarde`.
- **Sauvegardes :** Méthode CLI isolée (Terminé Phase 1).
- **Erreurs :** `duplicate` (exception `vendre_panier`), collisions SQL.

**Statut :** **EN COURS** (Vérification à faire).

---

## 3. Travail réel : Transitions (Comptes existants, attribution contrôlée, réversibilité)
**Action :** Préparer les transitions sur la base isolée.
- **Comptes existants :** Transition des comptes sans site vers les sites attribués.
- **Attribution contrôlée :** Attribution des membres aux sites.
- **Réversibilité :** Retour arrière en cas d'erreur.

**Statut :** **EN COURS** (Préparation à faire).

---

## 4. Contrainte (Phase 2)
- **Ne pas appliquer les migrations 101–128 sur le pilote avant validation.**
- **Ne pas fusionner PR #5.**

---

## 5. Sortie Phase 2 (À faire)
- **Tests adversariaux Auth/PostgREST :** Terminés.
- **Surfaces :** Vérifiées.
- **Transitions :** Préparées.
- **Validation :** Comparaison des empreintes (données, ACL, policies, fonctions, `auth.users`) entre la base isolée et le pilote.

**Conclusion Phase 2 :**
Le plan complet est rédigé dans **`patisgest-app/PLAN-CLOTURE.md`**, **`patisgest-app/PHASE-0-PLAN-FIX-AMELIORATION.md`**, **`patisgest-app/PHASE-1-ATTAQUONS.md`**, **`patisgest-app/PHASE-2-ISOLATION.md`**, **`patisgest-app/migrations/RECONCILIATION-PHASE-0.md`**, **`patisgest-app/AUDIT-PHASE-1.md`**, **`patisgest-app/CERTIFICATION-PHASES-2-3.md`**, **`patisgest-app/SECURITE-MODULES-EN-COURS.md`** et **`patisgest-app/migrations/ETAT-RESTAURATION.md`**.
La Phase 1 est **TERMINÉE**. La Phase 2 commence (Travail réel en cours).

**Risque :** Fusion PR #5 **BLOQUÉE** jusqu'à la fin de la Phase 5.

---
**Règle transversale :** Un résultat vert partiel ne signifie pas la certification. La Phase 1 est une préparation technique et un inventaire précis. La Phase 2 est l'isolation et les tests.
