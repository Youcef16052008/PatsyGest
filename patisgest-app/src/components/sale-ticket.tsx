"use client";

import { useState } from "react";
import { type Etablissement } from "@/lib/etablissement";
import { isPaymentMode, PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/pos-cart";
import { whatsappSaleReceiptUrl } from "@/lib/whatsapp";
import { dinars, quantite } from "@/lib/workspace-data";
import { Icon } from "./workspace-icons";

export type SaleTicketLine = {
  label: string;
  qty: number;
  unit?: string;
  totalTTC?: number;
};

/**
 * Ticket de caisse simple (format 80 mm, style Algérie) :
 * nom du magasin, date et heure, produits avec leurs prix, et total final en DA.
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
};

export default function SaleTicket({ data }: { data: SaleTicketData }) {
  const shopName = data.etablissement?.nom?.trim() || "Boutique";
  const shopAddress = data.etablissement?.adresse?.trim() || "";
  const shopPhone = data.etablissement?.telephone?.trim() || "";
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

  return (
    <div className="pg-card pg-card-pad space-y-3">
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
            break-inside: avoid;
            overflow-wrap: anywhere;
          }
          @page { margin: 4mm; }
        }
      `}</style>
      <div className="pg-card-head no-print">
        <h2>Dernier ticket</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="tel"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder="WhatsApp client (0550...)"
            className="pg-input w-44 text-xs"
            aria-label="Numéro WhatsApp du client"
          />
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="pg-button text-xs">
              Envoyer reçu WhatsApp
            </a>
          )}
          <button type="button" onClick={() => window.print()} className="pg-button pg-button-secondary">
            <Icon name="print" size={18} /> Imprimer
          </button>
        </div>
      </div>
      <div className="sale-ticket mx-auto w-[80mm] max-w-full wrap-anywhere border border-dashed border-slate-400 bg-white p-3 font-mono text-[11px] leading-snug text-black">
        <div className="text-center text-[13px] font-extrabold uppercase">{shopName}</div>
        {shopAddress && <div className="text-center text-[10px]">{shopAddress}</div>}
        {shopPhone && <div className="text-center text-[10px]">Tél : {shopPhone}</div>}
        {data.demo && <div className="mt-1 text-center text-[10px] font-bold">DÉMONSTRATION · SANS VALEUR FISCALE</div>}
        <div className="my-1.5 border-t border-dashed border-slate-400" />
        <div className="flex justify-between text-[11px]">
          <span>{dateStr}</span>
          <span>{timeStr}</span>
        </div>
        <div className="my-1.5 border-t border-dashed border-slate-400" />
        <div className="space-y-1">
          {lines.map((l, idx) => (
            <div key={idx} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-bold">{quantite(l.qty, l.unit)}</span> × {l.label}
              </span>
              <span className="shrink-0 font-bold">
                {l.totalTTC != null ? dinars(l.totalTTC) : ""}
              </span>
            </div>
          ))}
        </div>
        <div className="my-1.5 border-t border-dashed border-slate-400" />
        <div className="flex justify-between text-[13px] font-extrabold">
          <span>TOTAL</span>
          <span>{dinars(data.totalTTC)}</span>
        </div>
        <div className="my-1.5 border-t border-dashed border-slate-400" />
        <div className="text-center text-[10px]">Merci de votre visite !</div>
      </div>
    </div>
  );
}
