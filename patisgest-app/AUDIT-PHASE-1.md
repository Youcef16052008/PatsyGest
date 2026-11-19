# Phase 1 — inventaire et écarts de sécurité

État relevé en lecture seule sur le pilote `evepzygucfxarpdnflzv` et le projet
Vercel `patsy-gest`. Aucun compte ou donnée pilote n'a été créé ni modifié pour
cet audit. Les constatations sont ponctuelles et doivent être vérifiées à
nouveau avant déploiement.

## État réel et risque de l'aperçu

- Pilote Supabase : projet actif, PostgreSQL 17 ; dernière migration recensée
  `20261119045242 controle_modules_23`. Les migrations locales 24–31 ne sont
  pas dans l'historique. La confidentialité labo de 24 n'est donc pas active.
- Vercel production : déploiement `dpl_5vaSEsFj7FBuoCjZjB2zGhsgR5C5`, commit
  `f11e371`, état READY. Le code de la branche n'est pas publié en production.
- **L'aperçu Vercel utilise la même URL Supabase que la production/pilote.**
  Ce n'est pas une base de test isolée. Les anciens déploiements d'aperçu
  existent encore : ne pas les utiliser avec des comptes ou données réels.
- Un garde-fou applicatif est ajouté sur la branche : les nouveaux builds Preview
  bloquent les routes métier et actions et le client serveur refuse toute
  connexion Supabase ; seul `/estimation` en GET/HEAD reste accessible. Le test
  HTTP `npm run test:preview` vérifie ce comportement. Il ne change pas les
  droits de l'API Supabase elle-même et ne protège pas rétroactivement les
  anciens aperçus. Sur l'aperçu du commit `74c9abb`, la lecture de `/connexion`
  a renvoyé le texte de blocage et `/estimation` le calculateur. Le service de
  lecture utilisé n'a pas fourni le code HTTP ; seuls les tests locaux vérifient
  le statut 503 et les POST. Ne pas utiliser d'anciens aperçus pour tester.
- La pile GitHub Actions isolée reste le seul environnement de tests métier
  utilisé ici : Supabase local éphémère, vraies sessions Auth et PostgREST,
  données factices, destruction en fin de job.

## Surface réelle du pilote

25 tables publiques recensées avec RLS activée. Cela **ne prouve pas** que les
policies ou RPC couvrent le périmètre demandé. Classification par colonnes :

| Portée disponible | Tables | Problème à résoudre |
| --- | --- | --- |
| `site_id` | `cakes`, `clotures`, `demandes_reassort`, `lots`, `mouvements`, `ordres_fabrication`, `ventes`, `z_imports` | Contrôler les accès, les liens et les RPC ; `cakes.site_id` peut être nul. |
| Deux sites | `transferts` | Contrôler départ **et** arrivée, objets liés et descendants. |
| Site par identifiant | `sites` | Seul le propriétaire gère la liste ; l'accès aux sites n'est pas encore restreint en production. |
| Pas de colonne de site | `articles`, `bons_commande`, `conversions`, `fournisseurs`, `historique_prix`, `nettoyages`, `non_conformites`, `parametres_couts`, `recette_familles`, `recette_versions`, `releve_temperatures`, `taches_planning` | Décider explicitement si la donnée est partagée ou doit être liée à un site ; ne pas déduire la portée d'un nom libre. |
| Identité/gestion | `clients`, `utilisateurs`, `acces_modules` | Isolation établissement, intégrité des rôles, révocation, modules et transition des comptes existants. |

34 RPC publiques `SECURITY DEFINER` exécutables par `authenticated` dans le
pilote, aucune par `anon` dans cet inventaire. Elles contournent normalement la
RLS de leurs tables : les fonctions internes, valeurs de retour et erreurs
nécessitent une analyse propre. Les prototypes 27–30 ajoutent d'autres fonctions
et ne reflètent pas encore la base pilote.

### Comparaison pilote et reconstruction à la migration 23

