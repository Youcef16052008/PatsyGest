# Répétition des migrations et restauration — non validées

Ce document n'autorise ni application au pilote ni fusion. `repetition.json` fige les fichiers et empreintes de la **reconstruction des tests** : historique jusqu'à 23, fixtures vitrine 25–31 de main, puis brouillons sécurité 24–50. Ce n'est pas un ordre de déploiement. L'index main 24 n'est pas inclus dans cette répétition et sa présence sur le pilote n'est pas établie. Les adaptations historiques et les écarts observés sur le catalogue pilote empêchent de déduire une équivalence à partir de ces tests. Les migrations vitrine 25–31 ont déjà été enregistrées sur le pilote ; les brouillons de sécurité du même numéro sont différents et ne sont pas appliqués.

## Test de restauration jetable

Le workflow `supabase-isole.yml` construit une pile Supabase CLI locale, y exécute les tests fictifs Auth/PostgREST, puis essaie de sauvegarder et restaurer la base dans une seconde base locale éphémère. Le script vérifie la cible, refuse une base préexistante, conserve les ACL dans le dump et supprime son archive temporaire et sa propre base de test. Il ne se connecte jamais au pilote.

**Résultat : échec, restauration non certifiée.** Dans le run [44706006657](https://github.com/Youcef16052008/PatsyGest/actions/runs/44706006657), `pg_restore` avec le rôle `postgres` de la pile CLI échoue sur `realtime.list_changes` : `permission denied to set parameter "log_min_messages"`. Ce rôle n'est pas superutilisateur ; `supabase_admin` l'est dans cette pile, mais n'est pas accessible par authentification ni par `SET ROLE` depuis `postgres` (runs 44707732791 et 44708146717). Le script conserve le rôle accessible et laisse l'étape en échec au lieu de masquer l'erreur.

Même une restauration locale réussie avec `--no-owner` ne prouverait pas la restauration des propriétaires, des rôles globaux et privilèges, de la configuration Auth, des secrets, des services ni des octets Storage externes ; les comparaisons prévues couvrent seulement les tables publiques, leurs contenus, politiques, ACL et fonctions, ainsi que `auth.users`. Une répétition représentative de **la sauvegarde réelle** et un retour arrière opérable restent requis. Le pilote avait 0 bucket et 0 objet Storage au dernier contrôle : c'est un état ponctuel, pas une couverture de sauvegarde.

## Conditions de poursuite

1. Disposer d'un mécanisme de sauvegarde sécurisée et cohérente du pilote, couvrant PostgreSQL, rôles/ACL/propriétaires, Auth et configuration, ainsi que les objets Storage ; identifier les permissions nécessaires sans placer de secrets dans les journaux ou le dépôt.
2. Restaurer cette sauvegarde dans un environnement Supabase réellement isolé et représentatif, y comparer données et catalogue, vérifier Auth/accès/fonctionnement, puis démontrer le retour arrière. La création d'une branche Supabase a été refusée par le plan (402) ; aucun autre projet ne doit être utilisé pour contourner cette restriction.
3. Comparer le catalogue actuel du pilote et les définitions effectives à la reconstruction, établir une séquence de migrations sans collision et les adaptations de données (notamment les cakes sans site), puis vérifier sécurité et compatibilité avant/après.
4. Après validation et sauvegarde fraîche vérifiée, exécuter séquentiellement les seules migrations approuvées, vérifier le résultat, compléter le plan et seulement alors fusionner.

Le workflow historique `sauvegarde-free.yml` n'a aucun run observé ; il exclut les privilèges, ne sauvegarde pas Storage et ne démontre pas une restauration complète. L'export JSON applicatif est partiel et n'est pas un rollback.
