# Plan de clôture PâtisGest

**État : inventaire de phase 1 terminé ; phase 2 partielle, phase 3 amorcée.** La PR #5 est en
brouillon. Les migrations 24 à 36 sont non appliquées ; le pilote conserve les
migrations jusqu'à 23. L'inventaire n'est pas une certification de sécurité.
Ne pas activer de comptes ni fusionner avant les critères ci-dessous. Les tests
métier et de sécurité se font sur la pile Supabase CLI jetable, jamais avec des
écritures de test dans le pilote. Voir `SECURITE-MODULES-EN-COURS.md` et
`AUDIT-PHASE-1.md` et `CERTIFICATION-PHASES-2-3.md` pour les détails et les
critères de certification encore bloqués.

## Phase 1 — état des lieux et garde-fous (inventaire terminé)

1. Relever en lecture seule l'état du pilote et du déploiement, les migrations,
   tables, policies et RPC accessibles ; distinguer les brouillons du réel.
2. Recenser les entrées sensibles : sites, données communes, fonctions
   `SECURITY DEFINER`, vues, comptes, modules, sauvegardes et chemins HTTP.
3. Rendre l'inventaire contrôlable par test et identifier les cas encore non
   couverts ; documenter les divergences de bootstrap et leurs conséquences.
4. Éviter qu'un aperçu applicatif utilise le pilote comme bac à sable ; tester
   le garde-fou sans effectuer de modifications sur le pilote.

**Sortie :** inventaire et matrice de risques disponibles, contrôles reproductibles,
état réel vérifié, trous restants documentés. Un inventaire ne prouve pas la
sécurité et la couverture ne se réduit pas à un nombre de tests.

## Phase 2 — isolation des sites et confidentialité

- Décider quelles données sont communes à l'établissement et quelles données
  doivent porter un site, y compris les historiques, données sans site et JSON.
- Protéger chaque lecture/écriture directe, vue, RPC et appel imbriqué ; couvrir
  les anciennes références et tout résultat ou message d'erreur. Un transfert
  vérifie les deux sites ; rappel et blocage doivent gérer les descendants.
- Finaliser confidentialité labo et règles des modules sans faire fuiter les
  prix ou coûts par tables, vues, RPC, exports, sauvegardes ou erreurs.
- Pour les fonctions temporairement inaccessibles, expliciter la limitation dans
  l'interface ; ne pas prétendre les prendre en charge.

**Sortie :** tests adversariaux Auth/PostgREST pour propriétaire, labo, vendeur,
compte non approuvé et deux établissements avec plusieurs sites ; tests positifs
et négatifs sur chaque chemin, sans contournement par un identifiant connu.

## Phase 3 — équipe et approbation

- Inscription avec identité vérifiée, demande de rattachement et invitation ;
  acceptation/refus uniquement par le propriétaire du bon établissement.
- Attribution et modification d'un ou plusieurs sites et des modules, comptes
  individuels vendeurs, révocation immédiate et vérification des sessions déjà
  émises. Protéger concurrence, invitations expirées, doublons et changements
  d'adresse ; aucune élévation par métadonnées utilisateur.
- Fournir interface et canal d'invitation vérifié ; ne pas supposer qu'un
  serveur SMTP ou des modèles d'e-mail sont configurés.
- Préparer une transition explicite des comptes existants : aucune attribution
  silencieuse plus large et aucun verrouillage accidentel.

**Sortie :** parcours complets d'invitation et de demande approuvés/refusés,
affectation, modification et révocation testés avec Auth et PostgREST réels.

## Phase 4 — parcours métier multisites et robustesse

- Ajouter la prise en charge explicite de plusieurs laboratoires et boutiques
  pour la prévision et le réassort, avec répartition traçable des quantités.
- Parcours de bout en bout achats, recettes, stocks, OF partiels, transferts,
  caisse, commandes et clôture ; confidentialité labo et modules désactivés.
- Traiter idempotence, échecs partiels, simultanéité, pagination et restauration ;
  préciser ce qui ne peut pas être transactionnel.

**Sortie :** scénarios représentatifs à plusieurs sites et tests de défaillance,
plus lint, types, tests, build, smoke HTTP et revue des dépendances.

## Phase 5 — répétition et préparation du déploiement

- Comparer signatures, ACL, schéma et données historiques du pilote avec les
  hypothèses des migrations ; résoudre les divergences, comptes existants et
  anciens OF sans réécriture silencieuse.
- Rejouer les migrations finales depuis l'état connu dans une base isolée,
  tester l'application ancienne et nouvelle et documenter les incompatibilités.
- Vérifier sauvegarde/restauration, retour arrière applicatif et base,
  maintenance, ordre précis des opérations et critères d'arrêt. Un simple
  redéploiement de l'ancienne application ne suffit pas à annuler des migrations.

**Sortie :** répétition réussie, sauvegarde vérifiée et procédure de retour
arrière testée ; aucun blocage critique ouvert.

## Phase 6 — mise en production et clôture

- Appliquer séquentiellement les migrations validées et coordonner le
  déploiement de l'application ; ne pas faire passer du trafic réel sur une
  combinaison base/application incompatible.
- Vérifier santé, RLS, parcours et accès effectivement publiés sans données de
  test destructives. Ne fusionner la PR que si toutes les portes sont franchies ;
  en cas d'échec, appliquer le plan de retour arrière.
- Confirmer l'état réel des migrations, de la production Vercel et de la PR.

**Règle transversale :** un résultat vert partiel, un brouillon ou une démo ne
signifie pas que le système est prêt pour la production.
