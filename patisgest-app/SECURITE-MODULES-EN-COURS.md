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
métier réelles. Une suite complémentaire utilise une pile Supabase CLI jetable
avec les véritables services Auth et PostgREST sur un runner GitHub Actions :
`.github/workflows/supabase-isole.yml` et `tests/integration/auth-postgrest.mjs`.
Le résultat du run https://github.com/Youcef16052008/PatsyGest/actions/runs/44488174691
est réussi : quatre sessions fictives, deux clients, isolation des données,
confidentialité labo, modules, achat, réception, recette, OF partiel, rappel et
vente vendeur ont été vérifiés par HTTP. Cette pile est détruite après chaque
run et ne se connecte pas au pilote ; le script refuse les hôtes non locaux et
une base métier non vierge. Aucune donnée réelle n'y est copiée.

Ce test n'est pas exhaustif : il ne couvre ni toutes les combinaisons de modules,
ni tous les parcours UI, erreurs, exports, courses ou compatibilités avec la
production. Il reconstruit le schéma avec trois adaptations de bootstrap : une
fonction DDL présente sur le pilote mais absente localement, l'ancienne signature
référencée par la migration 07 et la colonne `clotures.revision` attendue par 09.
Il ne démontre donc pas que les migrations historiques sont rejouables telles
quelles sur une base vierge, ni que le schéma du pilote est identique.

## Sites et accès du personnel — nouvelle demande

Le propriétaire souhaite créer et modifier plusieurs boutiques et laboratoires,
inviter ses employés ou approuver leurs demandes, et attribuer à chaque compte
labo ou vendeur un ou plusieurs sites. Les vendeurs ont des comptes individuels,
sans gestion séparée de caisses physiques. Une interface de gestion des sites
et la migration brouillon `26-gestion-sites.sql` sont préparées : elles ne sont
pas déployées ; 26 réserve l'écriture des sites au propriétaire, mais **ne
restreint pas les employés aux sites qui leur seraient attribués**.

Il n'existe actuellement ni système d'invitation/demande et approbation, ni
attribution des sites, ni révocation complète d'un employé. Un compte Auth sans
ligne `utilisateurs` ne constitue pas un accès à l'établissement, mais ce
constat ne remplace pas une procédure d'admission. Les RLS actuelles isolent
par client, pas par site ; de nombreuses RPC `SECURITY DEFINER` contournent les
policies. Certaines vues labo sont elles aussi exécutées avec les droits de leur
propriétaire, et des tables n'ont pas de colonne site. Il serait dangereux de
présenter un filtrage d'interface comme une isolation effective.

Avant activation : concevoir la vérification d'adresse et le cycle de demande,
invitation, approbation/refus et révocation ; assurer que seuls les propriétaires
du même client attribuent des sites ; migrer explicitement les comptes existants
sans rupture ni élargissement silencieux ; contrôler les RLS, les vues et toutes
les RPC sur les données et opérations de chaque site (transferts entre deux sites,
ventes, lots, OF, rappels, demandes, commandes et exports compris). Ajouter des
cas Auth/PostgREST adversariaux avec deux boutiques et plusieurs utilisateurs,
et traiter les données sans site. Le plan de prévision reste limité à un labo
et une boutique. Aucune approbation n'est implémentée tant que son attribution
de site ne peut pas être réellement appliquée.

## Risques et travail restant avant déploiement

- Un défaut de valorisation a été confirmé dans `terminer_of` : lorsque la
  fabrication est réceptionnée en plusieurs lots, le coût des matières peut
  être imputé plusieurs fois. La migration locale `25-cout-of-partiel.sql`,
  prévue après 24, répartit le coût sur la quantité prévue et un test PGlite
  couvre deux lots ; elle n'est pas appliquée. Un contrôle en lecture seule du
  pilote n'a trouvé aucun OF partiel ni aucun OF avec plusieurs lots produits.
  Il ne constitue pas une validation des parcours réels ni des historiques
  extérieurs au pilote.
- Next.js et son outil ESLint ont été mis à jour en 16.4.6. `npm audit
  --omit=dev` ne signale plus de vulnérabilité ; quatre alertes modérées restent
  dans les dépendances de développement liées à `drizzle-kit`, et la solution
  automatique proposée par npm impose un changement majeur à examiner.

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
vraie session n'a été validé sur le pilote ; les tests Auth/PostgREST ultérieurs
ont utilisé exclusivement la pile jetable décrite plus haut. La migration 24
reste en attente pour préserver l'interface labo de production.

La création d'une branche de test a été refusée par Supabase : le service de
branches exige le forfait Pro ou supérieur (`entitlement_required`). Cette
tentative n'a rien changé sur le pilote et n'a pas été contournée. Le sandbox
ne peut pas joindre directement les hôtes Supabase ni lancer Docker ; la pile
CLI jetable exécutée sur GitHub Actions fournit l'environnement isolé nécessaire,
sans créer de projet distant supplémentaire.

Poursuivre les essais dans cette base isolée, jamais par écrit sur les données
du pilote. Après validation et déploiement coordonné, contrôler à nouveau les
flux et droits réellement publiés.
