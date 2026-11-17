# Sprint 3 — Recettes & coûts (S7–S8) + caisse hors-ligne

> Objectif roadmap : fiche coût RC-01..RC-06, tests auto des10 recettes de
> référence au centime, et (périmètre session) caisse hors-ligne + ticket
> 80 mm + file de synchronisation. MOD-04 (versions/sous-recettes figées)
> livré en fin de Sprint2 (migration12).

## Fait

- [x] **Formules gravées RC-01..RC-10** (`src/lib/cost-sheet.ts`) — cahier §4 :
      parage, cuisson, coût total, MO chargée, coût/portion (jamais de TVA),
      marge sur HT, taux de perte, manque à gagner, garde-fous non bloquants.
- [x] **10 recettes de référence au centime** (`tests/rc-reference.test.mjs`,
      CA-04) + `tests/cost-sheet.test.mjs` — écart max < 0,005 DA par portion.
- [x] **Paramètres de coûts** (migration15 `parametres_couts`, 3 policies
      select/insert/update) : taux horaire + charges % (RC-04), formulaire sur
      le module Simulation.
      > ⚠️ Revue 2026-11-17 : la **lecture** n'est pas restreinte par rôle — un
      > vendeur peut lire `parametres_couts` et les coûts de `recette_versions`
      > via l'API REST (vérifié en SQL). Écriture bien restreinte
      > (proprietaire/labo). À corriger en migration17 (cf. HANDOFF §9.4).
- [x] **Fiche de coût interactive** (`cost-sheet-form.tsx` + `actions-couts.ts`)
      : version active → matières FEFO (RC-01/RC-09) → RC-02..RC-06,
      pertes RC-07/08 saisies, garde-fous RC-10 (référence optionnelle).
- [x] **Caisse hors-ligne** (`sale-queue.ts` + `sale-form.tsx`) : file
      localStorage **avant** envoi, synchronisation immédiate si le réseau
      répond, panneau **État synchro** (liste + bouton + indicateur en
      ligne/hors ligne), retrait après succès.
- [x] **Idempotence de synchronisation** : ticket UUID fourni par le client,
      `vendre_article` (migration06) refuse les doublons — resynchroniser ne
      double jamais une vente.
- [x] **Ticket caisse80 mm** (`sale-ticket.tsx`, impression isolée CSS).

## Tests

`npm test` → **154** : store(47) + inputs(43 : stock10, journal15, purchase6,
z6, version6) + alerts(24 : price-alerts6, reconciliation5, label-model5,
quality-alerts8) + **RC formules(10) + recettes de référence(13, dont les 10
recettes CA-04)** + fefo-cost(6) + **file de ventes(6)** + **file OF(5)**.
+ smoke(6/6) séparé.

> Correction de revue (2026-11-17) : la ligne précédente annonçait
> « RC formules(12) +10 recettes » et omettait `version-input` — réel mesuré
> fichier par fichier : `cost-sheet`=10, `rc-reference`=13.

- [x] **RC-07/08 sur données réelles** : `aggregatePertes` agrège les
      lignes de clôture30 j (`code`, `pvHT`) — la fiche affiche les pertes
      réelles avec leur source, repli sur saisie manuelle sinon.
- [x] **Flux hors-ligne testé de bout en bout en logique** : journée sans
      internet → reprise → resynchronisation → **0 doublon** (invariant de
      tickets uniques, `sale-queue.test` + `of-queue.test`).

## Restant / validation humaine

- [ ] E2E navigateur : journée complète sans internet puis synchronisée
      (comme les autres E2E du pilote — utilisateur).
- [ ] « 3 pâtissiers retrouvent leurs coûts à la main » (critère fin S3,
      revue humaine).
