# Phase 3 — avancement : coûts et stock

Travail sur la branche de revue uniquement. Aucune migration n'a été appliquée au pilote et aucune donnée réelle n'a été réévaluée.

## FEFO : correction applicative proposée

Le tri TypeScript des coûts met désormais les lots non congelés avant les lots congelés, puis trie par DLC, réception et identifiant, comme la clause de la migration 21 examinée. Le test de parité `fefo-parite-db.test.mjs` exécute cette clause SQL sur des données fictives avec PGlite ; `fefo-cost.test.mjs` vérifie aussi le coût d'un exemple frais/congelé. La parité ne prouve pas que la définition SQL effective du pilote est identique à cette migration, ni que tous les filtres de simulation et de production sont équivalents.

Les requêtes de simulation limitées à 300 lots, le périmètre site et les lots au prix inconnu n'ont pas été corrigés ici. Le tri corrigé ne suffit donc pas à certifier les coûts ou le stock.

## OF partiel : défaut reproduit, pas encore corrigé

`of-cout-partiel-main.test.mjs` construit une base PGlite fictive avec la série 01–31 adaptée, puis appelle deux fois la RPC du dépôt pour un OF de 80 unités et 800 DA de matières. Les résultats calculés sont 20 DA/unité pour chaque lot et 1 600 DA au total, alors que l'hypothèse de répartition sur les unités prévues donnerait 10 DA/unité et 800 DA au total. Le sous-test de comportement attendu est explicitement **TODO non bloquant** : il révèle le problème sans prétendre que la CI le bloque. La formule du pilote a été observée en lecture seule ; le scénario n'a pas été exécuté sur le pilote.

**Décision du propriétaire :** pour 80 pièces prévues et 800 DA de matières consommées, si 78 pièces sont finalement produites, affecter 780 DA aux pièces et constater séparément 20 DA de perte. Cette décision ne signifie pas que l'application sait encore enregistrer cette perte.

`of-cout-partiel-brouillon.test.mjs` exerce les brouillons 101/102 sur une base fictive : 40 + 40 produit bien 800 DA de matières affectées, et 78 pièces produisent 780 DA. Mais l'OF reste `partiel` et les 20 DA ne sont pas enregistrés comme perte : **102 seul ne satisfait donc pas la décision métier** et ne doit pas être déployé tel quel.

Une proposition strictement expérimentale `migrations/propositions/cloture-of-perte-experimentale.sql` ajoute une clôture anticipée avec motif, auteur et perte de matière séparée. Elle exige la présence du brouillon 102, verrouille l'OF, réserve l'opération au propriétaire, respecte le contrôle du module et refuse les matières sans prix connu. Des essais PGlite avec données fictives couvrent 78/80, rejeu, motif différent, accès étranger/labo/anon, module désactivé et prix inconnu. **Elle ne fait pas partie du manifeste de déploiement ; aucune migration n'a été appliquée au pilote.**

Cette proposition ne valide pas la main-d'œuvre, les frais, les règles de correction ou d'annulation, les arrondis multi-lots, la concurrence PostgREST, ni les coûts historiques (éventuellement déjà erronés). Elle ne fournit pas d'interface ; des erreurs de saisie ne sont pas encore corrigeables. Une revue métier et sécurité, une séquence de migration et un retour arrière éprouvés restent indispensables avant toute livraison. Les coûts historiques ne doivent pas être modifiés automatiquement.

Le projet ne prévoit pour l'instant aucune restauration réelle : elle a été reportée à la dernière étape. Cette décision ne valide pas un retour arrière ni ne rend une migration sur la base pilote sûre.
