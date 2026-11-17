"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { sellProduct, type SaleState } from "@/lib/actions-caisse";
import { enqueueSale, getQueue, getServerQueue, removeSale, setQueue, subscribeQueue, type QueuedSale } from "@/lib/sale-queue";
import SaleTicket from "./sale-ticket";

type Option = { id: string; label: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";

type Msg = { kind: "err" | "ok" | "info"; text: string };

const isNetworkError = (e?: string) => !!e && e.includes("inaccessible");
const isDuplicate = (e?: string) => !!e && e.includes("déjà");

/**
 * Vente de caisse avec file hors-ligne : la vente est d'abord écrite dans la
 * file locale (localStorage), puis synchronisée immédiatement — si le réseau
 * tombe, elle reste en file et l'État synchro la renvoie (idempotent par
 * ticket : un doublon de sync ne double jamais la vente).
 */
export default function SaleForm({ articles, sites, etablissement }: { articles: Option[]; sites: Option[]; etablissement?: import("@/lib/etablissement").Etablissement | null }) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [lastSale, setLastSale] = useState<(SaleState & { articleLabel: string; siteLabel: string; qte: number; at: string }) | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );

  const queued = useSyncExternalStore(subscribeQueue, getQueue, getServerQueue);

  const commitQueue = (q: QueuedSale[]) => {
    setQueue(q);
  };

  /** Synchronise une vente : 'ok' | 'dup' (déjà faite) | 'network' | 'business'. */
  async function trySync(sale: QueuedSale): Promise<{ status: "ok" | "dup" | "network" | "business"; state: SaleState }> {
    const fd = new FormData();
    fd.set("articleId", sale.articleId);
    fd.set("siteId", sale.siteId);
    fd.set("qte", String(sale.qte));
    fd.set("ticket", sale.ticket);
    const state = await sellProduct({}, fd);
    if (state.succes) return { status: "ok", state };
    if (isDuplicate(state.erreur)) return { status: "dup", state };
    if (isNetworkError(state.erreur)) return { status: "network", state };
    return { status: "business", state };
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const articleId = String(fd.get("articleId") ?? "");
    const siteId = String(fd.get("siteId") ?? "");
    const qte = Number(fd.get("qte"));
    const articleLabel = articles.find((a) => a.id === articleId)?.label ?? articleId;
    const siteLabel = sites.find((s) => s.id === siteId)?.label ?? siteId;
    if (!articleId || !siteId || !Number.isFinite(qte) || qte <= 0) {
      setMsg({ kind: "err", text: "Saisie invalide." });
      return;
    }
    const sale: QueuedSale = {
      ticket: crypto.randomUUID(),
      articleId, articleLabel, siteId, siteLabel, qte,
      queuedAt: new Date().toISOString(),
    };
    commitQueue(enqueueSale(getQueue(), sale));
    setMsg({ kind: "info", text: "Vente en file — synchronisation…" });
    startTransition(async () => {
      const { status, state } = await trySync(sale);
      if (status === "ok" || status === "dup") {
        commitQueue(removeSale(getQueue(), sale.ticket));
        setLastSale({
          ...state, articleLabel, siteLabel, qte, at: new Date().toISOString(),
        });
        setMsg({ kind: "ok", text: status === "dup" ? "Déjà enregistrée (idempotence ticket)." : (state.succes ?? "Vente enregistrée.") });
        formRef.current?.reset();
      } else if (status === "network") {
        setMsg({ kind: "info", text: "Hors ligne — vente conservée dans la file locale (état synchro ci-dessous)." });
      } else {
        commitQueue(removeSale(getQueue(), sale.ticket));
        setMsg({ kind: "err", text: state.erreur ?? "Vente refusée." });
      }
    });
  }

  function syncAll() {
    if (queued.length === 0) return;
    setMsg({ kind: "info", text: `Synchronisation de ${queued.length} vente(s)…` });
    startTransition(async () => {
      let q = getQueue();
      let ok = 0;
      let dup = 0;
      const errs: string[] = [];
      let stopped = false;
      let firstOk: (SaleState & { articleLabel: string; siteLabel: string; qte: number; at: string }) | null = null;
      for (const sale of [...q]) {
        const { status, state } = await trySync(sale);
        if (status === "network") {
          stopped = true;
          break;
        }
        if (status === "ok" || status === "dup") {
          q = removeSale(q, sale.ticket);
          if (status === "ok") ok++;
          else dup++;
          if (!firstOk) {
            firstOk = { ...state, articleLabel: sale.articleLabel, siteLabel: sale.siteLabel, qte: sale.qte, at: new Date().toISOString() };
          }
        } else {
          q = removeSale(q, sale.ticket);
          errs.push(`${sale.articleLabel} × ${sale.qte} : ${state.erreur ?? "refusée"}`);
        }
      }
      commitQueue(q);
      if (firstOk) setLastSale(firstOk);
      const parts: string[] = [];
      if (ok > 0) parts.push(`${ok} synchronisée(s)`);
      if (dup > 0) parts.push(`${dup} déjà enregistrée(s)`);
      if (errs.length > 0) parts.push(`${errs.length} refusée(s) : ${errs.join(" ; ")}`);
      if (stopped) parts.push("réseau indisponible — le reste reste en file");
      setMsg({ kind: errs.length > 0 ? "err" : "ok", text: parts.join(" · ") || "File vide." });
    });
  }

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-bold">Nouvelle vente · caisse réelle</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {online ? "en ligne" : "hors ligne"}
        </span>
        {queued.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
            {queued.length} en attente
          </span>
        )}
      </div>
      <p className="mb-3 mt-1 text-xs text-slate-500">
        File hors-ligne : la vente part d&apos;abord dans la file locale puis se synchronise —
        sans réseau elle reste en attente et l&apos;État synchro la renvoie (idempotent par ticket,
        aucun doublon). FEFO atomique, stock jamais négatif, ventes non modifiables.
      </p>
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <label className={`${label} min-w-52 flex-1`}>Produit
          <select name="articleId" required className={field} disabled={articles.length === 0}>
            {articles.length === 0 && <option value="">— aucun produit —</option>}
            {articles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className={`${label} min-w-44 flex-1`}>Site
          <select name="siteId" required className={field}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className={`${label} w-32`}>Quantité
          <input name="qte" type="number" min={0.0001} step="any" required defaultValue={1} className={field} />
        </label>
        <button disabled={pending || articles.length === 0} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "Encaissement…" : "Encaisser"}
        </button>
      </form>
      {msg && (
        <p role={msg.kind === "err" ? "alert" : "status"}
          className={`mt-3 text-sm ${msg.kind === "err" ? "text-red-700" : msg.kind === "ok" ? "text-emerald-700" : "text-slate-600"}`}>
          {msg.text}
        </p>
      )}

      {queued.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-amber-800">État synchro — {queued.length} vente(s) en attente</h3>
            <button type="button" onClick={syncAll} disabled={pending}
              className="ml-auto rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              Synchroniser maintenant
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {queued.map((s) => (
              <li key={s.ticket} className="flex flex-wrap gap-2 text-xs text-amber-900">
                <span className="font-bold">{s.articleLabel}</span>
                <span>× {s.qte}</span>
                <span className="opacity-70">{s.siteLabel}</span>
                <span className="ml-auto font-mono opacity-70">{s.ticket.slice(0, 8)} · {new Date(s.queuedAt).toLocaleTimeString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastSale && (
        <SaleTicket data={{
          ticket: lastSale.ticket ?? "",
          articleLabel: lastSale.articleLabel,
          siteLabel: lastSale.siteLabel,
          qte: lastSale.qte,
          totalHT: lastSale.totalHT ?? 0,
          totalTTC: lastSale.totalTTC ?? 0,
          lots: lastSale.lots ?? [],
          at: lastSale.at,
          etablissement: etablissement ?? null,
        }} />
      )}
    </section>
  );
}
