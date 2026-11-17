"use client";

import { avertissementsTicket, enteteTicket, type Etablissement } from "@/lib/etablissement";

/**
 * Ticket de vente caisse imprimable (format 80 mm).
 * §5 du cahier des charges : le ticket doit porter NIF, NIS, RC et l'adresse.
 * Auparavant il n'affichait que « PâtisGest — Caisse ».
 */
export type SaleTicketData = {
  ticket: string;
  articleLabel: string;
  siteLabel: string;
  qte: number;
  totalHT: number;
  totalTTC: number;
  lots: string[];
  at: string;
  /** Identité de l'établissement (mentions légales). */
  etablissement?: Etablissement | null;
};

const da = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DA`;

export default function SaleTicket({ data }: { data: SaleTicketData }) {
  const entete = enteteTicket(data.etablissement);
  const manques = avertissementsTicket(data.etablissement);
  return (
    <div className="mt-3 space-y-2">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .sale-ticket, .sale-ticket * { visibility: visible; }
          .sale-ticket { position: absolute; left: 0; top: 0; width: 80mm; }
          .no-print { display: none !important; }
        }
      `}</style>
      <button type="button" onClick={() => window.print()}
        className="no-print rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">
        Imprimer le ticket
      </button>
      <div className="sale-ticket mx-auto w-[80mm] border border-dashed border-slate-400 bg-white p-3 font-mono text-[11px] leading-snug text-black">
        {entete.map((ligne, i) => (
          <div key={i} className={i === 0 ? "text-center font-bold uppercase" : "text-center"}>{ligne}</div>
        ))}
        <div className="text-center">{new Date(data.at).toLocaleString("fr-FR")}</div>
        <div className="text-center">Ticket n° {data.ticket}</div>
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="font-bold">{data.articleLabel}</div>
        <div className="flex justify-between"><span>Qté</span><span>{data.qte}</span></div>
        <div>Site : {data.siteLabel}</div>
        {data.lots.length > 0 && <div>Lots : {data.lots.join(", ")}</div>}
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="flex justify-between"><span>Total HT</span><span>{da(data.totalHT)}</span></div>
        <div className="flex justify-between font-bold"><span>Total TTC</span><span>{da(data.totalTTC)}</span></div>
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="text-center">Merci de votre visite !</div>
        {manques.length > 0 && (
          <div className="no-print mt-1 text-center text-[8px]">⚠ Mentions légales incomplètes (Paramètres)</div>
        )}
      </div>
    </div>
  );
}
