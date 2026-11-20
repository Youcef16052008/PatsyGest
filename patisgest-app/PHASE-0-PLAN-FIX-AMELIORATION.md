# Phase 0 — Fix, Amélioration et Préparation (PâtisGest)
**Branche :** `arena/bc75f340-patsygest` | **Date :** 20 nov. 2026 (UTC) | **Statut :** ACTIVE

## Objectif de la Phase 0
Réconcilier les divergences entre le pilote (`evepzygucfxarpdnflzv`), le code de la branche (vues absentes `labo_articles`, `labo_lots`, `vendeur_lots`) et les migrations (collisions 24–31). Établir une base de sauvegarde/restauration vérifiée avant toute fusion ou application SQL.

---

## 1. Fix : Résolution des blocages critiques

### 1.1 Inventaire Pilote vs Code (Fix immédiat)
- **Problème :** Le code (`workspace-read.ts`) lit `labo_articles`, `labo_lots`, `vendeur_lots`. Le pilote n'a pas ces vues (27 tables publiques, mais pas ces vues spécifiques).
- **Action Fix :**
  - [ ] Lister précisément les vues/fonctions `SECURITY DEFINER` existantes sur le pilote (`supabase.list_migrations` + `get_project_health` déjà faits, besoin d'un inventaire SQL précis via `supabase db query` ou connecteur).
  - [ ] Créer un script de réconciliation SQL qui génère les vues manquantes **sans** casser les migrations vitrine 25–31 existantes.
  - [ ] Documenter les noms exacts des vues à créer (ex: `labo_articles_v1`, `vendeur_lots_v1` si collision, ou nom exact attendu par le code).

### 1.2 Sauvegarde/Restauration (Fix du risque 100 %)
- **Problème :** CI rouge sur `pg_dump` brut (`realtime.list_changes`). Workflow `sauvegarde-free.yml` (main) n'a pas tourné. Coffre partiel.
- **Action Fix :**
  - [ ] Utiliser la méthode CLI réussie (excluant les tables vectorielles) comme base de référence, mais **ajouter** une vérification manuelle des objets Storage (0 bucket/objet actuel, mais doit être couvert).
  - [ ] Documenter la procédure de restauration isolée dans `ETAT-RESTAURATION.md` (actuellement "NON certifiée") en incluant les étapes de la CI réussie (`restauration-cli-isolee.sh`).
  - [ ] **Ne pas masquer l'erreur `log_min_messages`** : garder la note d'échec dans le plan.

### 1.3 Collisions Migrations (Fix du risque SQL)
- **Problème :** Numéros 24–31 en double (Vitrine `main` vs Sécurité `branche`).
- **Action Fix :**
  - [ ] Renommer les brouillons sécurité locaux (24–50) avec un décalage (ex: 100+) ou un préfixe unique dans `repetition.json` et les fichiers `.sql` pour éviter l'application accidentelle.
  - [ ] **Ne pas appliquer** le répertoire trié. Établir une liste blanche des migrations validées (uniquement les 01–23 + Vitrine 25–31 déjà appliquées + nouvelles migrations spécifiques sans collision).

---

## 2. Amélioration : Optimisation et Sécurité

### 2.1 Workflow Sauvegarde (Amélioration Main vs Branche)
- **Problème :** Différence entre `main` (18918b7) et `branche` (a863fea). `main` a supprimé `supabase-isole.yml` et modifié `sauvegarde-free.yml`.
- **Action Amélioration :**
  - [ ] Harmoniser `sauvegarde-free.yml` pour inclure la vérification de restauration (même si partielle) et la copie R2 (si secrets présents).
  - [ ] Conserver la note de risque : "Restauration réelle non testée par ce workflow" (comme dans la branche) mais ajouter les instructions de la CI réussie (`restauration-cli-isolee.sh`) comme annexe.

### 2.2 Garde Preview et Production (Amélioration Vercel)
- **Problème :** La production (`18918b7`) est prête, la Preview (`a863fea`) bloque les routes métier.
- **Action Amélioration :**
  - [ ] Vérifier que le garde Preview ne bloque pas les tests de réconciliation (API Supabase directe autorisée).
  - [ ] Préparer un script de vérification de santé (Health Check) qui teste les vues `labo_articles` etc. **après** création (Phase 1/2) mais **avant** fusion.

### 2.3 Coffre Sauvegarde (Amélioration Scripts)
- **Problème :** `coffre-sauvegarde.mjs` partiel (arrêt brutal = clair).
- **Action Amélioration :**
  - [ ] Ajouter une vérification de l'intégrité du fichier chiffré avant suppression du temporaire (déjà présent mais à renforcer dans les tests).
  - [ ] Documenter l'usage avec les secrets GitHub (sans les demander).

---

## 3. Début Phase 0 : Étapes opérationnelles (À exécuter maintenant)

### Étape 0.1 : Inventaire SQL précis (Pilote)
- [ ] Exécuter une requête via connecteur Supabase pour lister les vues et fonctions `SECURITY DEFINER` actuelles.
- [ ] Comparer avec `patisgest-app/src/lib/workspace-read.ts` (lignes 32, 47, 58).

### Étape 0.2 : Réconciliation des Migrations (Ordre unique)
- [ ] Créer `patisgest-app/migrations/ORDRE-VALIDÉ.md` :
  - Liste 01–23 (historique).
  - Liste 25–31 (Vitrine `main`, déjà appliquées).
  - Liste des brouillons sécurité (24–50) **à renommer/décaler** (ex: 100–150) et à valider un par un.
  - **Exclusion :** Ne pas appliquer les collisions 24–31 locales.

### Étape 0.3 : Documentation de la Sauvegarde
- [ ] Mettre à jour `ETAT-RESTAURATION.md` avec les résultats de la CI réussie (`restauration-cli-isolee.sh`) et les limites du workflow `sauvegarde-free.yml`.
- [ ] Ajouter une section "Phase 0 : Fix" dans `PLAN-CLOTURE.md`.

### Étape 0.4 : Test de la Garde Preview
- [ ] Vérifier que les routes `/estimation` (autorisées) et `/connexion` (bloquées) répondent correctement sur la Preview actuelle (`a863fea`).

---

## 4. Détails des corrections (Code & SQL)

### SQL (Réconciliation)
```sql
-- Exemple de création des vues manquantes (à adapter selon l'inventaire pilote)
CREATE VIEW labo_articles AS SELECT ... FROM articles WHERE role = 'labo';
CREATE VIEW labo_lots AS SELECT ... FROM lots WHERE role = 'labo';
CREATE VIEW vendeur_lots AS SELECT ... FROM lots WHERE role = 'vendeur';
```
*Note : Ces vues doivent être créées dans une migration spécifique (ex: `100-reconciliation-vues.sql`) après la validation de l'inventaire.*

### Code (Workspace Read)
- [ ] Vérifier si `patisgest-app/src/lib/workspace-read.ts` peut être rendu résilient (ex: fallback ou erreur explicite) si les vues sont absentes, **avant** la création des vues.

---

## 5. Matrice de risques (Phase 0)

| Risque | Impact | Fix/Amélioration |
|--------|--------|------------------|
| Fusion PR #5 | Cassure production (vues absentes) | **BLOQUÉE** jusqu'à Étape 0.1 & 0.2 |
| Collision 24–31 | Écrasement migrations vitrine | Renommage/Décalage (Étape 0.2) |
| Sauvegarde incomplète | Perte données (Storage/Auth) | Documentation limites (Étape 0.3) |
| Garde Preview | Blocage tests métier | Vérification routes (Étape 0.4) |

---

## 6. Prochaines étapes (Phase 1 & 2)
Une fois la Phase 0 terminée (Inventaire + Réconciliation + Sauvegarde documentée) :
1. **Phase 1 (Réalité) :** Appliquer les migrations validées (01–23 + 25–31 + nouvelles 100+) sur une base isolée.
2. **Phase 2 (Isolation) :** Tester les vues `labo_articles` etc. sur la base isolée.
3. **Phase 3 (Production) :** Coordonner le déploiement Vercel et la fusion PR #5.

---

**Note importante :** Ne pas fusionner la PR #5. Ne pas appliquer les migrations 24–31 locales. Ne pas demander de secrets.

# Fin Phase 0 — Préparation terminée (à valider par inventaire pilote)
