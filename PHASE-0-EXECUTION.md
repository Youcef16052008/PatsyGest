# Phase 0 — état de sûreté et inventaire en lecture seule

**Date : 21 novembre 2026 (UTC)** · **Dépôt :** `Youcef16052008/PatsyGest` · **Branche de travail :** `arena/d51c48b6-patsygest` · **Périmètre :** état des environnements, code et historique de migrations, catalogue Supabase et points de divergence. Ce compte rendu ne vaut ni approbation de migration, ni certification de sécurité, ni GO commercial.

## Conclusion exécutive

L’inventaire read-only a été réalisé et relu. La production Vercel est déclarée `READY` et `PROMOTED`; le projet Supabase qui lui est associé est déclaré sain. Cela n’établit ni que le pilote est sûr, ni que les données sont sauvegardées/récupérables, ni que chaque Preview est isolée.

Une divergence majeure est constatée entre les trois références : la branche de travail (`2fba72c`), le `origin/main` actuel (`2856ac7`) et le catalogue Supabase opérationnel. Certaines corrections présentées dans les revues n’existent que dans `main` ou directement sur le pilote. Les défauts SQL/capacités relevés dans le pilote restent présents. La phase suivante ne doit pas appliquer de SQL avant réconciliation des migrations et examen des chemins d’accès concernés.

**Aucune migration, requête d’écriture, fonction métier, restauration, export de données, modification Vercel/Supabase ou déploiement n’a été déclenché.** Les requêtes adressées à Supabase étaient limitées aux catalogues, ACL, politiques, contraintes, définitions et métadonnées. Aucun secret, ligne métier ou résultat contenant des données client n’est recopié ici.

## Identité Git et déploiements

- Branche active confirmée : `arena/d51c48b6-patsygest`; HEAD : `2fba72c78e643ac4cb1b484cb26b0efaa38cdeff`.
- Après récupération des références distantes (sans changement de branche), `origin/main` est `2856ac75d1d099b0dfccf490f1261fcd84a4e021`.
- Le diff ciblé montre que ces commits sont distincts : `src/lib/csv.ts` et `src/lib/domaines.ts` ont changé dans `main`. Les sources `pos-cart.ts`, `api/export/route.ts`, `api/sauvegarde/route.ts`, `actions-caisse.ts` et la migration SQL 27 sont identiques entre HEAD et `origin/main`.
- Vercel : projet `patsy-gest`, racine `patisgest-app`, production liée à `main`. Métadonnées du déploiement de production interrogé : `READY` / `PROMOTED`, commit `2856ac75d1d099b0dfccf490f1261fcd84a4e021` (exactement le `origin/main` récupéré). La preview interrogée est `READY` / `STAGED`, commit `29bdec835cf7c02ee1de213d17c0799eb7b0be1e`, branche `arena/a62eecd2-patsygest`, non la branche active de cette session. Les environnements du projet Vercel renvoient vers le même projet Supabase. Ce lien signifie que la configuration de Preview n’est pas un environnement de données isolé; aucune requête n’a été envoyée par le navigateur vers les déploiements.
- Le `git status` avant rédaction contenait déjà `ANALYSE-REVUES-AGENTS.md` non suivi. Cette analyse est un livrable antérieur; ne pas la confondre avec du code produit.

## Santé et inventaire Supabase

Projet `evepzygucfxarpdnflzv`, région `eu-west-1`, état `ACTIVE_HEALTHY`. Les sondes de service indiquaient Auth, DB, REST et Storage sains. Ces sondes n’attestent pas la disponibilité d’une sauvegarde ou d’une reprise. L’historique interrogé expose 18 migrations et se termine par `20261120194955_garde_prix_vitrine_rattrapage_32`.

Lecture du catalogue `public` au moment de la requête :

