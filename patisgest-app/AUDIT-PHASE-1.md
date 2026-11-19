# Phase 1 — inventaire et écarts de sécurité

État relevé en lecture seule sur le pilote `evepzygucfxarpdnflzv` et le projet
Vercel `patsy-gest`. Aucun compte ou donnée pilote n'a été créé ni modifié pour
cet audit. Les constatations sont ponctuelles et doivent être vérifiées à
nouveau avant déploiement.

## État réel et risque de l'aperçu

- Pilote Supabase : projet actif, PostgreSQL 17 ; dernière migration recensée
  `20261119045242 controle_modules_23`. Les migrations locales 24–30 ne sont
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
  anciens aperçus. Il faut encore vérifier le nouveau déploiement Vercel après
  son apparition, sans utiliser de compte réel.
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

## Matrice de priorités pour la phase 2

| Surface | Constat / décision requise | État |
| --- | --- | --- |
| RLS sur sites et tables de site | Brouillon 28 filtre plusieurs tables ; comparer aux policies du pilote, références, imports et écritures. | Partiel, non déployé |
| Vues labo | Quatre vues filtrées en 28, mais les vues privilégiées et JSON doivent toutes être examinés, y compris indirectement. | Partiel, non déployé |
| RPC avec `p_site_id`, deux sites ou OF | 29 ajoute des gardes à 13 fonctions ; vérifier arguments, appels imbriqués et objets existants. `affecter_production_cake` vérifie le nouveau site, pas encore l'ancien devis. | Partiel, non déployé |
| Devis et CGV | `creer_cake`, `editer_cake`, `evoluer_cake`, `accepter_cgv`, `cake_liens_production` et les devis sans site exigent une politique explicite. | Bloquant |
| Réassort | `traiter_demandes_reassort` accepte des identifiants et liens d'OF/transfert ; le contrôle par site doit s'appliquer à toutes les références. | Bloquant |
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
- Dernière validation Auth/PostgREST isolée avant cet audit :
  https://github.com/Youcef16052008/PatsyGest/actions/runs/44506975615.
- Le déplacement vers `src/proxy.ts` conserve le code de rafraîchissement de
  session, mais le rend effectivement actif. Le smoke local valide notamment
  les redirections et la démo, pas le rafraîchissement d'une vraie session Auth
  de production. Un test de session Auth réelle isolée via l'application est
  nécessaire avant déploiement.
- À compléter avant de clore la phase 1 : comparer systématiquement les
  signatures et policies du pilote aux hypothèses du prototype, inventorier
  les vues et les routes applicatives, et convertir chaque risque bloquant en
  cas positif et négatif vérifiable dans la pile isolée.
