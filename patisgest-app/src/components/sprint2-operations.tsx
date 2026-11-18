"use client";
import { type FormEvent } from 'react';
import { demoOrders } from '@/lib/demo-workspace';
import ProductionBoard from './production-board';
import { Disclosure } from './workspace-ui';
import { createPurchase, receivePurchase, createProduction, startProduction, completeProduction, transferStock, type State } from '@/lib/patisgest-store';

const box='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const field='w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
const btn='rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800';
const money=(n:number)=>new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:2}).format(n)+' DA';
type Props={data:State; canEdit:boolean; save:(state:State)=>boolean; notify:(message:string)=>void};
function act(fn:()=>State, {save,notify}:Props, message:string) {
  try { if(save(fn())) notify(message); } catch (err) { notify(err instanceof Error ? err.message : 'Opération impossible.'); }
}
const articleName=(data:State,id:string)=>data.articles.find(a=>a.id===id)?.nom ?? 'Article inconnu';

export function PurchaseOperations(props:Props) {
  const {data,canEdit}=props;
  function create(e:FormEvent<HTMLFormElement>) {e.preventDefault();const form=e.currentTarget;const f=new FormData(form);act(()=>createPurchase(data,String(f.get('supplier')),String(f.get('article')),Number(f.get('qty')),Number(f.get('price'))),props,'Bon de commande créé dans la démo.');}
  function reception(e:FormEvent<HTMLFormElement>,orderId:string) {e.preventDefault();const f=new FormData(e.currentTarget);act(()=>receivePurchase(data,orderId,Number(f.get('qty')),String(f.get('lot')),String(f.get('dlc')),String(f.get('site'))),props,'Réception enregistrée et lot créé localement.');}
  return <>
    {canEdit && <section className={box}><h2 className="mb-3 font-bold">Créer un bon de commande</h2><form onSubmit={create} className="grid gap-3 sm:grid-cols-3"><label className="text-xs text-slate-500">Fournisseur<select name="supplier" className={field}>{data.suppliers.map(s=><option key={s}>{s}</option>)}</select></label><label className="text-xs text-slate-500">Article<select name="article" className={field}>{data.articles.map(a=><option key={a.id} value={a.id}>{a.nom}</option>)}</select></label><label className="text-xs text-slate-500">Quantité<input name="qty" type="number" min="0.0001" step="0.0001" required className={field}/></label><label className="text-xs text-slate-500">Prix unitaire HT<input name="price" type="number" min="0" step="0.01" required className={field}/></label><div className="self-end"><button className={btn}>Créer le bon</button></div></form><p className="mt-3 text-xs text-slate-500">Une ligne par bon dans cette première version.</p></section>}
    <section className={box}><h2 className="mb-3 font-bold">Bons de commande</h2>{!data.purchases.length && <p className="text-sm text-slate-500">Aucun bon de commande.</p>}<div className="space-y-4">{data.purchases.slice().reverse().map(o=><div key={o.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><span><b>{o.numero}</b> · {o.fournisseur}<br/>{articleName(data,o.articleId)} · {o.received} / {o.qty} reçus · {money(o.pu)} HT</span><span className="font-semibold text-violet-700">{o.status}</span></div>{canEdit && o.status!=='recu' && <form onSubmit={e=>reception(e,o.id)} className="mt-3 grid gap-2 sm:grid-cols-5"><input name="qty" type="number" min="0.0001" max={o.qty-o.received} step="0.0001" required placeholder="Quantité" aria-label={`Quantité reçue ${o.numero}`} className={field}/><input name="lot" required placeholder="N° lot" aria-label={`Lot ${o.numero}`} className={field}/><input name="dlc" type="date" aria-label={`DLC ${o.numero}`} className={field}/><select name="site" aria-label={`Site ${o.numero}`} className={field}><option>Labo</option><option>Boutique</option></select><button className={btn}>Réceptionner</button></form>}</div>)}</div></section>
  </>;
}

export function ProductionOperations(props:Props) {
  const {data,canEdit}=props;
  function create(e:FormEvent<HTMLFormElement>) {e.preventDefault();const f=new FormData(e.currentTarget);act(()=>createProduction(data,Number(f.get('qty')),String(f.get('recipe')),String(f.get('plannedDate'))),props,'Ordre planifié avec la version courante figée.');}
  function finish(e:FormEvent<HTMLFormElement>,orderId:string) {e.preventDefault();const f=new FormData(e.currentTarget);act(()=>completeProduction(data,orderId,Number(f.get('qty')),String(f.get('lot')),String(f.get('dlc'))),props,'Production enregistrée au laboratoire : un lot issu d’un ingrédient bloqué est bloqué automatiquement.');}
  return <>
    {canEdit && <Disclosure title="Planifier une fournée" description="Choisissez la recette, la quantité et la date." icon="plus">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <label className="pg-field flex-1">Recette<select name="recipe" required className="pg-input">{data.recipes.map(r => <option key={r.id} value={r.id}>{r.name} · v{r.versions.at(-1)?.version}</option>)}</select></label>
        <label className="pg-field">Quantité prévue<input name="qty" type="number" min="0.0001" step="0.0001" defaultValue="20" required className="pg-input"/></label>
        <label className="pg-field">Date prévue<input name="plannedDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)} className="pg-input"/></label>
        <button className="pg-button">Planifier la fournée</button>
      </form>
    </Disclosure>}
    <ProductionBoard orders={demoOrders(data)} renderAction={canEdit ? (order) => {
      const o = data.productions.find(p => p.id === order.id)!;
      return <>
        {(o.shortages.length > 0 || o.consumption.some(c => c.costEstimated)) && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {!!o.shortages.length && <>Manquants : {o.shortages.map(s => `${articleName(data,s.articleId)} ${s.qty}`).join(' · ')}. </>}
          Le coût du lot ne comprend que les coûts connus.
        </p>}
        {!!o.consumption.length && <details className="pg-order-details"><summary>Lots consommés</summary>
          <p className="text-xs text-slate-600">{o.consumption.map(c => `${articleName(data,c.articleId)} ${c.numero} × ${c.qty}`).join(' · ')}</p></details>}
        {o.status === 'planifie' && <button type="button" aria-label={`Démarrer ${order.title}`} onClick={() => act(() => startProduction(data,o.id),props,'Fournée démarrée ; vérifiez les manquants éventuels.')} className="pg-button mt-2">Démarrer</button>}
        {(o.status === 'encours' || o.status === 'partiel') && <details className="pg-order-details"><summary>Enregistrer la quantité produite</summary>
          <form onSubmit={e => finish(e,o.id)} className="pg-order-form">
            <label className="pg-field">Quantité réalisée<input name="qty" type="number" min="0.0001" max={o.planned-o.completed} step="0.0001" defaultValue={o.planned-o.completed} required className="pg-input"/></label>
            <label className="pg-field">Numéro du lot<input name="lot" required className="pg-input"/></label>
            <label className="pg-field">Date limite de consommation<input name="dlc" type="date" className="pg-input"/></label>
            <button className="pg-button">Valider la production</button>
          </form>
        </details>}
      </>;
    } : undefined}/>
  </>;
}
export function TransferOperations(props:Props) {
  const {data,canEdit}=props;
  function send(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);act(()=>transferStock(data,String(f.get('article')),Number(f.get('qty')),String(f.get('from')),String(f.get('to'))),props,'Transfert enregistré ; lots et DLC conservés.');}
  return <><section className={box}><h2 className="font-bold">Transfert entre sites</h2><p className="mt-2 text-sm text-slate-500">Les lots disponibles sont transférés en FEFO avec leur DLC et leur prix. Un transfert supérieur au stock disponible est refusé.</p>{canEdit && <form onSubmit={send} className="mt-4 grid gap-3 sm:grid-cols-5"><select name="article" aria-label="Article à transférer" className={field}>{data.articles.map(a=><option key={a.id} value={a.id}>{a.nom}</option>)}</select><input name="qty" type="number" min="0.0001" step="0.0001" placeholder="Quantité" aria-label="Quantité" required className={field}/><select name="from" aria-label="Site de départ" className={field}><option>Labo</option><option>Boutique</option></select><select name="to" aria-label="Site d’arrivée" className={field}><option>Boutique</option><option>Labo</option></select><button className={btn}>Transférer</button></form>}</section><section className={box}><h2 className="mb-3 font-bold">Historique</h2>{!data.transfers.length && <p className="text-sm text-slate-500">Aucun transfert.</p>}{data.transfers.slice().reverse().map(t=><p key={t.id} className="border-t py-2 text-sm">{t.date} · {articleName(data,t.articleId)} × {t.qty} · {t.from} → {t.to} · {t.lotIds.length} lot(s)</p>)}</section></>;
}
