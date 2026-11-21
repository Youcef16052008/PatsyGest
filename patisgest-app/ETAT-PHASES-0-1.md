# Phases 0 et 1 — état et consignes

Référence du dépôt avant changements : `2fba72c78e643ac4cb1b484cb26b0efaa38cdeff`. Observations en lecture seule effectuées le 20 novembre 2026 ; elles peuvent devenir périmées. Ce document ne constitue ni une autorisation de déploiement ni une certification de récupération.

## Phase 0 — stabilisation et inventaire

### Fait

- Le README racine précise que le prototype HTML et son enveloppe Electron ne sont destinés qu'à des données fictives. Les instructions historiques d'application des migrations du README applicatif ont été marquées comme telles. Les guides historiques peuvent encore contenir d'anciennes instructions : ne pas les suivre sans réconciliation.
- Le projet Supabase correspondant au pilote mentionné dans les documents du dépôt est visible et son état déclaré est `ACTIVE_HEALTHY`. À l'instant de la vérification, les services DB, Auth, REST et Storage se déclaraient sains. **Une sonde de santé ne prouve ni la sécurité ni la disponibilité d'une sauvegarde.**
- L'historique renvoyé par Supabase contient notamment les migrations nommées 23 et 25–31, puis `garde_prix_vitrine_rattrapage_32` (version `20261120194955`). Cette dernière ne figure pas dans la série SQL de ce commit : le pilote et le dépôt ne sont donc pas strictement alignés. L'absence d'une entrée nommée 24 dans cette liste ne prouve pas que ses index sont absents : des modifications peuvent avoir été exécutées hors historique. Les brouillons 101–128 n'apparaissent pas sous ces noms dans l'historique interrogé ; cela ne prouve pas qu'aucun élément équivalent n'a été appliqué autrement.
- Le catalogue interrogé en lecture seule indique un fuseau **de la session de cette requête** `UTC`, aucun bucket et aucun objet Storage à cet instant, aucune table ordinaire/partitionnée du schéma `public` sans RLS et aucune fonction `SECURITY DEFINER` publique dépourvue d'un réglage `search_path`. Ce sont des contrôles limités : ils ne démontrent ni la sûreté des policies ni la couverture des sauvegardes, et le fuseau effectif des autres sessions doit être vérifié.
- La définition effective de `terminer_of` contient `v_known / p_qte`. La fonction interne de restauration contient une gestion `unique_violation` ; sa fonction publique est un wrapper. Les effets et gardes additionnels doivent être testés avant de conclure à un scénario complet.
- La fonction de commande effectivement installée sélectionne `s.id, s.client_id, s.subdomain` avant de lire `v_site.subdomain`. **Le défaut de champ absent constaté dans le fichier 27 de ce commit ne peut donc pas être attribué tel quel à cette définition du pilote.** Aucun appel de commande réel n'a été effectué ; sa fonctionnalité globale reste à tester en environnement isolé.
- Pour `sites`, les policies nommées `sites_insert_staff`, `sites_select_client`, `sites_update_staff` sont présentes et le rôle `authenticated` dispose d'un privilège UPDATE sur la table. Les expressions effectives d'insertion et d'UPDATE incluent propriétaire **et** labo du même client ; aucun trigger utilisateur sur `sites` n'a été trouvé lors du contrôle. Cela indique un risque d'écriture directe sur les champs de publication ; le résultat d'un PATCH avec JWT réel et tous les invariants doit encore être reproduit sur une pile isolée.
- GitHub indique que le dépôt est public. La consultation des métadonnées GitHub Actions n'a retourné **aucun run du workflow de sauvegarde ni aucun artefact** au moment de la requête. Cela ne prouve pas l'absence d'autres copies ou l'existence d'une sauvegarde récupérable. La lecture des protections de branche a échoué avec HTTP 403 ; leur état est donc inconnu.

Aucune migration, modification de données/configuration, export de données, sauvegarde ou restauration n'a été lancée sur le pilote. Aucun secret ni donnée métier n'a été écrit dans ce document.

### Restant — blocages avant fin de phase 0

