# Sprint 4 — Production + caisse (S9–S10)

> Objectif roadmap : MOD-05 (OF snapshot / lancer / valider partiel) +
> MOD-06 caisse + ticket 80 mm, file hors-ligne v1 (caisse **+ OF**) et
> bouton état synchro. **Fini si :** journée complète simulée sans
> internet puis synchronisée, 0 doublon.

## Fait

- [x] **MOD-05 complet** (déjà en place, vérifié) : snapshot figé côté
      serveur (`creer_of`), lancement avec consommation FEFO
      (`demarrer_of`), **validation partielle** (`terminer_of` → statut
      `partiel` tant que qte_realisee < qte_prevue), coût réel.
- [x] **MOD-06 caisse + ticket 80 mm** (livré Sprint3) : `sale-ticket`.
- [x] **Idempotence OF** (migration16) : `ordres_fabrication.client_ref` +
      index unique partiel par tenant ; `creer_of(..., p_client_ref)`
      répond `duplicate:true` si la référence existe — matrice : double
      appel → **1 seul OF**.
- [x] **File OF hors-ligne** (`of-queue.ts`, +5 tests) : queue-first comme
      la caisse, panneau **État synchro** (liste + bouton), retrait après
      succès/duplicate.
- [x] **État synchro des deux files** : caisse (`sale-form`) + production
      (`of-forms`) — le retour réseau resynchronise sans doublon grâce aux
      idempotences ticket/client_ref.

## Tests

`npm test` → **154** : … + file OF5 (dédup, plafond, incomplet, persistance,
**flux journée sans internet →0 doublon**).

## Restant / validation humaine

- [ ] E2E navigateur : journée complète sans internet (caisse + OF) puis
      synchronisée,0 doublon — critère officiel de fin Sprint4.
