# Note importante — PâtisGest

## Décision et travaux reportés

L'utilisateur souhaite revenir à l'option Supabase isolée lorsque PâtisGest aura 15 clients. Ce seuil est un rappel manuel : il ne déclenche aucun contrôle automatique, ne garantit pas la sécurité et ne remplace pas une sauvegarde. Les données existantes doivent être protégées dès que possible, sans attendre 15 clients.

## Risques vérifiés avant une éventuelle fusion

- La PR [#5](https://github.com/Youcef16052008/PatsyGest/pull/5) était ouverte en brouillon lors de ce contrôle. Une fusion vers `main` peut déclencher un déploiement Vercel de production.
- La base pilote n'avait pas les vues `labo_articles`, `labo_lots`, `vendeur_lots`, `labo_ordres_fabrication` et `vendeur_ordres_fabrication` lors de la vérification en lecture seule. La branche utilise ces vues : un déploiement de cette version avant réconciliation risque de casser des parcours labo et vendeur.
- Les brouillons de sécurité `101` à `128` ne sont pas validés pour le pilote. Ne pas les appliquer en triant le dossier entier : le manifeste `patisgest-app/migrations/repetition.json` décrit une répétition, pas un ordre de déploiement.
- Aucune sauvegarde complète du pilote et restauration représentative n'ont été démontrées. Le test isolé du dump brut échoue sur `realtime.list_changes` / `log_min_messages` ; la restauration CLI de données fictives est partielle. Voir `patisgest-app/migrations/ETAT-RESTAURATION.md`.
- L'accès GitHub aux réglages des secrets a répondu HTTP 403 lors du dernier contrôle ; cela ne prouve pas que les secrets sont absents. Ne pas partager de mot de passe ni de clé dans la conversation.

## Reprise et retour arrière

1. Vérifier à nouveau l'état réel de GitHub, de la production Vercel et du pilote ; ne pas supposer qu'un merge ou un déploiement a eu lieu à partir de cette note.
2. Préparer une sauvegarde sécurisée et cohérente (base, Auth, droits, configuration et objets Storage), une copie hors site et une procédure de récupération des clés. Vérifier une restauration réelle dans un environnement isolé et représentatif, puis tester le retour arrière.
3. Comparer les migrations au catalogue pilote, préparer la transition des comptes et sites, puis tester les parcours, l'isolation et les anciennes/nouvelles applications avant toute application SQL.
4. Après validation, appliquer seulement les migrations examinées, séquentiellement, et coordonner le déploiement. Ne pas utiliser la Preview Vercel comme bac à sable : elle a déjà été configurée sur le pilote.

La dernière production Vercel vérifiée avant décision était le déploiement `dpl_EbK9ojf1UYfBaSrZiZqX2rM9Cybi`, commit `18918b7245154468bb6b068251f95bd4a52537f4`. Conserver cette référence pour examiner un éventuel retour applicatif. Un redéploiement de l'application seule n'annule pas des modifications SQL ni les données écrites après le déploiement.

Pour le détail et les contrôles à jour : `HANDOFF-NEXT-SESSION.md` et `patisgest-app/PLAN-CLOTURE.md`. Cette note ne certifie ni la restauration, ni l'isolation, ni la fin du projet.
