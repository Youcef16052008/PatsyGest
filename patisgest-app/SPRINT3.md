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
- [x] **Paramètres de coûts** (migration15 `parametres_couts`, RLS3) :
      taux horaire + charges % (RC-04), formulaire sur le module Simulation.
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

`npm test` → **147/142 +5 file** : store(47) + inputs(37) + alerts(24)
+ **RC formules(12) +10 recettes de référence** + **file de ventes(5)**
+ smoke6.

## Restant / validation humaine

- [ ] E2E : journée simulée sans internet puis synchronisée,0 doublon
      (test navigateur manuel — comme les autres E2E du pilote).
- [ ] « 3 pâtissiers retrouvent leurs coûts à la main » (critère fin S3,
      revue humaine).
- [ ] Fiches RC de production (RC-07/08 sur données réelles de jeté/casse
      quand l'OF les journalisera).
