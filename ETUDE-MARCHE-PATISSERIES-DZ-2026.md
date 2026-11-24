# Étude — ce que paient les pâtisseries algériennes, et comment améliorer PatsyGest

Date : 20/11/2026. Méthode : recherche web sur les pages publiques des éditeurs et de presse
spécialisée. Aucune enquête de terrain. Les niveaux de fiabilité sont indiqués pour chaque chiffre.

## 1. Résumé

- Les pâtisseries paient en priorité le **logiciel de caisse et de stock**, rarement un logiciel de
  production. Le marché propose une entrée gratuite ou à bas prix : 10 000 à 20 000 DA par an pour
  les suites généralistes, 2 500 DA par mois pour la facturation.
- Le plus gros poste réel reste la **main-d'œuvre** (SNMG 24 000 DA depuis janvier 2026, plus
  25 % de cotisations employeur) et les **matières** (farine, beurre, amandes), dont les prix ont
  beaucoup bougé.
- Le paiement reste **majoritairement en espèces**. La carte CIB et Edahabia existe mais reste
  minoritaire chez les petits commerces.
- PatsyGest n'est pas en concurrence directe avec les caisses généralistes : sa valeur est le coût de
  revient des recettes, les lots, la production et les contrôles. Cette valeur doit être démontrée
  auprès des pâtissiers, car aucun concurrent algérien identifié ne publie un prix pour ce créneau.
- **Donnée manquante** : aucune source fiable ne dit quelle part des pâtisseries paie un logiciel.

## 2. Ce que paient les pâtisseries (logiciels)

| Produit | Prix public observé | Type | Fiabilité |
|---|---|---|---|
| Almawarid — Standard | 20 000 DA/an, promo −50 % = 10 000 DA/an ; plan gratuit sans carte CIB | Suite généraliste, pâtisserie incluse | Élevée (pages éditeur, plusieurs pages concordantes) |
| Almawarid — Entreprise | 36 000 DA/an, promo 18 000 DA/an | Idem, multi-utilisateurs | Élevée |
| Almawarid — pâtisserie | « Tarif sur demande » sur la page dédiée ; schéma JSON-LD indique 25 000 DA max | Idem | Moyenne (prix incohérents entre pages) |
| GestDZ — Essentiel / Professionnel / Entreprise | 9 990 / 14 990 / 19 990 DA/an | Gestion commerciale, fabrication (nomenclature) au niveau Professionnel | Élevée (page éditeur) |
| Costy — facturation | 2 500 DA/mois (engagement annuel), 3 000 DA/mois (semestriel), 60 000 DA « à vie » | Facturation collaborative | Moyenne (agrégateur + éditeur) |
| Costy Stock — restauration | Plan gratuit limité, puis 7 / 49 / 149 € par mois | Caisse, fiches techniques, déstockage ingrédients | Moyenne (agrégateur) |
| STOCK-DZpro — caisse | 2 500 à 8 900 DA/mois selon le plan | Commerce, stock | Moyenne (agrégateur) |
| Symloop — POS | 35 000 / 65 000 / 120 000 DA/an | Commerce, restaurant, café | Moyenne : une même page de blog donne aussi « dès 120 000 DA » pour la comptabilité |
| Gramme (France, en €) | 490 €/an Starter, 890 €/an Pro, installation 300–500 € | Boulangerie-pâtisserie, marges | Hors Algérie : référence uniquement |

**Lecture** : le standard algérien est un plan gratuit ou à bas prix, puis un abonnement annuel
entre 10 000 et 36 000 DA. Le plan gratuit est un argument d'entrée répandu.

**Pour PatsyGest** : l'offre Solo à 35 000 DA/an (hypothèse de la roadmap) se situe au niveau des
plans haut de gamme, pas de l'entrée. Elle se justifie seulement si les fonctions de coût de revient
et de production sont clairement supérieures. Il faut le tester sur les pilotes avec deux prix, et
prévoir un palier d'entrée limité (nombre de recettes, de transactions ou de sites) pour rester
comparable au gratuit.

