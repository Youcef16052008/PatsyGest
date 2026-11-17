"use client";

/** Ticket de vente caisse imprimable (format80 mm). */
export type SaleTicketData = {
  ticket: string;
  articleLabel: string;
  siteLabel: string;
  qte: number;
  totalHT: number;
  totalTTC: number;
  lots: string[];
  at: string;
};

const da = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DA`;

export default function SaleTicket({ data }: { data: SaleTicketData }) {
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
        <div className="text-center font-bold uppercase">PâtisGest — Caisse</div>
        <div className="text-center">{new Date(data.at).toLocaleString("fr-FR")}</div>
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="font-bold">{data.articleLabel}</div>
        <div className="flex justify-between"><span>Qté</span><span>{data.qte}</span></div>
        <div>Site : {data.siteLabel}</div>
        {data.lots.length > 0 && <div>Lots : {data.lots.join(", ")}</div>}
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="flex justify-between"><span>Total HT</span><span>{da(data.totalHT)}</span></div>
        <div className="flex justify-between font-bold"><span>Total TTC</span><span>{da(data.totalTTC)}</span></div>
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="text-center text-[9px]">Ticket {data.ticket}</div>
        <div className="text-center">Merci de votre visite !</div>
      </div>
    </div>
  );
}
