-- Migration de réconciliation des vues absentes (Phase 0 Fix)
-- Branche : arena/bc75f340-patsygest | Date : 20 nov. 2026 (UTC)
-- Objectif : Créer les vues requises par workspace-read.ts (lignes 32, 47, 58)
-- qui sont absentes du pilote (seule vitrine_catalogue présente).

-- Vue 1 : labo_articles (ligne 32)
CREATE OR REPLACE VIEW labo_articles AS
  SELECT id, nom, code, niveau, unite, seuil, client_id
  FROM articles
  WHERE client_id IN (SELECT client_id FROM utilisateurs WHERE role = 'labo');

-- Vue 2 : labo_lots (ligne 47)
CREATE OR REPLACE VIEW labo_lots AS
  SELECT id, article_id, site_id, numero, qte_rest, dlc, bloque, congele, date_reception, client_id
  FROM lots
  WHERE client_id IN (SELECT client_id FROM utilisateurs WHERE role = 'labo');

-- Vue 3 : vendeur_lots (ligne 47)
CREATE OR REPLACE VIEW vendeur_lots AS
  SELECT id, article_id, site_id, numero, qte_rest, dlc, bloque, congele, date_reception, client_id
  FROM lots
  WHERE client_id IN (SELECT client_id FROM utilisateurs WHERE role = 'vendeur');

-- Vue 4 : labo_ordres_fabrication (ligne 58)
CREATE OR REPLACE VIEW labo_ordres_fabrication AS
  SELECT id, article_id, site_id, numero, qte_prevue, qte_produite, etat, date_debut, date_fin, client_id
  FROM ordres_fabrication
  WHERE client_id IN (SELECT client_id FROM utilisateurs WHERE role = 'labo');

-- Vue 5 : vendeur_ordres_fabrication (ligne 58)
CREATE OR REPLACE VIEW vendeur_ordres_fabrication AS
  SELECT id, article_id, site_id, numero, qte_prevue, qte_produite, etat, date_debut, date_fin, client_id
  FROM ordres_fabrication
  WHERE client_id IN (SELECT client_id FROM utilisateurs WHERE role = 'vendeur');

-- Note : Ces vues ne doivent être créées qu'après vérification des ACL (RLS)
-- pour ne pas exposer les données. La migration 100 est la première étape de la Phase 1.
-- Les migrations 101-128 (décalage sécurité) suivront.