## 3. Ce que paient les pâtisseries (charges et matières)

| Poste | Donnée | Source | Fiabilité |
|---|---|---|---|
| SNMG | 24 000 DA/mois depuis le 1er janvier 2026 (décret présidentiel n° 26-01) | [sindansolutions](https://sindansolutions.com/outils/baremes-algerie/), [joliboaz](https://joliboaz.fr/salaire-minimum-algerie-2026/) | Élevée (deux sources concordantes, dont une citant le texte) |
| Cotisations | Salarié 9 %, employeur 25 %, fonds œuvres sociales 0,5 %, formation et apprentissage 1 % chacun | [sindansolutions](https://sindansolutions.com/outils/baremes-algerie/) | Élevée |
| Exemple de coût | Brut 50 000 DA → coût employeur 62 500 DA | [sindansolutions](https://sindansolutions.com/outils/baremes-algerie/) | Élevée |
| Salaire pâtissier débutant | 25 000 à 40 000 DA/mois | [stgbusinessconsulting](https://www.stgbusinessconsulting.com/blog/business/expatriation-en-algerie-le-guide-ultime-pour-ouvrir-un-restaurant-une-boulangerie-patisserie-ou-un-commerce-des-metiers-de-bouche.html) | Faible (guide commercial d'expatriation) |
| Farine | 90 DA/kg (contre 50 auparavant) | [Le Jour d'Algérie](https://www.lejourdalgerie.com/a-plus-de-550-da-le-kilo-les-cacahuetes-et-la-farine-a-90-da-les-gateaux-de-laid-vont-couter-cher/) | Faible : article de mars 2024, à actualiser |
| Amandes | 2 100 DA/kg | Idem | Faible : 2024 |
| Beurre végétal | 220 à 260 DA/500 g | Idem | Faible : 2024 |

**Les prix de matières ne sont pas utilisables tels quels.** Ils datent de 2024 et viennent de
presse généraliste. PatsyGest doit donc les saisir par le pâtissier lui-même (réceptions et
historique de prix), et non les figer dans l'application.

**Repères de marge** : les sources sur les marges de pâtisserie sont des blogs et ne concernent
pas l'Algérie. À titre indicatif, un exemple chiffré d'éclair donne une marge sur matière autour de
85 % du prix HT, mais une marge nette avant impôt d'environ 14 % après main-d'œuvre, emballage,
structure et invendus (source : [gramme.app](https://gramme.app/articles/calculer-sa-marge-boulangerie-patisserie),
pays non précisé, donc à ne pas transposer sans contrôle).

## 4. Comment les pâtisseries paient

- **Espèces** : mode dominant. Les règles de la Banque d'Algérie (directives de décembre 2025) sont
  rapportées comme durcissant le cash : plafond de paiement entre professionnels, obligation pour
  les commerçants d'accepter la carte CIB ou Edahabia. Source unique et commerciale
  ([Almawarid](https://almawarid.app/blog/fin-du-cash-en-algerie-ce-que-votre-entreprise-doit-faire-maintenant-pour-se-conformer-aux-nouvelles-regles-bancaires/)) :
  **à vérifier dans le texte officiel avant de l'utiliser**.
- **Carte** : pour encaisser par carte en ligne, il faut être inscrit au registre du commerce et au
  fichier national des e-fournisseurs, puis être certifié par le GIE Monétique. Les passerelles
  (Chargily Pay) annoncent 1,5 % à 4,5 % de commission ([sindansolutions](https://sindansolutions.com/blog/payer-en-ligne-algerie-methodes-paiement-2026/)).
- **Paiement à la livraison** : mode dominant pour les ventes en ligne, qui concerne directement les
  commandes d'événements (Aïd, mariages) des pâtisseries.

## 5. Ce qui manque

- Aucune étude de marché publiée sur l'équipement logiciel des pâtisseries algériennes.
- Pas de grille de prix d'un éditeur spécialisé pâtisserie en Algérie (les prix trouvés sont des
  suites généralistes, ou des pages de caisse restauration).
- Prix des matières à jour : à obtenir auprès de vrais pâtissiers et de grossistes.
- Texte officiel de la directive cash et de l'engagement éditeur (art. 74 et 81 de la LF 2026) : à
  faire valider par un conseiller fiscal.

## 6. Comment améliorer PatsyGest (par priorité)

Ces recommandations viennent du marché observé. Elles ne sont pas testées auprès de pâtissiers.

1. **Un palier d'entrée gratuit ou très bas**, limité en recettes ou en transactions. Le marché l'attend
   (Almawarid, Costy Stock). Sans cela, l'offre à 35 000 DA/an part avec un handicap.
2. **Commandes d'événements** : Aïd, mariages, gâteaux sur commande, avec acompte et date de retrait.
   C'est un besoin cité pour la pâtisserie orientale (Almawarid). La table `cakes` et ses acomptes existent
   déjà : à vérifier et à mettre en avant.
3. **Coût de revient à jour** : l'application doit recalculer le coût des recettes à chaque nouvelle
   réception au prix réel. C'est l'argument différenciant contre les caisses. L'historique de prix est
   prévu dans la roadmap : le livrer en priorité.
4. **Ticket et facture conformes** : le marché vend « conforme DGI, D.E. 05-468 ». PatsyGest doit
   vérifier les mentions obligatoires de ses tickets et factures contre ce texte, avant de l'afficher
   comme argument. Je n'ai pas pu lire le texte pendant cette étude.
5. **Interface en arabe et en français** : plusieurs concurrents l'annoncent (Almawarid, Symloop).
   À vérifier dans PatsyGest avant de l'annoncer.
6. **Modes de paiement** : espèces, carte CIB, virement, chèque sur chaque ticket, en plus de la
   facturation à la livraison pour la vitrine. Le schéma prévoit déjà `mode_paiement`.
7. **Charges réelles** : saisir le SNMG 2026 et les cotisations (25 % employeur) dans les paramètres de
   coût, plutôt qu'un taux horaire fixe. Le schéma a déjà `taux_horaire` et `charges_pct`.
8. **Pilotes avec deux prix** : tester 20 000 et 35 000 DA/an auprès de 3 à 5 pâtisseries, et mesurer
   le taux d'acceptation, plutôt que d'afficher une grille.

## 7. Sources

- Almawarid : [boulangerie-pâtisserie](https://almawarid.app/logiciel-boulangerie-patisserie-algerie/),
  [Béjaïa](https://almawarid.app/logiciel-boulangerie-bejaia/),
  [épicerie](https://almawarid.app/logiciel-epicerie-superette-algerie/),
  [pâtisserie orientale](https://almawarid.app/logiciel-patisserie-orientale-algerie/),
  [comparatif gratuit ou payant](https://almawarid.app/blog/logiciel-gestion-commerciale-algerie-gratuit-ou-payant/)
- GestDZ : [gestdz.com](https://gestdz.com/)
- Costy : [costy.app/prix](https://costy.app/prix/)
- Comparatifs agrégés : [caisse](https://zoomalgerie.com/logiciel-caisse-pos-algerie/),
  [facturation](https://zoomalgerie.com/logiciel-facturation-algerie/),
  [stock](https://zoomalgerie.com/logiciel-gestion-stock-algerie/)
- Symloop : [comptabilité 2024](https://www.symloop.com/blog/logiciel-comptabilite-algerie-2024/)
- SNMG et charges : [sindansolutions](https://sindansolutions.com/outils/baremes-algerie/),
  [joliboaz](https://joliboaz.fr/salaire-minimum-algerie-2026/)
- Paiement : [sindansolutions](https://sindansolutions.com/blog/payer-en-ligne-algerie-methodes-paiement-2026/)
- Prix des matières (2024) : [Le Jour d'Algérie](https://www.lejourdalgerie.com/a-plus-de-550-da-le-kilo-les-cacahuetes-et-la-farine-a-90-da-les-gateaux-de-laid-vont-couter-cher/)
- Référence hors Algérie : [gramme.app](https://gramme.app/tarifs)
