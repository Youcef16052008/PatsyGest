# PâtisGest — Cahier des charges fonctionnel v4.0 FINALE

**Logiciel de gestion pour pâtisseries artisanales — Marché : Algérie**
**Statut :** VALIDÉ pour démarrage · **Date :** novembre 2026 · **Auteur :** Fondateur + audit expert
**Confidentiel — usage interne et prestataires**

> Ce document est la **version fusionnée finale** issue de l'audit comparatif des 5 cahiers
> des charges v3.0. Il tranche tous les points ouverts, corrige tous les bugs d'algorithme
> détectés, et s'applique au marché algérien (DZD, TVA 19/9 %, décret 13-378).

## Historique des versions

| Version | Date | Objet |
|---|---|---|
| 1.0–3.0 | 2026 | 5 réponses concurrentes auditées (n°1 à n°5) |
| 3.1 | nov. 2026 | Audit comparatif : classement, 27 modules notés, catalogue de bugs |
| **4.0** | **nov. 2026** | **Fusion finale : le présent document (référence unique)** |

## 1. Contexte & objectifs

### 1.1 Contexte

Les pâtisseries artisanales algériennes gèrent leur activité sur papier, Excel ou « de tête » :
coûts de revient inconnus, pertes non mesurées, DLC suivies à l'œil, traçabilité impossible
en cas de problème. Les solutions existantes (Excel, Odoo, logiciels européens) sont trop
génériques, trop chères ou inadaptées (devise, TVA, hors-ligne, français simple).

### 1.2 Promesse produit

**« Ton coût VRAI, ta marge RÉELLE — et un logiciel qui ne te bloque jamais. »**

### 1.3 Objectifs mesurables (12 mois après lancement MVP)

| # | Objectif | Cible |
|---|---|---|
| O1 | Pâtisseries pilotes payantes à Oran | 5 minimum |
| O2 | Taux de perte moyen mesuré chez les pilotes | < 8 % (vs ~15 % estimé sans outil) |
| O3 | Marges réelles connues sur 100 % des produits vendus | 100 % des pilotes |
| O4 | Disponibilité du service cloud | ≥ 99,5 % |
| O5 | Utilisation hors-ligne sans perte de données | 100 % des actions de la file |

### 1.4 Périmètre

**DANS le périmètre (V1–V4) :** les 15 modules du §3, PWA tablette + PC, français,
1 devise (DZD), TVA algérienne, 1 établissement puis multi-sites, mode hors-ligne.

**HORS périmètre :** comptabilité complète (export comptable uniquement), paie,
livraison/livreurs, application client grand public, caisse certifiée NF525
(exigence française, non applicable en Algérie), autre langue que le français (arabe : V4+).

### 1.5 Parties prenantes

| Rôle | Personne | Responsabilité |
|---|---|---|
| Porteur / Product Owner | Fondateur | Vision, arbitrages, recettes |
| Développeur | Fondateur + IA | Réalisation (cf. Roadmap) |
| Utilisateurs pilotes | 3–5 pâtisseries d'Oran | Tests terrain, retours |
| Comptable conseil | À désigner | Validation fiscale (TVA, facture, conservation) |

### 1.6 Hypothèses & contraintes

- H1 : une tablette Android + une imprimante ticket par boutique (matériel client).
- H2 : connexion internet intermittente → le hors-ligne est **obligatoire**, pas optionnel.
- H3 : utilisateurs peu à l'aise avec l'informatique →3 clics max pour les actions quotidiennes.
- C1 : budget infra année 1 < 60 000 DA. C2 : solo-développeur → simplicité d'abord.

## 2. Personas & parcours clés

**Aïcha, 42 ans — propriétaire.** Veut connaître sa marge réelle et réduire les pertes.
Parcours : le matin elle lance les OF du jour → le soir elle fait la clôture en 5 minutes.

**Amine, 25 ans — vendeur.** Veut encaisser vite, même sans internet.
Parcours : encaissement comptoir → import du Z en fin de journée.

**Sara, 30 ans — responsable labo.** Veut produire sans erreur de lot ni rupture.
Parcours : réception avec DLC → production FEFO → relevés HACCP.

## 3. Exigences fonctionnelles (15 modules)

