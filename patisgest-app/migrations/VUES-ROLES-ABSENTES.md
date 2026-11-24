# Les vues par rôle n'existent pas — ce que ça casse réellement

**Constat relevé le 23 novembre 2026 sur la base pilote `evepzygucfxarpdnflzv` (v43), en lecture seule.**
Aucune écriture, aucune migration appliquée. Ce document décrit, il ne répare pas.

## Le fait

L'application lit neuf vues spécifiques au rôle :

| Vue | Rôle | Modèle |
|---|---|---|
| `labo_articles` | labo | 5 fichiers |
| `labo_lots` | labo | 3 fichiers |
| `labo_recette_versions` | labo | 3 fichiers |
| `labo_ordres_fabrication` | labo | 3 fichiers |
| `labo_cakes` | labo | 2 fichiers |
| `labo_bons_commande` | labo | 1 fichier |
| `labo_ventes_quantites` | labo | 1 fichier |
| `vendeur_lots` | vendeur | 4 fichiers |
| `vendeur_ordres_fabrication` | vendeur | 2 fichiers |

**Aucune des neuf n'existe en base.** Vérifié deux fois : `information_schema.views`
ne contient qu'une ligne (`vitrine_catalogue`), et l'appel direct de
`public.labo_articles` renvoie `42P01`.

Elles sont définies dans `supabase/brouillons/101-confidentialite-labo.sql` et
`115-confidentialite-vendeur-lots-brouillon.sql`, tous deux marqués « NE PAS
DEPLOYER ». Elles n'ont jamais été appliquées.

## Pourquoi les tests ne l'ont pas vu

`tests/labo-confidentialite-db.test.mjs` **applique le brouillon 101 avant de
tester**. Ligne 36 :

```js
await db.exec(await readFile(new URL('../supabase/brouillons/101-confidentialite-labo.sql',…)));
```

Les assertions qui suivent sont vertes — et elles sont justes, puisque les vues
existent alors dans PGlite. Le test prouve que **le brouillon est correct**, pas
que **le déploiement est complet**. Entre les deux, il y a l'application en base,
qui n'a jamais eu lieu.

C'est le mode de défaillance le plus coûteux qui existe : une suite verte qui
décrit un état qui n'est pas celui de la production.

## Ce que ça casse, mesuré compte par compte

Trois comptes existent sur cette base : un propriétaire, un labo, un vendeur.
J'ai rejoué leurs requêtes avec leur identité réelle (`set_config` des claims
JWT, `role authenticated`, puis `rollback`).

### Le labo ne peut pas faire son travail

Le cahier des charges lui confie la production (US-05.1 à US-05.3), le
rétroplanning (US-08.3), la traçabilité (US-11.1) et les transferts (US-14.2).
Or `src/app/(app)/[module]/page.tsx` l'envoie vers `LabWorkspace`, et chaque
branche de ce composant commence par lire une vue absente :

| Module | Vue lue | Écran obtenu |
|---|---|---|
| Recettes | `labo_recette_versions` | « Recettes indisponibles » |
| Achats | `labo_bons_commande` | « Les achats sont indisponibles » |
| Transferts / Traçabilité | `labo_articles` | « Les articles ou les sites sont indisponibles » |
| Planning | `labo_ordres_fabrication` | « Le planning est indisponible » |
| Cake-design | `labo_cakes` | formulaire avec `unavailable` |
| Production | `labo_ordres_fabrication` | ordres vides |
| Stocks | `labo_articles` | **écran vide, sans message** |

Huit modules sur huit. Le dernier est le plus trompeur : il n'affiche pas
d'erreur, il affiche « Aucun article » — l'utilisateur croit que la base est
vide alors qu'elle contient 17 articles.

Le message affiché, lui, est faux : « Vérifiez la connexion et les autorisations. »
La connexion va bien. C'est une vue qui manque. L'utilisateur n'a aucun moyen de
le deviner et contactera le support pour un problème qui n'existe pas.

### Le vendeur peut encaisser, mais à l'aveugle

La caisse fonctionne : `vendre_panier` fait son FEFO côté serveur et vérifie le
stock réel. Une vente aboutit donc normalement.

Mais `lireLots()` renvoie `null` (vue absente), et `SaleComposer` affiche alors
« Stock indisponible » sur chaque produit. Conséquences :

- plus d'indication de disponibilité au moment de composer le panier ;
- plus d'alerte « DLC dépassée » (US-09.x, sécurité alimentaire) ;
- la vente part quand même, et si le stock est insuffisant la RPC enregistre un
  mouvement `« Vente sans stock »` — ce qui est le comportement prévu, mais
  l'utilisateur n'a aucun moyen de l'anticiper.

### Le vendeur lit les prix d'achat

C'est le point le plus grave, et il est l'inverse de ce que les vues devaient
produire. Mesuré avec l'identité du compte vendeur :

