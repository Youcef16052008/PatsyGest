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

export function creditBalanceDa(entry: Pick<CreditEntry, "montantTotalDa" | "montantRegleDa" | "statut">): number {
  if (entry.statut !== "ouvert") return 0;
  return Math.max(0, Math.round((entry.montantTotalDa - entry.montantRegleDa) * 100) / 100);
}

export function sumOpenCreditsDa(entries: CreditEntry[]): number {
  return Math.round(entries.reduce((sum, e) => sum + creditBalanceDa(e), 0) * 100) / 100;
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
  const reste = creditBalanceDa(entry);
  if (amount > reste + 0.01) {
    throw new Error("Le versement dépasse le reste à payer.");
  }
  const newRegle = Math.min(entry.montantTotalDa, Math.round((entry.montantRegleDa + amount) * 100) / 100);
  const solde = newRegle >= entry.montantTotalDa - 0.01;
  return {
    ...entry,
    montantRegleDa: solde ? entry.montantTotalDa : newRegle,
    statut: solde ? "solde" : "ouvert",
    reglements: [...entry.reglements, { montantDa: amount, note: note.trim(), at: nowIso }],
  };
}
