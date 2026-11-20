# Réconciliation des Migrations et Fix Phase 0
**Branche :** `arena/bc75f340-patsygest` | **Date :** 20 nov. 2026 (UTC)

## 1. État du Pilote (Réel)
- **Migrations appliquées :** 01–23 + 25–31 (Vitrine `main`).
- **Vues présentes :** `vitrine_catalogue` (seule vue publique trouvée).
- **Vues ABSENTES (Code `workspace-read.ts`) :**
  - `labo_articles` (ligne 32)
  - `labo_lots` / `vendeur_lots` (ligne 47)
  - `labo_ordres_fabrication` / `vendeur_ordres_fabrication` (ligne 58)
- **Fonctions SECURITY DEFINER :** `accepter_cgv`, `activer_version`, `affecter_production_cake`, `bloquer_lot`, `cake_liens_production`, `cake_options_production`, `creer_cake`, `creer_cake_production`, `creer_commande`, `editer_cake`, `editer_commande`, `evoluer_cake`, `maj_non_conformite`, `patisgest_demander_commande`, `patisgest_exiger_modules`, `patisgest_traiter_demande`, `rappel_lot`, `simuler_recette`, `vendre_panier`.

## 2. Collisions Migrations (24–31)
- **Série Vitrine (Déjà appliquée sur Pilote) :**
  - 25-domaines-boutiques.sql
  - 26-vitrine-publique.sql
  - 27-commandes-vitrine.sql
  - 28-fermeture-anon.sql
  - 29-fermeture-public-fonctions.sql
  - 30-edition-vitrine-rpc.sql
  - 31-publication-vitrine.sql
- **Brouillons Sécurité (Branche - À décaler) :**
  - 24-confidentialite-labo.sql  => **100-confidentialite-labo.sql**
  - 24-index-exploitation.sql   => **101-index-exploitation.sql**
  - 25-cout-of-partiel.sql       => **102-cout-of-partiel.sql**
  - 26-gestion-sites.sql        => **103-gestion-sites.sql**
  - 27-equipe-fondations.sql    => **104-equipe-fondations.sql**
  - 28-sites-lecture-brouillon.sql => **105-sites-lecture-brouillon.sql**
  - 29-sites-rpc-brouillon.sql  => **106-sites-rpc-brouillon.sql**
  - 30-tracabilite-sites-brouillon.sql => **107-tracabilite-sites-brouillon.sql**
  - 31-reassort-sites-brouillon.sql => **108-reassort-sites-brouillon.sql**
  - 32-cake-sites-brouillon.sql => **109-cake-sites-brouillon.sql**
  - ... (jusqu'à 50 => **127**)

## 3. Fix : Création des Vues Manquantes (Phase 0)
Les vues `labo_articles`, `labo_lots`, `vendeur_lots` (et les variantes `ordres_fabrication`) doivent être créées dans une migration spécifique **100-reconciliation-vues.sql** (avant les brouillons sécurité décalés) pour éviter la casse de l'application.

**Migration 100-reconciliation-vues.sql (Proposition) :**
```sql
-- Création des vues manquantes pour le code workspace-read.ts
CREATE OR REPLACE VIEW labo_articles AS
  SELECT id, nom, code, niveau, unite, seuil, client_id
  FROM articles WHERE client_id IN (SELECT client_id FROM utilisateurs WHERE role = 'labo');

CREATE OR REPLACE VIEW labo_lots AS
  SELECT id, article_id, site_id, numero, qte_rest, dlc, bloque, congele, date_reception, client_id
  FROM lots WHERE client_id IN (SELECT client_id FROM utilisateurs WHERE role = 'labo');

CREATE OR REPLACE VIEW vendeur_lots AS
  SELECT id, article_id, site_id, numero, qte_rest, dlc, bloque, congele, date_reception, client_id
  FROM lots WHERE client_id IN (SELECT client_id FROM utilisateurs WHERE role = 'vendeur');

-- (Ajouter les variantes ordres_fabrication si nécessaire selon les lignes 58+)
```
*Note : Ces vues ne doivent être créées qu'après vérification des ACL (RLS) pour ne pas exposer les données.*

## 4. Plan de Fix et Amélioration (Phase 0)
1. **Renommer** les fichiers SQL locaux 24–50 (décalage 100+) pour éviter les collisions avec la série vitrine 25–31 déjà sur le pilote.
2. **Créer** la migration `100-reconciliation-vues.sql` (Fix des vues absentes).
3. **Mettre à jour** `repetition.json` avec les nouveaux noms (100+) et les empreintes.
4. **Documenter** la sauvegarde/restauration dans `ETAT-RESTAURATION.md` (inclure la réussite de la CI CLI et l'échec du dump brut).
5. **Vérifier** que `sauvegarde-free.yml` (Main) et la branche sont alignés sur la procédure de restauration mensuelle.

## 5. Amélioration Phase 0
- **Garde Preview :** Confirmer que les vues `labo_articles` etc. ne sont pas appelées par les routes publiques (seules `/estimation` autorisées).
- **Coffre :** Utiliser `coffre-sauvegarde.mjs` pour chiffrer les dumps de la Phase 0 (inventaire).

---
**Action immédiate :** Renommer les fichiers SQL locaux et créer la migration de réconciliation.
**Risque :** Fusion PR #5 interdite avant validation de ces étapes.
