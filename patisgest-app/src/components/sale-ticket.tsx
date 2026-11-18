"use client";

import { avertissementsTicket, enteteTicket, type Etablissement } from "@/lib/etablissement";
import { dinars, quantite } from "@/lib/workspace-data";
import { Icon } from "./workspace-icons";

/**
 * Ticket de vente caisse imprimable (format 80 mm).
 * §5 du cahier des charges : le ticket doit porter NIF, NIS, RC et l'adresse.
 * Auparavant il n'affichait que « PâtisGest — Caisse ».
 */
export type SaleTicketData = {
  numero?: string;
  articleLabel: string;
  siteLabel: string;
  qte: number;
  totalHT: number;
  totalTTC: number;
  lots: string[];
  at: string;
  demo?: boolean;
  /** Identité de l'établissement (mentions légales). */
  etablissement?: Etablissement | null;
};

export default function SaleTicket({ data }: { data: SaleTicketData }) {
  const entete = enteteTicket(data.etablissement);
  const manques = avertissementsTicket(data.etablissement);
  return (
    <div className="pg-card pg-card-pad space-y-3">
      <style>{`
        @media print {
          /* Conserver seulement le ticket et ses ancêtres (layout, main, etc.). */
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
          /* La longueur du papier vient du pilote, pas d'un format CSS fixe. */
          @page { margin: 4mm; }
        }
      `}</style>
      <div className="pg-card-head no-print"><h2>Dernier ticket</h2><button type="button" onClick={() => window.print()} className="pg-button pg-button-secondary">
        <Icon name="print" size={18}/> Imprimer le ticket
      </button></div>
      <div className="sale-ticket mx-auto w-[80mm] max-w-full wrap-anywhere border border-dashed border-slate-400 bg-white p-3 font-mono text-[11px] leading-snug text-black">
        {entete.map((ligne, i) => (
          <div key={i} className={i === 0 ? "text-center font-bold uppercase" : "text-center"}>{ligne}</div>
        ))}
        <div className="text-center">{new Date(data.at).toLocaleString("fr-FR")}</div>
        {data.demo && <div className="text-center font-bold">DÉMONSTRATION · SANS VALEUR FISCALE</div>}
        {data.numero && <div className="text-center">Ticket n° {data.numero}</div>}
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="text-[13px] font-extrabold">{data.articleLabel}</div>
        <div className="flex justify-between"><span>Qté</span><span>{quantite(data.qte)}</span></div>
        <div>Site : {data.siteLabel}</div>
        {data.lots.length > 0 && <div>Lots : {data.lots.join(", ")}</div>}
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="flex justify-between"><span>Total HT</span><span>{dinars(data.totalHT)}</span></div>
        <div className="flex justify-between font-bold"><span>Total TTC</span><span>{dinars(data.totalTTC)}</span></div>
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="text-center">Merci de votre visite !</div>
        {!data.demo && manques.length > 0 && (
          <div className="no-print mt-1 text-center text-[8px]">⚠ Mentions légales incomplètes (Paramètres)</div>
        )}
      </div>
    </div>
  );
}
