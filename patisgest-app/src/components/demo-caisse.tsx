"use client";

import { useState, type FormEvent } from "react";
import { DEMO_CREDITS_KEY_PREFIX, starterDemoCredits, type CreditAccountType, type CreditEntry } from "@/lib/credits";
import { DEMO_SITES, demoLots, demoProducts, demoSales } from "@/lib/demo-workspace";
import { sellCart } from "@/lib/patisgest-store";
import { isPaymentMode, PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/pos-cart";
import { jourLocal, quantite, stockParSite, stockPerimeParSite } from "@/lib/workspace-data";
import { useDemoWorkspace } from "./demo-workspace";
import CreditsWorkspace from "./credits-workspace";
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
  const today = jourLocal();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const modeRaw = String(fields.get("modePaiement") ?? "especes");
    const modePaiement: PaymentMode = isPaymentMode(modeRaw) ? modeRaw : "especes";
    const creditMode = String(fields.get("creditMode") ?? "0") === "1";
    const creditNom = String(fields.get("creditNom") ?? "").trim();
    const creditTelephone = String(fields.get("creditTelephone") ?? "").trim();
    const creditType = (String(fields.get("creditType") ?? "particulier") === "cafe_entreprise"
      ? "cafe_entreprise"
      : "particulier") as CreditAccountType;
    if (creditMode && !creditNom) {
      setFeedback({ kind: "error", message: "Entrez le nom du client ou du café pour noter au carnet." });
      return;
    }
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
        modePaiement: creditMode ? "À crédit (Carnet)" : modePaiement,
        totalHT: sale.totalHT,
        totalTTC: sale.totalTTC,
        lots: sale.lots,
        at: new Date().toISOString(),
        demo: true,
        etablissement: { nom: shop, adresse: null, telephone: null, nif: null, nis: null, rc: null },
      });
      if (creditMode) {
        try {
          const key = `${DEMO_CREDITS_KEY_PREFIX}demo`;
          const raw = window.localStorage.getItem(key);
          const list: CreditEntry[] = raw ? JSON.parse(raw) : starterDemoCredits(today);
          const entry: CreditEntry = {
            id: crypto.randomUUID(),
            nomDebiteur: creditNom,
            telephone: creditTelephone,
            typeCompte: creditType,
            montantTotalDa: sale.totalTTC,
            montantRegleDa: 0,
            dateEcheance: null,
            note: `Caisse ${sale.numero ?? ""} · ${lines.map((l) => `${l.label} × ${l.qty}`).join(", ")}`.slice(0, 280),
            statut: "ouvert",
            reglements: [],
            createdAt: new Date().toISOString(),
          };
          window.localStorage.setItem(key, JSON.stringify([entry, ...(Array.isArray(list) ? list : [])]));
        } catch {
          /* ignore localStorage error */
        }
      }
      setFeedback(
        creditMode
          ? {
              kind: "success",
              message: `Ticket noté au carnet de ${creditNom} (${Math.round(sale.totalTTC)} DA à encaisser).`,
            }
          : sale.missing > 0
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
      {!dashboard && <CreditsWorkspace mode="demo" scopeKey="demo" shop={shop} today={today} />}
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
