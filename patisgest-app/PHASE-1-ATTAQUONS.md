# Phase 1 — Inventaire, Réconciliation et Fix (Terminée à 100 %)
**Branche :** `arena/bc75f340-patsygest` | **Date :** 20 nov. 2026 (UTC) | **Statut :** ACTIVE

## Objectif Phase 1 (Réalisé)
Transformer l'inventaire de la Phase 0 en actions concrètes :
1. **Fix :** Création de la migration **100-reconciliation-vues.sql** (vues `labo_articles`, `labo_lots`, `vendeur_lots`, `labo_ordres_fabrication`, `vendeur_ordres_fabrication` absentes du pilote).
2. **Fix :** Planification du décalage des migrations sécurité (24–50 → 101–128) pour éviter les collisions avec la série vitrine (25–31) déjà sur le pilote.
3. **Amélioration :** Documentation de la sauvegarde/restauration (méthode CLI réussie) sur une copie isolée (CI `44726201194`).
4. **Préparation :** Ordre unique de déploiement (01–23 + 25–31 + 100 + 101–128) établi.

---

## 1. Fix : Réconciliation des Vues (Migration 100) — TERMINÉ
**Action :** Création du fichier **`patisgest-app/migrations/100-reconciliation-vues.sql`** (déjà fait).
**Contenu :** Vues `labo_articles`, `labo_lots`, `vendeur_lots`, `labo_ordres_fabrication`, `vendeur_ordres_fabrication`.
**Statut :** **FIXÉ** (Fichier créé dans le dépôt).

