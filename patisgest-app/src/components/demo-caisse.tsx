"use client";
import { useState, type FormEvent } from "react";
import { DEMO_SITES, demoLots, demoProducts, demoSales } from "@/lib/demo-workspace";
import { sell } from "@/lib/patisgest-store";
import { quantite, stockParSite } from "@/lib/workspace-data";
import { useDemoWorkspace } from "./demo-workspace";
import SaleComposer from "./sale-composer";
import SaleHistory from "./sale-history";
import SaleTicket, { type SaleTicketData } from "./sale-ticket";
import { ZImportOperations } from "./z-import-operations";
import { Disclosure, Notice } from "./workspace-ui";

const boutique = DEMO_SITES.filter(s => s.id === "Boutique");

export default function DemoCaisse({ dashboard = false, canEdit = false, shop = "Maison Amande" }: { dashboard?: boolean; canEdit?: boolean; shop?: string }) {
  const { data, save } = useDemoWorkspace();
  const [feedback, setFeedback] = useState<{ message: string; kind: "error" | "success" | "warning" } | null>(null);
  const [ticket, setTicket] = useState<SaleTicketData | null>(null);
  if (!data) return <p role="status" className="pg-muted">Chargement des produits…</p>;
  const articles = demoProducts(data);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const qte = Number(fields.get("qte"));
    const art = articles.find(a => a.id === fields.get("articleId"));
    if (!art) return;
    try {
      const next = sell(data, art.id, qte);
      if (!save(next)) throw new Error("Impossible d’enregistrer cette vente sur le navigateur.");
      const sale = next.sales[0];
      setTicket({ articleLabel: art.label, siteLabel: "Boutique", qte,
        totalHT: sale.totalHT, totalTTC: sale.totalTTC, lots: sale.lots, at: new Date().toISOString(), demo: true,
        etablissement: { nom: shop, adresse: null, telephone: null, nif: null, nis: null, rc: null } });
      setFeedback(sale.missing > 0
        ? { kind: "warning", message: `Vente d’essai enregistrée · ${quantite(sale.missing, art.unit)} manquants.` }
        : { kind: "success", message: "Vente d’essai enregistrée." });
      form.reset();
    } catch (err) { setFeedback({ kind: "error", message: err instanceof Error ? err.message : "Vente non enregistrée." }); }
  }
  return <div className="pg-stack">
    <SaleComposer articles={articles} sites={boutique} stock={stockParSite(demoLots(data))} onSubmit={submit} demo/>
    {feedback && <Notice kind={feedback.kind}>{feedback.message}</Notice>}
    {ticket && <SaleTicket data={ticket}/>}
    {!dashboard && <SaleHistory sales={demoSales(data)} demo/>}
    {!dashboard && canEdit && <Disclosure title="Importer un Z de caisse" icon="list">
      <ZImportOperations data={data} save={save} notify={(message) => setFeedback({ message, kind: "success" })}/>
    </Disclosure>}
  </div>;
}