| Élément | Observation | Portée / interprétation |
|---|---:|---|
| Tables publiques | 27 | Toutes ont RLS activé; aucune n’a `FORCE ROW LEVEL SECURITY`. RLS activé ne prouve pas que les politiques sont correctes. |
| Politiques RLS | 72 | Le nombre ne valide ni les expressions ni les scénarios d’accès. |
| Vues publiques | 1 | `vitrine_catalogue`; définie avec `security_invoker=false`. |
| ACL de la vue | `anon` a SELECT sur `vitrine_catalogue`; `anon` n’a pas SELECT direct sur `clients`, `articles` ou `recette_familles`. | La vue est donc un chemin d’exposition distinct de l’accès direct à ces tables. Son existence/configuration est confirmée; aucune ligne n’a été lue pour mesurer l’exposition réelle. |
| Fonctions publiques `SECURITY DEFINER` | 44 | Seule `patisgest_demander_commande` est accordée à `anon` parmi les fonctions de cette catégorie. La liste n’est pas à elle seule une preuve d’exploitabilité. |
| Storage | Aucune donnée d’objet retournée par la sonde antérieure | État ponctuel seulement, pas une preuve de couverture de sauvegarde. |
| Migration distante la plus récente | version 32 (`20261120194955`) | Aucun fichier source suivi correspondant au numéro/nom 32 n’a été trouvé dans ce checkout; les SQL numérotés suivis visibles vont jusqu’à 31. À résoudre avec l’historique/les empreintes avant toute migration. |

### Vérifications ciblées, toujours sans écriture

- La définition de `vitrine_catalogue` joint notamment les recettes publiées/visibles, les clients, les sites publiés et les articles; elle inclut des données de prix et les domaines/sous-domaines de boutique. L’ACL rend cette vue lisible par `anon`, alors que les tables sous-jacentes ne sont pas directement lisibles par `anon`. `security_invoker=false` signifie que la RLS des appelants ne s’applique pas comme une vue invoker; il faut analyser la définition complète et le filtrage avant de caractériser précisément chaque donnée accessible.
- `sites` accorde UPDATE à `authenticated`. Sa politique effective `sites_update_staff` autorise propriétaire et labo du même client. Aucun trigger utilisateur sur `sites` n’a été trouvé. Le chemin d’écriture directe vers des champs de publication/domaines est donc à traiter comme une capacité effective au niveau SQL; aucun PATCH n’a été envoyé.
- `clients.offre` est modifiable par privilège SQL pour `authenticated`, avec une policy d’UPDATE réservée au propriétaire. Cela confirme le contrôle de ligne annoncé, mais ne constitue pas une séparation d’autorité côté serveur contre un propriétaire authentifié. Aucun UPDATE n’a été exécuté.
- `patisgest_restaurer_sauvegarde_interne(jsonb)` est `SECURITY DEFINER`, contrôle que l’utilisateur est propriétaire et que le `client_id` du dump correspond au sien, mais son code n’a pas de garde générique assurant que chaque FK référence le même tenant. Il capture `unique_violation` autour de l’insertion entière d’une table. `recette_familles.produit_id` référence `articles.id` seul, sans clé composite incluant `client_id`. Ceci justifie un audit de restauration/relations inter-tenant, pas un test sur le pilote. Le wrapper public est distinct; aucune routine de restauration n’a été appelée.
- La fonction installée de commande publique sélectionne `s.id, s.client_id, s.subdomain`, contrairement au fichier local `27-commandes-vitrine.sql` qui sélectionne `s.nom` avant de lire `v_site.subdomain`. Le défaut « record has no field subdomain » n’est donc pas présent dans cette définition live, mais la reconstruction SQL du dépôt reste en divergence. La fonction contient aussi une limite de 30 demandes par établissement sur une heure, sensible à des requêtes simultanées; aucune commande n’a été créée.

## Comparaison revue ↔ code de la branche ↔ production

Le rapport initial portait sur le code à `2fba72c`. Cette phase empêche d’assimiler automatiquement ce code à celui de production :

1. **CSV imbriqué (R1)** : corrigé dans `origin/main` (sérialisation JSON des tableaux/objets) et dans la version de production associée à `main`; non corrigé dans la branche de travail. Ne pas fusionner la branche sans réconcilier ce retard.
2. **Commande vitrine (D3)** : correction `s.subdomain` constatée dans la fonction installée, absente du SQL 27 de la branche et de `origin/main`. L’application depuis une reconstruction locale demeure donc susceptible de restaurer le défaut.
3. **Vue vitrine (D2), écriture directe `sites` (D4), restauration/relations (D6/D7), capacité `offre` (D9)** : les métadonnées et définitions live confirment des chemins d’accès à examiner. Leur exploitabilité complète n’a pas été exercée et aucune donnée n’a été extraite.
4. **R2 (arrondis POS), R4/R4b (plafonds d’export/sauvegarde), R5 (dates UTC)** : les fichiers ciblés de la branche sont identiques à `origin/main`; leurs chemins restent à corriger et sont dans le périmètre du code `main` utilisé pour la production. Cela n’est pas une mesure de pertes ou d’incidents réels.
5. **Sécurité des fonctions** : décompte et ACL consignés ci-dessus; chaque définition `SECURITY DEFINER`, sa signature, appelant, `search_path`, droits et contexte doit être revue séparément avant toute modification.