> Notation MoSCoW : **M**ust (MVP) · **S**hould (V2) · **C**ould (V3) · **W**on't (V4+).
> Chaque règle de gestion est numérotée (RG) et testable.

### MOD-01 — Tableau de bord & alertes [M]

**Objectif :** piloter la pâtisserie en un coup d'œil.

- **US-01.1** En tant que propriétaire, je vois le CA du jour, le CA 7 jours, la marge réelle
  7 jours et le taux de perte afin de savoir où j'en suis.
- **US-01.2** En tant qu'utilisateur, je vois les alertes classées (urgent / à vérifier)
  afin de traiter les DLC proches, ruptures et non-conformités.
- **RG-01.1** Principe global : **alerte, jamais blocage** — aucun manquant ne bloque
  une vente ou une production ; il est signalé et tracé.
- **RG-01.2** La marge réelle = CA HT − Σ (coût de revient des produits vendus, recette active).
- **CA-01** : le dashboard s'affiche en < 2 s avec 1 an de données ; toute alerte mène à l'écran concerné.

### MOD-02 — Articles, lots & stocks FEFO [M]

**Objectif :** un stock juste, traçable par lot, valorisé au coût réel.

- **US-02.1** En tant que responsable labo, je crée un article à 3 niveaux
  (**matière / semi-fini / produit fini**, + emballage/consommable) afin de séparer
  ce qui s'achète, se transforme et se vend.
- **US-02.2** En tant que responsable labo, je crée un lot à chaque entrée
  (quantité, prix, **DLC/DDM**, fournisseur, site) afin d'assurer traçabilité et coût réel.
- **US-02.3** En tant que système, je déduis les sorties en **FEFO multi-lots**
  (DLC la plus proche d'abord, sur autant de lots que nécessaire).
- **US-02.4** En tant que responsable labo, je fais un inventaire (comptage + **motif obligatoire**)
  afin de corriger les écarts proprement.
- **RG-02.1** Règle « pas de lot = pas d'entrée stock » ; les mouvements sont **immuables**
  (on corrige par contre-mouvement motivé, jamais en modifiant).
- **RG-02.2** Le **CUMP est un simple indicateur** ; le coût de référence vient des lots FEFO.
- **RG-02.3** Stock négatif autorisé avec alerte (jamais bloquant) + régularisation auto
  documentée à l'achat suivant (voir §9, décision D4).
- **RG-02.4** Statuts de lot : disponible / bloqué / épuisé / négatif / périmé.
  Les lots bloqués et périmés sont exclus du FEFO ; le congelé passe après le frais.
- **CA-02** : 100 consommations FEFO correctes sur jeu de test (dont besoins chevauchant
  3 lots, DLC manquante, lot bloqué) ; inventaire impossible sans motif.

### MOD-03 — Achats & fournisseurs [M]

**Objectif :** acheter juste, au bon prix, sans rupture.

- **US-03.1** En tant que propriétaire, je crée un bon de commande (fournisseur, lignes,
  prix) et je le réceptionne ligne par ligne (quantité réelle, prix réel, **DLC**).
- **US-03.2** En tant que propriétaire, je suis alerté quand un prix augmente de plus de
  **10 %** (seuil réglable) avec la **liste des recettes impactées**.
- **US-03.3** En tant que responsable labo, j'obtiens la **liste de courses automatique**
  (besoins des OF planifiés − stock − en commande).
- **RG-03.1** Chaque réception crée un lot + alimente l'historique de prix + le CUMP indicatif.
- **RG-03.2** Comparaison fournisseur à qualité égale sur 12 mois glissants (prix + délais).
- **CA-03** : réception partielle possible ; une hausse de 12 % déclenche l'alerte
  avec ≥ 1 recette impactée listée.

### MOD-04 — Recettes, versionnage & coût de revient [M — cœur du produit]

**Objectif :** connaître le coût VRAI de chaque produit, version après version.

- **US-04.1** En tant que propriétaire, je crée une recette (famille) + des **versions** :
  ingrédients (articles ou **sous-recettes en version figée**), parages, perte cuisson,
  temps MO, énergie, emballage, frais généraux.
- **US-04.2** En tant que propriétaire, je vois le **coût par portion**, le PV HT,
  la marge et le taux de marge, et le prix conseillé (coût × coefficient).
- **US-04.3** En tant que propriétaire, je duplique une version pour tester une variante
  sans casser l'existant, puis j'active la meilleure.
- **RG-04.1** Versionnage : **famille + version immuable** ; une version utilisée par un OF
  ne peut plus être modifiée (duplication obligatoire).
- **RG-04.2** Sous-recette = pointeur vers une **version figée** (décision D2, §9).
- **RG-04.3** Formules de référence : voir **RC-01 à RC-05** (§4) — application stricte.
- **CA-04** : sur 5 recettes de référence, coûts calculés à 0,01 DA près vs corrigé d'audit ;
  modification d'une version figée impossible.

### MOD-05 — Production / ordres de fabrication [M]

**Objectif :** produire juste, avec preuve de ce qui a été consommé.

- **US-05.1** En tant que responsable labo, je crée un OF (recette active, quantité, site,
  date) ; le système **fige un snapshot** de la recette et calcule les besoins.
- **US-05.2** En tant que responsable labo, je lance l'OF : consommation **FEFO multi-lots**,
  manquants alertés sans blocage.
- **US-05.3** En tant que responsable labo, je **valide partiellement** (ex. 78/80) :
  un lot de produit fini est créé (DLC J+2 par défaut), le reliquat reste en cours.
- **RG-05.1** Cycle : planifié → en cours → (partiel) → terminé / annulé. Pas de retour arrière.
- **RG-05.2** Le snapshot contient : version complète + coût prévu ; il est **inenmodifiable**.
- **RG-05.3** Le lot produit porte le coût réel unitaire (matières consommées + quotes-parts).
- **CA-05** : OF lancé avec stock insuffisant → terminé avec manquants listés (non bloqué) ;
  coût réel calculé et affiché vs coût prévu.
### MOD-06 — Ventes, caisse & import Z [M : caisse / S : import Z]

**Objectif :** encaisser vite, déduire juste, même sans internet.

- **US-06.1** En tant que vendeur, j'encaisse au comptoir (produit, quantité, prix auto,
  TVA auto) en < 30 secondes, **avec ou sans internet** (file hors-ligne).
