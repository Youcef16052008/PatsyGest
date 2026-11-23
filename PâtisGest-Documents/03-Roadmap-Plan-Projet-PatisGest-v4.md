# PâtisGest — Roadmap & plan projet v4.0

**Solo-développeur + IA · Sprints de 2 semaines · Marché : Oran puis Algérie**
**Date :** novembre 2026 · **Devise :** DZD

## 1. Stratégie

1. **Prototype d'abord (FAIT)** : le HTML v1.0 valide l'ergonomie et les calculs avec de vrais
   pâtissiers avant d'écrire la V1 cloud.
2. **Pilotes payants** : 3–5 boutiques d'Oran paient un tarif réduit dès le MVP
   (un client qui paie donne de vrais retours).
3. **Un module rentable à la fois** : chaque version apporte un bénéfice mesurable
   (marge connue → pertes mesurées → cake rentable → multi-sites).
4. **Jamais de big-bang** : mises en production petites et fréquentes, retour arrière possible.

## 2. Phases (vue 12 mois)

| Phase | Durée | Contenu | Sortie |
|---|---|---|---|
| **Phase 0 — Cadrage terrain** | S1–S2 (3 sem.) | 5 visites labos, maquettes tablette validées, comptable désigné, RC/domaine lancés | Dossier validé + 3 pilotes signés |
| **MVP — Caisse qui calcule juste** | S3–S12 (~10 sem.) | MOD-01/02/03/04/05/06/caisse/09-base/10-base/15 + offline de base | 5 pilotes en production |
| **V2 — Pertes sous contrôle** | S13–S20 (~8 sem.) | MOD-07 clôture, import Z, retours, traçabilité, NC, étiquette 13-378, marge réelle | 15 clients, pertes < 8 % |
| **V3 — Rentabilité élargie** | S21–S30 (~10 sem.) | Cake studio, planning/besoins, simulation, multi-sites, offline complet, code-barres | 30 clients, multi-sites |
| **V4 — Industrialisation** | S31–S40 (~10 sem.) | Nutritionnel, SATIM, arabe partiel, desktop Tauri, API partenaires | 50+ clients, expansion |

*S = semaine calendaire à temps partiel adapté : compte ~1,5× si tu codes le soir/week-end.*

## 3. MVP en détail (6 sprints × 2 semaines)

### Sprint 1 — Socle (S3–S4)

- Projet Next.js + Supabase + Drizzle reliés ; Auth + rôles ; `client_id` partout.
- Maquettes PWA validées avec 2 pilotes (tablette réelle).
- **Fini si :** connexion + 3 rôles + 1er déploiement Vercel.

### Sprint 2 — Articles, lots, FEFO (S5–S6)

- MOD-02 complet + MOD-03 fournisseurs/BC/réception + historique prix.
- Tests auto FEFO (10 cas) + inventaire avec motif.
- **Fini si :** jeu de test 100 mouvements FEFO verts.

### Sprint 3 — Recettes & coûts (S7–S8)

- MOD-04 (familles/versions/sous-recettes figées) + fiche coût RC-01..RC-06.
- Tests auto des 10 recettes de référence au centime.
- **Fini si :** 3 pâtissiers retrouvent leurs coûts « à la main ».

### Sprint 4 — Production + caisse (S9–S10)

- MOD-05 (OF snapshot/lancer/valider partiel) + MOD-06 caisse + ticket 80 mm.
- File hors-ligne v1 (caisse + OF) + bouton état synchro.
- **Fini si :** journée complète simulée sans internet puis synchronisée, 0 doublon.

### Sprint 5 — Qualité + onboarding (S11)

- MOD-09 (T° + nettoyage + alertes), MOD-10 allergènes matières→produits, MOD-15
  (paramètres, sauvegarde/restauration, exports CSV), assistant onboarding.
- **Fini si :** novice termine l'onboarding en < 1 h (testé).

### Sprint 6 — Durcissement pilotes (S12)

- Check-list 60 cas, corrections, revue sécurité 25 points, mentions légales/CGU,
  formation 5 pilotes (1 h sur place + guide papier 2 pages).
- **Fini si :** 5 pilotes encaissent réellement pendant 1 semaine, 0 bug bloquant.

