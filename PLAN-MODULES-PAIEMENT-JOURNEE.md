# Plan d'exécution — modules, paiement, main-d'œuvre à la journée, Phase 0

Branche : `arena/e4cdb564-patsygest` (base `27b9398`). Date : 20/11/2026.
Suivi du plan en 5 étapes : voir `PLAN-SUIVI-COMMERCIAL.md`.

## 1. Demandes de ce tour et état

| # | Demande | Statut | Preuve |
|---|---|---|---|
| D1 | Retirer Edahabia et CIB des modes de paiement | **Fait** | Le mode `carte` est retiré du code (type, libellés, rapprochement, démo, tests). Les anciens tickets `carte` s'affichent « Non précisé ». **La contrainte SQL (`21-prix-demain-panier.sql`) et la RPC `vendre_panier` acceptent encore `carte` : les retirer exige une migration, soumise à validation.** |
| D2 | Payer la main-d'œuvre à la journée de travail, pas à l'heure | **Fait** | `src/lib/main-oeuvre.ts` : taux horaire RC-04 = salaire journalier ÷ heures payées par jour (défaut 8). Formule RC-04 inchangée. Saisie dans `cost-sheet-form.tsx` (« Salaire par jour », « Heures payées / jour ») et `portion-estimator.tsx`. La colonne `parametres_couts.taux_horaire` est conservée : pas de migration. |
| D3 | Cinq modules visibles d'emblée, le reste derrière un bouton menu | **Fait** | `src/lib/workspace-nav.ts` : 5 modules `primary` (Accueil, Stocks, Recettes, Production, Caisse). `src/app/workspace.css` : en designs pilotage/fabrication, la liste complète n'est plus affichée en permanence ; les autres modules s'ouvrent via « Plus ». |
| D4 | Commencer la Phase 0 | **Partiel** | Voir section 3. |
| D5 | Vérifier le masquage labo/vendeur après refonte de la navigation | **Fait** | `ROLES_LABO_VENDEUR_ACTIFS = false` inchangé (`src/lib/permissions.ts`). Tests `matrice-app-schema` et `revue-corrections` vérifient toujours ce masquage. |

Vérifications exécutées :
- `tsc --noEmit` : OK.
- `eslint` sur les fichiers modifiés : OK.
- `npm test` (après `npm ci`, les dépendances n'étaient pas installées au départ) : 463 réussis, 0 échec.
- Nouveau test : `tests/main-oeuvre.test.mjs` (5 cas : conversion journalière, MO chargée au jour, aller-retour, entrées invalides, modes de saisie).

## 2. Plan des étapes suivantes

| Étape | Contenu | Qui | Porte de validation |
|---|---|---|---|
| A | Revue du code de ce tour (diff, cas des tickets `carte` existants) | Développeur | Relecture humaine avant merge |
| B | Vérifier le menu « Plus » en navigateur (pilotage et fabrication, ordinateur et mobile) | Développeur | **Partiel** : `next build` OK ; rendu visuel non vérifié (pages protégées par connexion) |
| C | Libellé « Carte » dans l'historique | Produit | **Décidé : ne pas le conserver** (anciens tickets affichés « Non précisé ») |
| D | Étape 4 du plan : restauration représentative et test d'isolation inter-clients | Technique + humain | **Bloqué** : exige une sauvegarde fraîche du pilote (accès et validation humains), un environnement isolé représentatif et un retour arrière démontré (`migrations/ETAT-RESTAURATION.md`). Aucune action sur le pilote sans validation. |
| E | Étape 5 : trois pilotes, dix visites, témoignage, logo | Commercial | Clients signés |
| F | Étape 6 : page de prix publique | Commercial | Interdite avant E |

Migrations : aucune migration n'est proposée dans ce tour. Toute migration au pilote exige une validation humaine explicite.

## 3. Phase 0 — état sur cette branche

- Le document `PHASE-0-EXECUTION.md` (daté du 21/11/2026) se trouve sur la branche `arena/d51c48b6`. Il conclut NO-GO migration et commercial. **Il ne décrit pas l'état de cette branche.**
- Le kit de terrain `PâtisGest-Documents/05-Kit-Phase0-Terrain.md` (fiche, guide 90 minutes, questionnaire de 30 questions) existe.
- Aucune visite client n'a eu lieu : la Phase 0 ne peut pas être terminée depuis le dépôt.
- Périmètre Phase 0 propre à cette branche : (1) valider les trois changements de ce tour avec un utilisateur de caisse et un ouvrier, (2) mesurer le temps de saisie de la journée de travail, (3) recueillir la liste des modes de paiement réellement utilisés. Ces points demandent des personnes réelles.

## 4. Hypothèses à ne pas traiter comme acquises

- Salaire journalier par défaut : 3 200 DA (8 heures). **Validé par l'utilisateur** comme valeur par défaut ; reste une hypothèse de saisie, pas une grille salariale. Le SNMG 2026 de 24 000 DA par mois (cité dans `ETUDE-MARCHE-PATISSERIES-DZ-2026.md`) n'est pas recalculé ici.
- Abandon de CIB/Edahabia : décision produit fondée sur l'étude de marché (paiement surtout espèces et à la livraison). Source secondaire, à confirmer en Phase 0.
- Retrait du mode carte : décidé par l'utilisateur. Le retrait côté base reste à faire par migration validée.
- Prix 35 000 DA/an : hypothèse à tester, pas un prix validé.
