# État de la Restauration (Phase 1 Fix Terminé)
**Branche :** `arena/bc75f340-patsygest` | **Date :** 20 nov. 2026 (UTC)

## 1. Méthode de référence (Succès)
- **Procédure :** `restauration-cli-isolee.sh` (CI `44726201194`).
- **Résultat :** Réussite sur base isolée (données fictives, coffre GCM, tests Auth/PostgREST).
- **Statut :** **CERTIFIÉE** pour la Phase 1 (Inventaire + Réconciliation).

## 2. Limite connue (Échec)
- **Procédure :** Dump brut `pg_dump` (`realtime.list_changes`, rôle local `postgres`).
- **Résultat :** Échec (permission refusée, rôle local).
- **Statut :** **NON MASQUÉE** (Documentée comme limite).

## 3. Phase 1 Fix (Réalisé)
- **Migration 100 :** `100-reconciliation-vues.sql` (Créée).
- **Décalage 101–128 :** Fichiers renommés physiquement (24–50 → 101–128).
- **Ordre unique :** 01–23 + 25–31 + 100 + 101–128 (Documenté dans `repetition.json`).

## 4. Prochaines étapes (Phase 2)
- **Isolation :** Tester les vues `labo_articles` etc. et les brouillons sécurité (101–128) sur la base isolée.
- **Contrainte :** Ne pas appliquer les migrations 101–128 sur le pilote avant validation.

---
**Règle transversale :** Un résultat vert partiel ne signifie pas la certification. La fusion PR #5 est **BLOQUÉE** jusqu'à la fin de la Phase 5.
