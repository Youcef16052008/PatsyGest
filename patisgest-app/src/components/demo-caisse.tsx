"use client";

import { useState, type FormEvent } from "react";
import { DEMO_SITES, demoLots, demoProducts, demoSales } from "@/lib/demo-workspace";
import { sellCart } from "@/lib/patisgest-store";
import { isPaymentMode, PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/pos-cart";
import { jourUTC, quantite, stockParSite, stockPerimeParSite } from "@/lib/workspace-data";
import { useDemoWorkspace } from "./demo-workspace";
import SaleComposer from "./sale-composer";
import SaleHistory from "./sale-history";
import SaleTicket, { type SaleTicketData } from "./sale-ticket";
import { ZImportOperations } from "./z-import-operations";
import { Disclosure, Notice } from "./workspace-ui";

const boutique = DEMO_SITES.filter((s) => s.id === "Boutique");

export default function DemoCaisse({
  dashboard = false,
  canEdit = false,
  shop = "Maison Amande",
}: {
  dashboard?: boolean;
  canEdit?: boolean;
  shop?: string;
}) {
  const { data, save } = useDemoWorkspace();
  const [feedback, setFeedback] = useState<{ message: string; kind: "error" | "success" | "warning" } | null>(null);
  const [ticket, setTicket] = useState<SaleTicketData | null>(null);
  if (!data) return <p role="status" className="pg-muted">Chargement des produits…</p>;

  const articles = demoProducts(data);
  const lots = demoLots(data);
  const today = jourUTC();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const modeRaw = String(fields.get("modePaiement") ?? "especes");
    const modePaiement: PaymentMode = isPaymentMode(modeRaw) ? modeRaw : "especes";
    try {
      const rawJson = String(fields.get("lignesJson") ?? "").trim();
      const parsed = rawJson
        ? (JSON.parse(rawJson) as { articleId: string; qte: number }[])
        : [{ articleId: String(fields.get("articleId") ?? ""), qte: Number(fields.get("qte")) }];
      const items = parsed.map((p) => ({ articleId: p.articleId, qty: Number(p.qte) }));
      const next = sellCart(data, items, { modePaiement });
      if (!save(next)) throw new Error("Impossible d’enregistrer cette vente sur le navigateur.");
      const sale = next.sales[0];
      const byId = new Map(articles.map((a) => [a.id, a]));
      const lines = (sale.lines ?? []).map((l) => {
        const art = byId.get(l.articleId);
        return {
          label: art?.label ?? l.articleId,
          qty: l.qty,
          unit: art?.unit,
          totalTTC: l.totalTTC,
        };
      });
      setTicket({
        numero: sale.numero,
        articleLabel: lines[0]?.label ?? "Ticket",
        siteLabel: "Boutique",
        qte: sale.qty,
        lines,
        modePaiement,
        totalHT: sale.totalHT,
        totalTTC: sale.totalTTC,
        lots: sale.lots,
        at: new Date().toISOString(),
        demo: true,
        etablissement: { nom: shop, adresse: null, telephone: null, nif: null, nis: null, rc: null },
      });
      setFeedback(
        sale.missing > 0
          ? {
              kind: "warning",
              message: `Ticket d’essai enregistré (${lines.length} produit${lines.length > 1 ? "s" : ""}, ${PAYMENT_MODE_LABELS[modePaiement]}) · ${quantite(sale.missing)} manquant(s) sur stock éligible.`,
            }
          : {
              kind: "success",
              message: `Ticket d’essai enregistré (${lines.length} produit${lines.length > 1 ? "s" : ""}, ${PAYMENT_MODE_LABELS[modePaiement]}).`,
            },
      );
      form.reset();
    } catch (err) {
      setFeedback({ kind: "error", message: err instanceof Error ? err.message : "Vente non enregistrée." });
    }
  }

  return (
    <div className="pg-stack">
      <SaleComposer
        articles={articles}
        sites={boutique}
        stock={stockParSite(lots, today)}
        expiredStock={stockPerimeParSite(lots, today)}
        onSubmit={submit}
        demo
      />
      {feedback && <Notice kind={feedback.kind}>{feedback.message}</Notice>}
      {ticket && <SaleTicket data={ticket} />}
      {!dashboard && <SaleHistory sales={demoSales(data)} demo />}
      {!dashboard && canEdit && (
        <Disclosure title="Importer un Z de caisse" icon="list">
          <ZImportOperations
            data={data}
            save={save}
            notify={(message) => setFeedback({ message, kind: "success" })}
          />
        </Disclosure>
      )}
    </div>
  );
}
