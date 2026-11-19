# Évaluation de certification — phases 2 et 3

**Décision : NON CERTIFIÉES ; migrations 24–37 non autorisées pour application.**
Ce document décrit un état et des essais partiels, pas un certificat de sécurité.
Le pilote est utilisé par la production : une migration de sécurité incomplète
peut aussi verrouiller les utilisateurs existants ou casser l'ancienne application.

## Constat vérifié

- Historique Supabase consulté en lecture seule : dernière migration
  `controle_modules_23` (`20261119045242`). Les brouillons 24–37 n'y sont pas.
- Production Vercel consultée en lecture seule : commit `f11e371` ; elle ne
  correspond pas à l'application de la branche. Preview et production sont
  configurés sur la même base Supabase ; les tests destructifs sont interdits.
- La base pilote n'a qu'une clé étrangère vers `utilisateurs` dans son état
  actuel (`acces_modules`, suppression en cascade), mais le schéma évoluera
  avant le brouillon 36 et les usages applicatifs doivent être revérifiés.
- Les tests locaux passent (311, typecheck et lint). La CI 44572631200 réussit
  sur une pile Supabase CLI jetable : requêtes authentifiées, modifications
  d'affectations et vérification d'un JWT vendeur déjà émis après révocation,
  build et garde Preview. Les migrations historiques y sont reconstruites avec
  des adaptations de bootstrap : ce n'est pas une copie du pilote.

## Phase 2 — critères non satisfaits

- Toutes les tables, politiques, vues, fonctions SECURITY DEFINER, JSON,
  historiques, erreurs et combinaisons de modules ne sont pas couverts par des
  tests adversariaux. Certains accès sans site ou de traçabilité sont refusés
  de manière conservatrice, pas intégralement pris en charge.
- Les corps de sept fonctions et des policies de quatre tables diffèrent entre
  pilote et reconstruction ; leur impact sémantique doit être résolu avant
  rejeu. Trois anciens cakes sans site exigent une décision d'attribution.
- L'export JSON n'inclut pas les comptes Auth, autorisations et tables équipe ;
  il n'est pas une sauvegarde complète. Une restauration complète et un retour
  arrière base + application doivent être vérifiés sur un environnement isolé.

## Phase 3 — critères non satisfaits

- Le brouillon 33 enregistre une approbation mais ne crée aucune adhésion.
  Le brouillon 37 prépare l'acceptation d'une demande approuvée ou d'une
  invitation avec identité Auth vérifiée, aucun module actif par défaut et une
  bascule privée désactivée ; il n'est pas déployé ni activé. Les nouveaux tests
  Auth/PostgREST restent à exécuter. L'interface équipe et le canal d'invitation
  vérifié ne sont pas opérationnels.
- Le brouillon 36 modifie les affectations de membres existants et retire leur
  adhésion lors d'une révocation. Une transaction déjà en cours peut conserver
  son snapshot ; la concurrence avec les autres RPC de gestion, les changements
  d'adresse, les invitations et les clés étrangères du pilote restent à auditer.
  La suppression ne désactive pas le compte Supabase Auth lui-même.
- La transition des comptes existants doit être définie et testée sans élargir
  leurs droits ni les priver involontairement de leurs sites.

## Porte de sortie

Compléter les parcours et tests ci-dessus, reproduire le schéma pilote dans une
base isolée, valider sauvegarde/restauration et rollback, puis coordonner les
migrations et l'application. Aucun compte n'est à activer et aucune migration à
appliquer au pilote tant que ces portes ne sont pas satisfaites.
