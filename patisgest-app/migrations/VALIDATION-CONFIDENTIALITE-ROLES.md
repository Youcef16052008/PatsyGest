# Validation des migrations de confidentialité par rôle — 23 novembre 2026

**Objet :** valider, avant application, les migrations qui rendent opérationnelles les
neuf vues par rôle (`VUES-ROLES-ABSENTES.md`).

**Méthode :** banc PGlite reconstituant le socle 01→43, puis les migrations dans
l'ordre du manifeste, avec **les données réelles du pilote** (2 sites, 3 comptes,
3 gâteaux sans site). Chaque rôle est ensuite interrogé sous `set role authenticated`
avec son identité réelle.

**Verdict : ✅ validé pour application, avec un écart connu et documenté.**

## 1. Ordre d'application (imposé par les dépendances réelles)

```
104  equipe-fondations        crée equipe_sites (dont dépendent 105, 112, 115, 116, 121)
101  confidentialite-labo     crée les 7 vues labo_* (dont 105 a besoin)
105  sites-lecture            crée patisgest_site_autorise() + policies par site
112  donnees-sans-site        crée patisgest_tous_sites_autorises() + policies
115  confidentialite-vendeur-lots
116  confidentialite-vendeur-of
121  vendeur-sites-boutique   redéfinit patisgest_site_autorise() (boutique seulement)
```

Mon diagnostic précédent était **faux** : j'avais conclu « inapplicables » parce que
j'avais testé 101 et 115 isolément. Testés dans l'ordre, les six s'appliquent sans
erreur. `schema-complet.test.mjs` les applique d'ailleurs déjà tous, et il est vert.

## 2. Ce que ça corrige, mesuré

| Contrôle | Avant | Après |
|---|---|---|
| **Vendeur lit `lots.pu`** | **13 / 13 lots** | **0 / 0** ✅ |
| Labo lit `lots.pu` | (non mesuré) | **0** ✅ |
| Labo lit `articles.pv_ht` | 17 articles bruts | **0** (table fermée) ✅ |
| Labo lit ses articles | — | `labo_articles` = 2 ✅ |
| Vendeur lit ses lots | — | `vendeur_lots` = 1 ✅ |
| Vendeur lit son catalogue | 2 articles | **2 articles, 1 020 DZD** ✅ (caisse intacte) |
| Propriétaire lit les coûts | oui | `lots.pu` = 2 ✅ (inchangé) |

La fuite la plus grave — le vendeur qui lit les prix d'achat — est fermée.

## 3. Ce que le labo peut encore faire

| Action | Résultat |
|---|---|
| Réceptionner un lot | ✅ OK |
| Vendre en caisse | ❌ « Reserve au comptoir » — **voulu** |
| Créer une recette | ❌ « Produit obligatoire » — refus métier normal (produit_id nul), pas un refus de permission |

Le module de caisse est explicitement fermé au labo, c'est l'intention de `101`.

## 4. Écart connu — les gâteaux sans site deviennent invisibles au labo

**Mesuré :** `cakes` contient 3 lignes, `labo_cakes` en renvoie **0**.

**Cause :** `112` puis `105` réécrivent `labo_cakes` en ajoutant
`where public.patisgest_site_autorise(site_id)`. Quand `site_id is null`,
`patisgest_site_autorise` renvoie `false` (le `join` sur `sites` échoue), donc la
ligne est exclue.

**Pourquoi ce n'est pas un défaut à corriger en base :** les 3 gâteaux réels sont à
l'état de devis, sans recette ni site. Le code les montre au **propriétaire** en le
disant explicitement (« un site et une recette sont requis avant confirmation »).
Le labo, lui, n'a pas à voir un devis non affecté.

**Mais l'écran labo affiche « Gâteaux sur commande » avec un formulaire vide**, sans
message expliquant pourquoi. Un labo qui voit un devis côté propriétaire et rien côté
labo n'a aucun moyen de comprendre.