1. **Propriétaire produit :** confirmer quelles fonctions sont utilisées au pilote (vitrine, OF partiels, caisse/OF hors ligne et prototype) ; décider des suspensions ou procédures manuelles. Un avertissement dans le dépôt ne désactive pas un produit déjà déployé.
2. **Responsable DB et sécurité :** inventorier les définitions, policies, GRANT, vues, extensions, stockage et paramètres effectifs ; comparer à tous les SQL pertinents et documenter la migration 32. Ne pas déduire l'équivalence depuis l'historique seul.
3. **Exploitation :** inventorier les sauvegardes et copies privées, accès, rétention, couverture et date de la dernière restauration réussie ; fixer RPO/RTO et responsable des alertes. Un dump SQL, l'export JSON et un nombre de buckets nul ne constituent pas un PRA complet.
4. **DB/exploitation :** disposer d'un environnement réellement isolé et représentatif et répéter une restauration de la sauvegarde réelle sans exposer données ou secrets. Le dossier `migrations/ETAT-RESTAURATION.md` décrit les limites connues ; la création d'une branche Supabase avait été refusée par le plan. Ne pas contourner cette restriction en créant un autre projet.
5. **Propriétaire :** nommer les responsables et approuver les mesures compensatoires. Tant que ces points sont ouverts, pas de migration de production ni de GO commercial.

## Phase 1 — CI et reproductibilité

Le workflow `.github/workflows/ci.yml` se déclenche sur les pull requests, les pushs sur `main` et manuellement. Il exécute sur Node 22 : installation verrouillée, typecheck, lint, suite applicative incluant PGlite, build avec variables Supabase fictives, tests du design studio, puis deux jobs Auth/PostgREST sur piles Supabase CLI **locales et jetables** avec données fictives. Aucun secret de production n'est fourni. Les tests d'intégration vérifient eux-mêmes l'hôte, les ports, le marqueur jetable et une base vierge.

**Limites importantes :** les tests d'intégration Supabase et la plupart des tests PGlite utilisent le manifeste de répétition `migrations/repetition.json` : historique adapté puis brouillons 101–128, avec les fixtures 25–31 dans la variante vitrine ; cette reconstruction n'inclut pas l'index 24. Un test PGlite distinct (`serie-main-vitrine-db.test.mjs`) exerce désormais aussi les fichiers 01–31, index 24 compris, sans les brouillons, avec deux adaptations historiques. Il vérifie les privilèges anonymes et une requête refusée ; il ne prouve pas que les commandes valides fonctionnent.

Une commande valide est également testée dans `serie-main-vitrine-commande.test.mjs`, mais marquée **TODO non bloquant** : sur les fichiers du dépôt elle échoue actuellement avec `record "v_site" has no field "subdomain"`. La définition observée sur le pilote est différente. Après réconciliation et correction validée, retirer le marqueur TODO afin que le test devienne bloquant. Aucun de ces environnements ne correspond automatiquement au catalogue pilote ni ne valide un ordre de déploiement ; ils ne testent pas tous les défauts métier recensés. La restauration brute expérimentale connue pour échouer n'est pas intégrée comme gate verte ; le workflow séparé `supabase-isole.yml` reste une expérimentation et ses conclusions sont décrites dans `migrations/ETAT-RESTAURATION.md`.

La CI doit encore être exécutée sur GitHub. L'environnement local de cette analyse ne dispose pas de Docker ni de Supabase CLI : les deux jobs d'intégration réels ne peuvent pas y être certifiés. Les tests locaux et résultats de revue sont consignés dans la réponse de livraison. La configuration de protection de `main` n'est pas accessible avec l'intégration GitHub actuelle ; un administrateur doit, après validation d'une exécution PR, rendre obligatoires les checks `Application · tests, types, lint et build` et `Auth et PostgREST isolés · historique` / `vitrine`, exiger une revue des SQL sécurité, et vérifier qu'une PR volontairement cassée est effectivement bloquée. Ne pas considérer la protection comme active avant cette vérification.

Pour exécuter localement les contrôles applicatifs :

```sh
cd patisgest-app
npm ci
npm run typecheck
npm run lint
npm test
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:65531 NEXT_PUBLIC_SUPABASE_ANON_KEY=test npm run build
cd ..
node --test design-studio/tests/*.test.mjs
```

Ne pas utiliser ces variables fictives dans un déploiement. La répétition Supabase CLI doit rester sur une pile locale jetable ; elle peut détruire ses données de test et ne doit jamais viser le pilote.
