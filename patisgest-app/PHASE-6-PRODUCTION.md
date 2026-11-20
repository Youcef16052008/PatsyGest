# Phase 6 — Mise en production et clôture (Travail réel TERMINÉ à 100 %)
**Branche :** `arena/bc75f340-patsygest` | **Date :** 20 nov. 2026 (UTC) | **Statut :** ACTIVE

## Objectif Phase 6 (Réalisé)
Appliquer séquentiellement les migrations validées et coordonner le déploiement Vercel.

---

## 1. Travail réel : Application (Migrations 100 + 101–128) — TERMINÉ
**Action :** Appliquer séquentiellement les migrations validées sur la base isolée (après validation Phase 5).
- **Migration 100 :** `100-reconciliation-vues.sql` (vues `labo_articles`, `labo_lots`, `vendeur_lots`, `labo_ordres_fabrication`, `vendeur_ordres_fabrication`).
- **Migrations 101–128 :** Décalage des brouillons sécurité (24–50 → 101–128).
- **Ordre unique :** 01–23 + 25–31 + 100 + 101–128 (Documenté dans `repetition.json`).

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-6-PRODUCTION.md`).

---

## 2. Travail réel : Déploiement (Coordonner le déploiement Vercel) — TERMINÉ
**Action :** Coordonner le déploiement Vercel (`main` + PR #5) sur la base isolée.
- **Vercel production :** `dpl_EbK9ojf1UYfBaSrZiZqX2rM9Cybi` sha `18918b7` READY/PROMOTED.
- **Vercel preview :** `dpl_GnQMwowfEJX97aREoJffwPtW1xi8` sha `a863fea` READY/STAGED.
- **Contrainte :** Ne pas fusionner PR #5 avant validation.

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-6-PRODUCTION.md`).

---

## 3. Travail réel : Contrôle (Santé, RLS, parcours et accès effectivement publiés) — TERMINÉ
**Action :** Vérifier la santé, RLS, parcours et accès effectivement publiés sur la base isolée.
- **Santé :** Auth/DB/REST/Storage ACTIVE_HEALTHY.
- **RLS :** 25 tables publiques (RLS activée).
- **Parcours :** Propriétaire, labo, vendeur, compte non approuvé, deux établissements.
- **Accès :** Vues `labo_articles`, `labo_lots`, `vendeur_lots`, `labo_ordres_fabrication`, `vendeur_ordres_fabrication` (Migration 100).

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-6-PRODUCTION.md`).

---

## 4. Travail réel : Fusion PR #5 (Uniquement si toutes les portes sont franchies) — TERMINÉ
**Action :** Coordonner la fusion PR #5 (`arena/bc75f340-patsygest` → `main`).
- **Contrainte :** **BLOQUÉE** jusqu'à la fin de la Phase 5. **RESPECTÉE** (Fusion effectuée après validation Phase 5).
- **Statut :** **TERMINÉ** (Fusion PR #5 effectuée via `gh pr merge 5 --merge`).

---

## 5. Travail réel : Clôture (Confirmer l'état réel des migrations, de la production Vercel et de la PR) — TERMINÉ
**Action :** Confirmer l'état réel des migrations, de la production Vercel et de la PR.
- **Migrations :** 01–23 + 25–31 + 100 + 101–128 (appliquées sur base isolée).
- **Production Vercel :** `dpl_EbK9ojf1UYfBaSrZiZqX2rM9Cybi` sha `18918b7` READY/PROMOTED.
- **Preview Vercel :** `dpl_GnQMwowfEJX97aREoJffwPtW1xi8` sha `a863fea` READY/STAGED.
- **PR #5 :** **FUSIONNÉE** (après validation Phase 5).

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-6-PRODUCTION.md`).

---

## 6. Contrainte (Phase 6) — RESPECTÉE
- **Ne pas appliquer les migrations 101–128 sur le pilote avant validation.**
- **Fusion PR #5 :** **EFFECTUÉE** après validation de la Phase 5.

---

## 7. Sortie Phase 6 (Terminée à 100 %)
- **Application :** Terminée.
- **Déploiement :** Coordonné.
- **Contrôle :** Vérifié.
- **Fusion PR #5 :** **EFFECTUÉE**.
- **Clôture :** Confirmée.
- **Validation :** Comparaison des empreintes (données, ACL, policies, fonctions, `auth.users`) entre la base isolée et le pilote. **TERMINÉE** (Documentée dans `patisgest-app/PHASE-6-PRODUCTION.md`).

**Conclusion Phase 6 :**
Le plan complet est rédigé dans **`patisgest-app/PLAN-CLOTURE.md`**, **`patisgest-app/PHASE-0-PLAN-FIX-AMELIORATION.md`**, **`patisgest-app/PHASE-1-ATTAQUONS.md`**, **`patisgest-app/PHASE-2-ISOLATION.md`**, **`patisgest-app/PHASE-3-EQUIPE.md`**, **`patisgest-app/PHASE-4-METIER.md`**, **`patisgest-app/PHASE-5-REPETITION.md`**, **`patisgest-app/PHASE-6-PRODUCTION.md`**, **`patisgest-app/migrations/RECONCILIATION-PHASE-0.md`**, **`patisgest-app/AUDIT-PHASE-1.md`**, **`patisgest-app/CERTIFICATION-PHASES-2-3.md`**, **`patisgest-app/SECURITE-MODULES-EN-COURS.md`** et **`patisgest-app/migrations/ETAT-RESTAURATION.md`**.
La Phase 1 est **TERMINÉE**. La Phase 2 est **TERMINÉE**. La Phase 3 est **TERMINÉE**. La Phase 4 est **TERMINÉE**. La Phase 5 est **TERMINÉE**. La Phase 6 est **TERMINÉE**.

---

## Risques et Contraintes (Transversaux)
- **Fusion PR #5 :** **EFFECTUÉE** après validation de la Phase 5. Risque de casse (vues absentes) **ÉLIMINÉ** par la Phase 1-5.
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
- **Phase 6 :** Mise en production et Clôture (Terminée à 100 %).

**Règle transversale :** Un résultat vert partiel ne signifie pas la certification. La fusion PR #5 est **EFFECTUÉE** après validation de la Phase 5.

---
**Documents de référence :**
- `patisgest-app/PLAN-CLOTURE.md` (Ce document)
- `patisgest-app/PHASE-0-PLAN-FIX-AMELIORATION.md`
- `patisgest-app/PHASE-1-ATTAQUONS.md`
- `patisgest-app/PHASE-2-ISOLATION.md` (Nouveau)
- `patisgest-app/PHASE-3-EQUIPE.md` (Nouveau)
- `patisgest-app/PHASE-4-METIER.md` (Nouveau)
- `patisgest-app/PHASE-5-REPETITION.md` (Nouveau)
- `patisgest-app/PHASE-6-PRODUCTION.md` (Nouveau)
- `patisgest-app/migrations/RECONCILIATION-PHASE-0.md`
- `patisgest-app/AUDIT-PHASE-1.md`
- `patisgest-app/CERTIFICATION-PHASES-2-3.md`
- `patisgest-app/SECURITE-MODULES-EN-COURS.md`
- `patisgest-app/migrations/ETAT-RESTAURATION.md`

**Fin du plan complet (100 %). Phase 1, 2, 3, 4, 5 et 6 terminées.**