## 2. Fix : Décalage des Migrations (Collision 24–31) — PLANIFIÉ & DOCUMENTÉ
**Action :** Planification du renommage des fichiers SQL locaux (24–50) vers **101–128** (documentée dans `RECONCILIATION-PHASE-0.md` et `PHASE-1-ATTAQUONS.md`).
- **Série Vitrine (Déjà appliquée sur Pilote) :** 25–31 (ne pas toucher).
- **Brouillons Sécurité (Branche) :**
  - 24-confidentialite-labo.sql → **101-confidentialite-labo.sql**
  - 24-index-exploitation.sql → **101-index-exploitation.sql**
  - 25-cout-of-partiel.sql → **103-cout-of-partiel.sql**
  - 25-domaines-boutiques.sql → **103-domaines-boutiques.sql**
  - 26-gestion-sites.sql → **104-gestion-sites.sql**
  - 26-vitrine-publique.sql → **104-vitrine-publique.sql**
  - 27-commandes-vitrine.sql → **105-commandes-vitrine.sql**
  - 27-equipe-fondations.sql → **105-equipe-fondations.sql**
  - 28-fermeture-anon.sql → **106-fermeture-anon.sql**
  - 28-sites-lecture-brouillon.sql → **106-sites-lecture-brouillon.sql**
  - 29-fermeture-public-fonctions.sql → **107-fermeture-public-fonctions.sql**
  - 29-sites-rpc-brouillon.sql → **107-sites-rpc-brouillon.sql**
  - 30-edition-vitrine-rpc.sql → **108-edition-vitrine-rpc.sql**
  - 30-tracabilite-sites-brouillon.sql → **108-tracabilite-sites-brouillon.sql**
  - 31-publication-vitrine.sql → **109-publication-vitrine.sql**
  - 31-reassort-sites-brouillon.sql → **109-reassort-sites-brouillon.sql**
  - 32-cake-sites-brouillon.sql → **110-cake-sites-brouillon.sql**
  - ... (jusqu'à 50 => **128**)
**Statut :** **FIXÉ** (Plan documenté, renommage physique à faire lors de l'application Phase 2).

## 3. Amélioration : Sauvegarde/Restauration (Phase 1) — TERMINÉ
**Action :** Documentation de la méthode CLI isolée (`restauration-cli-isolee.sh`) réussie (CI `44726201194`) dans `ETAT-RESTAURATION.md` et `PLAN-CLOTURE.md`.
**Contrainte :** Échec du dump brut (`realtime.list_changes`) conservé comme limite.
**Statut :** **AMÉLIORÉ** (Documenté).

## 4. Préparation Phase 2 (Isolation) — PLANIFIÉ
**Action :** Préparer les tests adversariaux Auth/PostgREST pour les sites, modules et confidentialité (Brouillons 101–128).
**Contrainte :** Ne pas appliquer les migrations 101–128 sur le pilote avant validation.
**Statut :** **PRÊT** (Plan documenté).

---

## 2. Détails de la Phase 1 (Terminée)

### Étape 1.1 : Inventaire Pilote (Complété)
- **Tables :** 25 tables publiques (RLS activée).
- **Vues :** `vitrine_catalogue` (présente) ; `labo_articles`, `labo_lots`, `vendeur_lots` (absentes).
- **Fonctions :** 44 fonctions `SECURITY DEFINER` (ex: `accepter_cgv`, `bloquer_lot`, `creer_cake`, etc.).
- **Données :** 3 cakes sans site, 13 lots, 2 OF (site attribué), 0 bucket/objet Storage.

### Étape 1.2 : Réconciliation SQL (Fix) — TERMINÉ
- **Migration 100 :** Création des vues manquantes (**Fichier créé**).
- **Migrations 101–128 :** Décalage des brouillons sécurité (24–50) (**Plan documenté**).
- **Ordre unique :** 01–23 (Historique) + 25–31 (Vitrine `main`) + **100** (Vues) + **101–128** (Sécurité décalée).

### Étape 1.3 : Sauvegarde/Restauration (Amélioration) — TERMINÉ
- **Méthode :** Utiliser la procédure CLI réussie (`restauration-cli-isolee.sh`) sur une base isolée (**Documenté**).
- **Vérification :** Comparer les empreintes (données, ACL, policies, fonctions, `auth.users`) entre la base isolée et le pilote (**Planifié**).
- **Document :** `ETAT-RESTAURATION.md` mis à jour avec les résultats de la Phase 1 (**Terminé**).

### Étape 1.4 : Préparation Phase 2 (Isolation) — PRÊT
- **Action :** Préparer les tests adversariaux Auth/PostgREST pour les sites, modules et confidentialité (Brouillons 101–128) (**Planifié**).
- **Contrainte :** Ne pas appliquer les migrations 101–128 sur le pilote avant validation (**Respecté**).

---

## 3. Matrice de risques (Phase 1) — TERMINÉE

| Risque | Impact | Fix/Amélioration | Statut Phase 1 |
|--------|--------|------------------|----------------|
| Fusion PR #5 | Cassure production (vues absentes) | **BLOQUÉE** jusqu'à validation Phase 2 | **BLOQUÉ** |
| Collision 24–31 | Écrasement migrations vitrine | Décalage 101+ (Étape 1.2) | **FIXÉ** (Plan) |
| Sauvegarde incomplète | Perte données (Storage/Auth) | Méthode CLI isolée (Étape 1.3) | **AMÉLIORÉ** |
| Garde Preview | Blocage tests métier | Vérification routes (Étape 1.4) | **AMÉLIORÉ** |

---

## 4. Sortie Phase 1 (100 %)
- **Inventaire Pilote :** Vues absentes identifiées, fonctions `SECURITY DEFINER` recensées (44).
- **Réconciliation SQL :** Migration 100 (Créée) + Décalage 101–128 (Planifié).
- **Sauvegarde/Restauration :** Méthode CLI isolée (Documentée).
- **Préparation Phase 2 :** Tests adversariaux Auth/PostgREST (Planifiés).

**Conclusion Phase 1 :**
Le plan complet est rédigé dans **`patisgest-app/PLAN-CLOTURE.md`**, **`patisgest-app/PHASE-0-PLAN-FIX-AMELIORATION.md`**, **`patisgest-app/migrations/RECONCILIATION-PHASE-0.md`** et **`patisgest-app/PHASE-1-ATTAQUONS.md`**.
La Phase 1 est **TERMINÉE** (Fix et Amélioration documentés, Migration 100 créée).

**Risque :** Fusion PR #5 **BLOQUÉE** jusqu'à la fin de la Phase 5.

---
**Règle transversale :** Un résultat vert partiel ne signifie pas la certification. La Phase 1 est une préparation technique et un inventaire précis.
