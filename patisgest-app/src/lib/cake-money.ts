/** Montants de dossier : paiements en TTC, acompte minimum fixé sur le HT. */
export function cakeConnectedTotals(prixHt: number, tvaPct: number, paid: number) {
  const brut = prixHt * (1 + tvaPct / 100);
  const ttc = Math.round((brut + Number.EPSILON * Math.max(1, Math.abs(brut))) * 100) / 100;
  return { ttc, balance: Math.max(0, Math.round((ttc - paid + Number.EPSILON) * 100) / 100) };
}
