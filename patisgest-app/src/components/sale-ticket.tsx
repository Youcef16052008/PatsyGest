"use client";

import { useEffect, useRef, useState } from "react";
import { type Etablissement } from "@/lib/etablissement";
import { isPaymentMode, PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/pos-cart";
import { whatsappSaleReceiptUrl } from "@/lib/whatsapp";
import { dinars, quantite } from "@/lib/workspace-data";
import { useLocale } from "./locale-provider";
import { Icon } from "./workspace-icons";

export type SaleTicketLine = {
  label: string;
  qty: number;
  unit?: string;
  unitTTC?: number;
  totalTTC?: number;
};

/**
 * Ticket de caisse 80 mm, volontairement réduit à cinq choses :
 * le nom du magasin, la date et l'heure, les produits avec leur prix,
 * et le total. Rien d'autre — c'est un reçu de comptoir, pas une facture.
 *
 * `autoPrint` : dès que la vente est confirmée, le ticket s'imprime tout seul.
 * Le bouton reste là pour réimprimer sans refaire la vente.
 */
export type SaleTicketData = {
  numero?: string;
  articleLabel: string;
  siteLabel: string;
  qte: number;
  lines?: SaleTicketLine[];
  modePaiement?: PaymentMode | string | null;
  totalHT: number;
  totalTTC: number;
  lots: string[];
  at: string;
  demo?: boolean;
  etablissement?: Etablissement | null;
  creditNom?: string;
};

export default function SaleTicket({ data, autoPrint = false }: { data: SaleTicketData; autoPrint?: boolean }) {
  const { t } = useLocale();
  const shopName = data.etablissement?.nom?.trim() || "Boutique";
  const lines: SaleTicketLine[] =
    data.lines && data.lines.length > 0
      ? data.lines
      : [{ label: data.articleLabel, qty: data.qte, totalTTC: data.totalTTC }];

  const when = new Date(data.at);
  const dateStr = Number.isNaN(when.getTime())
    ? data.at
    : when.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const modeLabel = isPaymentMode(data.modePaiement)
    ? PAYMENT_MODE_LABELS[data.modePaiement]
    : typeof data.modePaiement === "string" && data.modePaiement.trim()
      ? data.modePaiement
      : undefined;

  const [clientPhone, setClientPhone] = useState("");
  const waUrl = whatsappSaleReceiptUrl({
    phone: clientPhone,
    shop: shopName,
    numero: data.numero ?? "Ticket",
    totalDa: data.totalTTC,
    lines: lines.map((l) => ({ label: l.label, qty: l.qty, unit: l.unit, totalDa: l.totalTTC })),
    modePaiement: modeLabel,
  });

  // Impression immédiate après le paiement : une seule fois par ticket.
  const dejaImprime = useRef<string | null>(null);
  useEffect(() => {
    if (!autoPrint) return;
    const cle = `${data.numero ?? ""}|${data.at}`;
    if (dejaImprime.current === cle) return;
    dejaImprime.current = cle;
    const minuteur = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        /* aucune imprimante branchée : le ticket reste affiché à l'écran */
      }
    }, 350);
    return () => window.clearTimeout(minuteur);
  }, [autoPrint, data.numero, data.at]);

  return (
    <div className="pg-card pg-card-pad pg-ticket-card space-y-3">
      <style>{`
        @media print {
          body:has(.sale-ticket) > :not(.sale-ticket, :has(.sale-ticket)),
          body :has(.sale-ticket) > :not(.sale-ticket, :has(.sale-ticket)),
          .sale-ticket .no-print { display: none !important; }

          body:has(.sale-ticket), body :has(.sale-ticket) {
            display: block;
            min-height: 0;
            height: auto;
            max-width: none;
            margin: 0;
            padding: 0;
            border: 0;
            background: white;
          }
          .sale-ticket {
            position: static;
            width: 80mm;
            max-width: 100%;
            margin: 0;
            padding: 0;
            border: 0;
            box-shadow: none;
            break-inside: avoid;
            overflow-wrap: anywhere;
          }
          @page { margin: 4mm; }
        }
      `}</style>

      <div className="pg-ticket-head no-print">
        <div>
          <p className="pg-kicker">{t.ticketPrinted}</p>
          <h2>{t.ticketTitle}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => window.print()} className="pg-button">
            <Icon name="print" size={18} /> {t.ticketPrint}
          </button>
          <details className="pg-ticket-wa">
            <summary className="pg-button pg-button-secondary">{t.ticketSendWhatsApp}</summary>
            <div className="pg-ticket-wa-body">
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder={t.ticketWhatsAppPlaceholder}
                className="pg-input"
                aria-label={t.ticketWhatsAppLabel}
              />
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="pg-button pg-button-secondary">
                  <Icon name="arrow" size={16} /> WhatsApp
                </a>
              )}
            </div>
          </details>
        </div>
      </div>

      <div className="sale-ticket mx-auto w-[80mm] max-w-full wrap-anywhere border border-dashed border-slate-400 bg-white p-3 font-mono text-[12px] leading-snug text-black">
        <div className="text-center text-[15px] font-extrabold uppercase tracking-wide">{shopName}</div>
        <div className="mt-1 flex justify-between text-[12px]">
          <span>{dateStr}</span>
          <span>{timeStr}</span>
        </div>
        <div className="my-2 border-t border-dashed border-slate-500" />
        <div className="space-y-1.5">
          {lines.map((l, idx) => {
            const unit = l.unitTTC ?? (l.totalTTC != null && l.qty > 0 ? l.totalTTC / l.qty : null);
            return (
              <div key={idx} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{l.label}</span>
                  <span className="block text-[11px]">
                    {quantite(l.qty, l.unit)}
                    {unit != null ? ` × ${dinars(unit)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-bold">{l.totalTTC != null ? dinars(l.totalTTC) : ""}</span>
              </div>
            );
          })}
        </div>
        <div className="my-2 border-t border-dashed border-slate-500" />
        <div className="flex justify-between text-[15px] font-extrabold">
          <span>{t.ticketTotal}</span>
          <span>{dinars(data.totalTTC)}</span>
        </div>
        {data.creditNom && (
          <div className="mt-1 text-[11px] font-bold">{t.ticketCredit} {data.creditNom}</div>
        )}
        {data.demo && <div className="mt-2 text-center text-[10px] font-bold">{t.ticketDemo}</div>}
      </div>
    </div>
  );
}
