# Suivi du plan — décision commerciale et réglementaire (novembre 2026)

Source : analyse du dossier « rapports d'agents » et plan en 5 étapes. Statut au 20/11/2026.

| # | Étape | Statut | Preuve / reste à faire |
|---|---|---|---|
| 1 | Ne fusionner aucune des trois applications concurrentes | **Fait** (sans objet dans le dépôt) | Aucun de ces dossiers n'est dans `main`. Décision consignée ici. |
| 2 | Remplacer la grille mensuelle par une offre annuelle prépayée, comme hypothèse | **Fait** | `PâtisGest-Documents/03-Roadmap-Plan-Projet-PatisGest-v4.md` §6 et §7 (R8) ; `01-Cahier-des-Charges` ligne D1. Restent à aligner : `NOTE-HEBERGEMENT.md`, `NOTE-COUT-MINIMAL.md`, `HANDOFF-EN.md`, `02-Architecture-Technique` (ligne 180) et les fichiers `.docx` (non régénérés). |
| 3 | Inscrire la LF 2026 au registre des risques | **Fait** | `NOTE-IMPORTANTE-PATISGEST.md` (section « Risque réglementaire ») et R8 de la roadmap. Texte à faire valider par un conseiller fiscal. |
| 4 | Fermer les P0 de restauration (D5/D6) et d'isolation (D7) | **Non terminé** | Non démontré à ce jour. Le test de restauration du dump brut échoue sur `realtime.list_changes` / `log_min_messages` (`patisgest-app/migrations/ETAT-RESTAURATION.md`). Procédure prête : `revue/PROCEDURE-RESTAURATION-PILOTE.md` (D5/D6/D7). **Bloquants** : sauvegarde réelle du pilote (mot de passe de base refusé, workflow `sauvegarde-free.yml` corrigé mais non abouti) et environnement Supabase isolé à fournir (création de branche 402). |
| 5 | Trois pilotes payants à −50 % sur 6 mois (10 visites, témoignage, logo) | **Non terminé** | Action commerciale humaine. Aucun pilote signé à ce jour. Gabarits prêts : `revue/DOSSIER-PILOTES-COMMERCIAL.md` (script de prospection, fiche d'offre, convention, suivi) ; il manque les noms, adresses, contacts et comptes rendus de visite. |
| 6 | Page de prix publique | **Non démarré (volontaire)** | Conditionnée aux pilotes (étape 5). Ne pas publier avant. |

## Points bloquants

- Étapes 4 et 5 ne peuvent pas être finies depuis le dépôt : la première exige une restauration réelle
  et des tests d'isolation sur une base de test ; la seconde exige des clients qui signent.
- Attestation éditeur (art. 74 / 81 / 115 bis, en vigueur le 01/01/2027) : **ne pas signer** avant que
  l'étape 4 soit démontrée.

## Hypothèses à valider

- Solo 35 000 DA/an, Réseau 89 000–129 000 DA/an, installation 15 000–25 000 DA : hypothèses de départ.
- Almawarid (concurrent) publie 10 000 DA/an en promotion et un plan gratuit ; ce prix n'a pas été testé auprès de boutiques.