## 4. Jalons & critères de sortie (rappel opposable)

| Jalon | Date cible | Critère impératif |
|---|---|---|
| J0 cadrage | S2 | 3 conventions pilotes signées + maquettes validées |
| J1 MVP | S12 | 5 pilotes en prod 1 semaine, 0 bloquant, RC verts |
| J2 V2 | S20 | 15 clients, taux de perte mesuré < 8 % chez 80 % |
| J3 V3 | S30 | 30 clients dont 3 multi-sites, NPS ≥ 40 |
| J4 V4 | S40 | 50 clients, paiement en ligne actif, churn < 5 %/mois |

**Règle d'arrêt :** si J1 n'a pas 3 pilotes payants à S14 → pause, diagnostic terrain
2 semaines (prix ? ergonomie ? besoin ?), puis pivot documenté ou arrêt propre.
## 5. Budget prévisionnel (DZD, année 1)

| Poste | Détail | Montant |
|---|---|---|
| Infra cloud | Domaine + Supabase/Vercel Pro à 15–20 clients + sauvegardes | ~60 000 |
| Juridique/compta | RC + comptable (trimestriel année 1) + CGU | ~80 000 |
| Matériel démo | Tablette + imprimante ticket (kit pilote prêté) | ~45 000 |
| Déplacements Oran | 5 pilotes × visites | ~30 000 |
| Marketing terrain | Flyers, cartes, démo vidéo | ~25 000 |
| Imprévus (15 %) | | ~36 000 |
| **Total année 1** | | **≈ 276 000 DA (~2 000 €)** |

Ton temps n'est pas chiffré (investissement fondateur). Aucun salarié avant 40 clients.

## 6. Business model — Algérie

### Offres (HT, DZD) — hypothèse de départ, à valider sur 3 boutiques pilotes

Modèle retenu : **abonnement annuel prépayé + frais d'installation**. Aucun abonnement mensuel,
aucune licence à vie par poste, aucun projet sur mesure par boutique. Ces montants ne sont pas
affichés publiquement tant que les pilotes n'ont pas confirmé le prix accepté.

| Offre | Prix (par an, prépayé) | Contenu |
|---|---|---|
| **Solo** | 35 000 (fourchette 35 000–39 000) | 1 site, 2 utilisateurs, tous modules V1–V2 |
| **Réseau** | 89 000–129 000 (selon sites) | 2 à 5 sites ; palier intermédiaire à définir après pilotes |
| Installation | 15 000–25 000 (une fois) | Paramétrage + reprise données + formation 2 h |
| Pilotes (6 mois) | −50 % | En échange : retours + témoignage + logo. Durée limitée, puis tarif plein |

Ancrage marché vérifié (pages publiques consultées le 20/11/2026) : Almawarid publie un plan Standard à 20 000 DA/an,
soit 10 000 DA/an en promotion −50 %, et un plan gratuit sans carte CIB. Notre Solo à 35 000
DA/an est donc au-dessus de l'entrée promotionnelle concurrente : la valeur doit être démontrée
par les pilotes, pas supposée.

### Encaissement

- Année 1 : virement, chèque, espèces contre reçu (pilotes et early adopters).
- Année 1 : facturation annuelle prépayée ; virement, chèque ou espèces contre reçu.
- V4 : renouvellement annuel en ligne **CIB / EDAHABIA via SATIM** + rappels auto d'impayés
  (grâce : 15 j, puis lecture seule — jamais de perte de données). Le paiement par carte sans
  registre de commerce n'est pas acquis : à vérifier avant d'annoncer ce canal.

### Seuil de rentabilité

Charges fixes ~25 000 DA/mois (infra + compta), soit ~300 000 DA/an. Un Solo à 35 000 DA/an
équivaut à ~2 917 DA/mois de revenu lissé → **~9 clients Solo** pour l'équilibre de trésorerie
(25 000 ÷ 2 917 ≈ 8,6). Ce calcul n'inclut ni le coût d'acquisition (déplacements, temps
commercial), ni l'IFU, ni la CASNOS : à compléter avant toute décision de budget.
Les seuils de 35 et 50 clients sont à recalculer avec le prix retenu après les pilotes.

