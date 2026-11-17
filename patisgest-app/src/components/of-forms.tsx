"use client";

import { useActionState, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  enqueueOf, getOfQueue, getServerOfQueue, removeOf, setOfQueue, subscribeOfQueue,
  type QueuedOf,
} from "@/lib/of-queue";
import { createOf, finishOf, startOf, type OfState } from "@/lib/actions-of";

type Option = { id: string; label: string };
export type OfOrder = {
  id: string;
  numero: string;
  statut: string;
  qte_prevue: number;
  qte_realisee: number;
};

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

function Feedback({ state }: { state: OfState }) {
  return (
    <>
      {state.erreur && <p role="alert" className="mt-3 text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="mt-3 text-sm text-emerald-700">{state.succes}</p>}
    </>
  );
}

type OfMsg = { kind: "err" | "ok" | "info"; text: string };

const isNetErr = (e?: string) => !!e && e.includes("inaccessible");
const isDup = (e?: string) => !!e && (e.includes("déjà") || e.includes("idempotence"));

/**
 * Planification d'OF avec file hors-ligne : l'OF part d'abord dans la file
 * locale (référence client = idempotence creer_of), puis se synchronise —
 * sans réseau il reste en attente dans l'État synchro (0 doublon au retour).
 */
function CreateOfForm({ versions, sites }: { versions: Option[]; sites: Option[] }) {
  const [msg, setMsg] = useState<OfMsg | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const queued = useSyncExternalStore(subscribeOfQueue, getOfQueue, getServerOfQueue);

  const commit = (q: QueuedOf[]) => setOfQueue(q);

  async function trySync(op: QueuedOf): Promise<{ status: "ok" | "dup" | "network" | "business"; state: OfState }> {
    const fd = new FormData();
    fd.set("versionId", op.versionId);
    fd.set("siteId", op.siteId);
    fd.set("qtePrevue", String(op.qte));
    fd.set("datePrevue", op.datePrevue);
    fd.set("clientRef", op.opId);
    const state = await createOf({}, fd);
    if (state.succes && !state.duplicate) return { status: "ok", state };
    if (state.duplicate || isDup(state.succes) || isDup(state.erreur)) return { status: "dup", state };
    if (isNetErr(state.erreur)) return { status: "network", state };
    return { status: "business", state };
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const versionId = String(fd.get("versionId") ?? "");
    const siteId = String(fd.get("siteId") ?? "");
    const qte = Number(fd.get("qtePrevue"));
    const datePrevue = String(fd.get("datePrevue") ?? "");
    const versionLabel = versions.find((v) => v.id === versionId)?.label ?? versionId;
    const siteLabel = sites.find((s) => s.id === siteId)?.label ?? siteId;
    if (!versionId || !siteId || !Number.isFinite(qte) || qte <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(datePrevue)) {
      setMsg({ kind: "err", text: "Saisie invalide." });
      return;
    }
    const op: QueuedOf = {
      opId: crypto.randomUUID(),
      versionId, versionLabel, siteId, siteLabel, qte, datePrevue,
      queuedAt: new Date().toISOString(),
    };
    commit(enqueueOf(getOfQueue(), op));
    setMsg({ kind: "info", text: "OF en file — synchronisation…" });
    startTransition(async () => {
      const { status, state } = await trySync(op);
      if (status === "ok") {
        commit(removeOf(getOfQueue(), op.opId));
        setMsg({ kind: "ok", text: state.succes ?? "OF planifié." });
        formRef.current?.reset();
      } else if (status === "dup") {
        commit(removeOf(getOfQueue(), op.opId));
        setMsg({ kind: "ok", text: state.succes ?? "OF déjà enregistré (idempotence)." });
        formRef.current?.reset();
      } else if (status === "network") {
        setMsg({ kind: "info", text: "Hors ligne — OF conservé dans la file locale (État synchro ci-dessous)." });
      } else {
        commit(removeOf(getOfQueue(), op.opId));
        setMsg({ kind: "err", text: state.erreur ?? "Création refusée." });
      }
    });
  }

  function syncAll() {
    if (queued.length === 0) return;
    setMsg({ kind: "info", text: `Synchronisation de ${queued.length} OF…` });
    startTransition(async () => {
      let q = getOfQueue();
      let ok = 0;
      let dup = 0;
      const errs: string[] = [];
      let stopped = false;
      for (const op of [...q]) {
        const { status, state } = await trySync(op);
        if (status === "network") { stopped = true; break; }
        if (status === "ok") { q = removeOf(q, op.opId); ok++; }
        else if (status === "dup") { q = removeOf(q, op.opId); dup++; }
        else { q = removeOf(q, op.opId); errs.push(`${op.versionLabel} × ${op.qte} : ${state.erreur ?? "refusé"}`); }
      }
      commit(q);
      const parts: string[] = [];
      if (ok > 0) parts.push(`${ok} planifié(s)`);
      if (dup > 0) parts.push(`${dup} déjà existant(s)`);
      if (errs.length > 0) parts.push(`${errs.length} refusé(s) : ${errs.join(" ; ")}`);
      if (stopped) parts.push("réseau indisponible — le reste reste en file");
      setMsg({ kind: errs.length > 0 ? "err" : "ok", text: parts.join(" · ") || "File vide." });
    });
  }

  return (
    <div>
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <label className={`${label} min-w-52 flex-1`}>Recette (version figée)
          <select name="versionId" required className={field} disabled={versions.length === 0}>
            {versions.length === 0 && <option value="">— aucune recette —</option>}
            {versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
        <label className={`${label} min-w-44 flex-1`}>Site de production
          <select name="siteId" required className={field}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className={`${label} w-32`}>Quantité prévue
          <input name="qtePrevue" type="number" min={0.0001} step="any" required defaultValue={12} className={field} />
        </label>
        <label className={`${label} w-40`}>Date prévue
          <input name="datePrevue" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={field} />
        </label>
        <button disabled={pending || versions.length === 0} className={btn}>
          {pending ? "Création…" : "Planifier l'OF"}
        </button>
      </form>
      {msg && (
        <p role={msg.kind === "err" ? "alert" : "status"}
          className={`mt-2 text-sm ${msg.kind === "err" ? "text-red-700" : msg.kind === "ok" ? "text-emerald-700" : "text-slate-600"}`}>
          {msg.text}
        </p>
      )}

      {queued.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-amber-800">État synchro — {queued.length} OF en attente</h3>
            <button type="button" onClick={syncAll} disabled={pending}
              className="ml-auto rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              Synchroniser maintenant
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {queued.map((o) => (
              <li key={o.opId} className="flex flex-wrap gap-2 text-xs text-amber-900">
                <span className="font-bold">{o.versionLabel}</span>
                <span>× {o.qte}</span>
                <span className="opacity-70">{o.siteLabel} · {o.datePrevue}</span>
                <span className="ml-auto font-mono opacity-70">{o.opId.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StartOfButton({ ofId, numero }: { ofId: string; numero: string }) {
  const [state, action, pending] = useActionState(startOf, {});
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="ofId" value={ofId} />
      <button disabled={pending} className={btn}>
        {pending ? "Lancement…" : `Lancer ${numero} et consommer (FEFO)`}
      </button>
      <Feedback state={state} />
    </form>
  );
}

function FinishOfForm({ order }: { order: OfOrder }) {
  const [state, action, pending] = useActionState(finishOf, {});
  const reste = Number(order.qte_prevue) - Number(order.qte_realisee);
  return (
    <form action={action} className="mt-3 grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="ofId" value={order.id} />
      <input name="qte" type="number" min={0.0001} max={reste} step="any" required defaultValue={reste}
        className={field} aria-label={`Quantité réalisée ${order.numero}`} />
      <input name="numeroLot" required placeholder="N° lot produit" className={field}
        aria-label={`Lot produit ${order.numero}`} />
      <input name="dlc" type="date" required className={field} aria-label={`DLC ${order.numero}`} />
      <button disabled={pending} className={btn}>{pending ? "Enregistrement…" : "Valider la production"}</button>
      <div className="sm:col-span-4"><Feedback state={state} /></div>
    </form>
  );
}

/**
 * Écritures réelles de la page Production (RPCs SQL) : création avec besoins
 * figés, lancement FEFO, clôture au coût connu. Réservé propriétaire/labo.
 */
export default function OfForms({ versions, sites, orders }: { versions: Option[]; sites: Option[]; orders: OfOrder[] }) {
  const planifies = orders.filter((o) => o.statut === "planifie");
  const enCours = orders.filter((o) => o.statut === "encours" || o.statut === "partiel");
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Ordres de fabrication · écritures réelles</h2>
      <p className="mb-3 text-xs text-slate-500">
        Les besoins sont recalculés côté serveur à partir de la version de recette ; le lancement
        consomme les lots en FEFO dans une transaction ; la clôture crée le lot produit au coût connu.
        Les manques sont journalisés sans jamais bloquer la production.
      </p>
      <CreateOfForm versions={versions} sites={sites} />
      {planifies.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <h3 className="mb-1 text-xs font-bold uppercase text-slate-500">À lancer</h3>
          {planifies.map((o) => <StartOfButton key={o.id} ofId={o.id} numero={o.numero} />)}
        </div>
      )}
      {enCours.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <h3 className="mb-1 text-xs font-bold uppercase text-slate-500">À clôturer</h3>
          {enCours.map((o) => (
            <div key={o.id} className="mb-3">
              <p className="text-sm font-semibold">{o.numero} — réalisé {String(o.qte_realisee)} / {String(o.qte_prevue)}</p>
              <FinishOfForm order={o} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
