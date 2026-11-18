"use client";

import { useActionState, useState, useSyncExternalStore, useTransition } from "react";
import {
  enqueueOf, getOfQueue, getServerOfQueue, removeOf, setOfQueue, subscribeOfQueue,
  type QueuedOf,
} from "@/lib/of-queue";
import { createOf, finishOf, startOf, type OfState } from "@/lib/actions-of";
import FormulaireGuide, { champGuide } from "./guide-form";
import ProductionBoard from "./production-board";
import { Disclosure, Notice } from "./workspace-ui";
import { type ProductionItem } from "@/lib/workspace-data";
import { Icon } from "./workspace-icons";

type Option = { id: string; label: string };
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

/**
 * Planification d'OF avec file hors-ligne : l'OF part d'abord dans la file
 * locale (référence client = idempotence creer_of), puis se synchronise —
 * sans réseau il reste en attente dans l'État synchro (0 doublon au retour).
 */
export function CreateOfForm({ versions, sites, guide = false, guideTermine = false }: {
  versions: Option[]; sites: Option[]; guide?: boolean; guideTermine?: boolean;
}) {
  const [msg, setMsg] = useState<OfMsg | null>(null);
  const [pending, startTransition] = useTransition();
  const queued = useSyncExternalStore(subscribeOfQueue, getOfQueue, getServerOfQueue);

  const commit = (q: QueuedOf[]) => setOfQueue(q);

  async function trySync(op: QueuedOf): Promise<{ status: "ok" | "dup" | "network" | "business"; state: OfState }> {
    const fd = new FormData();
    fd.set("versionId", op.versionId);
    fd.set("siteId", op.siteId);
    fd.set("qtePrevue", String(op.qte));
    fd.set("datePrevue", op.datePrevue);
    fd.set("clientRef", op.opId);
    let state: OfState;
    try {
      state = await createOf({}, fd);
    } catch {
      return { status: "network", state: {} };
    }
    if (state.duplicate) return { status: "dup", state };
    if (state.succes) return { status: "ok", state };
    if (state.reessayer) return { status: "network", state };
    return { status: "business", state };
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Réessayer depuis la file, avec la même référence, pas en recréant l'OF.
    if (guide && (guideTermine || getOfQueue().length > 0)) return;
    const formulaire = e.currentTarget;
    const fd = new FormData(formulaire);
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
      if (status === "ok" || status === "dup") {
        commit(removeOf(getOfQueue(), op.opId));
        setMsg({ kind: "ok", text: state.succes ?? "OF enregistré." });
        formulaire.reset();
      } else if (status === "network") {
        setMsg({ kind: "info", text: "OF conservé dans la file locale. Reprenez la synchronisation dès que la connexion est rétablie." });
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
      setMsg({ kind: errs.length > 0 ? "err" : stopped ? "info" : "ok", text: parts.join(" · ") || "File vide." });
    });
  }

  if (guideTermine && !msg && queued.length === 0) return null;

  const styleChamp = guide ? champGuide : field;
  const recette = <label className={`${label} ${guide ? "min-w-0" : "min-w-52 flex-1"}`}>{guide ? "Recette" : "Recette (version figée)"}
    <select name="versionId" required className={styleChamp} disabled={versions.length === 0}>
      {guide && <option value="">Choisir une recette active</option>}
      {!guide && versions.length === 0 && <option value="">— aucune recette —</option>}
      {versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
    </select>
  </label>;
  const site = <label className={`${label} ${guide ? "min-w-0" : "min-w-44 flex-1"}`}>Site de production
    <select name="siteId" required className={styleChamp}>
      {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  </label>;
  const quantite = <label className={`${label} ${guide ? "min-w-0" : "w-32"}`}>Quantité prévue
    <input name="qtePrevue" type="number" min={0.0001} step="any" required defaultValue={12} className={styleChamp} />
  </label>;
  const date = <label className={`${label} ${guide ? "min-w-0" : "w-40"}`}>Date prévue
    <input name="datePrevue" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={styleChamp} />
  </label>;

  return (
    <div>
      {!guideTermine && (guide ? (
        <FormulaireGuide onSubmit={onSubmit} pending={pending} valider="Planifier la fabrication" indisponible={!versions.length || !sites.length || queued.length > 0}
          groupes={[
            { nom: "Recette et site", titre: "Que voulez-vous préparer ?", contenu: <div className="grid gap-3 sm:grid-cols-2">{recette}{site}</div> },
            { nom: "Quantité et date", titre: "Combien et pour quand ?", contenu: <div className="grid gap-3 sm:grid-cols-2">{quantite}{date}</div> },
          ]} />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          {recette}{site}{quantite}{date}
          <button disabled={pending || versions.length === 0 || sites.length === 0} className={btn}>
            {pending ? "Création…" : "Planifier la fournée"}
          </button>
        </form>
      ))}
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

function StartOfButton({ ofId, titre }: { ofId: string; titre: string }) {
  const [state, action, pending] = useActionState(startOf, {});
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="ofId" value={ofId} />
      <button disabled={pending} className="pg-button" aria-label={`Démarrer ${titre}`}>
        {pending ? "Lancement…" : "Démarrer"} <Icon name="arrow" size={15}/>
      </button>
      <Feedback state={state} />
    </form>
  );
}

function FinishOfForm({ order }: { order: ProductionItem }) {
  const [state, action, pending] = useActionState(finishOf, {});
  const reste = Math.round((order.planned - order.done) * 1000) / 1000;
  if (!(reste > 0)) return null;
  return <details className="pg-order-details">
    <summary>Enregistrer la quantité produite</summary>
    <form action={action} className="pg-order-form">
      <input type="hidden" name="ofId" value={order.id}/>
      <label className="pg-field">Quantité réalisée<input name="qte" type="number" min={0.0001} max={reste} step="any" required defaultValue={reste} className="pg-input"/></label>
      <label className="pg-field">Numéro du lot<input name="numeroLot" required maxLength={80} placeholder="LOT-301" className="pg-input"/></label>
      <label className="pg-field">Date limite de consommation<input name="dlc" type="date" required className="pg-input"/></label>
      <button disabled={pending} className="pg-button">{pending ? "Enregistrement…" : "Valider la production"}</button>
      <Feedback state={state}/>
    </form>
  </details>;
}

/** Les cartes utilisent les mêmes actions FEFO et les mêmes permissions. */
export default function OfForms({ versions, sites, orders, canEdit, optionsIndisponibles }: {
  versions: Option[]; sites: Option[]; orders: ProductionItem[] | null; canEdit: boolean; optionsIndisponibles: boolean;
}) {
  return <div className="pg-stack">
    {canEdit && <Disclosure title="Planifier une fournée" description="Choisissez la recette, la quantité et la date." icon="plus">
      {optionsIndisponibles ? <Notice kind="warning">Les recettes ou sites ne sont pas disponibles. Rechargez la page.</Notice> :
        !versions.length || !sites.length ? <Notice>Une recette et un site sont nécessaires pour planifier.</Notice> :
          <CreateOfForm versions={versions} sites={sites}/>}
    </Disclosure>}
    <ProductionBoard orders={orders} renderAction={canEdit ? (order) => order.statut === "planifie" ? <StartOfButton ofId={order.id} titre={order.title}/> :
      order.statut === "encours" || order.statut === "partiel" ? <FinishOfForm order={order}/> : null : undefined}/>
  </div>;
}
