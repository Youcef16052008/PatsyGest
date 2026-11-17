"use client";

/** Ticket Cake Design imprimable (format ticket largeur80 mm). */
export type TicketData = {
  numero: string;
  clientNom: string;
  telephone: string | null;
  dateEvent: string;
  nbParts: number;
  prixHt: number;
  tvaPct: number;
  acompte: number;
  statut: string;
};

const eur = (n: number) => `${Number(n).toFixed(2)} DA`;

export default function CakeTicket({ data }: { data: TicketData }) {
  const ttc = data.prixHt * (1 + data.tvaPct / 100);
  const solde = Math.max(ttc - data.acompte, 0);
  return (
    <div className="space-y-2">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .cake-ticket, .cake-ticket * { visibility: visible; }
          .cake-ticket { position: absolute; left: 0; top: 0; width: 80mm; }
          .no-print { display: none !important; }
        }
      `}</style>
      <button type="button" onClick={() => window.print()}
        className="no-print rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">
        Imprimer le ticket
      </button>
      <div className="cake-ticket mx-auto w-[80mm] border border-dashed border-slate-400 bg-white p-3 font-mono text-[11px] leading-snug text-black">
        <div className="text-center font-bold uppercase">PâtisGest — Cake Design</div>
        <div className="text-center font-bold">{data.numero}</div>
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div>Client : {data.clientNom}</div>
        {data.telephone && <div>Tél : {data.telephone}</div>}
        <div>Événement : {data.dateEvent} · {data.nbParts} parts</div>
        <div>Statut : {data.statut}</div>
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="flex justify-between"><span>Prix HT</span><span>{eur(data.prixHt)}</span></div>
        <div className="flex justify-between"><span>TVA {data.tvaPct} %</span><span>{eur(ttc - data.prixHt)}</span></div>
        <div className="flex justify-between font-bold"><span>Total TTC</span><span>{eur(ttc)}</span></div>
        <div className="flex justify-between"><span>Acquitte</span><span>{eur(data.acompte)}</span></div>
        <div className="flex justify-between font-bold"><span>Solde</span><span>{eur(solde)}</span></div>
        <div className="my-1 border-t border-dashed border-slate-400" />
        <div className="text-center">Merci de votre confiance !</div>
        <div className="text-center text-[9px]">CGV acceptées — conservant ce ticket</div>
      </div>
    </div>
  );
}
