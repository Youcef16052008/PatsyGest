/**
 * Main-d'œuvre payée à la journée (et non à l'heure).
 *
 * Le salarié est payé pour une journée de travail. Pour le calcul RC-04
 * (temps × taux × (1 + charges %)), la journée est convertie en taux horaire
 * équivalent : salaire journalier ÷ heures payées par jour.
 * Exemple : 3 200 DA/jour sur 8 h → 400 DA/h ; une recette de 90 min, charges 25 %, coûte 750 DA de MO.
 */

export const HEURES_PAYEES_PAR_JOUR_DEFAUT = 8;
export const SALAIRE_JOURNALIER_MAX = 10_000_000;

/** Taux horaire équivalent d'une journée payée (arrondi au centime). */
export function tauxHoraireDepuisJournee(
  salaireJournalier: number,
  heuresParJour: number = HEURES_PAYEES_PAR_JOUR_DEFAUT,
): number {
  if (!Number.isFinite(salaireJournalier) || salaireJournalier < 0 || salaireJournalier > SALAIRE_JOURNALIER_MAX) {
    throw new RangeError("Salaire journalier invalide (0 à 10 000 000 DA).");
  }
  if (!Number.isFinite(heuresParJour) || heuresParJour <= 0 || heuresParJour > 24) {
    throw new RangeError("Heures payées par jour invalides (entre 0 et 24).");
  }
  return Math.round((salaireJournalier / heuresParJour) * 100) / 100;
}

/** Inverse : salaire journalier affiché à partir du taux horaire enregistré. */
export function salaireJournalierDepuisTaux(
  tauxHoraire: number,
  heuresParJour: number = HEURES_PAYEES_PAR_JOUR_DEFAUT,
): number {
  if (!Number.isFinite(tauxHoraire) || tauxHoraire < 0) return 0;
  return Math.round(tauxHoraire * heuresParJour * 100) / 100;
}