### Go-to-market (Oran d'abord)

1. Liste de 30 pâtisseries (réseau + tournée) → 10 démos (prototype HTML sur tablette).
2. 5 pilotes payants (−50 %) → témoignages vidéo 60 s.
3. Bouche-à-oreille + Facebook/Instagram local + 1 grossiste partenaire (flyers).
4. Année 2 : Alger, Constantine, Sétif via 1 commercial à la commission.

## 7. Risques & parades

| # | Risque | Probabilité | Impact | Parade |
|---|---|---|---|---|
| R1 | Adoption faible (habitudes papier) | Moyenne | Fort | Onboarding < 1 h, formation sur place, pilotes de confiance |
| R2 | Coupures internet longues | Forte | Moyen | Offline-first testé 7 j (file + conflits additifs) |
| R3 | Erreur de calcul (marge fausse) | Faible | Critique | RC-01..10 en tests bloquants + revue comptable |
| R4 | Perte de données | Faible | Critique | Sauvegarde auto + export client + restauration testée/mois |
| R5 | Changement fiscal (TVA, e-facture) | Moyenne | Moyen | TVA paramétrable par nature ; veille comptable trimestrielle |
| R6 | Épuisement solo | Moyenne | Fort | Sprints courts, arrêt J1 documenté, freelance ponctuel possible |
| R7 | Concurrent copiant le créneau | Faible | Moyen | Vitesse + terrain + données (recettes clients = ancrage) |
| R8 | Obligation fiscale LF 2026 (art. 74, 81 ; CPF 20 ter et 51 sexies) exigible au 01/01/2027 : engagement éditeur demandé par les boutiques, amende de 500 000 DA par logiciel si absent (art. 115 bis) | Forte | Critique | Ne signer aucune attestation tant que restauration (D5/D6) et isolation (D7) ne sont pas prouvées ; faire valider le texte par un conseiller fiscal. Voir NOTE-IMPORTANTE-PATISGEST.md |

## 8. KPI pilotés (revue mensuelle, 30 min)

Adoption : pilotes actifs/semaine, tickets/jour, clôtures faites (objectif 90 %).
Produit : bugs bloquants (0), temps synchro médian, exports réussis.
Business : MRR, churn, NPS, taux de perte médian des clients (preuve de valeur).

## 9. Organisation solo (concrète)

- **Rituel hebdo :** lundi = plan (3 objectifs), vendredi = démo filmée 5 min + mise en prod.
- **Outils :** GitHub (code + jalons), carnet terrain (retours pilotes datés), WhatsApp pilotes,
  tableur MRR 1 page.
- **Règle IA :** l'IA propose, les **tests RC/FEFO disposent** — aucun calcul sans test vert.
- **Recours :** freelance à la tâche (design étiquette, CGU, audit sécu) — jamais au forfait global.
- **Santé :** 1 jour off/semaine non négociable ; si 2 sprints rouges d'affilée → réduire le scope.

## 10. Check-list de démarrage (tes 10 premières actions)

- [ ] 1. Faire valider le §5 fiscal du CDC par un comptable (1 rendez-vous).
- [ ] 2. Lister 30 pâtisseries à Oran + préparer la démo tablette (prototype HTML).
- [ ] 3. Lancer RC + domaine (NIC DZ) en parallèle du dev.
- [ ] 4. Créer GitHub privé + projet Vercel + projet Supabase (offres gratuites).
- [ ] 5. Sprint 1 : Auth + rôles + `client_id` (ne rien coder d'autre avant).
- [ ] 6. Faire signer 3 conventions pilotes (modèle : −50 %, 6 mois, témoignage).
- [ ] 7. Valider les maquettes caisse + clôture sur tablette réelle avec 2 pilotes.
- [ ] 8. Écrire les tests RC-01..RC-10 AVANT les écrans de calcul.
- [ ] 9. Acheter le kit démo (tablette + imprimante 80 mm d'occasion).
- [ ] 10. Bloquer le rituel lundi/vendredi dans l'agenda pour 12 semaines.

*— Fin de la roadmap v4.0 — Bon courage, on commence ! 🧁*
