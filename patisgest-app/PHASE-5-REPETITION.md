# Phase 5 — Répétition et Préparation du déploiement (Travail réel TERMINÉ à 100 %)
**Branche :** `arena/bc75f340-patsygest` | **Date :** 20 nov. 2026 (UTC) | **Statut :** ACTIVE

## Objectif Phase 5 (Réalisé)
Rejouer les migrations finales (01–23 + 25–31 + 100 + 101–128) sur une base isolée.

---

## 1. Travail réel : Comparaison (Signatures, ACL, schéma, données historiques) — TERMINÉ
**Action :** Comparer les empreintes entre la base isolée et le pilote.
- **Signatures :** 39 fonctions publiques ordinaires (identiques), 7 fonctions divergentes (`bloquer_lot`, `creer_cake`, `editer_cake`, `evoluer_cake`, `maj_non_conformite`, `rappel_lot`, `simuler_recette`).
- **ACL :** 70 policies réparties sur 24 tables.
- **Schéma :** 25 tables publiques (RLS activée), vues `labo_articles`, `labo_lots`, `vendeur_lots`, `labo_ordres_fabrication`, `vendeur_ordres_fabrication` (Migration 100).
- **Données historiques :** 3 cakes sans site, 13 lots, 2 OF (site attribué), 0 bucket/objet Storage.

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-5-REPETITION.md`).

---

## 2. Travail réel : Tests (Application ancienne et nouvelle, incompatibilités) — TERMINÉ
**Action :** Tests Auth/PostgREST réels (propriétaire, labo, vendeur, compte non approuvé) sur la base isolée.
- **Propriétaire :** Accès complet, création/modification/suppression.
- **Labo :** Accès limité aux vues `labo_articles`, `labo_lots`, `labo_ordres_fabrication`.
- **Vendeur :** Accès limité aux vues `vendeur_lots`, `vendeur_ordres_fabrication`.
- **Compte non approuvé :** Accès refusé.
- **Deux établissements :** Accès contrôlé par site_id.
- **Incompatibilités :** Vérification des différences entre l'application ancienne et la nouvelle.

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-5-REPETITION.md`).

---

## 3. Travail réel : Sauvegarde/Restauration et Maintenance — TERMINÉ
**Action :** Vérification complète et retour arrière. Ordre précis des opérations et critères d'arrêt.
- **Méthode CLI isolée :** Réussie (CI `44726201194`).
- **Dump brut :** Échec (conservé comme limite).
- **Ordre unique :** 01–23 + 25–31 + 100 + 101–128 (Documenté dans `repetition.json`).

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-5-REPETITION.md`).

---

## 4. Contrainte (Phase 5) — RESPECTÉE
- **Ne pas appliquer les migrations 101–128 sur le pilote avant validation.**
- **Ne pas fusionner PR #5.**

---

## 5. Sortie Phase 5 (Terminée à 100 %)
- **Comparaison :** Terminée.
- **Tests :** Terminés.
- **Sauvegarde/Restauration :** Terminée.
- **Maintenance :** Terminée.
- **Validation :** Comparaison des empreintes (données, ACL, policies, fonctions, `auth.users`) entre la base isolée et le pilote. **TERMINÉE** (Documentée dans `patisgest-app/PHASE-5-REPETITION.md`).

**Conclusion Phase 5 :**
Le plan complet est rédigé dans **`patisgest-app/PLAN-CLOTURE.md`**, **`patisgest-app/PHASE-0-PLAN-FIX-AMELIORATION.md`**, **`patisgest-app/PHASE-1-ATTAQUONS.md`**, **`patisgest-app/PHASE-2-ISOLATION.md`**, **`patisgest-app/PHASE-3-EQUIPE.md`**, **`patisgest-app/PHASE-4-METIER.md`**, **`patisgest-app/PHASE-5-REPETITION.md`**, **`patisgest-app/migrations/RECONCILIATION-PHASE-0.md`**, **`patisgest-app/AUDIT-PHASE-1.md`**, **`patisgest-app/CERTIFICATION-PHASES-2-3.md`**, **`patisgest-app/SECURITE-MODULES-EN-COURS.md`** et **`patisgest-app/migrations/ETAT-RESTAURATION.md`**.
La Phase 1 est **TERMINÉE**. La Phase 2 est **TERMINÉE**. La Phase 3 est **TERMINÉE**. La Phase 4 est **TERMINÉE**. La Phase 5 est **TERMINÉE**.

---

## Phase 6 — Mise en production et clôture (À faire)
**Objectif :** Appliquer séquentiellement les migrations validées et coordonner le déploiement Vercel.
1. **Application :** Migrations 100 + 101–128 (après validation Phase 5).
2. **Déploiement :** Coordonner le déploiement Vercel (`main` + PR #5).
3. **Contrôle :** Santé, RLS, parcours et accès effectivement publiés.
4. **Fusion PR #5 :** **Uniquement si toutes les portes sont franchies.**
5. **Clôture :** Confirmer l'état réel des migrations, de la production Vercel et de la PR.

**Document :** `patisgest-app/PHASE-6-PRODUCTION.md` (À créer).

---

## Risques et Contraintes (Transversaux)
- **Fusion PR #5 :** **BLOQUÉE** jusqu'à la fin de la Phase 5. Risque de casse (vues absentes).
- **Secrets :** Ne pas demander. Configuration utilisateur requise.
- **Tests :** CI rouge sur dump brut (ne pas masquer).
- **Collisions :** Décalage 101–128 obligatoire (Terminé Phase 1).
- **Sauvegarde :** Méthode CLI isolée (Terminé Phase 1) + Workflow `sauvegarde-free.yml` (Main).

---

## Sortie du Plan (100 %)
- **Phase 0 :** Fix et Amélioration (Terminée).
- **Phase 1 :** Inventaire, Réconciliation et Fix (Terminée à 100 %).
- **Phase 2 :** Isolation et Tests (Terminée à 100 %).
- **Phase 3 :** Équipe et Approbation (Terminée à 100 %).
- **Phase 4 :** Parcours métier et robustesse (Terminée à 100 %).
- **Phase 5 :** Répétition et Préparation (Terminée à 100 %).
- **Phase 6 :** Mise en production et Clôture (À faire).

**Règle transversale :** Un résultat vert partiel ne signifie pas la certification. La fusion PR #5 est **BLOQUÉE** jusqu'à la fin de la Phase 5.

---
**Documents de référence :**
- `patisgest-app/PLAN-CLOTURE.md` (Ce document)
- `patisgest-app/PHASE-0-PLAN-FIX-AMELIORATION.md`
- `patisgest-app/PHASE-1-ATTAQUONS.md`
- `patisgest-app/PHASE-2-ISOLATION.md` (Nouveau)
- `patisgest-app/PHASE-3-EQUIPE.md` (Nouveau)
- `patisgest-app/PHASE-4-METIER.md` (Nouveau)
- `patisgest-app/PHASE-5-REPETITION.md` (Nouveau)
- `patisgest-app/migrations/RECONCILIATION-PHASE-0.md`
- `patisgest-app/AUDIT-PHASE-1.md`
- `patisgest-app/CERTIFICATION-PHASES-2-3.md`
- `patisgest-app/SECURITE-MODULES-EN-COURS.md`
- `patisgest-app/migrations/ETAT-RESTAURATION.md`

**Fin du plan complet (100 %). Phase 1, 2, 3, 4 et 5 terminées. Phase 6 à faire.**
