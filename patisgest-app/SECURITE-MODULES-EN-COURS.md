# Contrôle des modules et confidentialité labo — travail en cours

**Ne pas déployer la migration 24 ni considérer la PR comme prête.** Les
migrations 22 et 23 sont appliquées au pilote ; 24 ne l’est pas. Le code des
nouvelles interfaces a été poussé sur la branche, mais pas déployé en
production. Il attend les vues 24 : ne pas le déployer séparément de la base.

## Ce qui est prototypé et testé localement

- Réglage individuel des modules par le propriétaire, filtrage de navigation,
  gardes de certaines RPC et policies restrictives. Une garde SQL échoue si une
  fonction ciblée est absente ou a plusieurs surcharges, au lieu d'en choisir
  une silencieusement.
- Vues opérationnelles labo expurgées, y compris quantités de vente et ingrédients
  de recettes ; achats, transferts, traçabilité, recettes, devis, qualité et
  planning ont des parcours adaptés. Les données financières brutes restent
  interdites au labo dans le prototype ; la saisie de prix fixes reste possible.
- Le plan « Demain au labo » refuse une lecture incomplète, des recettes
  invalides/cycliques ou des conversions manquantes, et exige actuellement
  exactement un laboratoire et une boutique. Il ne s'agit pas d'un support
  multisite. Les commandes avec OF lié sont distinguées du besoin de vitrine.
- La création d'OF et le transfert signalent une mise à jour partielle des
  demandes de réassort si la seconde RPC échoue. Les deux opérations restent
  **non transactionnelles entre elles** ; un transfert n'a pas de clé
  d'idempotence et un résultat réseau incertain doit être vérifié avant retry.
- Export CSV brut refusé au labo ; sauvegarde réservée au propriétaire. Export
  et sauvegarde paginent, échouent si la limite est atteinte et vérifient les
  modules ; la sauvegarde refuse un fichier trop volumineux pour la restauration.
  Ce n'est pas un instantané transactionnel : des écritures simultanées peuvent
  changer les données pendant la pagination.

La suite locale comprend des tests PGlite de schémas simplifiés et des migrations
métier réelles, notamment pour l'isolation des tenants, les policies, certaines
RPC et l'expurgation JSON. Elle ne reproduit pas Auth ou PostgREST, ni tous les
parcours et combinaisons de modules. Le test complet injecte des correctifs de
bootstrap historiques : la migration 07 référence une ancienne signature dans
ses GRANT et la 09 attend une colonne `clotures.revision` absente du socle local.

## Risques et travail restant avant déploiement

1. Définir et tester les droits de chaque combinaison de modules, y compris
   tables partagées, lectures et écritures directes et toutes les RPC. Par
   exemple, désactiver Stocks ne retire pas encore toute lecture directe
   d'`articles` pour un propriétaire. Les gardes injectées doivent être
   comparées aux signatures et aux définitions de la base distante.
2. Auditer toutes les vues, champs JSON, réponses et erreurs SECURITY DEFINER,
   options et résultats financiers. Tester les ACL et les policies sous de vrais
   JWT et PostgREST : la RLS sur `articles` et `lots` peut affecter d'autres
   policies d'écriture. Les tests actuels ne prouvent pas l'absence de fuite.
3. Tester les parcours réels de bout en bout, le calcul privé, les erreurs et la
   pagination avec des données représentatives et deux tenants, ainsi que les
   échecs partiels et les demandes simultanées. Les étiquettes avec ingrédients
   sont temporairement désactivées au labo ; l'export CSV labo est aussi refusé.
4. La démo utilise le localStorage et ne fournit aucune frontière de
   confidentialité entre rôles. L'outil public d'estimation et l'impact de tous
   les modules sur les exports/restaurations restent à revoir.
5. Prévoir un déploiement coordonné avec retour arrière et tester les anciennes
   interfaces contre les migrations. La production tourne encore sur l'ancienne
   application, alors que 22 change la confirmation des devis : éviter de
   confirmer des devis sans la nouvelle interface d'association production.
   Sans 24, les règles Supabase permettent encore au labo de lire
   des informations financières : la confidentialité demandée n'est donc pas
   encore en place en production.

## Vérification du pilote et blocage des tests réels

Avant application de 23, Supabase indiquait que le projet pilote était actif et
que les services Auth, base de données et REST étaient sains. Les migrations
23 et 24 ne figuraient alors pas dans son historique. Une inspection en lecture seule a trouvé une
seule signature SECURITY DEFINER pour chacune des 28 RPC ciblées par 23, ainsi
que pour la restauration ; les quatre signatures des wrappers correspondent
aux signatures observées. Ceci ne teste ni les corps, ni les ACL, ni les accès
Auth/PostgREST.

À la demande de l'utilisateur, la migration `controle_modules_23` a ensuite été
appliquée au pilote (version `20261119045242`). La table et la RPC des modules,
la fonction interne de restauration et quatre gardes RPC ont été vérifiées en
lecture seule ; aucun réglage de module n'était présent. Aucun parcours par une
vraie session n'a été validé. L'utilisateur a choisi de laisser la migration 24
en attente pour préserver l'interface labo de production.

La création d'une branche de test a été refusée par Supabase : le service de
branches exige le forfait Pro ou supérieur (`entitlement_required`). Aucun
changement n'a été effectué sur le pilote et aucune tentative de contournement
n'a été faite. L'environnement de travail ne peut pas joindre directement les
hôtes Supabase pour ouvrir des sessions Auth ou appeler PostgREST ; le connecteur
actuel n'offre pas ces opérations de session. Une branche seule ne suffira donc
pas : il faudra aussi un environnement de test capable d'accéder à Auth et REST.

Utiliser une base de test isolée et des comptes authentifiés propriétaire, labo
et vendeur de deux clients différents. Ne pas effectuer d'essais d'écriture
destructifs sur les données du pilote. Après validation et déploiement
coordonné, contrôler à nouveau les flux et droits réellement publiés.
