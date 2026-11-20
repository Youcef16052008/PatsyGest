# Évaluation de certification — phases 2 et 3

**Décision : NON CERTIFIÉES ; brouillons sécurité 24–49 non autorisés pour application.**
Ce document décrit un état et des essais partiels, pas un certificat de sécurité.
Le pilote est utilisé par la production : une migration de sécurité incomplète
peut aussi verrouiller les utilisateurs existants ou casser l'ancienne application.

## Constat vérifié

- Historique Supabase consulté en lecture seule : après `controle_modules_23`
  (`20261119045242`), sept migrations de vitrine et domaines ont été appliquées
  indépendamment, jusqu'à `publication_vitrine_31` (`20261119195618`). Ce ne
  sont pas les brouillons sécurité 24–49 de cette branche, dont la numérotation
  entre en collision avec celle de la vitrine. Aucun de ces brouillons sécurité
  n'a été appliqué au pilote par cette session.
- Production Vercel consultée en lecture seule : commit `24ec425` sur main,
  incluant la vitrine ; cette branche diverge depuis `f11e371`. Preview et
  production sont configurés sur la même base Supabase ; les tests destructifs
  y sont interdits. Il faut réconcilier application et migrations sans écraser
  le travail publié sur main.
- La base pilote n'a qu'une clé étrangère vers `utilisateurs` dans son état
  actuel (`acces_modules`, suppression en cascade), mais le schéma évoluera
  avant le brouillon 36 et les usages applicatifs doivent être revérifiés.
- Les tests locaux passent (314, typecheck, lint et build). La CI 44607099826 réussit
  sur pile jetable : sessions Auth, contrôles PostgREST, modifications
  concurrentes, révocation et changement de type de site ou d'adresse. La CI
  44690862739 couvre aussi certains formulaires HTTP. La CI 44572631200 réussit
  sur une pile Supabase CLI jetable : requêtes authentifiées, modifications
  d'affectations et vérification d'un JWT vendeur déjà émis après révocation,
  build et garde Preview. La CI 44586560234 couvre en plus l'admission de test
  avec verrou privé ouvert uniquement dans cette pile. Les migrations
  historiques y sont reconstruites avec des adaptations de bootstrap : ce
  n'est pas une copie du pilote.

## Phase 2 — critères non satisfaits

- La vitrine ajoutée au pilote introduit `sous_domaines_reserves`,
  `vitrine_photos`, une vue publique et de nouvelles RPC. Le catalogue réel
  expose la vue `vitrine_catalogue` et `patisgest_demander_commande` à anon :
  les affirmations anciennes « aucune vue ou RPC publique » ne sont plus
  valables. `patisgest_traiter_demande` modifie un cake sous SECURITY DEFINER
  sans contrôle de site ou module dans sa définition actuellement observée.
  Le brouillon 48 ajoute une garde de périmètre et de module ; la CI 44692500455
  la teste avec Auth/PostgREST sur une reconstruction vitrine. Le brouillon 49
  ajoute une garde pour les photos et les RPC de recette, encore à vérifier en
  CI. La compatibilité des autres chemins vitrine reste à démontrer. Les fixtures
  copiées de main ne sont pas une copie du pilote. L'export partiel ne comprend
  pas `vitrine_photos` ni Storage et n'est pas un rollback.
- Toutes les tables, politiques, vues, fonctions SECURITY DEFINER, JSON,
  historiques, erreurs et combinaisons de modules ne sont pas couverts par des
  tests adversariaux. Les brouillons 38 et 39 masquent au vendeur les lots,
  mouvements et OF bruts contenant des coûts ; les autres surfaces vendeur
  (notamment les JSON de cake) restent à auditer. Les tests Auth/PostgREST de
  ces brouillons passent dans la CI 44588935236. Le brouillon 40 reconstruit
  le rapport de rappel pour les employés, masque les sections non autorisées
  et signale leur absence dans l'interface ; ses essais isolés ne certifient
  ni le graphe complet ni la compatibilité du pilote. Certains accès sans
  site ou de traçabilité sont refusés de manière conservatrice, pas
  intégralement pris en charge. Le brouillon 44 vérifie aussi le type boutique
  pour chaque accès vendeur ; il peut bloquer des affectations historiques
  et exige donc un audit préalable et une transition coordonnée.