- Les 39 fonctions publiques ordinaires recensées (nom, arguments et
  `SECURITY DEFINER` ou non) ont la même empreinte de signatures. Leur corps
  diffère pour **sept fonctions** : `bloquer_lot`, `creer_cake`, `editer_cake`,
  `evoluer_cake`, `maj_non_conformite`, `rappel_lot` et `simuler_recette`.
  Une différence d'empreinte peut inclure du formatage ; sa portée doit être
  analysée avant toute migration. Les 32 autres définitions ont la même
  empreinte. Les signatures identiques ne prouvent pas le comportement.
- 70 policies réparties sur 24 tables ; `acces_modules` a RLS et aucune policy,
  aucun droit direct de lecture/écriture pour `authenticated` et `anon`. Les
  empreintes de noms, rôles, commandes et expressions correspondent sur 20 des
  24 tables. Les quatre restantes sont `nettoyages`, `non_conformites`,
  `releve_temperatures`, `taches_planning`. Pour la non-conformité, le pilote
  n'accepte à l'insertion que `ouverte`, la reconstruction accepte aussi
  `Ouverte` ; les autres écarts observés concernent les noms des policies
  d'écriture. Avant migration, comparer aussi droits, dépendances et comportements.
- Les droits SQL seuls ne sont pas les droits effectifs : de nombreuses tables
  ont des privilèges SQL larges pour `anon` et `authenticated`, et dépendent de
  RLS ; les tests doivent combiner ACL et policies et couvrir toutes les opérations.
- Aucune vue publique dans le pilote actuel. Les brouillons 24/28 ajoutent sept
  vues labo, dont quatre filtrées par site ; les trois autres concernent des
  données supposées communes, à décider explicitement en phase 2.
- Relevé agrégé du pilote : **3 cakes sur 3 sans site**, 13 lots et 2 OF avec
  site, aucune demande de réassort. Aucun rattachement automatique ne doit être
  déduit de ces chiffres ; préparer une attribution contrôlée et réversible.
- `tests/catalogue-local.mjs` calcule les empreintes de la reconstruction 01–23
  et `tests/audit-catalogue.sql` fournit des requêtes de catalogue en lecture
  seule. Résultat ponctuel : répéter l'inventaire avant le déploiement.

### Entrées applicatives

`tests/inventaire-surface.json` liste pages/routes et actions serveur, vérifiées
par test ; une extraction statique ne remplace pas l'analyse des appels
indirects ou SQL dynamiques. Les principaux chemins sont :

| Entrée | Surface à contrôler en phase 2 |
| --- | --- |
| `/`, `/connexion`, actions Auth | redirection, connexion, rafraîchissement et révocation des sessions |
| `/estimation` | calcul public indépendant, sans données du pilote |
| `/[module]`, tableau de bord, paramètres, mentions | gardes de rôle/module, lectures et vues ; filtrage DB obligatoire |
| `/api/export`, `/api/sauvegarde` | CSV selon RLS/modules ; dump complet propriétaire seulement |
| actions achats, stock, OF, caisse, journaux, rappel | RPC et écritures directes, sites et références liées |
| actions recettes, coûts, simulation | données communes et confidentialité labo, y compris JSON |
| actions établissement, modules, sites et restauration | propriétaire, contrôle des droits, sauvegarde et retour arrière |

La sauvegarde actuelle exclut les comptes Auth et ne comprend pas les accès
modules ni les nouvelles tables équipe/sites : elle n'est pas une restauration
complète du futur modèle et ne constitue pas une sauvegarde vérifiée avant
migration. Traiter format, ordre, dépendances et restauration avant production.

## Matrice de priorités pour la phase 2

