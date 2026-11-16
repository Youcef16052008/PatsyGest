# PâtisGest — Plan d'attaque « 1 seul pilote »

**Adaptation du plan projet v4.0 : un pilote unique, à fond, à Oran**
**Date :** novembre 2026 · **Durée :** 10 semaines (S1 → S10) · **Devise :** DZD

## 1. Ce que « 1 seul pilote » change

**Avantages :** décisions en 24 h, feedback quotidien possible, formation sur mesure,
zéro coordination multi-boutiques, MVP plus concentré (8 semaines au lieu de 12).

**Risques spécifiques :** dépendance totale (s'il abandonne, tout s'arrête), biais
(le produit colle à UNE boutique), pas de comparaison. **Parades :** convention
d'engagement signée (§ Kit Phase 0), critères objectifs chiffrés (pas « j'aime/j'aime pas »),
2 boutiques « observatrices » (1 visite/mois, sans engagement) pour garder du recul.

## 2. Calendrier 10 semaines (vue complète)

| Sem. | Phase | Objectif | Livrable | Validation pilote |
|---|---|---|---|---|
| S1 | **Phase 0** | Visite terrain + fiche pilote + mesures | CR visite + fiche remplie | 2 h sur place |
| S2 | **Phase 0** | Maquettes sur tablette + convention signée | Grille maquettes + convention | 1 h + signature |
| S3–S4 | **Ph.1 · Sprint 1** | Socle : comptes, rôles, 1er déploiement | App en ligne, connexion OK | Crée son compte, se connecte |
| S5–S6 | **Ph.1 · Sprint 2** | Articles, lots FEFO, achats, inventaire | Stocks réels saisis | Saisit 20 articles + 1 BC réel |
| S7–S8 | **Ph.1 · Sprint 3** | Recettes, coûts, OF, caisse, ticket | 1 journée complète dans l'app | Encaisse 1 journée réelle |
| S9–S10 | **Ph.1 · Sprint 4** | Clôture 6 flux, HACCP, onboarding, durcissement | MVP complet en routine | 2 semaines en production réelle |

**Règle d'or :** chaque vendredi 17 h = démo 15 min au pilote (sur place ou visio),
même si c'est petit. Jamais 2 semaines sans le voir utiliser le produit.

## 3. Phase 0 détaillée (S1–S2) — LE TERRAIN

### S1 — Visite d'observation (objectif : comprendre, pas vendre)

- [ ] Lundi : appeler, fixer le créneau (mardi ou mercredi matin, 2 h, heures creuses).
- [ ] Jour J : déroulé 90 min (voir Kit Phase 0) : observation 30 min → interview 40 min →
      mesures 20 min (compter : nb produits, tickets/jour, pertes visibles, matériel).
