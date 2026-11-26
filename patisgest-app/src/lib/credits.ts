export type CreditAccountType = "particulier" | "cafe_entreprise";
export type CreditStatus = "ouvert" | "solde" | "annule";

export type CreditPaymentEntry = {
  montantDa: number;
  note: string;
  at: string;
};

export type CreditEntry = {
  id: string;
  nomDebiteur: string;
  telephone: string;
  typeCompte: CreditAccountType;
  montantTotalDa: number;
  montantRegleDa: number;
  dateEcheance: string | null;
  note: string;
  statut: CreditStatus;
  reglements: CreditPaymentEntry[];
  createdAt: string;
};

export const DEMO_CREDITS_KEY_PREFIX = "patisgest.credits.v1.";

/**
 * Montant lisible en DA, ou 0.
 *
 * Les montants peuvent arriver dégradés : blob `localStorage` d'une version
 * antérieure, import JSON, ligne réparée à la main en SQL. Sans ce garde,
 * `NaN` se propageait jusqu'au tableau de bord, qui affichait « NaN DA ».
 * Une valeur numérique sous forme de chaîne (`"10000"`) reste acceptée :
 * c'est ce que produit un JSON sérialisé sans typage.
 */
function enDa(valeur: unknown): number {
  const n = typeof valeur === "string" ? Number(valeur) : valeur;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Arrondi au centime, sans dérive binaire. */
const auCentime = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function creditBalanceDa(
  entry: Pick<CreditEntry, "montantTotalDa" | "montantRegleDa" | "statut">,
): number {
  if (!entry || entry.statut !== "ouvert") return 0;
  return Math.max(0, auCentime(enDa(entry.montantTotalDa) - enDa(entry.montantRegleDa)));
}

/**
 * Somme des soldes ouverts. Une entrée illisible vaut 0 : elle ne contamine
 * jamais le total (le patron doit pouvoir lire un montant fiable même si une
 * ligne est corrompue).
 */
export function sumOpenCreditsDa(entries: CreditEntry[]): number {
  if (!Array.isArray(entries)) return 0;
  return auCentime(entries.reduce((sum, e) => sum + creditBalanceDa(e), 0));
}

export function starterDemoCredits(today: string): CreditEntry[] {
  return [
    {
      id: "cred-cafe-elbahdja",
      nomDebiteur: "Café El Bahdja (M. Karim)",
      telephone: "0551 23 45 67",
      typeCompte: "cafe_entreprise",
      montantTotalDa: 12500,
      montantRegleDa: 5000,
      dateEcheance: today,
      note: "Livraison croissants & mille-feuilles semaine",
      statut: "ouvert",
      reglements: [{ montantDa: 5000, note: "Avance mardi", at: `${today}T09:00:00Z` }],
      createdAt: `${today}T07:30:00Z`,
    },
    {
      id: "cred-meriem",
      nomDebiteur: "Mme Meriem (Habituelle)",
      telephone: "0661 88 99 10",
      typeCompte: "particulier",
      montantTotalDa: 3200,
      montantRegleDa: 0,
      dateEcheance: null,
      note: "Plateau gâteaux secs",
      statut: "ouvert",
      reglements: [],
      createdAt: `${today}T11:15:00Z`,
    },
  ];
}

export function applyCreditPayment(
  entry: CreditEntry,
  montantDa: number,
  note = "",
  nowIso = new Date().toISOString(),
): CreditEntry {
  if (entry.statut !== "ouvert") {
    throw new Error("Ce crédit est déjà soldé ou annulé.");
  }
  const amount = Math.round(Number(montantDa) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Montant du versement invalide.");
  }
  const total = enDa(entry.montantTotalDa);
  const reste = creditBalanceDa(entry);
  if (amount > reste + 0.01) {
    throw new Error("Le versement dépasse le reste à payer.");
  }

  /*
   * Trop-perçu toléré (<= 0.01) : on encaisse le RESTE, pas le montant brut.
   *
   * Avant, on stockait `min(total, regle + amount)` : un versement de 7 500,01
   * sur un reste de 7 500,00 enregistrait 7 500,00 « réglés » mais ajoutait
   * une ligne de 7 500,01 dans `reglements`, donc une ligne de caisse
   * supérieure au montant censé avoir été réglé (incohérence comptable).
   *
   * Décision (revue 11/03) : la ligne de règlement porte le montant
   * effectivement encaissé = `reste`. Le centime de trop n'est ni stocké ni
   * inventé. Règle identique côté SQL après migration 52.
   */
  const encaisse = auCentime(Math.min(amount, reste));
  const regleAvant = enDa(entry.montantRegleDa);
  const newRegle = auCentime(regleAvant + encaisse);
  const solde = newRegle >= auCentime(total) - 0.01;

  const lignes = Array.isArray(entry.reglements) ? [...entry.reglements] : [];
  const sommeLignes = auCentime(lignes.reduce((s, x) => s + enDa(x?.montantDa), 0));

  /*
   * Une avance initiale peut avoir été enregistrée dans `montantRegleDa`
   * sans ligne correspondante (création d'un crédit avec acompte). Sans
   * régularisation, la somme des lignes reste inférieure au montant réglé :
   * le rapprochement de tiroir ne tombe jamais juste, et le patron voit un
   * « trou » qui n'existe pas.
   *
   * On matérialise donc l'écart UNE fois, au premier règlement, sous une
   * ligne explicite « Avance initiale (régularisation) ».
   */
  const ecartAvant = auCentime(regleAvant - sommeLignes);
  if (ecartAvant > 0) {
    lignes.push({ montantDa: ecartAvant, note: "Avance initiale (régularisation)", at: nowIso });
  }
  lignes.push({ montantDa: encaisse, note: note.trim(), at: nowIso });

  return {
    ...entry,
    montantTotalDa: total,
    montantRegleDa: solde ? total : newRegle,
    statut: solde ? "solde" : "ouvert",
    reglements: lignes,
  };
}