## Migrations, reprise et contrôles qui restent ouverts

- Le dépôt a une divergence de version/historique : Supabase liste 32 comme dernière migration, alors qu’aucun fichier suivi 32 n’est présent ici. Les documents de restauration précisent également que l’index 24 et certaines modifications historiques peuvent différer; les fichiers 101–128 sont des brouillons non approuvés. **Ne pas appliquer 101–128, ne pas tenter de rattrapage automatique, ne pas utiliser `db push`.** Obtenir le SQL exact et son empreinte auprès de la source d’autorité et comparer chaque migration à l’état effectif avant d’établir un ordre.
- Le projet n’a pas fourni ici de preuve de sauvegarde restaurable récente, de couverture des rôles/ACL, Auth, paramètres ou Storage, ni de restauration représentative du pilote. Les documents existants signalent des limites sur la restauration réelle et le dump brut. Cette phase ne modifie pas la décision antérieure de reporter la restauration au dernier jalon; ce report est un blocage, pas une validation.
- Les fonctions vitrine/commandes sont opérationnelles au niveau DB d’après le catalogue et l’ACL, mais leur usage commercial actif n’est pas confirmé. Décision produit et mesures de suspension/atténuation à faire valider par le propriétaire.
- Pas de comparaison du contenu métier, pas d’appel anonyme réel, pas de test HTTP, pas de test de performance/concurrence, pas d’analyse d’incident, pas d’inventaire complet des secrets ou rôles globaux. La liste Vercel des previews était tronquée et n’est pas un inventaire exhaustif.

## Auto-revue du livrable

- [x] Référence de la branche, HEAD et `origin/main` identifiés et distingués.
- [x] Les informations d’environnement sensibles ne sont pas recopiées; ni valeurs de secrets, ni identifiants de lignes, ni contenu client.
- [x] Les constatations d’ACL/fonctions sont formulées comme preuves de configuration/code, sans prétendre avoir démontré l’exfiltration ou l’exploitabilité en appelant les fonctions.
- [x] La différence entre code de branche, `main` et définitions installées est explicitée; la correction locale de commande n’est pas considérée comme un correctif source.
- [x] Les limites et les actions non exécutées sont visibles; aucune phase applicative/SQL n’a été engagée.
- [x] Le statut de migration 32 est borné à l’absence de source suivie trouvée dans le checkout, pas à une affirmation sur tous les systèmes de stockage possibles.
- [ ] L’inventaire des sauvegardes/reprises, revue exhaustive des 44 fonctions, propriétaire des risques et décision concernant l’usage pilote restent à obtenir; ces éléments ne peuvent être conclus de ce snapshot read-only.

### Décision de sortie de phase

**Phase 0 — inventaire technique exécuté et documenté; phase 0 de gouvernance/exploitation non entièrement levée.** Garder un **NO-GO pour toute migration de production et pour le GO commercial** tant que les divergences SQL, l’accès à la vue et aux champs `sites`/`offre`, la reprise restaurable, les rôles/responsabilités et les usages pilote ne sont pas tranchés. Prochaine étape recommandée : validation par responsables produit/DB/exploitation de ce relevé, puis préparer une matrice de migration et des tests isolés sur données synthétiques; pas de modification du pilote.

## Traçabilité

- Analyse des revues et plan amont : [`ANALYSE-REVUES-AGENTS.md`](ANALYSE-REVUES-AGENTS.md).
- État préexistant des phases 0–1 : `patisgest-app/ETAT-PHASES-0-1.md` (référence documentée dans `origin/main`; ne remplace pas l’observation datée de ce rapport).
- Limites de restauration et essais isolés : `patisgest-app/migrations/ETAT-RESTAURATION.md`.
- Vérification Git effectuée localement (`git status`, `git rev-parse`, diff ciblé et `git ls-files`); sondes externes via connecteurs Vercel/Supabase. Les requêtes de catalogue n’ont produit aucune écriture.