- [ ] J+1 : rédiger le CR visite + remplir la fiche pilote + lister les 5 douleurs classées.
- [ ] Vendredi : envoyer au pilote le résumé 1 page (« ce que j'ai compris ») pour validation.

### S2 — Maquettes + convention (objectif : engager)

- [ ] Lundi–mardi : adapter le prototype (nom boutique, 5 vrais produits, vrais prix).
- [ ] Mercredi : séance tablette 1 h (caisse → clôture → alerte DLC), remplir la grille.
- [ ] Jeudi : ajuster si score < 4/5 sur un écran critique (caisse, clôture).
- [ ] Vendredi : **signer la convention** (tarif −50 % dès validation MVP, 6 mois).

**Jalon J0 (fin S2) — Go/No-Go :** convention signée + grille maquettes ≥ 4/5 sur caisse,
clôture, stocks + fiche pilote complète. Si non → 1 semaine de rattrapage max, sinon pause.

## 4. Phase 1 détaillée : MVP 1-pilote (S3–S10)

Périmètre MVP resserré : MOD-01, 02, 03, 04, 05, 06 (caisse), **07 (clôture)**,
09-base (T° + nettoyage), 10-base (allergènes), 15. Tout le reste = V2.

### Sprint 1 — Socle (S3–S4) · ÉTAT : CODE LIVRÉ, À BRANCHER

Contenu : projet Next.js + Supabase + hébergement ; connexion + 3 rôles ;
isolement client ; 1er déploiement en ligne.
**Fini si :** le pilote se connecte à l'adresse en ligne et voit son tableau de bord.
→ *Le code est déjà créé dans `patisgest-app/` (voir §7). Reste : créer les comptes
gratuits (30 min) et déployer (voir README du projet).*

### Sprint 2 — Stocks & achats (S5–S6)

Contenu : articles 3 niveaux, lots + DLC, FEFO multi-lots, inventaire avec motif,
fournisseurs, bons de commande, réceptions, historique prix + alerte +10 %.
**Fini si :** 20 vrais articles + 1 vrai BC réceptionné ; test FEFO 100 mouvements verts.

### Sprint 3 — Cœur métier (S7–S8)

Contenu : recettes versionnées + fiche coût, OF (snapshot/lancer/valider partiel),
caisse hors-ligne + ticket 80 mm, file de synchro.
**Fini si :** 5 vraies recettes coûtées juste (vs calcul manuel) + 1 journée encaissée.

### Sprint 4 — Routine & durcissement (S9–S10)

Contenu : clôture 6 flux, HACCP (T° + nettoyage + alertes), allergènes auto,
onboarding, sauvegarde/restauration, check-list 60 cas, revue sécurité.
**Fini si :** 2 semaines en production réelle, 0 bug bloquant, clôture faite 12 j/14.

**Jalon J1 (fin S10) — MVP validé :** le pilote encaisse + clôture quotidiennement,
connaît ses marges sur ses 5 top produits, paie le 1er mois (−50 %).

## 5. Budget révisé — 1 pilote (année 1)

| Poste | Montant (DA) |
|---|---|
| Infra cloud (domaine + offres gratuites puis Pro) | 30 000 |
| Juridique/compta (RC + comptable + CGU) | 80 000 |
| Kit démo (tablette + imprimante 80 mm, prêté au pilote) | 45 000 |
| Déplacements + terrain (Oran) | 15 000 |
| Imprévus (15 %) | 26 000 |
| **Total** | **≈ 196 000 DA** |

Premier revenu : pilote à −50 % dès S10 (≈ 1 450 DA/mois Solo) — symbolique mais réel :
un client qui paie = preuve de valeur.

## 6. Engagements réciproques (résumé — fait foi : la convention signée)

**Le fondateur s'engage à :** livrer 1 démo/semaine, corriger tout bug bloquant en 48 h,
ne jamais perdre une donnée (sauvegardes), former (2 h + guide papier), rester à −50 %
pendant 6 mois après validation.

**Le pilote s'engage à :** 2 h/semaine (démo + tests), utiliser l'app en réel dès S7,
transmettre ses vrais chiffres (articles, prix, pertes), répondre sous 48 h,
payer dès validation J1, accepter 1 témoignage (si satisfait).

## 7. Où en est la Phase 1 aujourd'hui (livré ce jour)

- ✅ **Sprint 1 codé** : `patisgest-app/` — connexion, 3 rôles, isolement client,
  tableau de bord socle, base de données + sécurité, prêt à brancher.
- ⏳ **À faire par toi (30–45 min)** : créer les comptes gratuits Supabase + Vercel +
  GitHub et suivre le `README.md` du projet (10 étapes numérotées).
- ⏳ **Ensuite** : Sprint 2 (stocks) — on le code ensemble quand J0 est signé.

## 8. Règle d'arrêt adaptée (1 pilote)

- Si J0 non signé à S3 → 1 semaine de rattrapage, sinon **changer de pilote** (liste B de 5 noms prête dès S1).
- Si le pilote n'utilise pas l'app 5 jours de suite entre S7 et S10 → diagnostic 48 h
  (visite surprise aux heures creuses), puis décision : simplifier, reformer, ou remplacer.
- Si J1 non atteint à S12 → pause 2 semaines, analyse écrite, puis pivot ou arrêt propre.
  Ne jamais « continuer en espérant » sans jalon daté.

## 9. Après J1 (cap, sans s'y engager)

V2 (S11–S18) : import Z, retours, traçabilité, étiquette 13-378 + **pilotes n°2 et n°3**
(recrutés grâce au témoignage du n°1). Le plan 5-pilotes d'origine reprend à ce moment.

## 10. Cette semaine (S1) — jour par jour

| Jour | Action (durée) |
|---|---|
| Lundi | Imprimer le Kit Phase 0 + appeler le pilote (créneau 2 h) + préparer liste B (5 noms) |
| Mardi/Mercredi | **Visite terrain** (guide + questionnaire + photos + mesures) |
| Jeudi | Rédiger CR + fiche pilote + top 5 douleurs ; envoyer résumé 1 page au pilote |
| Vendredi | Créer comptes GitHub/Supabase/Vercel (README §1–3) + relire convention avant S2 |

*— Fin du plan d'attaque 1 pilote —*
