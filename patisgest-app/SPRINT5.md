# Sprint 5 — Qualité + onboarding (S11)

> Objectif roadmap : MOD-09 (T° + nettoyage + alertes), MOD-10 (allergènes
> matières → produits), MOD-15 (paramètres, sauvegarde/restauration, exports
> CSV), assistant onboarding.
> **Fini si :** un novice termine l'onboarding en < 1 h (testé).

## Fait

- [x] **MOD-09 — registre HACCP** (déjà livré Sprint2) : `releve_temperatures`,
      `nettoyages`, `non_conformites` (RPC `maj_non_conformite`), panneau
      d'alertes pur (`quality-alerts.ts`, 8 tests) — températures hors seuil,
      relevés manquants, nettoyages et tâches en retard, DLC proches.
- [x] **MOD-10 — allergènes matières → produits** (`src/lib/allergenes.ts`,
      11 tests). Avant : `articles.allergenes` était saisi **à la main** sur le
      produit fini, sans lien avec les matières. Mesure sur le jeu pilote :
      `PF-CRO` (Croissant) déclarait `gluten, lait, oeufs` alors que sa recette
      (farine, beurre, sucre, lait) **ne contient aucun œuf**.
      Maintenant :
  - `allergenesDerives(versionId, versions, articles)` : expansion récursive des
    sous-recettes (profondeur bornée à 3, anti-cycle par mémo, comme
    `patisgest_besoins_de_version`), normalisation des 14 allergènes légaux
    (accents, ligatures `œ`/`æ`, alias de saisie) ;
  - `verifierDeclaration` : `manquants` = allergène présent non déclaré
    (**bloquant**, risque légal), `enTrop` = sur-déclaration (avertissement) ;
  - l'étiquette imprime la liste **dérivée** ; une alerte rouge signale la
    sous-déclaration avant impression, une alerte ambre la sur-déclaration.
- [x] **MOD-15 — exports CSV** (`src/lib/csv.ts`, 12 tests) : route
      `/api/export?table=…`, 11 tables. Format **Excel FR** (séparateur `;`,
      virgule décimale, BOM UTF-8 — sans le BOM, « é » devient « Ã© » chez le
      comptable), échappement RFC 4180, **injection de formule neutralisée**
      (OWASP : `=`, `+`, `-`, `@`, tab, CR préfixés d'une apostrophe — un nom
      saisi au comptoir ne doit pas s'exécuter dans le poste du comptable).
      Les tables de coût (`recette_versions`, `parametres_couts`) sont
      réservées aux rôles propriétaire/labo (migration 17), au niveau de l'UI
      **et** de la route (403).
- [x] **MOD-15 — assistant d'onboarding** (`src/lib/onboarding.ts`, 8 tests) :
      6 étapes dans l'ordre du cahier US-15.3, compteurs réels sur le tableau de
      bord, prochaine action mise en avant, notion de `pretAVendre` (les étapes
      bloquantes : matières, produits, recette active, première vente ;
      fournisseurs et premier OF sont recommandés mais ne bloquent pas).

## Tests

`npm test` → **188** (180 hors onboarding + 8) :
`store47 · stock10 · journal15 · purchase6 · z6 · price-alerts6 · reconciliation5 ·
label-model5 · version-input6 · cost-sheet10 · rc-reference13 · fefo-cost6 ·
quality-alerts8 · sale-queue6 · of-queue5 · permissions3 · **allergenes11** ·
**csv12** · **onboarding8**`. Smoke **7/7** (dont un test réel de `/api/export` :
401 sans session, 403 pour un vendeur sur une table de coût).

## Restant / validation humaine

- [ ] **CA-15** « novice termine l'onboarding en < 1 h » : critère humain, à
      faire tester à un vrai utilisateur. Ce sprint mesure la progression, il ne
      prouve pas le temps passé.
- [ ] **US-15.2 restauration** : seule la **sauvegarde** (export CSV) est
      livrée. La restauration complète « en 2 clics » n'est pas implémentée —
      elle demande un import transactionnel table par table (et une décision
      produit : que faire en cas de conflit d'identifiants ?). À planifier.
- [ ] Tableau nutritionnel (arrêté du 19 oct. 2017) : explicitement reporté en
      **V4** par le cahier.