- **US-06.2** En tant que vendeur, j'imprime un ticket (thermique 80 mm) avec NIF/RC,
  lignes, TVA par taux, totaux HT/TTC.
- **US-06.3 [S]** En tant que propriétaire, j'importe le **rapport Z** de ma caisse
  (CSV : code;quantité;prix) : mapping auto par code, **détection de doublon**
  (même jour + même site + même total), déduction FEFO.
- **US-06.4 [S]** En tant que vendeur, je fais un **retour/avoir** (motif, remise en stock
  ou destruction tracée).
- **RG-06.1** Chaque vente déduit les produits finis en FEFO ; manquants alertés, jamais bloquants.
- **RG-06.2** Ticket Z : lignes à code inconnu = signalées et ignorées (import partiel tracé),
  jamais d'échec silencieux ni de double déduction.
- **RG-06.3** TVA **par nature et par ligne** (19 % pâtisserie fine par défaut ; 9 % si produit
  de base — table modifiable, cf. §5).
- **CA-06** : encaissement hors-ligne puis synchronisé sans doublon ; réimport du même Z
  détecté comme doublon ; ticket conforme aux mentions §5.

### MOD-07 — Clôture & anti-gaspi (6 flux) [S — priorité haute]

**Objectif :** mesurer chaque soir ce qui a été perdu, et pourquoi.

- **US-07.1** En tant que propriétaire, je saisis la clôture du jour par produit et par site
  sur les **6 flux** : fabriqué · vendu · reporté (invendu réutilisable) · jeté ·
  casse/erreur · offert-don-personnel.
- **US-07.2** En tant que propriétaire, je vois le **taux de perte**, le manque à gagner
  et l'évolution sur 30 jours.
- **RG-07.1** Taux de perte = (jeté + casse) ÷ fabriqué. Manque à gagner = (jeté + casse) × PV HT.
- **RG-07.2** Le « fabriqué » est **pré-rempli** depuis les OF validés du jour (modifiable).
- **RG-07.3** Le « reporté » crée une alerte de réutilisation (DLC courte) ; il ne gonfle
  ni le vendu ni la perte.
