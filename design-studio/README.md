# PâtisGest — Studio de maquettes

Cinq pistes **interactives** pour l’interface de gestion, à comparer avant de modifier le pilote. Elles emploient les mêmes articles, ordres de fabrication, ventes et recettes de démonstration. Le guide B a un scénario séparé sur un atelier vierge, pour essayer le premier jalon sans l’ajouter au stock commun.

| Piste | Ce qui change | À essayer |
| --- | --- | --- |
| **01 · Atelier** | Accueil éditorial, photo du métier, couleurs crème et forêt. La production et la caisse restent accessibles dès l’accueil. | Ouvrir une alerte de stock, puis passer au planning. |
| **02 · Pilotage** | Menu latéral, indicateurs, courbe des ventes sur 7 ou 14 jours et inventaire filtrable. | Basculer de 7 à 14 jours, puis rechercher « crème » dans Stocks. |
| **03 · Mise en place** | Le laboratoire passe au premier plan : colonnes par état, heure et quantité sur chaque fiche, lecture en liste disponible. | Démarrer une fournée ou en planifier une autre. |
| **04 · Comptoir** | Accueil orienté caisse : tuiles de produits, panier, total et ticket. | Ajouter un produit, simuler la vente et ouvrir l’aperçu d’impression. |
| **05 · Essentiel** | Une tâche prioritaire, accès courts et guide B mis en avant sur mobile. | Passer en format Mobile et créer un ingrédient dans le guide d’essai. |

## Lancer et comparer

Depuis la racine, avec Node.js (aucune installation npm nécessaire) :

```sh
node design-studio/serve.mjs
```

Ouvrir `http://localhost:4173`. `PORT` permet de choisir un autre port. Dans Arena, le serveur est visible en aperçu sur le port 4173 et accepte le nom d’hôte du proxy. Le navigateur ne contacte aucun service local distinct.

1. En haut, choisir une piste numérotée. Le changement de piste **garde l’écran ouvert** et ses données d’essai.
2. Visiter **Stocks, Recettes, Production** ou **Caisse** dans le menu de la maquette. Utiliser **Bureau / Mobile** pour comparer le même écran à une autre largeur.
3. **Garder en favori** mémorise un choix dans le navigateur. Cela ne soumet pas un vote au serveur. Les autres données de l’essai sont réinitialisées au rechargement.

Le studio sert uniquement [`public/`](public/). Il ne démarre pas l’app Next.js, n’utilise ni compte ni base du pilote et n’a aucun lien vers un encaissement réel. Le ticket imprimable est marqué « Maquette · sans valeur fiscale ». Aucun changement de style n’est appliqué à `patisgest-app/`.

## Références et adaptation

- **Tartine Bakery** [1](https://tartinebakery.com/) : la photographie montre le produit et le geste. Pour Atelier, elle est limitée à l’accueil et aux fiches produit, pas aux tableaux de travail. Photographies originales générées pour la démo.
- **Shopify Polaris** [3](https://shopify.dev/docs/api/app-home/patterns/compositions/index-table) : recherche, filtres et liste d’objets comparables. Pilotage adapte ce principe à la DLC, au niveau de stock et au statut du lot.
- **Atlassian** [1](https://www.atlassian.com/agile/kanban/boards) : des cartes suivent des colonnes qui représentent des états. Mise en place les applique aux fournées ; une action clavier ou tactile déplace la carte, sans glisser-déposer obligatoire.
- **Square** [1](https://my.squareup.com/help/ca/en/article/8334-set-up-item-grid) : un accès direct aux produits via des tuiles. Comptoir le combine avec la quantité et le total du ticket, visibles avant de simuler la vente.
- **GOV.UK Design System** [1](https://design-system.service.gov.uk/components/task-list/) : libeller les états d’avancement. Essentiel conserve la progression du guide B et les dépendances métier propres à PâtisGest ; il ne copie pas la navigation GOV.UK.
- **W3C WCAG 2.2** [1](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) : taille et espacement des cibles d’interaction. Le studio prévoit aussi des contrôles sémantiques et un contour de focus visible, sans revendiquer un audit de conformité complet.

Les polices Manrope et Fraunces sont servies localement ; leurs licences OFL sont dans [`public/assets/`](public/assets/).

## Tests rapides

```sh
node --test design-studio/tests/*.test.mjs
```

Ils couvrent les routes des cinq pistes, l’état commun, les recherches, la progression de production et les totaux du ticket. En complément, dans un navigateur, rejouer une fabrication, un panier et le guide B, puis vérifier que les états sont conservés en changeant de piste.
