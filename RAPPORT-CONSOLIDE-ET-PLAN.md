# PâtisGest — rapport consolidé et plan de remédiation

**Date : 20 novembre 2026 · Référence du dépôt : `2fba72c78e643ac4cb1b484cb26b0efaa38cdeff` · Branche de travail : `arena/a62eecd2-patsygest`.**

## Actualisation — contrôle du pilote pendant les phases 0 et 1

Après la rédaction initiale, une consultation en lecture seule a révélé que le pilote a une migration enregistrée `garde_prix_vitrine_rattrapage_32`, absente de ce commit. Sa définition effective de la RPC de commande sélectionne bien `s.subdomain` : le défaut F-001 reste constaté dans le fichier 27 du dépôt, mais ne peut pas être attribué tel quel à cette définition du pilote. Cela ne prouve pas que toute commande fonctionne. La fonction effective de fin d'OF contient encore `v_known / p_qte`. Résultats, limites et tâches non terminées : [état des phases 0 et 1](patisgest-app/ETAT-PHASES-0-1.md).

## 1. Résumé exécutif

**Recommandation : pas de mise en production commerciale générale en l'état.** Un pilote ne devrait continuer qu'avec périmètre réduit, surveillance et mesures compensatoires explicitement acceptées. Les risques les plus sérieux identifiés concernent le coût des productions partielles, la restauration, une possible fuite inter-établissements, la vitrine, la fiabilité des migrations et l'usage du prototype avec des données réelles. Les sévérités des trois rapports divergent : leur décompte et leurs identifiants ne sont pas directement comparables. La gravité commerciale dépend aussi des fonctionnalités réellement actives et des données du pilote.

**Ce document n'est pas une certification de sécurité.** Les constats sont distingués entre code inspecté et tests indépendants ; les essais déclarés par les auteurs ne sont pas prétendus reproduits ici. La configuration, le catalogue effectif et les migrations de la base pilote n'ont pas été vérifiés. Les brouillons SQL ne doivent pas être appliqués directement en production.

### Sources et limites

