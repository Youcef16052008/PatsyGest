"use client";

import { cakeConnectedTotals } from "@/lib/cake-money";
import { whatsappOrderUrl } from "@/lib/whatsapp";

/** Ticket commande gâteau simple (format 80 mm, style Algérie). */
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
  shopName?: string;
};

const da = (n: number) => `${Math.round(Number(n)).toLocaleString("fr-FR")} DA`;

export default function CakeTicket({ data }: { data: TicketData }) {
  const { ttc, balance: solde } = cakeConnectedTotals(data.prixHt, data.tvaPct, data.acompte);
  const waUrl = whatsappOrderUrl({
    phone: data.telephone,
    client: data.clientNom,
    numero: data.numero,
    eventDate: data.dateEvent,
    parts: data.nbParts,
    resteDa: solde,
  });
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
      <div className="no-print flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">
          Imprimer le ticket
        </button>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800">
            Envoyer par WhatsApp
          </a>
        )}
      </div>
      <div className="cake-ticket mx-auto w-[80mm] border border-dashed border-slate-400 bg-white p-3 font-mono text-[11px] leading-snug text-black">
        <div className="text-center text-[13px] font-extrabold uppercase">{data.shopName?.trim() || "Commande Gâteau"}</div>
        <div className="text-center text-[10px]">{data.numero}</div>
        <div className="my-1.5 border-t border-dashed border-slate-400" />
        <div>Client : {data.clientNom}</div>
        {data.telephone && <div>Tél : {data.telephone}</div>}
        <div>Pour le : {data.dateEvent} · {data.nbParts} parts</div>
        <div className="my-1.5 border-t border-dashed border-slate-400" />
        <div className="flex justify-between text-[12px] font-extrabold">
          <span>TOTAL</span>
          <span>{da(ttc)}</span>
        </div>
        {data.acompte > 0 && (
          <>
            <div className="flex justify-between"><span>Avance payée</span><span>{da(data.acompte)}</span></div>
            <div className="flex justify-between font-bold"><span>Reste à payer</span><span>{da(solde)}</span></div>
          </>
        )}
        <div className="my-1.5 border-t border-dashed border-slate-400" />
        <div className="text-center text-[10px]">Merci de votre confiance !</div>
      </div>
    </div>
  );
}