- **CA-07** : clôture saisie en < 5 min pour 10 produits ; taux et manque à gagner exacts
  sur jeu de test ; historique 30 jours affiché.

### MOD-08 — Cake Design Studio [C]

**Objectif :** vendre des gâteaux événementiels sans se tromper sur le prix ni le planning.

- **US-08.1** En tant que propriétaire, je fais un devis par **options**
  (chaque option = coût matière + temps), prix HT, acompte, date d'événement.
- **US-08.2** En tant que système, je **bloque la confirmation** si l'acompte < 30 %
  (seuil réglable) — seule exception bloquante du produit, exigée par le métier.
- **US-08.3** En tant que responsable labo, je suis le **rétroplanning auto**
  (J-5 achats → J-1 production → J livraison).
- **RG-08.1** Cycle : devis → acompte → confirmé → produit → livré/soldé / annulé.
- **RG-08.2** CGV imprimées sur le devis (acompte non remboursable < 72 h, TVA par nature).
- **CA-08** : confirmation impossible sous 30 % ; rétroplanning généré à la confirmation ;
  devis imprimable avec CGV.

### MOD-09 — HACCP & qualité (HACCP-lite) [M : températures + nettoyage / S : NC]

**Objectif :** prouver l'hygiène au quotidien, sans paperasse.

- **US-09.1** En tant que responsable labo, je saisis les **températures** (chambre froide,
  congélateur, vitrine) ; toute valeur hors seuil = **alerte immédiate**.
- **US-09.2** En tant que responsable labo, je pointe le **plan de nettoyage** (zones, agent).
- **US-09.3 [S]** En tant que responsable labo, je déclare une **non-conformité**
  (type, lot concerné, action corrective) et je la clôture.
- **RG-09.1** Seuils par équipement (ex. ≤ +4 °C, ≤ −18 °C) ; un dépassement crée
  une alerte + propose une NC.
- **RG-09.2** Registres infalsifiables (horodatage, auteur) — exportables pour contrôle.
- **CA-09** : saisie T° en < 20 s ; dépassement = alerte + NC proposée ; registre exporté en 1 clic.

### MOD-10 — Étiquettes, allergènes & information consommateur [M : allergènes / S : INCO-DZ]

**Objectif :** des étiquettes conformes au **décret exécutif 13-378**.

- **US-10.1** En tant que responsable labo, je renseigne les allergènes des **matières**
  (référentiel 14 allergènes + traces éventuelles).
- **US-10.2** En tant que système, je **calcule les allergènes des produits finis**
  depuis la recette active (matières + sous-recettes).
- **US-10.3 [S]** En tant que responsable labo, j'imprime l'étiquette préemballé :
  dénomination, **ingrédients par ordre décroissant**, allergènes mis en évidence,
  quantité nette, **DLC/DDM**, conservation, fabricant + adresse, lot.
