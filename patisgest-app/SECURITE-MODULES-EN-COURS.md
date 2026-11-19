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
Le run https://github.com/Youcef16052008/PatsyGest/actions/runs/44506975615
est réussi : sessions fictives, deux clients, isolation inter-client, demandes
et invitations sans activation, plusieurs refus inter-sites sur les chemins
couverts, confidentialité labo, modules, achat, réception, recette, OF partiel,
rappel et vente vendeur ont été vérifiés par HTTP. Le rappel et le blocage sont
actuellement refusés à un employé qui n'a pas accès à tous les sites. Cette pile est détruite après chaque
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

La migration brouillon `27-equipe-fondations.sql` prépare les demandes, les
invitations et la table d'attribution des sites. Les demandes sont liées à
l'identité Auth et à une adresse vérifiée ; les invitations ne sont visibles
qu'au compte Auth portant cette adresse. **Aucune fonction d'approbation ou
d'activation n'existe encore**, et aucune invitation n'est envoyée par e-mail :
cette fondation n'est pas une fonctionnalité prête. La révocation complète d'un
employé reste aussi à réaliser. Un compte Auth sans ligne `utilisateurs` ne
constitue pas un accès à l'établissement, mais ce constat ne remplace pas une
procédure d'admission. Les RLS du pilote isolent
par client, pas par site ; de nombreuses RPC `SECURITY DEFINER` contournent les
policies. Le brouillon `28-sites-lecture-brouillon.sql` filtre les sites et
plusieurs tables directes ainsi que quatre vues labo dans l'environnement isolé.
Le brouillon `29-sites-rpc-brouillon.sql` ajoute une garde à certaines RPC qui
reçoivent un site ou un OF. Les autres RPC et les données sans site restent à
sécuriser : ces brouillons ne doivent pas être appliqués. Le brouillon 30
bloque de façon conservatrice rappel et blocage pour un employé qui n'a pas
accès à tous les sites, afin d'éviter les fuites et effets par propagation ;
le travail de filtrage fin des graphes et de l'interface reste à faire. Le
brouillon 31 vérifie les sites des demandes de réassort et de leurs références,
et masque les liens hors périmètre ; la cohérence métier et la concurrence
restent à valider. Il n'est pas appliqué non plus. Les écarts entre pilote et
reconstruction, dont sept corps de fonctions différents, sont recensés dans
`AUDIT-PHASE-1.md` et bloquent une mise en production non préparée.
Les brouillons 32–35 ajoutent des contrôles cake par site, une approbation
sans activation, un garde-fou sur les références idempotentes d'OF, et une
restriction conservatrice aux utilisateurs ayant tous les sites pour les
commandes et journaux sans site. Les anciens cakes sans site restent réservés
au propriétaire ; leur attribution exige une décision explicite. Les écrans
signalent les restrictions, et la création/édition des devis est réservée au
comptoir. Tests Auth/PostgREST sur pile jetable réussis pour ces chemins et
l'arrondi des OF à la version `33a03b8` (CI 44558358899) ; cela ne couvre pas
tous les chemins ni la compatibilité avec le pilote.

Le brouillon 36 prépare la modification atomique des affectations et la
révocation de membres existants, avec journal interne ; il n'active aucun
compte. La révocation retire l'adhésion mais pas le compte Auth et ne peut
interrompre une transaction déjà en cours sur un ancien snapshot. Elle doit
encore être confrontée au schéma pilote, aux clés étrangères et aux parcours
complets. L'export JSON de sauvegarde exclut les comptes, les droits et les
nouvelles données d'équipe : son interface le présente comme partiel et il ne
remplace pas une sauvegarde complète de la base et d'Auth.

Le brouillon 37 prépare une admission après approbation ou invitation : adresse
Auth vérifiée à l'acceptation, sites contrôlés, modules tous désactivés et
bascule d'admission fermée par défaut, inaccessible aux rôles applicatifs. La
bascule n'a été ouverte que dans la pile jetable pour les tests ; il ne faut pas
la déployer ou l'ouvrir sur le pilote avant certification. Les brouillons 38 et
39 empêchent les lectures brutes vendeur des coûts de lots, mouvements et OF,
et fournissent des vues réduites par site. L'export CSV brut est désormais
réservé au propriétaire. La CI 44588935236 teste ces chemins sur pile jetable ;
les autres surfaces vendeur et les parcours bout en bout restent à examiner.
Le brouillon 40 limite les sections du rappel selon le rôle et les modules ;
les ventes sont masquées au labo et aux vendeurs sans caisse, les ordres sans
production ni planning, et les transferts sans leur module. L'interface signale
un rapport incomplet plutôt que de présenter une section masquée comme vide.
La restriction conservatrice exige toujours tous les sites. La conformité de
la fonction historique du pilote reste à vérifier avant tout déploiement.

Les brouillons 41–42 et les interfaces expérimentales permettent au propriétaire
de gérer demandes et invitations et au candidat vérifié de leur répondre.
Aucun courrier n'est envoyé ; l'admission en base reste fermée par défaut et
les modules sont désactivés à l'admission. Les interfaces ne sont accessibles
qu'avec l'opt-in `PATSYGEST_EQUIPE_EXPERIMENTAL=true`, en développement, hors
Vercel, et avec une URL Supabase locale sur le port 54321. Cette restriction
ne remplace pas la sécurité SQL ; n'utiliser qu'une pile jetable. L'interface
d'affectation des membres et les vérifications de bout en bout restent à faire.

Certaines vues labo sont exécutées avec les droits de leur propriétaire, et
des tables n'ont pas de colonne site. Il serait dangereux de
présenter un filtrage d'interface comme une isolation effective.

Avant activation : concevoir la vérification d'adresse et le cycle de demande,
invitation, approbation/refus et révocation ; assurer que seuls les propriétaires
du même client attribuent des sites ; migrer explicitement les comptes existants
sans rupture ni élargissement silencieux ; contrôler les RLS, les vues et toutes
les RPC sur les données et opérations de chaque site (transferts entre deux sites,
ventes, lots, OF, rappels, demandes, commandes et exports compris). Ajouter des
cas Auth/PostgREST adversariaux avec deux boutiques et plusieurs utilisateurs,
et traiter les données sans site. Le plan de prévision reste limité à un labo
et une boutique. Le brouillon 33 enregistre une décision d'approbation avec
sites vérifiés, mais n'active aucun compte ni ne crée d'adhésion : c'est une
étape préparatoire, pas un parcours d'admission utilisable.

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