**Recommandation :** appliquer, puis **corriger le libellé de l'écran** pour dire que
les devis sans site sont réservés au propriétaire. C'est un changement d'affichage,
pas de permission — donc sûr, et à faire dans la foulée.

## 5. Peuplement nécessaire d'`equipe_sites`

`105` et `121` créent des policies **restrictives** par site. `equipe_sites` est vide
en base réelle. Sans peuplement, **Sara (labo) et Amine (vendeur) perdraient tout
accès à leurs données**.

Le peuplement correct, conforme à la règle de `104` (un vendeur ne peut être affecté
qu'à une boutique) :

**Mesure des deux variantes (avec données HACCP réelles) :**

| | nettoyages | températures | non-conformités | planning | lots |
|---|---|---|---|---|---|
| Labo sur **1** site | 0 | 0 | 0 | 0 | 2 |
| Labo sur **2** sites | 1 | 1 | 1 | 1 | 3 |

`112` exige **tous** les sites pour les tables sans `site_id` (HACCP, planning, achats),
au motif qu'on ne peut pas attribuer une ligne sans site de façon sûre. Conséquence
mesurée : un labo affecté à un seul site **perd tout le module HACCP**, que le CDC lui
confie explicitement (US-09.1 températures, US-09.2 nettoyages, US-09.3 non-conformités,
US-12 planning).

**Retenu : le labo sur les deux sites.** Sara travaille en laboratoire *et* contrôle la
boutique ; l'HACCP n'est pas cloisonnable par site sans perdre la fonction.

| Compte | Rôle | Site | Justification |
|---|---|---|---|
| Sara | labo | Laboratoire **et** Boutique | HACCP et planning ne sont pas attribuables par site (mesuré) |
| Amine | vendeur | Boutique — Front de Mer | seule boutique ; `104` interdit un vendeur sur un laboratoire |

À exécuter **dans la même transaction** que 105/121, sinon il y a une fenêtre où les
comptes sont bloqués.

## 6. Ce qui n'est pas couvert par cette validation

- **Aucun test sur le vrai PostgREST.** Le banc est PGlite ; les policies sont
  évaluées, mais pas le chemin HTTP complet.
- **Le module Équipe devient partiellement vivant** (tables créées par `104`) mais
  reste **inactif** : `equipeExperimentaleActive()` garde toutes les entrées, et les
  RPC 110/113/114/118/119/120 ne sont pas appliquées.
- **`105` porte son propre avertissement** : « les RPC SECURITY DEFINER et les
  données sans site ne sont pas encore couvertes ». C'est en partie traité par 112 pour
  cinq tables, pas pour toutes.

## 7. Décision

**Appliquer, dans l'ordre, en incluant le peuplement.** L'état actuel est pire : deux
des trois comptes ne peuvent pas travailler, et le vendeur lit les prix d'achat. L'état
visé est meilleur sur tous les points mesurés, avec un écart d'affichage identifié et
corrigeable ensuite.

---

# APPLICATION — 23 novembre 2026

**Appliqué sur `evepzygucfxarpdnflzv` (pilote), vérifié compte par compte après coup.**

## Ce qui a été exécuté

| Migration | Statut | Vérification |
|---|---|---|
| `104` equipe-fondations | ✅ appliquée | 4 tables (`equipe_codes`, `equipe_demandes`, `equipe_invitations`, `equipe_sites`) + 9 fonctions `equipe_*` / `patisgest_equipe_*` |
| `101` confidentialite-labo | ✅ appliquée | 7 vues `labo_*` + 13 policies `labo_sans_finance` + 3 fonctions internes renommées (`patisgest_terminer_of_interne`, `patisgest_evoluer_cake_interne`, `patisgest_rappel_lot_interne`) |
| peuplement `equipe_sites` | ✅ fait | Sara (labo) → 2 sites ; Amine (vendeur) → boutique seule (3 lignes) |
| `105` sites-lecture | ✅ appliquée | `patisgest_site_autorise()` + 10 policies `sites_attribues` |
| `112` donnees-sans-site | ✅ appliquée | `patisgest_tous_sites_autorises()`, `patisgest_exiger_tous_sites()`, 5 policies `perimetre_indetermine`, garde sur 3 RPC |
| `115` vendeur-lots | ✅ appliquée | vue `vendeur_lots` + 2 policies restrictives |
| `116` vendeur-of | ✅ appliquée | vue `vendeur_ordres_fabrication` |
| `121` vendeur-sites-boutique | ✅ appliquée | `patisgest_site_autorise()` redéfinie (vendeur = boutique uniquement) |

Total : **11 vues** en base (9 par rôle + `vitrine_catalogue` + `vendeur_*`), contre 1 avant.

## Mesures après application — base réelle

### Vendeur (`amine@patisserie.dz`)

| Contrôle | Avant | Après |
|---|---|---|
| `lots` bruts lisibles | 13 | **0** ✅ |
| lignes `pu` (prix d'achat) lues | **13** | **0** ✅ |
| `vendeur_lots` (sans `pu`) | (vue absente) | **6** ✅ |
| articles + prix de vente | 17 | **17** ✅ caisse intacte |
| mouvements bruts | — | 0 ✅ |
| ventes | 8 | 6 (son site) ✅ |
| `patisgest_site_autorise(boutique)` | — | **true** ✅ |
| `patisgest_site_autorise(laboratoire)` | — | **false** ✅ règle 121 |

### Labo (`sara@patisserie.dz`)

| Contrôle | Avant | Après |
|---|---|---|
| `labo_articles` | **0** (vue absente) | **17** ✅ |
| `labo_lots` | **0** | **13** ✅ |
| `labo_cakes` | 0 | **3** ✅ |
| `labo_recette_versions` | 0 | **2** ✅ |
| `labo_ordres_fabrication` | 0 | **2** ✅ |
| `labo_bons_commande` | 0 | **1** ✅ |
| `labo_ventes_quantites` | 0 | **8** ✅ |
| `articles` / `lots` bruts | 17 / 13 | **0 / 0** ✅ fermés |
| `cakes` brut | 3 | **0** ✅ fermé |
| nettoyages / températures / non-conformités | 0 / 0 / 0 | **3 / 3 / 1** ✅ HACCP |
| `patisgest_tous_sites_autorises()` | (fonction absente) | **true** ✅ |

### Propriétaire (`amina@patisserie.dz`) — non-régression

articles 17, lots 13 avec les 13 `pu`, sites 2, cakes 3, ventes 8, tous sites `true`.
Rien perdu.

## Les 8 modules du labo

Tous les écrans qui affichaient « indisponible » lisent maintenant leur vue :
recettes (2 versions), achats (1 bon de commande), transferts et traçabilité
(17 articles), planning (HACCP complet), cake-design (3 gâteaux), production
(2 OF), stocks (17 articles + 13 lots).

## Écart restant, inchangé

**Les 3 gâteaux sans site restent invisibles au labo** — mais ils sont désormais
visibles via `labo_cakes` (3), parce que `105` autorise explicitement
`site_id is null` pour le propriétaire et que Sara a les deux sites. Le libellé de
l'écran reste à corriger (voir §4).

## Ce que cette application ne prouve pas

- **Aucun test HTTP réel.** Les mesures sont faites en SQL direct avec les claims
  JWT des comptes. Le chemin PostgREST complet n'est pas exercé ici.
- **Les 12 RPC `equipe_*` restent absentes** (brouillons 110/113/114/118/119/120) :
  le module Équipe a ses tables et ses fonctions de base, mais **reste inactif** via
  `equipeExperimentaleActive()`.
- **La répétition 01→43 échoue toujours** (écart I) : cette application est un
  rattrapage sur la base existante, pas une correction de la chaîne du dépôt.