| Surface | Constat / décision requise | État |
| --- | --- | --- |
| RLS sur sites et tables de site | Brouillon 28 filtre plusieurs tables ; comparer aux policies du pilote, références, imports et écritures. | Partiel, non déployé |
| Vues labo | Quatre vues filtrées en 28, mais les vues privilégiées et JSON doivent toutes être examinés, y compris indirectement. | Partiel, non déployé |
| RPC avec `p_site_id`, deux sites ou OF | 29 ajoute des gardes à 13 fonctions ; vérifier arguments, appels imbriqués et objets existants. `affecter_production_cake` vérifie le nouveau site, pas encore l'ancien devis. | Partiel, non déployé |
| Devis et CGV | `creer_cake`, `editer_cake`, `evoluer_cake`, `accepter_cgv`, `cake_liens_production` et les devis sans site exigent une politique explicite. | Bloquant |
| Réassort | Brouillon 31 contrôle chaque demande, les nouveaux et anciens liens OF/transfert et les deux sites du transfert ; masque les lignes avec liens hors périmètre. Il reste à tester les relations métier article/site, concurrence et UX. | Partiel, non déployé |
| Rappel et blocage | 30 refuse provisoirement aux employés sans accès à tous les sites, car la propagation et les réponses traversent les sites. | Limitation volontaire, non déployée |
| Achats, HACCP, planning sans site | `bons_commande`, `nettoyages`, `non_conformites`, `releve_temperatures`, `taches_planning` ne permettent pas une isolation par site sans choix de modèle ou restriction. | Bloquant |
| Comptes | Demandes/invitations préparées en 27, mais aucune approbation, activation ou révocation ; pas de transmission d'invitation. | Bloquant |
| Modules et exports | Des tables communes restent lisibles selon d'autres modules ; tester lectures indirectes, exports, sauvegardes et restaurations. | Bloquant |
| Migration et exploitation | Reconstitution vierge adaptée pour 07, 09 et helper DDL ; affectations des comptes existants et compatibilité ancienne application non résolues. | Bloquant |

## Contrôles reproductibles

- `tests/inventaire-rpc.json` classe les fonctions exposées du prototype ; le test
  `tests/schema-complet.test.mjs` échoue si une fonction `SECURITY DEFINER`
  accessible n'est pas inventoriée, si un nom est surchargé ou si `anon` y a
  accès. Il reconstruit le schéma sous PGlite avec adaptations historiques et
  **n'est pas** un audit de comportement ni une comparaison automatique au pilote.
- `npm run test:preview` vérifie les réponses HTTP d'un serveur Next local
  configuré en Preview sans URL pilote. `tests/preview-guard.test.mjs` teste
  aussi les décisions pures ; ce test ne suffit pas à prouver un déploiement Vercel.
- Le renouvellement d'une vraie session Auth expirée via le proxy Next et
  l'ouverture du tableau de bord ont été testés sur la pile jetable :
  https://github.com/Youcef16052008/PatsyGest/actions/runs/44512003490. Cela ne
  vérifie ni les cookies ni l'environnement de production Vercel.
- Le test d'inventaire des routes et actions signale tout nouveau point d'entrée
  détectable ; mettre à jour l'inventaire avec `node tests/inventaire-surface.mjs
  --update` après revue. Les vues labo sont également énumérées par test.

## Cas à réaliser avant la validation de phase 2

L'inventaire est terminé ; **la résolution et la démonstration de sécurité ne
le sont pas**. Tests à ajouter sur Auth/PostgREST isolés, avec succès sur site
attribué et refus pour autre site, autre établissement, compte non approuvé,
`anon` et module désactivé selon chaque opération :

1. Lecture et écriture de chaque table de site, y compris références liées,
   changement de site, ancien lien, absence de site et données historiques.
2. Devis : créer, affecter, éditer, CGV, paiements et transitions, y compris
   devis sans site et OF associé ; aucune divulgation via les listes ou erreurs.
3. Réassort : compléter 31 avec cohérence article/site, anciennes données,
   suppressions et mises à jour concurrentes, fonctions imbriquées et reprise
   après échec de la deuxième RPC.
4. Rappel/blocage : graphes de lots multi-sites, ventes, transferts, branches,
   profondeur et confidentialité des montants ; tester les limites de 30.
5. Achats, qualité et planning sans site : choix de modèle, données historiques,
   RLS directe, RPC, projections et restauration ; éviter tout accès implicite.
6. Toutes les vues et RPC de coût ou modules, y compris JSON imbriqué, exports,
   API directes, erreurs et droits SQL effectifs ; assurer les parcours autorisés.
7. Comptes et affectations : demande/invitation, refus/approbation/révocation,
   sessions déjà émises, intégrité inter-établissements et restauration.
8. Concurrence et déploiement : mutation simultanée des affectations et des
   objets, ancien/nouveau schéma, intégrité des données et rollback répété.