```
lots_lus = 13,  pu_lus = 13,  sum(lots.pu) = 8056.00 DZD
```

Le vendeur lit la colonne `pu` — le prix d'achat — sur les treize lots. Les vues
`vendeur_lots` existaient précisément pour ne pas exposer cette colonne. En leur
absence, l'application interroge `public.lots` directement, et la RLS ne filtre
que par tenant, pas par colonne.

Le labo, lui, est correctement protégé sur ce point : la RLS de la migration 17
ne lui ouvre pas `parametres_couts` (0 ligne lue), et `articles.pv_ht` reste
accessible comme prévu (le labo a le droit aux coûts selon RG-15.2).

## Pourquoi les brouillons ne sont pas applicables tels quels

Vérification faite après coup, en base : les brouillons ne sont pas seulement
« non validés », ils sont **inapplicables en l'état**.

`101` révoque trois fonctions internes qui n'existent pas :

```
patisgest_terminer_of_interne   → absente
patisgest_rappel_lot_interne    → absente
patisgest_evoluer_cake_interne  → absente
```

Sa ligne 65 : `revoke all on function public.patisgest_terminer_of_interne(...)`
échouerait. Ces trois fonctions devaient être créées par un brouillon antérieur
(`103`/`109` renomment `terminer_of` et `creer_cake`), qui n'est pas appliqué non
plus.

`115` et `116` appellent `patisgest_site_autorise()` — définie dans le brouillon
`105`, elle aussi absente de la base. Et `105` interroge la table `equipe_sites`,
qui n'existe pas (le module Équipe est inactif par conception).

C'est donc une **architecture de permissions en poupées russes** : les vues
dépendent des policies de sites, qui dépendent d'une fonction de sites, qui
dépend de la table `equipe_sites`, qui dépend des brouillons Équipe. Vingt-huit
brouillons, environ 1 557 lignes, jamais appliqués, dont la moitié pour le seul
module Équipe qui n'est pas censé être actif.

Ce n'est pas un oubli de déploiement. C'est un chantier de refonte des
permissions qui a été écrit, testé en PGlite, et jamais validé sur base réelle.

## Ce que je n'ai pas fait, et pourquoi

**Je n'ai pas appliqué les brouillons 101 et 115.** Quatre raisons :

1. Ils portent leur propre avertissement — « couverture, compatibilité et parcours
   labo non validés » — et je ne peux pas le lever seul : cela demande de tester
   chaque rôle, chaque module et chaque RPC sur une base de recette.
2. `101` crée des policies **restrictives** qui retirent au labo la lecture des
   tables financières. Appliquer la moitié (les vues sans les policies, ou
   l'inverse) casse l'application différemment, et de façon plus grave.
3. Ce sont des migrations de contrôle d'accès. Une erreur ici est une fuite, pas
   un bug d'affichage.
4. **Elles ne s'appliqueraient pas de toute façon** : elles référencent trois
   fonctions internes et une fonction de site qui n'existent pas encore. Il
   faudrait promouvoir au moins `104`, `105` et `109` d'abord — c'est-à-dire
   activer de fait le module Équipe, qui n'a jamais été validé.

**Je n'ai rien modifié en base.** Toutes les requêtes de ce diagnostic étaient en
lecture seule, sous `begin … rollback`.

## L'état du dépôt, lui, n'est pas cassé

Le code est cohérent : il décrit une application où ces vues existent et où la
confidentialité est assurée par `security_barrier` plus vérification explicite de
tenant, rôle, site et module. C'est un bon modèle. Il n'a simplement jamais été
appliqué.

La correction est donc une **opération de déploiement**, pas de développement :
valider 101 et 115 sur une base de recette, rôle par rôle, puis les appliquer en
migration 44 et 45 avec leur entrée dans `repetition.json`.

## Recommandation, dans l'ordre

1. **Avant tout nouveau client** : appliquer 101. Sans elle, un labo ne peut pas
   se servir de l'outil, et un vendeur lit les prix d'achat.
2. Traiter 101 et 115 comme un couple : les appliquer séparément laisse soit une
   application cassée, soit une fuite ouverte.
3. Ajouter à la recette un contrôle qui ne peut pas mentir : vérifier dans la base
   **réelle** que les neuf vues existent. Le test actuel applique le brouillon,
   donc il ne peut structurellement pas détecter leur absence. Un test qui
   interroge `information_schema.views` de la base cible le ferait.
4. Corriger les messages : « Vérifiez la connexion et les autorisations » doit
   devenir « Cette fonction n'est pas disponible sur cette installation » —
   l'utilisateur ne peut pas réparer une vue manquante.

## Ce que ce diagnostic a coûté, et ce qu'il a évité

Une soirée de lecture. Il a évité de livrer un audit « 100 % » qui aurait déclaré
conformes un module labo inutilisable et une confidentialité des prix non
appliquée — deux écarts que la suite de tests verte ne pouvait pas voir, par
construction.
