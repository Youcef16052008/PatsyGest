export function normalizeAlgerianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("213") && digits.length >= 11) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return `213${digits.slice(1)}`;
  if (digits.length >= 8) return digits;
  return null;
}

export function whatsappOrderUrl(params: {
  phone: string | null | undefined;
  client: string;
  numero: string;
  eventDate: string;
  parts: number;
  resteDa?: number;
}): string | null {
  const num = normalizeAlgerianPhone(params.phone);
  if (!num) return null;
  const resteTxt =
    params.resteDa != null && params.resteDa > 0
      ? ` Reste à régler : ${new Intl.NumberFormat("fr-DZ").format(Math.round(params.resteDa))} DA.`
      : "";
  const msg = `Bonjour ${params.client}, concernant votre commande ${params.numero} (${params.parts} parts) prévue pour le ${params.eventDate}.${resteTxt}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

export function whatsappCreditReminderUrl(params: {
  phone: string | null | undefined;
  debiteur: string;
  resteDa: number;
  shop: string;
  note?: string;
}): string | null {
  const num = normalizeAlgerianPhone(params.phone);
  if (!num) return null;
  const montant = new Intl.NumberFormat("fr-DZ").format(Math.round(params.resteDa));
  const detail = params.note ? ` (${params.note})` : "";
  const msg = `Salam ${params.debiteur}, petit rappel amical de la pâtisserie ${params.shop} concernant le solde en cours de ${montant} DA${detail}. Merci et à bientôt !`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

export function whatsappDailyClosingUrl(params: {
  phone: string | null | undefined;
  shop: string;
  date: string;
  totalVentesDa: number;
  especesAttenduesDa: number;
  especesCompteesDa: number;
  ecartDa: number;
  tickets: number;
  resteEncaisserDa?: number;
}): string | null {
  const num = normalizeAlgerianPhone(params.phone);
  if (!num) return null;
  const fmt = (n: number) => `${new Intl.NumberFormat("fr-DZ").format(Math.round(n))} DA`;
  const lines = [
    `*Bilan du soir — ${params.shop}* (${params.date})`,
    `• Tickets encaissés : ${params.tickets}`,
    `• Total ventes du jour : ${fmt(params.totalVentesDa)}`,
    `• Espèces attendues tiroir : ${fmt(params.especesAttenduesDa)}`,
    `• Espèces comptées : ${fmt(params.especesCompteesDa)}`,
    `• Écart tiroir : ${params.ecartDa >= 0 ? "+" : ""}${fmt(params.ecartDa)}`,
  ];
  if (params.resteEncaisserDa != null && params.resteEncaisserDa > 0) {
    lines.push(`• Reste à encaisser (commandes/crédits) : ${fmt(params.resteEncaisserDa)}`);
  }
  return `https://wa.me/${num}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export function whatsappSaleReceiptUrl(params: {
  phone: string | null | undefined;
  shop: string;
  numero: string;
  totalDa: number;
  lines: { label: string; qty: number; unit?: string; totalDa?: number | null }[];
  modePaiement?: string;
}): string | null {
  const num = normalizeAlgerianPhone(params.phone);
  if (!num) return null;
  const fmt = (n: number) => `${new Intl.NumberFormat("fr-DZ").format(Math.round(n))} DA`;
  const detail = params.lines
    .slice(0, 12)
    .map((l) => `- ${l.label} × ${l.qty}${l.unit ? ` ${l.unit}` : ""}${l.totalDa != null ? ` (${fmt(l.totalDa)})` : ""}`)
    .join("\n");
  const msg = [
    `Merci pour votre visite chez *${params.shop}* !`,
    `Reçu ${params.numero}${params.modePaiement ? ` · ${params.modePaiement}` : ""}`,
    detail,
    `*Total : ${fmt(params.totalDa)}*`,
  ].join("\n");
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}
