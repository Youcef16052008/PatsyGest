# Phase 3 — Équipe et Approbation (Travail réel TERMINÉ à 100 %)
**Branche :** `arena/bc75f340-patsygest` | **Date :** 20 nov. 2026 (UTC) | **Statut :** ACTIVE

## Objectif Phase 3 (Réalisé)
Parcours complets d'invitation, demande, affectation, révocation.

---

## 1. Travail réel : Interface (Canal d'invitation vérifié) — TERMINÉ
**Action :** Vérifier le canal d'invitation (SMTP fictif ou réel selon configuration) sur la base isolée.
**Contenu :**
- **Propriétaire :** Envoi d'invitation, acceptation, révocation.
- **Labo :** Envoi d'invitation, acceptation, révocation.
- **Vendeur :** Envoi d'invitation, acceptation, révocation.
- **Compte non approuvé :** Refus d'invitation.

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-3-EQUIPE.md`).

---

## 2. Travail réel : Tests (Auth/PostgREST réels) — TERMINÉ
**Action :** Tests Auth/PostgREST réels (propriétaire, labo, vendeur, compte non approuvé) sur la base isolée.
- **Propriétaire :** Accès complet, création/modification/suppression.
- **Labo :** Accès limité aux vues `labo_articles`, `labo_lots`, `labo_ordres_fabrication`.
- **Vendeur :** Accès limité aux vues `vendeur_lots`, `vendeur_ordres_fabrication`.
- **Compte non approuvé :** Accès refusé.
- **Deux établissements :** Accès contrôlé par site_id.

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-3-EQUIPE.md`).

---

## 3. Travail réel : Transitions (Comptes existants, attribution contrôlée, réversibilité) — TERMINÉ
**Action :** Préparer les transitions sur la base isolée.
- **Comptes existants :** Transition des comptes sans site vers les sites attribués.
- **Attribution contrôlée :** Attribution des membres aux sites.
- **Réversibilité :** Retour arrière en cas d'erreur.

**Statut :** **TERMINÉ** (Documenté dans `patisgest-app/PHASE-3-EQUIPE.md`).

---

## 4. Contrainte (Phase 3) — RESPECTÉE
- **Ne pas appliquer les migrations 101–128 sur le pilote avant validation.**
- **Ne pas fusionner PR #5.**

---

## 5. Sortie Phase 3 (Terminée à 100 %)
- **Parcours complets :** Terminés.
- **Interface :** Vérifiée.
- **Tests :** Terminés.
- **Transition :** Préparée.
- **Validation :** Comparaison des empreintes (données, ACL, policies, fonctions, `auth.users`) entre la base isolée et le pilote. **TERMINÉE** (Documentée dans `patisgest-app/PHASE-3-EQUIPE.md`).

**Conclusion Phase 3 :**
Le plan complet est rédigé dans **`patisgest-app/PLAN-CLOTURE.md`**, **`patisgest-app/PHASE-0-PLAN-FIX-AMELIORATION.md`**, **`patisgest-app/PHASE-1-ATTAQUONS.md`**, **`patisgest-app/PHASE-2-ISOLATION.md`**, **`patisgest-app/PHASE-3-EQUIPE.md`**, **`patisgest-app/migrations/RECONCILIATION-PHASE-0.md`**, **`patisgest-app/AUDIT-PHASE-1.md`**, **`patisgest-app/CERTIFICATION-PHASES-2-3.md`**, **`patisgest-app/SECURITE-MODULES-EN-COURS.md`** et **`patisgest-app/migrations/ETAT-RESTAURATION.md`**.
La Phase 1 est **TERMINÉE**. La Phase 2 est **TERMINÉE**. La Phase 3 est **TERMINÉE**.

---

## Phase 4 — Parcours métier multisites et robustesse (À faire)
**Objectif :** Plusieurs laboratoires/boutiques, achats, recettes, stocks, OF, transferts, caisse, commandes, clôture.
1. **Scénarios :** Représentatifs à plusieurs sites, tests de défaillance.
2. **Idempotence :** `vendre_panier` (exception `duplicate`), collisions SQL.
3. **Contrainte :** Ne pas faire passer du trafic réel sur une combinaison base/application incompatible.

**Document :** `patisgest-app/PHASE-4-METIER.md` (À créer).

---

## Phase 5 — Répétition et Préparation du déploiement (À faire)
**Objectif :** Rejouer les migrations finales (01–23 + 25–31 + 100 + 101–128) sur une base isolée.
1. **Comparaison :** Signatures, ACL, schéma, données historiques.
2. **Tests :** Application ancienne et nouvelle, incompatibilités.
3. **Sauvegarde/Restauration :** Vérification complète et retour arrière.
4. **Maintenance :** Ordre précis des opérations et critères d'arrêt.

**Document :** `patisgest-app/PHASE-5-REPETITION.md` (À créer).

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
- **Phase 4 :** Parcours métier et robustesse (À faire).
- **Phase 5 :** Répétition et Préparation (À faire).
- **Phase 6 :** Mise en production et Clôture (À faire).

**Règle transversale :** Un résultat vert partiel ne signifie pas la certification. La fusion PR #5 est **BLOQUÉE** jusqu'à la fin de la Phase 5.

---
**Documents de référence :**
- `patisgest-app/PLAN-CLOTURE.md` (Ce document)
- `patisgest-app/PHASE-0-PLAN-FIX-AMELIORATION.md`
- `patisgest-app/PHASE-1-ATTAQUONS.md`
- `patisgest-app/PHASE-2-ISOLATION.md` (Nouveau)
- `patisgest-app/PHASE-3-EQUIPE.md` (Nouveau)
- `patisgest-app/migrations/RECONCILIATION-PHASE-0.md`
- `patisgest-app/AUDIT-PHASE-1.md`
- `patisgest-app/CERTIFICATION-PHASES-2-3.md`
- `patisgest-app/SECURITE-MODULES-EN-COURS.md`
- `patisgest-app/migrations/ETAT-RESTAURATION.md`

**Fin du plan complet (100 %). Phase 1, 2 et 3 terminées. Phase 4, 5, 6 à faire.**
