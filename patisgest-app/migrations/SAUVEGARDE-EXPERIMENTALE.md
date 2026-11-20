# Sauvegarde et restauration : ce qui est réellement disponible

**L'ensemble n'est pas un mécanisme de reprise certifié pour le pilote.** Aucun de ces essais ne justifie l'application des migrations ou la fusion. Les éléments ci-dessous servent à construire et tester ce mécanisme sans écrire dans le pilote.

## Coffre authentifié

`scripts/coffre-sauvegarde.mjs` chiffre un fichier existant avec AES-256-GCM, sel et nonce aléatoires, clé dérivée par scrypt. Il refuse une phrase secrète de moins de 32 octets et une destination existante. La sortie du déchiffrement n'est publiée qu'après validation du tag ; le temporaire est privé et supprimé en fin normale ou lors d'une erreur. Un arrêt brutal (machine coupée, SIGKILL) peut laisser un temporaire en clair : utiliser uniquement un répertoire sécurisé sur un disque chiffré, puis contrôler et purger les résidus. Le fichier d'origine reste en clair : cet outil ne le supprime pas.

Usage pour des **fichiers de test**, avec `PATSYGEST_BACKUP_PASSPHRASE` fourni hors terminal partagé, journaux et dépôt :

```sh
node scripts/coffre-sauvegarde.mjs chiffrer entree.tar coffre.pgcgcm
node scripts/coffre-sauvegarde.mjs dechiffrer coffre.pgcgcm sortie.tar
```

Garder la phrase secrète indépendamment des archives, avec procédure de récupération et de rotation vérifiée. Un coffre authentifié ne crée pas une sauvegarde cohérente : il protège seulement les octets fournis. La taille reste visible. Les tests unitaires couvrent fichiers vides et volumineux, mot de passe erroné, modification, troncature et interdiction d'écrasement.

## Répétition Supabase CLI jetable

Dans le workflow `supabase-isole.yml`, après les tests avec données fictives :

1. capture d'empreintes des lignes publiques, policies, ACL, fonctions et `auth.users` ;
2. dump CLI séparé des rôles, du schéma et des données ; les deux tables vectorielles gérées `storage.buckets_vectors` et `storage.vector_indexes` sont **exclues** selon la documentation Supabase ;
3. chiffrement dans le coffre, suppression des originaux de test, déchiffrement et extraction ;
4. destruction et recréation de la pile CLI locale, neutralisation de certains droits par défaut et restauration transactionnelle, puis comparaison des empreintes ;
5. connexion de deux comptes fictifs restaurés et test de l'isolation PostgREST entre leurs clients ainsi que du refus anonyme.

La répétition CLI ci-dessus a **réussi** avec ces contrôles dans le [run 44725686722](https://github.com/Youcef16052008/PatsyGest/actions/runs/44725686722). Dans ce même run, le test séparé de restauration du dump PostgreSQL brut a échoué, donc la CI entière reste en échec. Aucun de ces tests n'utilise une sauvegarde du pilote et ils ne couvrent pas les deux tables vectorielles exclues ni les autres éléments listés ci-dessous.

La commande de destruction est strictement limitée à la pile CLI locale `patsygest-isole`. Les trois dumps ne partagent pas un instantané ; la cohérence dépend ici d'une pile de test sans écritures. En production, il faudrait une fenêtre d'arrêt vérifiée des écritures (y compris Auth et Storage) ou une méthode de capture cohérente à travers tous les composants. Le dump CLI gère des schémas Supabase différemment d'un `pg_dump` brut ; il ne sauvegarde pas les octets Storage ni la configuration et les secrets des services. Les fichiers temporaires de l'essai sont en clair dans un répertoire privé du runner éphémère et ne sont pas publiés. Les données du test ne sont pas celles du pilote.

Un défaut de Supabase observé pendant l'essai mérite une attention particulière : une base neuve peut réintroduire des droits `anon`, `authenticated` ou `service_role` par défaut lors de la création de tables ou de fonctions. La comparaison des ACL et la neutralisation ciblée de ces défauts servent à détecter ce problème ; elles ne certifient pas tous les rôles, propriétaires, privilèges par défaut, schémas gérés ou politiques.

Références : [dump et restauration Supabase](https://supabase.com/docs/guides/self-hosting/restore-from-platform), [précautions sur les privilèges par défaut](https://supabase.com/docs/reference/cli/supabase-backups-restore), [sauvegarde et exclusions vectorielles](https://supabase.com/docs/guides/deployment/ci/backups).

## Workflow historique

`../../.github/workflows/sauvegarde-free.yml`, récemment modifié sur `main` puis intégré à cette branche, produit un dump PostgreSQL chiffré en flux sans fichier clair ; il conserve désormais les ACL et propriétaires dans ce dump, mais n'a pas démontré leur restauration, ne sauvegarde pas les octets Storage ou les rôles globaux, et son format CBC n'a pas d'authentification cryptographique. Il n'utilise pas encore le coffre GCM expérimental ci-dessus. Aucun run de ce workflow n'était visible au dernier contrôle. Son succès ne doit pas être assimilé à une sauvegarde complète.

## Blocages pour le pilote

Il faut une sauvegarde réelle couvrant PostgreSQL, Auth, les ACL/propriétaires et rôles, tous les objets Storage et la configuration utile, une copie hors site, puis une restauration effective et des tests applicatifs dans un environnement isolé représentatif. Le connecteur disponible n'expose ni création de sauvegarde complète ni restauration ; la création de branche Supabase a été refusée par le plan (402), et l'accès aux secrets GitHub Actions est refusé (403). Le contrôle de Storage à zéro objet est seulement un constat ponctuel. Voir [ETAT-RESTAURATION.md](ETAT-RESTAURATION.md) pour les conditions de poursuite et les écarts de migration.