- Les corps de sept fonctions et des policies de quatre tables diffèrent entre
  pilote et reconstruction ; leur impact sémantique doit être résolu avant
  rejeu. Trois anciens cakes sans site exigent une décision d'attribution.
- L'export JSON n'inclut pas les comptes Auth, autorisations et tables équipe ;
  il n'est pas une sauvegarde complète. Ses lectures paginées successives ne
  garantissent pas un instantané cohérent si les données changent pendant l'export.
  Une restauration complète et un retour arrière base + application doivent
  être vérifiés sur un environnement isolé.

## Phase 3 — critères non satisfaits

- Le brouillon 33 enregistre une approbation mais ne crée aucune adhésion.
  Le brouillon 37 prépare l'acceptation d'une demande approuvée ou d'une
  invitation avec identité Auth vérifiée, aucun module actif par défaut et une
  bascule privée désactivée ; il n'est pas déployé ni activé. Des tests
  Auth/PostgREST couvrent ce brouillon en environnement jetable, pas tous les
  cas concurrents. Une interface expérimentale couvre côté propriétaire le code,
  les demandes et les invitations, et côté candidat leurs réponses. Elle est
  limitée au développement local sur API Supabase locale avec opt-in explicite ;
  l'admission reste verrouillée. Le brouillon 43 ajoute l'interface d'affectation
  et de révocation avec contrôle de version contre les formulaires périmés,
  et ne fournit pas encore de canal réel. Un essai local optionnel raccorde un SMTP fictif sur 127.0.0.1:54325,
  exclusivement pour les adresses example.test, sans lien ni droit dans le
  message. L'acceptation SMTP n'est pas une preuve de livraison ; annulation
  et envoi peuvent encore courir en concurrence. Aucun fournisseur réel n'est
  configuré. La CI 44691423347 vérifie sur Auth/PostgREST jetables les formulaires
  de demande, approbation, réponse avec admission verrouillée, invitation, renvoi,
  annulation, affectation et révocation, avec SMTP fictif et une session déjà
  émise. Le canal réel et la couverture complète des formulaires restent à établir.
- Le brouillon 36 modifie les affectations de membres existants et retire leur
  adhésion lors d'une révocation. Une transaction déjà en cours peut conserver
  son snapshot ; la concurrence avec les autres RPC de gestion, les changements
  d'adresse, les invitations et les clés étrangères du pilote restent à auditer.
  Le compteur de révision du brouillon 43 sérialise les chemins applicatifs de
  modification et la révocation versionnée ; il ne garantit pas la détection
  de modifications SQL privilégiées ou de cascades externes. Les brouillons
  45–46 ajoutent un historique privé de révocation et empêchent l'acceptation
  de décisions antérieures même après changement d'adresse ; sa sauvegarde,
  sa restauration et ses courses doivent encore être validées. La suppression
  ne désactive pas le compte Supabase Auth lui-même.
- Un test PGlite reconstitue des comptes préexistants, vérifie l'absence de
  sites implicites puis des affectations explicites en conservant leurs modules.
  Cela ne définit ni ne valide les affectations des comptes réels ; la
  transition doit être préparée et testée sans perte ou élargissement de droits.
- Le brouillon 47 annule les collisions et contrôle les FK entre établissements
  lors d'une restauration partielle. Des tests PGlite vérifient une insertion,
  l'annulation sur collision et le rejet d'une FK étrangère. La CI 44690862739
  confirme aussi un aller-retour partiel sur quatre tables, les refus de rôle,
  collisions et FK étrangères via Auth/PostgREST. Les liens JSON, les courses et
  la sauvegarde de l'historique de révocation restent à traiter.

## Porte de sortie

Compléter les parcours et tests ci-dessus, reproduire le schéma pilote dans une
base isolée, valider sauvegarde/restauration et rollback, puis coordonner les
migrations et l'application. Aucun compte n'est à activer et aucune migration à
appliquer au pilote tant que ces portes ne sont pas satisfaites.
