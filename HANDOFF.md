# PâtisGest — Passation et rapport comparatif

Cette passation accompagne la [PR #4](https://github.com/Youcef16052008/PatsyGest/pull/4) vers `main`. Le [commit `2166c71`](https://github.com/Youcef16052008/PatsyGest/commit/2166c716375d0a7241603bf06d63645c64eb9c14) livre les changements de l’application, les maquettes et le rapport ; la présente mise à jour documentaire fait partie de la même PR. Les [preuves et notes des sprints précédents](https://github.com/Youcef16052008/PatsyGest/blob/ff1181cd458664a50deb66b63e1e5f64564c5346/HANDOFF.md) restent consultables dans l’historique. Leurs chiffres et consignes de branche ne sont pas l’état actuel.

**À retenir pour la reprise :** le rapport a été refait sur demande de l’utilisateur parce que le premier comparatif, centré sur des caisses généralistes et une feuille de route, ne répondait pas à la question. Comparer des **logiciels de gestion de pâtisserie**, sur les mêmes tâches : ce qu’ils font, comment, pourquoi le parcours est meilleur et quel mécanisme adapter. Le besoin le plus net est **un dossier unique de la demande client à la fiche labo et au lot fabriqué**. C’est une proposition, pas une fonctionnalité livrée.

[État du projet](#état-du-projet) · [Relancer les aperçus](#relancer-les-aperçus) · [Rapport comparatif](#rapport-comparatif) · [Points à vérifier avant de coder](#points-à-vérifier-avant-de-coder)

## État du projet

| Livrable | Ce qui est dans le dépôt |
| --- | --- |
| [Application principale](patisgest-app/README.md) | Next.js dans `patisgest-app/`. Cinq apparences — Atelier, Pilotage, Mise en place, Comptoir, Essentiel — et mode clair/sombre mémorisé par navigateur. Vues Stocks, Caisse et Production réorganisées sans mélanger les données de démo et celles d’un établissement connecté. `PâtisGest-Final.html` et `patisgest-desktop/` sont des prototypes distincts, pas l’application à faire évoluer. |
| [Guide B](GUIDE-PILOTE.md) | Six gestes métier, reprise et états réels pour propriétaire/labo connecté. Le choix utilisateur est la **maquette B** du [PDF d’onboarding](PâtisGest-Documents/06-Maquettes-Onboarding.pdf). Le fournisseur bénéficie de sa propre création ; les erreurs de lecture ne sont pas interprétées comme des compteurs à zéro. |
| [Données et sécurité](patisgest-app/REVUE-SECURITE-25.md) | Restrictions de lecture des recettes et coûts par rôle, restauration réservée au propriétaire (analyser, garder le même fichier, confirmer). Les migrations [19](patisgest-app/supabase/19-confidentialite-familles-recettes.sql) et [20](patisgest-app/supabase/20-creation-fournisseur.sql) sont versionnées. Elles n’ont pas été appliquées à une base distante durant cette livraison ; vérifier l’état réel avant toute migration, et suivre le guide (19 puis 20 sur un pilote déjà en 18). Ne pas reseeder un établissement existant. |
| [Studio des maquettes](design-studio/README.md) | Cinq maquettes interactives, vues métier et variantes bureau/mobile. Serveur et données fictives séparés de l’application, sans compte ni paiement réel. |
| [Rapport HTML](rapport-patisgest/index.html) | Rapport de référence, autonome, consultable sans JS et imprimable en A4. Sa version texte, comprenant l’analyse et les 27 sources, est reproduite ci-dessous pour la reprise. |

**Validation de cette livraison :** application **280/280** tests, lint et TypeScript sans erreur ; studio **6/6** tests. Le build et les 13 smokes HTTP ont été vérifiés sur l’application de cette livraison. Le dernier redémarrage des trois aperçus a été vérifié : accès sous l’hôte de prévisualisation, connexion démo, devis/production/caisse, studio interactif et rapport sur cinq largeurs, sans JS et à l’impression (13 pages A4). Les vérifications Vercel de la PR ont passé sur `2166c71` ; voir la PR pour l’état du dernier head.

**Ne pas présenter le pilote comme prêt pour la production.** La connexion sur l’environnement réel, l’exercice réel de sauvegarde/restauration, la journée hors ligne et sa reprise, la revue de coût à la main avec trois pâtissiers, l’onboarding chronométré en moins d’une heure et la validation légale/comptable restent des vérifications terrain. Le [guide pilote](GUIDE-PILOTE.md) contient le protocole. Les références métier restent le [cahier des charges](PâtisGest-Documents/01-Cahier-des-Charges-PatisGest-v4.md), notamment RC‑01 à RC‑10, et la [roadmap](PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.md). Une commande fictive ou une fixture ne valide ni la fiscalité ni le paiement.

## Relancer les aperçus

Ne pas dépendre d’un ancien lien de sandbox ni des scripts temporaires d’une session. Dans Arena, lancer ces commandes comme processus persistants (`start_process`) dans trois services séparés. Les aperçus doivent écouter sur `0.0.0.0` et le navigateur ne doit pas joindre un backend via `localhost`. Le rapport et le studio n’ont pas besoin de l’application pour fonctionner.

**Rapport** (port 4180, depuis la racine) :

```sh
python3 -m http.server --bind 0.0.0.0 --directory rapport-patisgest 4180
```

**Application principale** (port 3000, démo isolée, Node ≥ 22) :

```sh
cd patisgest-app
npm ci  # si les dépendances ne sont pas déjà installées
export PATISGEST_DEMO_MODE=true
export PATISGEST_DEMO_SECRET="$(node -p "require('node:crypto').randomBytes(32).toString('hex')")"
NEXT_PUBLIC_SUPABASE_URL='' NEXT_PUBLIC_SUPABASE_ANON_KEY='' \
  npm run dev -- --hostname 0.0.0.0 --port 3000
```

Ouvrir `/connexion`, puis **Essayer · Propriétaire**. Utiliser `dev` : le mode démo est volontairement verrouillé en production. L’hôte de preview du port 3000 est autorisé par `next.config.ts` via `E2B_SANDBOX_ID`. Vérifier non seulement la page de connexion, mais aussi son POST et l’ouverture du tableau de bord. Le stockage de démo `patisgest-demo-v1` peut rester vide avant le premier enregistrement : les données initiales sont en mémoire, pas absentes de l’interface.

**Studio** (port 4173, depuis la racine, pas d’installation npm) :

```sh
PORT=4173 node design-studio/serve.mjs
```

**Pour refaire les contrôles :** dans `patisgest-app/`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, puis `npm run test:smoke`. Arrêter le `next dev` du même checkout avant le smoke HTTP : le test lance son propre serveur sur 3411. Ne pas committer le changement automatique de `next-env.d.ts` ou de configuration générée. Depuis la racine : `node --test design-studio/tests/*.test.mjs`.

## Rapport comparatif

**Périmètre :** une pâtisserie à Oran avec un petit labo et un comptoir, qui vend aussi des gâteaux sur commande. Comparaison de six outils spécialisés : **Almawarid, ProCake, Pastria, Gramme, Bakesy et BakeSmart**. Les logiciels étrangers sont des références pour un geste précis, pas forcément des options déployables en Algérie. Les caisses généralistes ne sont pas le sujet.

**Niveaux de preuve :** « vu » = page, outil ou formulaire public consulté en novembre 2026 ; « décrit » = documentation, capture ou cas publié, pas un back-office testé ; « vérifié chez nous » = manipulation dans la démo PâtisGest ou lecture du code précisée ; « proposé » = pas livré. Aucun envoi de demande ni paiement réel chez les concurrents. Ni les téléchargements, ni les notes, ni les comptes créés ne mesurent les usages actifs ou la rétention. Aucun gain de temps comparatif n’a été mesuré.

### Verdict

- **Pour capter la commande :** Bakesy rend la demande accessible par un lien, sans app côté client. BakeSmart montre comment des choix structurés passent au prix et au décorateur.
- **Pour fixer un prix :** ProCake raisonne en moule, volume et composants. Pastria répond avant l’inscription. Gramme rend visible l’impact d’un achat sur les recettes, y compris les sous-recettes.
- **Pour faire circuler le travail entre labo et boutique :** Almawarid est le rival direct étudié en Algérie. Son offre présente un flux depuis la commande ou le besoin de vitrine jusqu’à la fournée et au transfert, en DA, avec assistance locale.

PâtisGest sait déjà suivre un devis, gérer des lots, différencier les stocks et lancer une fournée. **Ces briques ne forment pas encore un seul dossier gâteau.** C’est cette liaison qui compte, pas le nombre de modules.

### Almawarid — Le concurrent direct en Algérie

**Ce qu’il fait et comment.** L’éditeur découpe la journée par rôle : le labo calcule et lance les fournées, la vitrine reçoit, le gérant compte les espèces. La commande porte un retrait daté et un QR de suivi ; la confirmation est annoncée comme réservant le gâteau au client et donnant une fournée à la bonne date. La vitrine demande ce qui manque, le labo prépare, le transfert a un bon numéroté. L’offre décrit aussi des recettes imbriquées, des coûts par fournée (matières, heures, frais), les pertes et un réassort proposé d’après les ventes des mêmes jours et le stock. Le panier illustré en boulangerie regroupe baguettes, croissants et msemen pour **310 DA** ; ce n’est pas un encaissement exécuté. ([1][s1], [2][s2])

**Pourquoi c’est intéressant.** L’éditeur est à Oran, facture son abonnement en DA et annonce reprise Excel et accompagnement en français/arabe par téléphone ou WhatsApp. On peut voir les gestes du métier avant d’adopter l’outil. Google Play affiche **1 000+ téléchargements tous métiers**, pas 1 000 pâtisseries. Aucun test du flux labo privé, du mode Windows hors ligne ou de la conformité. ([1][s1], [3][s3])

**Où il fait mieux et quoi reprendre.** Chez nous, confirmer le devis ne crée pas la fournée. La clôture comparée porte sur les quantités et non sur le tiroir. Reprendre le passage **« à fabriquer → prêt à retirer »** et le besoin de vitrine, avec même référence sur la fabrication et le transfert. Faire plus simple pour un petit atelier : importer dix références et produire la première fiche ensemble, sans imposer de configurer la salle, les tables ou la paie.

### ProCake — Du moule et de la recette au dossier de commande

**Ce qu’il fait et comment.** Une ganache ou une génoise se chiffre au volume (cm³) ; les macarons ou décors peuvent se compter à l’unité. On assemble composants, temps de travail et consommables, et on adapte la fiche à un moule cible ou à un nombre d’unités. Seul le client est requis pour commencer une commande : date, produits, parts et conditions se complètent ensuite. L’éditeur décrit le coût et la marge dans le dossier, l’acompte/solde, le calendrier et la génération depuis la commande du devis, de la liste de courses et de la fiche de fabrication. La vitrine présentée est un formulaire de **contact**, pas la preuve d’une commande ferme en ligne. ([4][s4], [5][s5], [6][s6])

**Pourquoi c’est intéressant.** La taille d’un gâteau change le coût et les quantités plutôt que de forcer à refaire un tableur. Le brouillon laisse saisir la demande même incomplète. L’équipe de MyCake dispose d’un canal vers les pâtissiers et présente un mini-calculateur public. **Plus de 200 comptes créés** est une déclaration de l’éditeur, pas un chiffre d’actifs ; l’essai complet de 7 jours exige une carte. ([4][s4], [5][s5])

**Où il fait mieux et quoi reprendre.** `Simulation de prix` et `Cake Design` sont distincts chez nous. Le devis exige un prix HT, une date et des parts saisis à la main, et ne se nourrit pas d’un moule ou d’une recette. Commencer par les parts, ajuster le moule, séparer quantités redimensionnables et frais fixes, préremplir le devis. Aller plus loin en conservant le prix accepté et la version utilisée, puis en reliant le devis au lot produit. Le vendeur voit le prix sans avoir accès aux coûts matière.

### Pastria — Un résultat avant le compte

**Ce qu’on peut voir.** Deux sens de calcul, moule → parts et parts → moule, avec une taille de portion et une idée de découpe. À 4,5 cm de haut, le tableau donne **16 parts moyennes** pour un rond de 26 cm et **21** pour 30 cm (hypothèse : 150 cm³ par part). Le calculateur de coût montre une recette d’éclair ; l’exemple éditorial passe de **0,68 € par pièce** pour matières, pertes et petits frais à **2,69 €** avec main-d’œuvre et charges. Ces valeurs ne sont pas des prix algériens. Ces outils publics ne conservent pas le calcul. Le SaaS décrit fiches techniques, sous-recettes, historique des marges, agenda/iCal et relevés d’hygiène exportables selon l’offre. ([7][s7], [8][s8], [9][s9])

**Pourquoi c’est intéressant.** On peut résoudre une question immédiate avec un exemple avant de constituer le catalogue. L’hypothèse de portion est lisible. Offre de départ sans carte, 10 recettes, mais un seul utilisateur, inscription professionnelle avec SIREN/SIRET français et pas de caisse ni de gestion de réseau de boutiques. Pas de chiffre d’actifs vérifié. ([7][s7])

**Où il fait mieux et quoi reprendre.** PâtisGest a une démo riche, mais on ouvre un atelier puis un module au lieu de commencer par « quel moule ? ». Donner une estimation sans compte en DA, sur un entremets ou un coffret, puis pouvoir **garder explicitement les hypothèses dans un brouillon** sans tout ressaisir. Garder nos avantages en rôles et en séparation Labo/Boutique.

### Gramme — Faire remonter une hausse d’achat aux recettes

**Ce qu’il fait et comment.** La visite publique de l’atelier de démonstration Maison Duprat montre une facture de **9 lignes** et le chemin vers le suivi de marge. D’après l’éditeur, le scan rapproche produit, conditionnement et prix avec la mercuriale (historique des prix fournisseur) ; on voit les recettes touchées, y compris via leurs préparations communes. L’exemple d’entremets donne un coût matière de **34,13 €** avant découpe, soit **37,51 € pour l’équivalent vendable** à 91 % de rendement après parage. Ce n’est pas un nouveau prix d’achat. ([10][s10], [11][s11], [12][s12])

**Pourquoi c’est intéressant.** Le chef veut savoir *quels prix revoir*, pas seulement scanner un PDF. La visite est visible sans compte ; une visio sur atelier de démo et la reprise des fiches manuscrites ou Excel sont annoncées. Le forfait d’installation accompagné (à partir de **300 € HT** en Starter, en plus de l’abonnement) peut ôter de la saisie mais augmente le coût d’entrée. La précision du scan et le nombre d’utilisateurs actifs n’ont pas été vérifiés. ([10][s10], [11][s11], [13][s13])

**Où il fait mieux et quoi reprendre.** PâtisGest gère sous-recettes et conversions en connecté et valorise des besoins à partir des lots, mais il faut ouvrir la simulation pour un produit ; pas de vue repérée « cette hausse touche ces recettes » depuis une réception. Afficher ancien/nouveau prix par kg, effet par part vendable et source de chaque prix. Présenter côte à côte **estimation au prochain achat** et **coût des lots utilisés**. Commencer par une saisie validée plutôt que par l’OCR.

### Bakesy — Récupérer les demandes du téléphone au lieu du chat

**Ce qu’on a vu.** Pretty Pineapple Bakery indique ses règles avant le formulaire : minimum **48 $**, délai typique **une semaine**, acompte typique **50 %**. Ce sont ses règles, pas celles de Bakesy par défaut. « Request Order » mène aux biscuits décorés à partir de 48 $ la douzaine. La boutique distingue demande, devis après vérification de la date, puis acompte pour réserver. Début du formulaire consulté, sans envoi. Le guide décrit champs personnalisés et photo d’inspiration ; la fiche du store décrit la reprise des détails dans la facture. ([14][s14], [15][s15], [16][s16], [18][s18])

**Pourquoi c’est intéressant.** Bakesy donne un lien à coller dans une bio Instagram ou à envoyer à ses clients, sans app à leur faire installer. Un avis App Store raconte le remplacement d’un constructeur de site trop difficile et la publication sur les réseaux ; un avis Google Play regrette la saisie longue sur téléphone. Retours individuels. Google Play affiche **100 000+ téléchargements** ; l’App Store US affiche **4,9/5, environ 7 400 notes**. Téléchargements et notes ne comptent ni abonnés ni entreprises actives. ([16][s16], [17][s17], [18][s18])

**Où il fait mieux et quoi reprendre.** Chez nous, le devis se saisit en interne ; aucun formulaire public de demande repéré. Partager une page légère depuis WhatsApp, afficher délais et retrait avant de demander les détails, et distinguer « demande reçue » de « retrait confirmé ». Faire suivre la même demande vers devis, capacité et fiche labo sur le grand écran de l’artisan.

### BakeSmart — Livrer les bonnes informations au décorateur

**Ce qu’on a vu et ce qui est décrit.** Montgomery Bakehouse distingue catalogue et demande sur mesure. Formulaire public : retrait, date (éventuellement approximative), invités, budget, description et photo facultative. Pas de soumission. Côté atelier, la *Cake Matrix* règle le prix selon taille, parfums, couches, garnitures, glaçage et décors ; le rapport additionne les bases par jour, taille et parfum ; le *Deco Ticket* reprend composition, retrait, consignes et photo. Le guide de démarrage montre le tableur à remplir pour les formes, tailles, options et suppléments : des règles réutilisables, mais un vrai paramétrage. Le lien entre ce formulaire public et le *Deco Ticket* n’a pas été testé de bout en bout. ([19][s19], [20][s20], [21][s21], [24][s24])

**Pourquoi des artisans l’ont choisi.** Dans le témoignage éditeur de Cakes D’Sabores, la recommandation d’un confrère puis la matrice et le commerce en ligne intégré ont aidé à remplacer des formulaires papier épars et un site séparé. La vitrine de ce client affichait « Coming soon » à la consultation ; témoignage historique, pas confirmation d’une commande en ligne actuelle. Chez Helen Bernhard Bakery, le patron rapporte **20 commandes en ligne ou plus par jour sans devoir les retaper**. Ce n’est ni une moyenne représentative, ni un effet causal mesuré. ([22][s22], [23][s23], [25][s25])

**Où il fait mieux et quoi reprendre.** Chez nous, des options et des notes alimentent un devis ; le ticket interne connecté n’est pas une consigne pour le décorateur. « Marquer produit » change un statut sans ouvrir de fournée. Fournir d’emblée quelques modèles locaux plutôt qu’une matrice vide ; gérer les commandes simples et laisser le sur-mesure passer en devis manuel. Sortir les bases à cuire en lot et une fiche par gâteau, liée à la recette et au lot sorti.

### Trois tâches comparées à PâtisGest

#### A. « Un gâteau de 20 parts pour samedi. »

- **Observé dans la démo Propriétaire :** devis fictif pour le 5 décembre 2026, **20 parts**, **12 000 DA HT** saisis, **3 600 DA HT** d’acompte simulé, solde **8 400 DA HT**. PâtisGest crée les jalons achats (J−3), production (J−1), retrait (J). Après confirmation, **4 fournées avant, 4 après** : il faut transmettre la commande au labo séparément. Aucun paiement réel.
- **Repères :** Bakesy ouvre la demande au client, ProCake décrit le coût et la fiche depuis la commande, BakeSmart réutilise les choix dans le rapport et le ticket de décoration. La valeur vient de la réutilisation des choix, pas des seuls statuts. ([6][s6], [16][s16], [21][s21])
- **À essayer chez nous :** client → date, parts, parfum, photo facultative ; artisan → coût, devis, capacité, acompte enregistré ; labo → une fiche avec moule, montage, déco, version, quantités et retrait ; boutique → le lot relié à la commande. Une demande non validée ne réserve pas le créneau.

#### B. « Le beurre augmente. Faut-il changer les prix ? »

- **Observé dans la démo :** sur l’éclair chocolat, prix de vente simulé **250 DA HT**, une hausse de **15 % de toutes les matières** (pas du beurre seul) change le coût unitaire de **106,32 à 114,17 DA HT** et la marge estimée de **143,68 à 135,83 DA**. Les autres coûts ne varient pas et le prix n’est pas modifié. La démo utilise le premier lot selon FEFO sans garantir qu’il couvre la quantité. En mode connecté, le coût et la couverture des besoins sont calculés sur les lots disponibles ; un coût partiel est signalé.
- **Repères :** Gramme part de l’achat pour signaler les recettes affectées, Pastria transforme un diamètre en parts, ProCake adapte les quantités au moule. « Combien de parts ? » et « quelles quantités ? » sont deux questions différentes. ([5][s5], [8][s8], [12][s12])
- **Exemple proposé :** beurre de **1 400 à 1 610 DA/kg**, 1,2 kg utilisés pour 20 parts vendables : **+252 DA par série et +12,60 DA par part** au prix du prochain achat. Un ancien lot couvrant la production n’a pas pris cette hausse, et on ne modifie pas rétroactivement le devis accepté. Utiliser l’écart pour décider du prochain devis.

#### C. « Que met-on en fabrication pour demain ? »

- **Observé dans la démo :** on fait passer une fournée de croissants de « À lancer » à « En cours ». Le planning calcule matières et charge d’ordres déjà datés, pas une quantité à lancer depuis la demande de vitrine. À la caisse, sélectionner une tartelette après un éclair **remplace** l’article ; ce n’est pas un panier multiproduit. L’import Z ne remplace pas le panier.
- **Repères :** BakeSmart agrège les bases par jour/taille/parfum pour les commandes ; Almawarid présente une estimation par ventes et stock et une demande vitrine → labo avec transfert. Ils font remonter **le besoin** au poste de travail ; le tableau seul ne décide pas quoi faire. ([1][s1], [21][s21])
- **Exemple proposé :** 22 ventes comptoir attendues + 6 pièces confirmées en plus − 4 pièces utilisables demain = **24 à préparer**, sans compter deux fois les commandes. Montrer à chaque ligne pourquoi elle existe, présenter les ruptures et la disponibilité, laisser le labo valider le lancement. Conserver quantité, lot, destination et responsable jusqu’à la vitrine. Séparer écarts de produits et écarts d’espèces.

### Tableau des écarts par tâche

| Tâche | Repère utile | PâtisGest actuel | Ce qui peut devenir meilleur |
| --- | --- | --- | --- |
| Première estimation | Pastria : moule/parts et modèles sans compte | Simulation dans la démo, après entrée dans l’atelier | Calcul de 20 parts en DA qui se transforme en brouillon si le pâtissier le décide |
| Prendre une commande | Bakesy : lien, conditions et formulaire mobile | Saisie interne dans Cake Design | Demande partageable, retrait expliqué, validation distincte |
| Chiffrer et deviser | ProCake : composants, volume/unité et documents liés | Coûts et devis séparés, prix saisi | Chiffrage par recette et moule, prix conseillé vérifiable, devis prérempli |
| Fabriquer ce qui a été vendu | BakeSmart : bases à cuire et fiche de décoration | Jalons et ordres de fabrication distincts | Même référence pour devis, fiche labo, ordre et lot |
| Réagir à la hausse d’un ingrédient | Gramme : achat → recettes et marges touchées | Simulation à la demande et prix liés aux lots | Coût au nouvel achat séparé du coût des lots, écart par produit |
| Relier labo et comptoir | Almawarid : demande de réassort et transfert | Lots par site, transferts, blocage/rappel, OF versionné | Besoin boutique prêt à valider, historique du passage d’un site à l’autre |
| Vendre et rapprocher | Almawarid : panier illustré et comptage annoncés | Un article par vente, rapprochement des quantités | Un panier par client après validation de la reprise, puis bilans séparés espèces/produits |

### Pourquoi ces outils sont adoptés : ce qu’on sait et ce qu’on ne sait pas

1. **Prouver l’intérêt avant le compte.** Les calculateurs publics de Pastria et l’estimation ProCake, relayable dans l’écosystème MyCake, évitent de remplir tout un catalogue pour essayer. Leur taux de conversion n’est pas connu. Notre test : un seul parcours démo continu, du prix à la fiche labo. ([4][s4], [8][s8], [9][s9])
2. **Suivre les habitudes existantes.** Bakesy laisse garder l’audience et ses canaux ; Almawarid propose le support dans la langue et le canal de travail et la reprise des listes. Gramme annonce une installation accompagnée, plus chère mais utile si les recettes sont déjà dans des carnets ou fichiers. Mesurer chez nous le premier lien envoyé ou le premier vrai produit importé, pas les comptes créés. ([1][s1], [11][s11], [16][s16], [18][s18])
3. **Remplacer une tâche répétitive de bout en bout.** Les cas BakeSmart documentent le besoin métier (papiers épars, double catalogue, commandes à retaper), pas une croissance imputable au logiciel. Compter chez nous combien de fois nom, parfum et date sont saisis jusqu’à la fabrication. ([22][s22], [25][s25])

**Cas d’appui hors des six : Cybake chez Cooplands.** Le réseau gérait déjà le réassort avec Cybake depuis 2020. Il a ensuite essayé **Cybake ISB**, un produit distinct, pour planifier les sandwichs sur tablette selon le site et l’heure. Le *York Press* (4 mars 2024) rapporte un essai comparé à cinq boutiques témoins, puis le déploiement ; la responsable rapporte une hausse, sans chiffre ni données brutes. Reprendre la méthode — tester une tâche et regarder pertes, ruptures, disponibilité — et non les résultats d’un grand réseau anglais pour une pâtisserie à Oran. ([26][s26], [27][s27])

### Avantage à construire et comment le prouver

**Priorité : demande → devis chiffré par recette et moule → devis accepté et acompte enregistré → créneau confirmé → fiche labo et ordre rattachés à la version → lot disponible au retrait.** Le client voit l’état, le vendeur voit le prix et le labo voit les consignes. Les rôles autorisés seuls voient les coûts. Le reçu d’une demande et l’enregistrement d’un acompte ne sont pas un paiement en ligne.

1. **Relier d’abord devis et fabrication.** Réutiliser Cake Design et les ordres versionnés. Démarrer avec entremets, gâteau d’anniversaire et coffret. Garder les hypothèses et les choix utiles (format, couches, parfum, décor, retrait, photo facultative). Figer le devis accepté et la version du travail à faire ; ouvrir **un seul** ordre par confirmation même si elle est rejouée, en gardant les contrôles de rôle. Le labo doit lire le dossier et retrouver le lot produit sans recopier les champs.
2. **Expliquer le prix avant de le soumettre.** Exemple public en DA ajustable en parts, pertes et durée ; distinguer matières, coût complet, rendement vendable et prix HT proposé. Signaler un coût incomplet, ne pas transformer une estimation partielle en prix plancher. Conserver l’historique de prix et séparer valorisation des lots et coût du prochain achat, sans écraser les prix acceptés.
3. **Finir la journée réelle en boutique.** Faire une liste « Demain au labo » issue des commandes et du réassort, validée par le chef. Avant de promettre le parcours boutique complet : panier multiproduit, reprise du ticket sans doublon, lot retraçable, contrôle des lots non utilisables, rapprochement lisible. Faire la mise en main sur des appareils ordinaires, en français/arabe pour la cible. Ne pas commencer par la paie, la 3D, le scan ou un paiement distant.

**Mesure proposée, pas acquise :** reprendre le même gâteau de 20 parts avec le cahier/WhatsApp puis, si autorisé, un logiciel de test. Compter les champs retapés, les allers-retours, les erreurs et le délai jusqu’à la fiche labo. Vérifier le coût à la main à données identiques (matières, temps, rendement net), puis une hausse ciblée. Pilote sur cinq boutiques, un vrai produit chacune : objectifs d’essai de 8 demandes exploitables sur 10 (date, quantité, modèle suffisants pour deviser), zéro ressaisie labo sur les modèles standard, et 4 boutiques sur 5 refaisant une commande sans aide en semaine 4. Ces seuils ne sont ni des résultats, ni une prédiction.

### Sources du rapport

1. [Almawarid — Offre pâtisserie, laboratoire et vitrine, mise à jour du 23 octobre 2026][s1]
2. [Almawarid — Panier illustré en DA et présentation de la session de caisse][s2]
3. [Google Play — Almawarid Business & POS : téléchargements tous métiers][s3]
4. [ProCake — Calcul en page d’accueil, lien avec MyCake et comptes déclarés][s4]
5. [ProCake — Recettes au volume ou à l’unité, moules et fiche de fabrication][s5]
6. [ProCake — Fiche commande, états et documents générés][s6]
7. [Pastria — Écrans publiés, périmètre labo, limites et conditions du compte][s7]
8. [Pastria — Outil public : taille du moule et nombre de parts][s8]
9. [Pastria — Outil public : coût par portion et exemple d’éclair][s9]
10. [Gramme — Visite publique de l’atelier de démonstration Maison Duprat][s10]
11. [Gramme — Étude d’un entremets, sous-recettes et rendement][s11]
12. [Gramme — Mercuriale, prix de facture et recettes touchées][s12]
13. [Gramme — Déroulé annoncé de la démonstration en visio][s13]
14. [Pretty Pineapple Bakery — Vitrine Bakesy et bouton « Request Order »][s14]
15. [Pretty Pineapple Bakery — Début de la demande : produit et prix de départ, sans envoi][s15]
16. [Bakesy — Lien de boutique, configuration de formulaire et photos][s16]
17. [Google Play — Bakesy : tranche de téléchargements, avis et notes de version][s17]
18. [App Store US — Bakesy : notes et avis sur la mise en route][s18]
19. [Montgomery Bakehouse — Catalogue public lié à BakeSmart][s19]
20. [Montgomery Bakehouse — Formulaire public, consulté sans envoi][s20]
21. [BakeSmart — Cake Matrix, rapport de couches et exemple de fiche décorateur][s21]
22. [BakeSmart — Cas client Cakes D’Sabores : passage des formulaires à un dossier partagé][s22]
23. [Cakes D’Sabores — Ancienne vitrine sur BakeSmart, commandes en ligne indisponibles à la consultation][s23]
24. [BakeSmart — Guide de configuration initiale et tableur d’accompagnement][s24]
25. [BakeSmart — Témoignage Helen Bernhard Bakery sur les commandes en ligne][s25]
26. [Cybake — Cas Cooplands : réassort, puis essai de planification ISB][s26]
27. [The York Press — Annonce du déploiement de Cybake ISB chez Cooplands, 4 mars 2024][s27]

[s1]: <https://almawarid.app/logiciel-patisserie-laboratoire-algerie/>
[s2]: <https://almawarid.app/blog/logiciel-boulangerie-algerie-caisse-production/>
[s3]: <https://play.google.com/store/apps/details?id=app.almawarid>
[s4]: <https://www.procake.io/fr>
[s5]: <https://www.procake.io/fr/fonctionnalites/recettes>
[s6]: <https://www.procake.io/fr/fonctionnalites/commandes>
[s7]: <https://pastria.fr/logiciel-patisserie>
[s8]: <https://pastria.fr/outils/taille-gateau-nombre-personnes>
[s9]: <https://pastria.fr/outils/calcul-cout-revient-patisserie>
[s10]: <https://gramme.app/>
[s11]: <https://gramme.app/logiciel-patisserie>
[s12]: <https://gramme.app/fonctionnalites/scan-factures-mercuriale>
[s13]: <https://gramme.app/demo>
[s14]: <https://shop.bakesy.app/b/pretty-pineapple-bakery>
[s15]: <https://shop.bakesy.app/order-request/new/ae1dd2be-5f6f-4733-8938-ca8a85d5a604>
[s16]: <https://www.bakesy.app/post/getting-started-with-bakesy>
[s17]: <https://play.google.com/store/apps/details?id=app.bakesy.release&hl=en_US>
[s18]: <https://apps.apple.com/us/app/bakesy-home-bakery-biz-app/id1515139393>
[s19]: <https://montgomerybakehouse.bakesmart.com/store/categories>
[s20]: <https://montgomerybakehouse.bakesmart.com/ask?store=true>
[s21]: <https://bakesmart.com/cake-matrix>
[s22]: <https://bakesmart.com/blog/baking-up-success-cakes-dsabores-a-bakesmart-customer-story>
[s23]: <https://cakesdsabores.bakesmart.com/store/categories>
[s24]: <https://help.bakesmart.com/en/article/bakesmart-spreadsheet-user-guide>
[s25]: <https://bakesmart.com/blog/bakesmart-bakery-success-story>
[s26]: <https://cybake.com/cooplands-bakery/>
[s27]: <https://www.yorkpress.co.uk/news/24159996.cooplands-bakery-installs-software-york-based-cybake/>

## Points à vérifier avant de coder

Ces points viennent du code et du benchmark ; ils **n’ont pas été corrigés par le rapport**. Si l’utilisateur demande une évolution, commencer par reproduire le cas de 20 parts et présenter un périmètre réduit. La passation ne vaut pas autorisation de modifier l’application ou les données distantes.

| Point de départ | Fichiers et contrôle utile |
| --- | --- |
| Dossier gâteau et commande → labo | `patisgest-app/src/components/cake-operations.tsx` (démo), `cake-forms.tsx`, `cake-ticket.tsx`, `src/lib/actions-journaux.ts`, `supabase/09-journaux-ecritures.sql` et `14-cake-edition-cgv-ticket.sql` (connecté). `evoluer_cake` ne crée pas d’OF. Vérifier un seul OF par confirmation et par version du devis ; ne pas consommer le stock au simple dépôt d’une demande. |
| Acompte, solde et ticket | Le seuil de confirmation actuel est de 30 % du **HT**. Côté connecté, la transaction limite le montant enregistré et vérifie le solde sur le HT ; le ticket peut déduire les montants du **TTC**. Harmoniser et tester avec TVA non nulle avant de partager un devis ou d’annoncer un solde. Le ticket interne n’est pas une facture fiscale et aucun PSP n’a été testé. |
| Coût, version et produits distincts | `simulation-operations.tsx` pour la démo ; `actions-simulation.ts`, `actions-couts.ts`, `cost-sheet.ts` et `fefo-cost.ts` pour le connecté. `simuler_recette` reçoit l’ID du produit, mais la lecture des charges dans `ficheCoutReal` filtre établissement et version active sans filtre explicite sur ce produit. **Risque à reproduire, pas un bug mesuré** : tester deux produits actifs aux temps, rendements et frais différents avant de réutiliser ce calcul dans le devis. Conserver les formules RC du cahier. |
| Fournées, disponibilités et FEFO | `production-board.tsx`, `planning-operations.tsx`, `actions-of.ts`, migrations 06/07/11/13/16. Besoins figés dans l’OF ; prélèvement au lancement et lot fini au terme. FEFO donne une priorité de sortie ; dans les chemins lus, le tri DLC et le blocage ne constituent pas un filtre explicite de péremption. Le planning de démo n’est pas une réservation et n’inclut pas les réceptions futures. Vérifier l’éligibilité des lots avant de promettre des quantités, sans supprimer la traçabilité, le blocage ou le rappel. |
| Caisse, reprise et rapprochement | `sale-composer.tsx`, `sale-form.tsx`, `sale-queue.ts`, `reconciliation.ts`. Vente mono-produit déjà payée et enregistrée ; file locale et référence stable si elle a été conservée, distinctes du traitement carte. Le rapprochement compare des **quantités** par site et jour, pas le tiroir ; lecture plafonnée à 500 ventes dans le parcours audité. Tester la reprise après fermeture/coupure avant toute promesse de hors-ligne. |

**Ordre de reprise recommandé :** relire ce rapport et la PR ; rejouer la démo sans données réelles ; si le prochain chantier est confirmé, écrire les critères d’acceptation du dossier 20 parts avant de coder (un devis, un ordre à validation, aucune ressaisie au labo, version et lot retrouvables, prix accepté immuable). Les améliorations de caisse ou un comparatif généraliste ne doivent pas remplacer ce premier test métier.
