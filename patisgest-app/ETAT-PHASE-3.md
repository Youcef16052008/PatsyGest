# Phase 3 — avancement : coûts et stock

Travail sur la branche de revue uniquement. Aucune migration n'a été appliquée au pilote et aucune donnée réelle n'a été réévaluée.

## FEFO : correction applicative proposée

Le tri TypeScript des coûts met désormais les lots non congelés avant les lots congelés, puis trie par DLC, réception et identifiant, comme la clause de la migration 21 examinée. Le test de parité `fefo-parite-db.test.mjs` exécute cette clause SQL sur des données fictives avec PGlite ; `fefo-cost.test.mjs` vérifie aussi le coût d'un exemple frais/congelé. La parité ne prouve pas que la définition SQL effective du pilote est identique à cette migration, ni que tous les filtres de simulation et de production sont équivalents.

Les requêtes de simulation limitées à 300 lots, le périmètre site et les lots au prix inconnu n'ont pas été corrigés ici. Le tri corrigé ne suffit donc pas à certifier les coûts ou le stock.

## OF partiel : défaut reproduit, pas encore corrigé

`of-cout-partiel-main.test.mjs` construit une base PGlite fictive avec la série 01–31 adaptée, puis appelle deux fois la RPC du dépôt pour un OF de 80 unités et 800 DA de matières. Les résultats calculés sont 20 DA/unité pour chaque lot et 1 600 DA au total, alors que l'hypothèse de répartition sur les unités prévues donnerait 10 DA/unité et 800 DA au total. Le sous-test de comportement attendu est explicitement **TODO non bloquant** : il révèle le problème sans prétendre que la CI le bloque. La formule du pilote a été observée en lecture seule ; le scénario n'a pas été exécuté sur le pilote.

Avant de proposer un correctif SQL et de lever le TODO, le propriétaire métier doit valider le traitement des quantités manquantes et des pertes : si 80 pièces ont consommé 800 DA et que seules 78 sont finalement produites, faut-il répartir les 800 DA sur les 78 pièces, affecter 780 DA aux pièces et constater 20 DA de perte, ou appliquer une autre règle ? Il faut aussi définir les arrondis et la main-d'œuvre, puis tester clôtures partielles, arrêt anticipé, reprise, annulation, coûts inconnus et droits. Les coûts historiques ne doivent pas être modifiés automatiquement.

Le projet ne prévoit pour l'instant aucune restauration réelle : elle a été reportée à la dernière étape. Cette décision ne valide pas un retour arrière ni ne rend une migration sur la base pilote sûre.