- **G = rapport attribué à Grok** par l'utilisateur : [fichier `review-content.ts` dans Drive](https://drive.google.com/file/d/1ZToqxZPngmGCi62ALFUmQCaAkvnKm8e0/view), 18 constats ; inclut prototype HTML et Electron. Son commit exact n'est pas précisé : comparaison faite avec `2fba72c`.
- **F = rapport dans le dossier Fabel 5.2** : [`report.ts`](https://drive.google.com/file/d/1zmC56JZDq3tdQM2bHCYeKKCMkgKG1T2t/view), [`findings-a.ts`](https://drive.google.com/file/d/1_ABbIBC_lKCNEK4IS3qbIqPM6E_IBee-/view), [`findings-b.ts`](https://drive.google.com/file/d/1WZbZrZvoV7_0HfHSSbXu-tWMFjC7KyQe/view), 27 constats, commit annoncé `2fba72c`.
- **C = rapport code review fourni dans la conversation** : 20 constats, commit `2fba72c`, application Next.js surtout. Les mentions « fixed in patch » renvoient à un patch non présent dans le dépôt examiné ; elles ne signifient pas que ce commit est corrigé.
- Le Drive contient des applications de présentation : les constats ont été lus dans leurs fichiers de contenu, pas simplement déduits des noms des dossiers. Les documents originaux ne sont pas modifiés.

**Légende des tableaux** : **Confirmé-code** = mécanisme observé dans le code, pas forcément reproduit de bout en bout ; **Partiel** = une partie est constatée mais l'impact ou le scénario complet nécessite un test ; **À vérifier** = revendication lue, non confirmée indépendamment. Un résultat observé dans le SQL du dépôt ne prouve pas sa présence dans la base en service.

### Vérifications exécutées indépendamment

Après `npm ci`, dans `patisgest-app` avec Node 22.22.3 : `npm test` **366/366**, `npm run typecheck` et `npm run lint` réussis, `npm audit --omit=dev` : **0 vulnérabilité rapportée au moment de l'exécution**. Lecture ciblée de SQL, TS, workflow et HTML. GitHub indique que le dépôt est public. Aucun test indépendant PostgREST, test d'intrusion, restauration sur base réelle, test navigateur complet ou build de production n'a été exécuté pour ce rapport. Les tests verts n'établissent ni sécurité ni correction métier.

## 2. Constatations majeures et arbitrages

### A. Coûts et sécurité alimentaire

1. **Production partielle — priorité P0** (G-001). `supabase/07-of-production.sql:396-404,433` calcule le coût matériel total des consommations puis le divise par `p_qte` à chaque clôture ; le coût total est ajouté à chaque tranche. Avec 800 DA de matière pour 80 unités, deux clôtures de 40 imputent chacune environ 800 DA de matière, soit 1 600 DA au total, hors arrondis et charges. **Confirmé-code** ; l'impact sur le pilote dépend de sa fonction réellement installée. Le projet comprend `102-cout-of-partiel.sql`, explicitement brouillon. Valider le traitement des pertes, quantités finales, annulations et arrondis avec le métier avant de choisir une formule ; inventorier et corriger les données historiques après validation comptable, jamais par mise à jour automatique aveugle.
2. **FEFO divergente** (G-002/018). `src/lib/fefo-cost.ts:50-53` trie le congelé d'abord, alors que `supabase/21-prix-demain-panier.sql:451,607,748` utilise `congele asc`, donc le frais d'abord pour des booléens non nuls. Le test existant entérine le comportement TS. **Confirmé-code** ; vérifier les nulls et les règles métier. Le calcul de simulation peut diverger du lot effectivement consommé.
3. **Simulation site/stock/coût** (G-003). Requêtes limitées à 300 lots sans filtre site dans `actions-couts.ts` et `actions-simulation.ts`, et `fefo-cost.ts:86` ignore les prix nuls. **Confirmé-code**, impact à mesurer. Aligner périmètre, ordre, pagination, remontée des erreurs et coût inconnu avec la production ; ne pas transformer un coût inconnu en coût nul fiable.
4. **Prototype autonome** (G-007 à G-010/017) : `PâtisGest-Final.html:346` n'exclut pas les DLC dépassées ; `validerZ` compare les totaux plutôt qu'une identité complète ; `encaisser` utilise le prix fourni. **Confirmé-code**. Le README le qualifie de « prototype » et invite à le tester ; cela ne démontre pas qu'il est utilisé pour des ventes réelles. Il faut néanmoins signaler clairement « démonstration uniquement » et empêcher son usage comme registre de production tant que les parcours alimentaires, financiers et sécurité ne sont pas validés. L'injection HTML/CSV alléguée exige une reproduction navigateur séparée.
5. **Cake HT/TTC et main-d'œuvre** (G-004/013). `09-journaux-ecritures.sql` plafonne/solde sur `prix_ht` ; une divergence de présentation TTC est alléguée par G. Le calcul SQL `07:401-404` inclut énergie, emballage et frais, mais pas explicitement la main-d'œuvre. **Partiel** : confirmer le modèle fiscal, les conventions des montants et toute répartition ailleurs avant de modifier les factures ou données.

### B. Isolation, restauration et exposition

6. **Restauration partielle** (G-005, F-007, C-006). `21-prix-demain-panier.sql:1234-1242` intercepte `unique_violation` par table : une collision peut annuler l'insertion de toute la table tout en poursuivant les autres. `actions-restauration.ts:81-94` affiche les tables ignorées, mais sous `succes` ; le terme « silencieux » est donc excessif côté UI, tandis que le succès partiel reste dangereux. **Confirmé-code**. Rendre l'opération atomique et le résultat non ambigu ; le brouillon 124 vérifie certaines FK, pas les liens logiques contenus dans JSON.
7. **Références inter-établissements** (F-006, C-006). Le brouillon 124 reconnaît l'absence de contrôle inter-tenant ; la vue `26-vitrine-publique.sql:240-244` joint `articles` sur l'identifiant seul, puis contourne la RLS. F déclare avoir reproduit une fuite de prix via restauration avec UUID étranger ; **Partiel** ici : mécanismes statiques constatés, reproduction et conditions d'accès effectives non revérifiées. Traiter comme **P0 de sécurité** jusqu'à test : contrôler toutes les références relationnelles et JSON, durcir les jointures avec `client_id`, considérer des clés étrangères composites, vérifier les privilèges effectifs et l'existant. Un UUID difficile à deviner n'est pas une autorisation.
8. **Anciennes sauvegardes** (F-002). `jsonb_populate_recordset` sur un enregistrement NULL et insertion `r.*` risquent de remplir de nouvelles colonnes manquantes à NULL plutôt que leurs valeurs par défaut. F déclare un essai PGlite sur `sites.publication`. **Partiel**, compatibilité réelle non reproduite ici. Répéter avec sauvegardes représentatives et définir une politique versionnée de migration des formats.
9. **Instantané et récupération** (F-015, C-011/016). L'export JSON lit les tables successivement et est borné à 4 Mio ; il ne constitue pas nécessairement un instantané transactionnel cohérent ni un PRA complet. Le dump planifié est explicitement une copie partielle, sans Storage ni rôles globaux, avec AES-CBC non authentifié et `PGSSLMODE=require`. **Confirmé-code** pour ces limites. Définir RPO/RTO, sauvegarder composants manquants, chiffrer avec authentification, vérifier la chaîne TLS, contrôler rétention et tester une restauration isolée.
10. **Artefacts GitHub** (F-003). Le dépôt est public et le workflow téléverse le dump **chiffré**, pas le texte clair, en artefact 30 jours ; une copie R2 est facultative. **Confirmé-code**. L'accessibilité effective des artefacts, les runs, les données incluses et les protections du compte ne sont pas vérifiés indépendamment : l'affirmation d'une exposition publique effective est donc **à vérifier**, pas un incident établi. Ne pas publier de dump sensible dans des artefacts tant que les droits et la politique ne sont pas validés ; privilégier stockage privé et chiffrement authentifié, avec alerte en cas d'échec.

### C. Vitrine et accès

11. **RPC de commande** (F-001). `27-commandes-vitrine.sql:55-76` sélectionne `id, client_id, nom` dans un `record`, puis lit `v_site.subdomain`, absent de cette sélection. **Confirmé-code** pour la définition de migration ; F rapporte un échec exécuté en PGlite. Vérifier quelle définition est installée et ajouter un test fonctionnel anonyme complet. Tant que ce n'est pas validé, ne pas annoncer la commande vitrine comme fonctionnelle. Le brouillon 127 n'est pas une preuve de déploiement.
12. **Écritures directes sur sites** (F-005/020). `01-socle.sql:79-97` autorise dans sa policy propriétaire et labo ; `31-publication-vitrine.sql` reconnaît le chemin direct. **Partiel** : les privilèges et policies réellement effectifs doivent être testés, notamment après toutes migrations ; une policy permissive ne prouve pas à elle seule qu'un rôle dispose du GRANT. Tester les PATCH directs avec JWT labo/propriétaire, noms réservés et champs de plan ; concentrer les règles dans le modèle de privilèges et les invariants base.
13. **Flood/idempotence et photo** (C-007/010, G-011, F-008). Un quota global de 30/h/établissement existe dans `27-commandes-vitrine.sql`, mais pas de limite par visiteur ; un appel qui atteint la limite peut affecter d'autres visiteurs. Une course sur la clé reste à reproduire. Bloquer l'abus sans pénaliser les clients légitimes ; une limite uniquement par téléphone falsifiable n'est pas suffisante, CAPTCHA peut être contourné en appel direct de la RPC. Vérifier si URL arbitraires, politiques Storage, CSP et chemins de lecture créent un risque effectif.
14. **Routage, cache, en-têtes** (C-004/005/009/010, F-011/018). `domaines.ts` réécrit les chemins non exemptés sur sous-domaine ; `/appearance/` n'est pas exempté. Le service worker met en cache les réponses OK sans vérifier le type MIME. Les modules back-office et validations Host nécessitent tests d'intégration. **Confirmé-code** pour les polices/cache ; l'effet exact nécessite navigateur. Ajouter en-têtes adaptés, tester CSP avec Next/Supabase et invalider les caches existants.
15. **Déconnexion** (F-022) : `actions-auth.ts:39-48` saute `signOut()` dès présence d'un cookie démo, même invalide, mais efface ensuite les cookies locaux Supabase. **Confirmé-code** ; révocation effective des jetons à tester avec Auth. Toujours dissocier suppression locale et révocation serveur.

### D. Exploitation et qualité

16. **Pas de gate générale CI** (C-001). Workflows de sauvegarde et de test isolé présents, mais pas de pipeline générique PR/main pour tests, lint et typecheck. **Confirmé-code** ; règles GitHub de branche non auditées. Ajouter workflow puis le rendre obligatoire via la protection de branche si les droits le permettent.
17. **État des migrations** (C-014/018, F-004, G-015). Manifest `migrations/repetition.json` distingue historique, fixtures vitrine et brouillons 101–128 ; le dépôt ne constitue pas à lui seul une preuve de ce qui est installé sur le pilote. Les tests de répétition principaux n'établissent pas l'équivalence du schéma réel. **Confirmé-code pour cette distinction**, pas d'affirmation globale sur tous les tests. Inventorier catalogue et versions effectives avant toute promotion ; établir un historique de migrations unique et vérifiable.
18. **File OF** (C-020). `src/lib/of-queue.ts` utilise une clé commune, `slice(-100)`, renvoie `[]` sur corruption et ignore les erreurs de stockage. **Confirmé-code** : perte silencieuse possible, et séparation de compte non garantie. Priorité P0 pour tout pilote utilisant la production hors ligne.
19. **CSV, volume et dates** (C-002/008/011, F-009/010/017). `csv.ts` convertit des objets en `[object Object]` et joint les tableaux sans préserver leur structure. Les dates TS utilisent UTC ; côté SQL, `current_date` dépend du fuseau de session. Les routes de sauvegarde/export paginent et construisent la réponse en mémoire ; sauvegarde limitée à 4 Mio. **Confirmé-code** ; le seuil exact de pagination et les effets locaux doivent être mesurés. Préserver JSON, délimitation et sécurité tableur ; gérer dates métier `Africa/Algiers` sans imposer une interprétation erronée des timestamps.
20. **Sessions et résilience** (C-013, F-013). `auth.ts` abandonne l'attente de `getUser` à 1,5 s et interprète l'absence de résultat comme session nulle ; le proxy utilise 1,2 s. **Confirmé-code** ; perte effective de rotation et nombre d'appels doivent être instrumentés. Distinguer réseau indisponible d'authentification invalide sans accorder d'accès sur un jeton non vérifié.

## 3. Inventaire exhaustif des rapports sources

Les numéros ci-dessous sont **préfixés** : par exemple G-001, F-001 et C-001 sont trois constats différents. Les titres anglais sont conservés pour retrouver exactement les originaux. Un état « à vérifier » ne veut pas dire faux.

### 3.1 Source G — Grok (18 constats)

| Référence | Constat original | Statut de notre contrôle |
|---|---|---|
| G-001 | Partial production records the full material cost on every completion | Confirmé-code |
| G-002 | Cost engine consumes frozen lots before fresh lots, against the spec and the SQL | Confirmé-code |
| G-003 | Recipe cost reads an arbitrary, site-blind subset of lots and skips zero-price lots | Confirmé-code (limite, site et prix nul) ; impact à tester |
| G-004 | Cake payments settle on HT while the printed ticket bills TTC | Partiel : base HT constatée ; règle TTC à valider |
| G-005 | Backup restore swallows a unique violation and commits a partial load | Confirmé-code |
| G-006 | “Today” is UTC, so Algeria rejects the local date for an hour after midnight | Confirmé-code TS ; SQL selon fuseau |
| G-007 | The offline program sells and produces from expired lots | Confirmé-code |
| G-008 | Prototype Z import treats an equal total as a duplicate and drops the stock movement | Confirmé-code |
| G-009 | Prototype till trusts a price typed in the grid | Confirmé-code |
| G-010 | Prototype CSV export and toasts are injectable | À vérifier en navigateur |
| G-011 | Public storefront exposes tenant ids, can be flooded, and drops order corrections | Partiel : quota et vue constatés |
| G-012 | Lab cost access is allowed in SQL, denied in the UI, and described both ways | À vérifier selon migrations et règles métier |
| G-013 | Finished-lot cost omits labor | Partiel : omission dans formule SQL constatée |
| G-014 | Custom domains are classified and then ignored by the router | À vérifier de bout en bout |
| G-015 | Applied SQL, drafts, and the security sign-off disagree | Confirmé-code : séries distinctes ; pilote inconnu |
| G-016 | A slow auth check is treated as logged out | Confirmé-code pour timeout |
| G-017 | Prototype sale totals are unrounded floats | Confirmé-code pour calcul flottant |
| G-018 | The FEFO test cannot fail when the specification is violated | Confirmé-code : test et tri TS à comparer à SQL |

### 3.2 Source F — dossier Fabel 5.2 (27 constats)

| Référence | Constat original | Statut de notre contrôle |
|---|---|---|
| F-001 | Storefront order RPC fails on every call: it reads a column it never selected | Confirmé-code ; comportement DB à reproduire |
| F-002 | Backups taken before a schema change can no longer be restored | Partiel : mécanisme SQL ; fixture à reproduire |
| F-003 | The nightly full-database dump would be published as an artifact of a public repository | Partiel : artefact chiffré et dépôt public ; accès à vérifier |
| F-004 | The test suite validates a schema that is not the one main ships; the pilot's migration state is undocumented | Confirmé-code : périmètres distincts ; pilote inconnu |
| F-005 | Direct table writes bypass the storefront rules: a lab account can publish, and reserved subdomains can be taken | Partiel : policy ; GRANT et accès effectifs à tester |
| F-006 | Restore accepts links to another tenant's rows; the public catalogue then reveals that tenant's price | Partiel : jointure et garde absente ; fuite à reproduire |
| F-007 | Restore skips a whole table at the first duplicate and reports it as already present | Confirmé-code ; avertissement UI existe |
| F-008 | Anonymous order endpoint: a shop-wide limit of 30 per hour lets anyone lock a storefront and fill the queue with junk | Confirmé-code : quota ; charge/concurrence à tester |
| F-009 | CSV export writes '[object Object]' for every JSON column | Confirmé-code |
| F-010 | Export fails for good once a table reaches 20,000 rows; the in-app backup stops at 4 MiB | Confirmé-code : limite 4 Mio ; seuil à tester |
| F-011 | On a boutique subdomain every back-office module opens the public storefront | Partiel : réécriture constatée ; parcours à tester |
| F-012 | Server errors are swallowed: 97 empty catch blocks and one log statement in the whole application | À vérifier : comptage et impact |
| F-013 | A slow network is treated as 'not signed in', and a token refresh that finishes late is lost | Confirmé-code pour timeout ; rotation à tester |
| F-014 | The Drizzle schema is stale and `npm run db:push` would propose dropping tables and columns | Partiel : db:push présent ; comparaison intégrale à refaire |
| F-015 | Backup and export read table by table without a transaction, so the file is not one consistent snapshot | Partiel : lectures séquentielles ; impact à reproduire |
| F-016 | The cart total shown to the cashier can differ by one centime from the amount the server records | À vérifier avec fixtures et règle d’arrondi |
| F-017 | The business day is computed in UTC: between midnight and 01:00 in Algeria, 'today' is yesterday | Confirmé-code TS ; SQL selon fuseau |
| F-018 | No security headers: pages can be framed and there is no Content-Security-Policy | Confirmé-code dans configuration repo ; vérifier edge |
| F-019 | The public catalogue view exposes the internal tenant id of every published shop; the public page is never cached | Confirmé-code : colonnes vue ; exposition effective à tester |
| F-020 | An owner can rewrite the subscription plan column through the REST API | À vérifier sur catalogue et privilèges effectifs |
| F-021 | Saving a storefront photo reports success even when the caption insert fails; raw exception text is shown to users | Confirmé-code : erreur insert ignorée |
| F-022 | Logout skips the Supabase sign-out whenever a demo cookie is present, even an invalid one | Confirmé-code ; révocation effective à tester |
| F-023 | The offline sale queue stops the till when it holds 200 tickets or one unreadable entry | À vérifier : comportement volontaire fail-closed et UX |
| F-024 | The backup workflow runs unpinned actions, images and a pip install next to production credentials | Partiel : versions flottantes présentes ; chaîne à auditer |
| F-025 | Demo login accepts inherited object keys such as 'constructor' | Confirmé-code : accès hérité en mode démo seulement |
| F-026 | The backup fingerprint is a 32-bit checksum anyone can recompute, yet the message suggests tamper detection | À vérifier : usage et garanties de l’empreinte |
| F-027 | Dead compatibility paths and comments that no longer match the code | À vérifier : inventaire et suppression sûre |

### 3.3 Source C — revue transmise dans la conversation (20 constats)

| Référence | Constat | Statut de notre contrôle |
|---|---|---|
| C-001 | Absence de CI générale PR/main | Confirmé-code ; protection de branche non vérifiée |
| C-002 | Export JSON en `[object Object]` | Confirmé-code ; patch non présent |
| C-003 | Propriétés héritées en mode démo | Confirmé-code ; patch non présent ; mode production désactivé |
| C-004 | Polices réécrites sur sous-domaines | Confirmé-code ; patch non présent |
| C-005 | Cache d'une réponse HTML sous URL d'asset | Confirmé-code pour absence de validation MIME ; navigateur à tester |
| C-006 | Collisions et références inter-tenant en restauration | Confirmé-code pour collisions ; fuite : partiel, test isolé requis |
| C-007 | Quota anonyme global et course d'idempotence | Confirmé-code pour quota ; course à reproduire |
| C-008 | Dates UTC et DLC | Confirmé-code TS ; SQL selon fuseau effectif |
| C-009 | Host non validé pour réécriture | Confirmé-code pour absence de validation DNS complète ; impact à mesurer |
| C-010 | En-têtes de sécurité et URL de photo | Partiel : configuration applicative sans en-têtes explicites ; edge et URL à tester |
| C-011 | Volume/mémoire/pagination sauvegarde et CSV | Confirmé-code pour lectures en mémoire et cap ; seuil exact et timeout à mesurer |
| C-012 | Schéma Drizzle périmé et db:push | Partiel : commande présente ; effet exact à vérifier |
| C-013 | Appels auth et timeouts | Confirmé-code pour timeout ; compter les appels et tester rotation |
| C-014 | Tests sécurité insuffisants / répétition sans 24–31 | Confirmé-code pour périmètre de la répétition principale ; pas pour chaque test |
| C-015 | Messages d'exception bruts | Partiel : exemples constatés ; nombre exact non recompté |
| C-016 | Chiffrement CBC, TLS et veille sauvegarde | Confirmé-code pour CBC et PGSSLMODE ; disponibilité/schedule à vérifier |
| C-017 | Échec d'insertion de légende ignoré | Confirmé-code ; duplications à reproduire |
| C-018 | Séries de migrations et suivi | Confirmé-code pour séries ; historique effectif non vérifié |
| C-019 | Health/logging/rate limit login | À vérifier intégralement, y compris contrôles plateforme |
| C-020 | File OF : éviction, corruption, absence de portée compte | Confirmé-code ; scénario utilisateur à reproduire |

## 4. Plan détaillé, dépendances et critères d'acceptation

**Décision du propriétaire : la restauration et sa répétition sont reportées à la dernière étape du projet, sans changement de plan Supabase pour le moment.** Les numéros ci-dessous sont conservés pour retrouver les références du rapport, mais ne représentent plus l'ordre d'exécution : avancer d'abord sur les phases 3 à 6 et les travaux d'isolation indépendants de la restauration ; terminer par la phase 2. Son niveau de risque ne disparaît pas : aucune restauration n'est certifiée et elle reste une condition avant le GO commercial. Aucun changement de base pilote ni migration en production ne doit être déduit de ce report.

Les priorités ci-dessous sont des **portes de décision**, pas des estimations de date. Plusieurs chantiers peuvent avancer en parallèle après l'inventaire du pilote. Affecter un responsable réel à chaque lot ; les rôles indiqués sont proposés, pas des personnes désignées.

### Phase 0 — Stabiliser et connaître l'état réel (avant toute modification DB)

**Responsables : propriétaire produit + responsable infrastructure/Supabase + référent sécurité.**

1. Déterminer si le HTML/Electron, la vitrine, les OF partiels et les sauvegardes JSON sont utilisés réellement. Marquer HTML/Electron comme démonstration non certifiée ; si commande publique ou OF à risque activées, les désactiver temporairement ou définir un traitement manuel contrôlé.
2. Dans un environnement isolé, inventorier les migrations installées, définitions des fonctions et vues, policies, grants, fuseaux, Storage et configurations. Comparer au commit, aux historiques 01–31 et brouillons 101–128. Sauvegarder la preuve de comparaison et ne pas extraire de données sensibles dans un dépôt public.
3. Identifier les sauvegardes disponibles, leurs propriétaires, rétention, chiffrement, couverture et dates ; contrôler accès aux artefacts GitHub **sans publier les dumps**. Confirmer s'il y a eu des exécutions et une exposition effective. Définir procédure d'incident conditionnelle, sans annoncer une fuite non prouvée.
4. Créer une base jetable suffisamment proche du pilote : rôles `anon`/`authenticated`, RLS, fonctions, extensions et seed non sensible. Ne jamais exécuter les tests destructifs sur production.

**Sortie partielle pour continuer les travaux hors production :** inventaire et fonctionnalités à risque documentés, accès et personne décisionnaire confirmés et tests fictifs reproductibles. La disponibilité d'une sauvegarde restaurable et la répétition représentative sont reportées à la dernière étape ; la phase 0 n'est donc pas entièrement validée. En cas d'écart inconnu ou sans sauvegarde et retour arrière démontrés, pas de migration en production.

### Phase 1 — CI et reproductibilité (P0)

**Responsables : équipe application + infrastructure.**

- Créer un workflow PR + `main`, Node 22 et installation déterministe, exécutant `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, puis `npm run build` dans un environnement de build non productif. Documenter les variables factices et distinguer un échec dû à l'absence de secrets d'un test réussi.
- Ajouter tests PGlite pour le SQL approprié et intégration Supabase/PostgREST jetable pour auth, rôles, grants, RPC et concurrence. Les fixtures vitrine ne remplacent pas la vérification de l'ordre de production. Exécuter aussi les tests du design studio si ce produit est dans le périmètre de livraison.
- Exiger les checks via règles de branche quand les permissions le permettent ; revue indépendante obligatoire des SQL sécurité. Publier la version de schéma et les preuves des tests, sans jetons ou données personnelles.

**Acceptation :** une PR avec test volontairement cassé est bloquée ; tout est vert sur la configuration cible ; rollback et environnement isolé documentés.

### Phase 2 — Restauration et récupération (P0, reportée à la dernière étape)

**Responsables : ingénieur base + sécurité + responsable exploitation.** Le volet restauration est reporté à la fin à la demande du propriétaire, y compris sa répétition sur une sauvegarde réelle. Les contrôles d'isolation inter-tenant indépendants de la restauration restent prioritaires et peuvent être développés et testés sur données fictives pendant les autres phases. La validation d'une restauration réelle et d'un retour arrière demeure une condition préalable au déploiement commercial.

1. Définir la sémantique : un dump incompatible, une collision ou une référence étrangère provoque une erreur **et zéro écriture**, sauf si un mode de fusion explicite et vérifié est conçu séparément. Supprimer tout succès avec `ignore` non vide ; l'UI doit montrer une erreur et les tables concernées.
2. Vérifier toutes les FK tenant, y compris les tables non restaurées, références optionnelles, composites et liens imbriqués en JSON. Ajouter des clés composites et des jointures tenant là où applicable après audit des données existantes ; tester les politiques/grants effectifs. Le brouillon 124 est un matériau de revue, non une migration prête à appliquer.
3. Versionner les formats de dump et leur compatibilité : traiter champs manquants et valeurs par défaut, importer au besoin via étapes explicites testées. Refuser les versions inconnues et les tables manquantes selon un contrat documenté ; maintenir des fixtures historiques anonymisées.
4. Définir stratégie de restauration complète : PostgreSQL, ACL, rôles, fichiers Storage, configuration services et secrets hors dump, RPO/RTO, rétention et responsable d'astreinte. Chiffrement authentifié et vérification TLS `verify-full` avec chaîne de confiance adaptée. Ne pas supprimer la dernière copie avant de disposer d'une autre copie privée vérifiée.
5. Exécuter des restaurations isolées, tester les données, comptages, FK, rôles et parcours métier. Ajouter alerte indépendante en cas d'échec ou absence de sauvegarde ; vérifier régulièrement que le workflow planifié s'exécute.

**Acceptation :** tests collision première et dernière table, lignes valides plus doublon, lien étranger et JSON malveillant => transaction annulée ; ancienne sauvegarde connue restaurée ou refus explicite ; restauration complète documentée et chronométrée ; aucune fuite inter-tenant sur tests PostgREST.

### Phase 3 — Coûts, stock, caisse et sécurité alimentaire (P0)

**Responsables : ingénieur métier/DB + pâtissier pilote + responsable financier.**

1. Reproduire OF de 80 unités/800 DA avec clôtures 40 + 40 puis partielle, complète, écart, annulation et pertes ; comparer les transactions et lots. Fixer la règle métier pour matières, MO, énergie, frais, déchets et arrondis ; migrer via fonction explicite avec rollback. Évaluer séparément la correction des historiques et documenter ses incidences.
2. Unifier FEFO TS/SQL : frais/congelé, dates NULL, ordre de réception, égalités, DLC, site, lots bloqués, coûts inconnus. Ajouter fixtures partagées exécutées dans les deux couches ; remplacer le test qui affirme le mauvais ordre.
3. Synchroniser simulation et stock effectif : requêtes bornées mais complètes, filtre site, erreur visible, pas de coût présenté comme certain si incomplet. Ajouter essais >300 lots, réseau en panne et coût nul.
4. Trancher contrat HT/TTC, taxes et acompte : paiement, ticket, API, dépôt et livraison doivent partager une règle chiffrée. Tester par exemple prix 100 HT et TVA 19 %, puis valider l'interprétation comptable avec le responsable métier.
5. Définir une date métier `Africa/Algiers` pour TS et SQL, avec test avant/après minuit et comparaison au fuseau de session. Ne pas changer aveuglément le fuseau global de PostgreSQL si d'autres systèmes en dépendent.
6. Prototype : soit désactivation explicite pour exploitation, soit durcissement séparé FEFO, import Z, prix, arrondis, sécurité des contenus et sauvegardes, puis tests navigateur et validation métier. Aucun bénéfice de la correction Next.js ne doit être attribué automatiquement au HTML/Electron.

**Acceptation :** les coûts répartis ne dupliquent pas la matière, le coût réel complet et les écarts sont expliqués ; TS et SQL choisissent les mêmes lots dans les mêmes conditions ; aucun lot périmé n'est consommé dans le périmètre métier retenu ; tickets et paiements concordent ; tests signés par le métier.

### Phase 4 — Accès et vitrine (P0 si fonction active)

**Responsables : équipe app + DB + sécurité.**

- Corriger le champ manquant de la RPC via migration ordonnée et vérifiée ; exécuter une vraie commande anon sur schéma de déploiement, puis tester erreur, double clic, concurrence et répétition avec payload différent. Définir explicitement les règles d'idempotence ; ne jamais annoncer qu'une modification a été enregistrée si seule une commande antérieure existe.
- Fermer les écritures directes non autorisées sur publication, sous-domaines et plan ; tester **policies et privilèges effectifs** de chaque rôle via PostgREST. Garantir noms réservés et invariants y compris lors d'une restauration.
- Mettre une limitation multi-niveau à une frontière non contournable, avec protections réseau, quotas par visiteur et par boutique, limites de concurrence et anti-abus appropriés ; tenir compte de la protection des données. Si la RPC reste accessible directement avec la clé anon, un CAPTCHA seulement dans Next.js ne suffit pas.
- Minimiser colonnes publiques, durcir les jointures tenant et valider les URL de photo selon une politique réellement compatible avec Storage. Ajouter CSP, `frame-ancestors`, Referrer-Policy et Permissions-Policy après test Next/Supabase et contrôle des en-têtes réellement servis par l'hébergeur.
- Corriger routage des assets et modules, valider Host selon les règles DNS, prévenir les faux positifs sur domaines custom ; incrémenter la version du service worker, refuser de mettre en cache du HTML pour des assets et vérifier les erreurs hors ligne.

**Acceptation :** commande anonyme valide enregistrée une fois sous charge concurrente ; un visiteur ne peut pas monopoliser facilement le service ; accès directs non autorisés refusés ; polices `font/woff2`, navigation back-office et CSP fonctionnent sur domaine réel ; aucune fuite entre deux tenants testés.

### Phase 5 — Hors ligne et opérations (P0 si production hors ligne ; sinon P1)

**Responsables : équipe app + support pilote.**

- Refondre la file OF en reprenant les garanties de la file vente sans supposer qu'elle résout tous les cas : clé par identité/tenant, persistance validée, pas d'éviction silencieuse, refus explicite si capacité atteinte, conservation et procédure de récupération des données corrompues, coordination multi-onglets et idempotence serveur. Signaler l'impossibilité d'écrire sur disque avant de promettre une opération enregistrée.
- Définir le comportement quand auth est lente ou hors ligne : afficher un état distinct, ne pas accorder d'accès non vérifié et gérer les rotations sans perdre les cookies. Tester 2 secondes de latence, panne DNS, reprise et expiration réelle.
- Toujours tenter la révocation Supabase indépendamment du cookie de démo ; effacer les cookies locaux même en cas de panne et informer que la révocation distante n'a pas été confirmée.
- Ajouter logs structurés sans secrets ni données personnelles inutiles ; suivi des files, erreurs de RPC, exports, sauvegardes et latence ; alertes et runbook d'incident.

**Acceptation :** 101+ OF ne perdent aucune opération silencieusement ; corruption et quota de stockage génèrent un état récupérable ; changement de compte isole les données ; reprise multi-onglets ne duplique pas ; tests de sign-out et délais Auth passent.

### Phase 6 — Export, montée en charge et entretien (P1/P2)

- Sérialiser les objets/tableaux JSON en JSON valide dans une cellule CSV correctement échappée ; conserver la défense formule pour les textes et tester null, valeurs numériques et dates. Définir la compatibilité avec les tableurs visés, y compris espaces/caractères atypiques, sans supposer leur comportement universel.
- Vérifier les bornes de pagination avec N−1/N/N+1, croissance pendant la lecture et instantané cohérent ; ne pas annoncer un export complet avant une preuve de fin. Mesurer 50 000 ventes, mémoire, latence et timeout ; envisager export asynchrone/flux privé plutôt qu'une réponse serveur illimitée.
- Déterminer si Drizzle est maintenu ; si non, désactiver `db:push` et documenter la source de vérité, sans supprimer un composant avant d'avoir recherché ses usages. Épingler actions/images et outils manipulant des secrets, surveiller dépendances de développement et audit complet.
- Vérifier erreurs de légende, messages d'exceptions, santé, traçabilité et risque de données personnelles dans les logs. Clarifier le rôle labo sur coûts dans la spécification, RLS, actions et UI.

**Acceptation :** export JSON reconstructible et défenses CSV testées ; données de grande taille et erreur explicite contrôlées ; plus de commande destructive ambiguë ; rôles et documentation cohérents.

## 5. Matrice minimale de validation avant lancement

| Domaine | Scénarios requis | Résultat attendu |
|---|---|---|
| Isolation | anon, vendeur, labo, propriétaire A/B, service role ; lecture, écriture et RPC directes | Matrice d'accès approuvée ; aucun accès inter-tenant non autorisé |
| Restauration | ancien format, doublon, colonnes manquantes, FK externe, JSON externe, interruption | Tout ou rien ; incompatibilité claire ; aucune fuite |
| Vitrine | commande valide, double clic, requêtes simultanées, quota, modification du payload | Commande exacte une fois ; abus limité sans blocage généralisé |
| Stock/OF | expiré, frais/congelé, quantité partielle, coût nul, 300+ lots, deux sites | Règle métier identique UI/SQL ; coûts et mouvements exacts |
| Caisse et cake | TVA, remise, arrondis, panne réseau, reprise | Montants cohérents, pas de doublon ni perte silencieuse |
| Hors ligne | stockage plein/corrompu, 101+ OF, plusieurs onglets, changement compte | Conservation, signalement, isolation et reprise contrôlée |
| Infrastructure | authentification lente, sauvegarde absente, bit-flip, restauration isolée | Détection, alerte, comportement sûr et preuve de récupération |
| Livraison | lint, typecheck, tests, build, tests SQL/PostgREST | Checks obligatoires verts sur le commit candidat |

## 6. Conditions de décision GO / NO-GO

**NO-GO** si une des conditions suivantes reste inconnue ou échoue : isolation inter-tenant et accès directs ; capacité de restaurer les données utilisées ; calculs de coûts/stock des fonctions actives ; migrations réellement appliquées ; intégrité des files hors ligne utilisées ; tests de bout en bout des commandes si vitrine activée. Un pilote limité peut accepter un risque résiduel seulement si le propriétaire le documente avec les fonctions désactivées et une solution manuelle.

**GO conditionnel** après correction/reproduction des points P0, revue indépendante des migrations, répétition de restauration, réussite de la matrice ci-dessus sur une version identifiée et validation écrite du métier, de la sécurité et de l'exploitation. Conserver pour chaque anomalie une preuve de test, version, responsable et risque résiduel ; ne pas déduire la sûreté des 366 tests seuls.

## 7. Décisions à prendre par le propriétaire

1. Le prototype HTML/Electron est-il une simple démo ou un produit supporté ?
2. Quelles fonctionnalités sont réellement activées chez le pilote et sur quelle base ?
3. Le laboratoire doit-il accéder aux coûts ? Qui peut publier une vitrine et changer le plan ?
4. Quelle règle officielle HT/TTC, TVA, frais, MO et coût en cas de perte ou OF partiel ?
5. Quelle durée maximale de perte de données et de rétablissement (RPO/RTO) ? Qui reçoit les alertes et teste les restaurations ?
6. Qui administre les protections de branche, les environnements isolés, les secrets et le stockage privé des sauvegardes ?
7. Quelle politique d'anti-abus et de conservation de données visiteurs est acceptable ?

**Livrable de cette analyse :** ce rapport et ce plan. Aucun correctif, aucune migration, aucun changement de configuration, aucune publication ni modification des sources Drive n'ont été effectués.
