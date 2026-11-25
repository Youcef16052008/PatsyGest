"use client";

import { useState } from "react";
import { avertissementsTicket, enteteTicket, type Etablissement } from "@/lib/etablissement";
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
 * Ticket de vente caisse imprimable (format 80 mm), mono- ou multiproduit.
 * Porte NIF, NIS, RC, adresse, détail des lignes, totaux HT/TVA/TTC, mode de
 * règlement encaissé et lots FEFO tracés.
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
  const entete = enteteTicket(data.etablissement);
  const manques = avertissementsTicket(data.etablissement);
  const lines: SaleTicketLine[] =
    data.lines && data.lines.length > 0
      ? data.lines
      : [{ label: data.articleLabel, qty: data.qte, totalTTC: data.totalTTC }];
  const totalTva = Math.round((data.totalTTC - data.totalHT) * 100) / 100;
  const modeLabel = isPaymentMode(data.modePaiement)
    ? PAYMENT_MODE_LABELS[data.modePaiement]
    : typeof data.modePaiement === "string" && data.modePaiement.trim()
      ? data.modePaiement
      : null;
  const [clientPhone, setClientPhone] = useState("");
  const waUrl = whatsappSaleReceiptUrl({
    phone: clientPhone,
    shop: data.etablissement?.nom ?? "Pâtisserie",
    numero: data.numero ?? "Ticket",
    totalDa: data.totalTTC,
    lines: lines.map((l) => ({ label: l.label, qty: l.qty, unit: l.unit, totalDa: l.totalTTC })),
    modePaiement: modeLabel ?? undefined,
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
        {entete.map((ligne, i) => (
          <div key={i} className={i === 0 ? "text-center font-bold uppercase" : "text-center"}>
            {ligne}
          </div>
        ))}
        <div className="text-center">{new Date(data.at).toLocaleString("fr-FR")}</div>
        {data.demo && <div className="text-center font-bold">DÉMONSTRATION · SANS VALEUR FISCALE</div>}
        {data.numero && <div className="text-center">Ticket n° {data.numero}</div>}
        <div className="text-center">Site : {data.siteLabel}</div>
        <div className="my-1 border-t border-dashed border-slate-400" />
        {lines.map((l, idx) => (
          <div key={idx} className="mb-1">
            <div className="font-bold">{l.label}</div>
            <div className="flex justify-between">
              <span>× {quantite(l.qty, l.unit)}</span>
              <span>{l.totalTTC != null ? dinars(l.totalTTC) : ""}</span>
            </div>
          </div>
        ))}
        <div className="my-1 border-t border-dashed border-slate-400" />
        {totalTva > 0.01 && (
          <>
            <div className="flex justify-between">
              <span>Total HT</span>
              <span>{dinars(data.totalHT)}</span>
            </div>
            <div className="flex justify-between">
              <span>TVA</span>
              <span>{dinars(totalTva)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-[12px] font-extrabold">
          <span>Total TTC</span>
          <span>{dinars(data.totalTTC)}</span>
        </div>
        {modeLabel && (
          <div className="flex justify-between">
            <span>Règlement</span>
            <span>{modeLabel}</span>
          </div>
        )}
        {data.lots.length > 0 && (
          <div className="mt-1 text-[11px]">Lots : {data.lots.join(", ")}</div>
        )}
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="text-center">Merci de votre visite !</div>
        {!data.demo && manques.length > 0 && (
          <div className="no-print mt-1 text-center text-[10px]">
            ⚠ Mentions légales incomplètes (Paramètres)
          </div>
        )}
      </div>
    </div>
  );
}