- **RG-10.1** Ordre décroissant de poids à la mise en œuvre (jamais en g/ml affichés).
- **RG-10.2** Vocabulaire : **DLC/DDM uniquement** (jamais DLUO) ; lot obligatoire.
- **RG-10.3** Produits non préemballés (vitrine) : dénomination sur écriteau (aide à l'affichage).
- **CA-10** : allergène ajouté sur une matière → répercuté sur tous les produits finis ;
  étiquette conforme à la check-list §5.

### MOD-11 — Traçabilité amont/aval & rappels [S]

**Objectif :** retrouver en 2 minutes tout ce qu'a touché un lot.

- **US-11.1** En tant que responsable labo, je sélectionne un lot et je vois l'**amont**
  (fournisseur, date, DLC, quantités) et l'**aval** (OF + tickets de vente).
- **US-11.2** En tant que propriétaire, je **simule un rappel** : productions touchées,
  ventes potentiellement touchées, conduite à tenir, blocage du lot en 1 clic.
- **RG-11.1** Tout mouvement matière↔produit↔vente est chaîné par les n° de lots (OF + tickets).
- **RG-11.2** Un lot bloqué est exclu du FEFO et signalé partout (stocks, traçabilité, alertes).
- **CA-11** : rappel simulé sur jeu de test → 100 % des OF et tickets touchés retrouvés.
### MOD-12 — Planning, besoins & capacité [C]

**Objectif :** savoir quoi produire, avec quoi, et si la journée tient.

- **US-12.1** En tant que responsable labo, je planifie la journée (tâches, OF liés,
  durées, responsables) et je vois la **charge vs capacité** (ex. 480 min).
- **US-12.2** En tant que responsable labo, je vois les **besoins matières**
  (OF planifiés explosés − stock) et les manques à acheter.
- **RG-12.1** Surcharge = alerte (répartition conseillée, jamais imposée).
- **RG-12.2** Les OF « en cours » sont exclus des besoins (déjà consommés).
- **CA-12** : besoins exacts sur planning de test à 3 OF ; surcharge signalée.

### MOD-13 — Simulation prix & aide à la décision [C]

**Objectif :** répondre à « si j'augmente / si le beurre augmente ? ».

- **US-13.1** En tant que propriétaire, je simule un **prix de vente** (curseur) et je vois
  marge et coefficient en direct.
- **US-13.2** En tant que propriétaire, je simule une **variation du coût matières**
  (± %) et je vois les prix conseillés (× 2,5 / × 3 / × 3,5).
- **US-13.3** En tant que propriétaire, je calcule l'**impact d'une hausse fournisseur**
  (nouveau prix → recettes impactées + delta par portion).
- **RG-13.1** Les simulations ne modifient jamais les données (bac à sable).
- **CA-13** : 3 scénarios de test recalculés juste ; aucune écriture en base.

### MOD-14 — Multi-sites & transferts [C]

**Objectif :** piloter labo + boutique(s) avec des stocks par site.

- **US-14.1** En tant que propriétaire, je gère plusieurs sites (stocks, ventes, clôtures par site).
- **US-14.2** En tant que responsable labo, je fais un **transfert** (origine → destination,
  motif) : sortie FEFO d'un côté, entrée lot de l'autre.
- **RG-14.1** Le stock est toujours exprimé **par site** (le total n'est qu'une somme).
- **RG-14.2** Manquant au transfert = alerté, quantité réellement transférée tracée.
- **CA-14** : transfert testé avec manquant partiel → écritures des 2 côtés exactes.

### MOD-15 — Administration, données & exports [M]

**Objectif :** paramétrer, sauvegarder, et rester maître de ses données.

- **US-15.1** En tant que propriétaire, je règle : identité (NIF/NIS/RC), devise, TVA,
  taux horaire, charges, coefficients, seuils d'alerte.
- **US-15.2** En tant que propriétaire, je **sauvegarde** (export complet) et je **restaure**
  en 2 clics ; export CSV : mouvements, ventes, **export comptable**.
- **US-15.3** En tant que nouvel utilisateur, je suis l'**onboarding** : assistant
  (articles → fournisseurs → recettes → premier OF → première vente) < 1 h.
- **RG-15.1** Export portable garanti : aucune donnée prisonnière (formats ouverts).
- **RG-15.2** Rôles : propriétaire (tout) / labo / vendeur (caisse + clôture lecture).
- **CA-15** : sauvegarde → restauration sur base vide = données identiques ;
  onboarding terminé par un novice en < 1 h.

## 4. Règles de calcul de référence (formules gravées)

> Ces formules corrigent les bugs des 5 réponses auditées. **Tout écart est un bug bloquant.**

| # | Règle | Formule |
|---|---|---|
| RC-01 | Parage/cuve (ex. citrons, fraises) | consommation = quantité × (1 + parage %) |
| RC-02 | Cuisson (perte de rendement) | rendement net = rendement brut × (1 − cuisson %) |
| RC-03 | Coût total recette | matières (lots FEFO) + emballage + MO chargée + énergie + frais généraux |
| RC-04 | MO chargée | (temps min ÷ 60) × taux horaire × (1 + charges) |
| RC-05 | Coût / portion | coût total ÷ rendement net — **jamais de TVA dans le coût** |
| RC-06 | Marge | PV HT − coût ; taux = marge ÷ PV HT (**toujours sur HT**) |
| RC-07 | Taux de perte | (jeté + casse) ÷ fabriqué |
| RC-08 | Manque à gagner | (jeté + casse) × PV HT |
| RC-09 | FEFO | DLC la plus proche d'abord, multi-lots, congelé après frais, bloqués/périmés exclus |
| RC-10 | Garde-fous | alerte si valeur ×10/÷10 vs référence ou prix > 2× — **non bloquante** |

## 5. Exigences réglementaires — Algérie

> Références vérifiées nov. 2026 ; **à faire valider par le comptable conseil** avant V1 commerciale.

| Sujet | Texte de référence | Exigence PâtisGest |
|---|---|---|
| Information consommateur / étiquetage préemballé | **Décret exécutif 13-378** (9 nov. 2013) | Dénomination, ingrédients décroissants, quantité nette, DLC/DDM, conservation, fabricant+adresse, lot |
| Allergènes | Décret 13-378, annexe II | Mis en évidence sur l'étiquette + calcul auto (MOD-10) |
| Étiquetage nutritionnel | Arrêté interministériel 19 oct. 2017 | Tableau nutritionnel en **V4** (données à saisir/vérifier) |
| Non préemballé (vitrine) | Décret 13-378 | Dénomination sur écriteau (aide d'affichage MOD-10) |
| Protection consommateur | Loi 09-03 | Affichage prix, conformité produits, traçabilité (MOD-11) |
| TVA ventes pâtisserie fine | Code TCA — 19 % (produits transformés) | 19 % par défaut, **TVA par nature et par ligne** |
| TVA achats matières de base | Code TCA — 9 % (farine, lait, sucre…) | Taux d'achat réglable par article |
| Facture & ticket | Mentions obligatoires | NIF, NIS, RC, n°, date, lignes, TVA par taux, HT/TTC |
| Conservation documents | Code de commerce (~10 ans) | Exports + sauvegardes horodatées, **conservation 10 ans** |
| Hygiène alimentaire | Principes HACCP / Codex | MOD-09 : T°, nettoyage, NC, registres exportables |
| Données personnelles | Loi 18-07 (protection des données) | Minimisation, consentement, export/suppression sur demande |

**Non-applicables (à ne pas développer) :** NF525 et FEC (France), DLUO (remplacée par DDM),
uptime « 99,99 % » non contractuel en V1.
## 6. Exigences non fonctionnelles

| # | Domaine | Exigence | Seuil |
|---|---|---|---|
| NF-01 | Performance | Dashboard et caisse affichés | < 2 s (4G) / < 1 s (wifi) |
| NF-02 | Hors-ligne | Caisse, OF, T°, clôture utilisables sans internet ; synchro auto au retour | 0 perte de données |
| NF-03 | Disponibilité cloud | Service + sauvegardes quotidiennes chiffrées | ≥ 99,5 % |
| NF-04 | Sécurité | Mots de passe hashés, sessions, rôles, isolement strict des clients (1 base logique/client) | Audit avant V1 |
| NF-05 | Confidentialité | Données hébergées UE ou DZ, minimisation (loi 18-07) | DPA signé avec hébergeur |
| NF-06 | Compatibilité | Android 9+ / Chrome, PC Windows + Chrome/Edge, imprimante thermique 80 mm, lecteur code-barres (V2) | Matrice de test |
| NF-07 | Utilisabilité | Actions quotidiennes ≤ 3 clics ; textes simples, grands boutons tablette | Test avec 3 novices |
| NF-08 | Fiabilité calculs | RC-01..RC-10 testées automatiquement à chaque version | 100 % des tests verts |
| NF-09 | Sauvegarde | Quotidienne auto (cloud) + export manuel ; restauration testée mensuellement | RPO 24 h, RTO 4 h |
| NF-10 | Traçabilité | Journal d'audit (qui, quoi, quand) sur ventes, stocks, clôtures | 10 ans |

## 7. Interfaces & expérience utilisateur

- **7.1 Principes :** mobile-first tablette, 1 action = 1 écran, chiffres en DZD partout,
  couleurs métier (vert = ok, orange = vérifier, rouge = urgent), mode sombre en V2.
- **7.2 Écrans V1 (16) :** dashboard, articles/stocks, achats, recettes, OF, caisse,
  clôture, cake studio, HACCP, étiquettes, traçabilité, planning, simulation, sites,
  données/exports, guide — maquette HTML de référence déjà validée (prototype v1.0).
- **7.3 Impressions :** ticket 80 mm, étiquette (58×40 min, 70×40 conseillé),
  bon de commande, devis cake + CGV, fiche recette, registres HACCP.
- **7.4 Langue :** français uniquement en V1 (arabe : V4+).

## 8. Données : reprise, imports, exports

- **8.1 Reprise initiale (onboarding) :** assistant en 5 étapes + import CSV
  (articles, fournisseurs, prix) avec modèle téléchargeable.
- **8.2 Imports :** ticket Z (CSV, MOD-06), tarifs fournisseurs (CSV, V2).
- **8.3 Exports :** sauvegarde complète JSON, CSV (mouvements, ventes, clôtures),
  **export comptable CSV** (date, pièce, compte auxiliaire, HT, TVA, TTC),
  registres HACCP PDF, étiquettes.
- **8.4 Rétention :** données actives illimitées (fair-use), archives annuelles,
  suppression définitive sur demande (loi 18-07).

## 9. Décisions tranchées (définitives)

| # | Question de l'audit | Décision v4.0 |
|---|---|---|
| D1 | Pricing et équilibre financier | Abonnement annuel prépayé : Solo 35 000 DA/an (hypothèse à valider sur pilotes), Réseau 89 000–129 000 DA/an, installation 15 000–25 000 DA. Aucun abonnement mensuel. Seuil rentabilité : ~9 clients Solo (cf. Roadmap §6) |
| D2 | Sous-recette : version active ou figée ? | **Version figée** (traçabilité + coût juste). Changement = nouvelle version de la recette parente |
| D3 | Périmètre « produit fini » | Lot + DLC + stock **par site** + invendus reportés tracés (flux, pas stock caché) |
| D4 | Régularisation du stock négatif | Mouvement d'écart tracé ; à l'achat suivant, le lot couvre le négatif (coût = PU du nouveau lot, mention « régularisé ») |
| D5 | Mode hors-ligne : périmètre exact | Autorisé : caisse, OF (lancer/valider), T°, nettoyage, clôture, inventaire. Interdit : exports comptables, clôture NC, suppression. Scan lot = contrôle, pas obligation V1 |
| D6 | DLUO vs DDM | **DDM** partout (décret 13-378) |
| D7 | Facturation / FEC / NF525 | Non applicables en Algérie → **non développés** |

## 10. Jalons & acceptation globale

- **J0 (S2) :** maquettes validées par 3 pilotes · **J1 (MVP, S12) :** 5 pilotes en production,
  0 bug bloquant, RC-01..10 verts · **J2 (V2, S20) :** clôture + Z + marge réelle en routine ·
  **J3 (V3, S30) :** cake + multi-sites · **J4 (V4, S40) :** nutritionnel + paiement en ligne.
- **Recette globale :** check-list de 60 cas (fournie en Roadmap), taux de réussite ≥ 98 %,
  test terrain 2 semaines chez 2 pilotes, procès-verbal signé.

## 11. Glossaire

**FEFO** (First Expired First Out : DLC proche d'abord) · **DLC** (limite de consommation,
périssable) · **DDM** (durabilité minimale) · **OF** (ordre de fabrication) · **CUMP**
(coût unitaire moyen pondéré, indicatif) · **Z** (ticket de clôture de caisse) ·
**Snapshot** (copie figée d'une recette dans un OF) · **HACCP-lite** (autocontrôles
simplifiés : T°, nettoyage, NC) · **NIF/NIS/RC** (identifiants fiscaux DZ).

## Annexe A — MoSCoW global

- **Must (MVP) :** MOD-01, 02, 03, 04, 05, 06 (caisse), 09 (T°+nettoyage), 10 (allergènes),
  15, hors-ligne de base, onboarding.
- **Should (V2) :** MOD-07, 06 (Z + retours), 11, 09 (NC), 10 (étiquette INCO-DZ), dashboard marge.
- **Could (V3) :** MOD-08, 12, 13, 14, hors-ligne complet, code-barres.
- **Won't (V4+) :** nutritionnel auto, SATIM/CIB en ligne, arabe, desktop Tauri, prévisions IA.

## Annexe B — Prototype de référence

Le prototype HTML v1.0 (fichier unique, 16 écrans, données Oran) fait foi pour
l'ergonomie et les règles de calcul. Tout écart V1 vs prototype doit être justifié et validé.

*— Fin du cahier des charges v4.0 —*
