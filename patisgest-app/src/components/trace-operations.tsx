"use client";
import { useState, type FormEvent } from 'react';
import { traceLot, setLotBlocked, type State, type Lot } from '@/lib/patisgest-store';
import Link from 'next/link';
const box='pg-card pg-card-pad';
const field='pg-input';
type Props={data:State; canEdit:boolean; save:(state:State)=>boolean; notify:(message:string)=>void};
function originText(lot:Lot, data:State):string {
  const origin=lot.origin;
  if (!origin) return 'non renseignée ou donnée ancienne';
  if (origin.type==='purchase') return `bon fournisseur · ${origin.supplier}`;
  if (origin.type==='production') return `production · ${data.productions.find(o=>o.id===origin.productionId)?.numero ?? 'ordre non trouvé'}`;
  return `transfert · lot source ${data.lots.find(l=>l.id===origin.fromLotId)?.numero ?? 'introuvable'} (${origin.fromLotId})`;
}
export function TraceOperations(props:Props) {
  const {data,canEdit}=props;
  const [selected,setSelected]=useState(data.lots[0]?.id ?? '');
  const lot=data.lots.find(l=>l.id===selected); const trace=lot?traceLot(data,lot.id):null;
  const article=(id:string)=>data.articles.find(a=>a.id===id)?.nom ?? 'Article inconnu';
  function toggle(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!lot || !trace) return;
    const form=e.currentTarget, f=new FormData(form), submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode=submitter?.value; if(!['block','cascade','unblock'].includes(mode ?? '')) return;
    if(mode==='cascade' && !window.confirm('Bloquer uniquement les lots liés connus dans cette démo ? Les données peuvent être incomplètes.')) return;
    try {const next=setLotBlocked(data,mode==='cascade'?trace.lots.map(l=>l.id):[lot.id],mode!=='unblock',String(f.get('reason') ?? ''));if(props.save(next)){form.reset();props.notify(mode==='cascade'?'Lots liés connus bloqués localement ; aucun rappel réel n’a été envoyé.':'Statut du lot mis à jour dans la démo.');}} catch(err){props.notify(err instanceof Error?err.message:'Opération impossible.');}
  }
  return <><div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><b>Simulation, pas un système de rappel sanitaire.</b> Résultats limités aux liens enregistrés dans ce navigateur ; ils peuvent être incomplets. Aucun client, fournisseur ou autorité n’est contacté, et aucun retrait physique n’est effectué.</div>
    <section className={box}><h2 className="font-bold">Choisir un lot</h2><label className="mt-3 block text-xs font-semibold text-slate-600">Lot et site<select value={selected} onChange={e=>setSelected(e.target.value)} className={field}><option value="">— Choisir —</option>{data.lots.map(l=><option value={l.id} key={l.id}>{l.numero} · {article(l.articleId)} · {l.site} · {l.bloque?'bloqué':'disponible'} · {l.id.slice(0,8)}</option>)}</select></label>{!lot && <p className="mt-3 text-sm text-slate-500">Choisissez un lot pour afficher les informations connues.</p>}</section>
    {lot && trace && <><section className={box}><div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-bold">Lot {lot.numero} · {article(lot.articleId)}</h2><p className="text-xs text-slate-500">ID : {lot.id}</p></div><b className={lot.bloque?'text-red-700':'text-emerald-700'}>{lot.bloque?'Bloqué':'Non bloqué'}</b></div><p className="mt-3 text-sm">Site : {lot.site} · Reçu / créé : {lot.date} · DLC : {lot.dlc||'non renseignée'} · Quantité restante : {lot.qte}</p><p className="mt-2 text-sm text-slate-600">Origine : {originText(lot,data)}</p>
      {canEdit && <form onSubmit={toggle} className="mt-4 space-y-2"><label className="block text-xs font-semibold text-slate-600">Motif obligatoire<input name="reason" maxLength={500} required className={field} placeholder="Ex. simulation de rappel"/></label><div className="flex flex-wrap gap-2"><button type="submit" name="action" value="block" className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white">Bloquer ce lot</button><button type="submit" name="action" value="cascade" className="rounded-lg border border-red-400 px-3 py-2 text-sm font-bold text-red-700">Bloquer aussi les lots liés connus</button><button type="submit" name="action" value="unblock" className="rounded-lg border px-3 py-2 text-sm font-bold">Débloquer ce lot uniquement</button></div></form>}
      <p className="mt-3 text-xs text-slate-500">Les lots bloqués sont exclus de FEFO. Les productions déjà lancées à partir d’un lot bloqué créent des lots bloqués. Le déblocage n’est jamais propagé.</p></section>
      <section className={box}><h2 className="font-bold">Aval connu · simulation de rappel</h2><p className="mt-2 text-xs text-slate-500">Propagation par identifiants : consommation en production et transferts reliés. Un OF relie tous ses lots produits aux lots consommés ; cela ne prouve pas quels clients ont reçu chaque produit.</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><b>{trace.lots.length}</b> lot(s) connu(s), source comprise</div><div className="rounded-lg bg-slate-50 p-3"><b>{trace.orders.length}</b> ordre(s) de production</div><div className="rounded-lg bg-slate-50 p-3"><b>{trace.sales.length}</b> vente(s) reliée(s)</div></div>
      <h3 className="mt-4 text-sm font-bold">Lots reliés</h3><ul className="mt-1 space-y-1 text-sm">{trace.lots.map(l=><li key={l.id}>{l.id===lot.id?'Source':'↳'} {l.numero} · {article(l.articleId)} · {l.site} · reste {l.qte} · {l.bloque?'bloqué':'non bloqué'} <span className="text-xs text-slate-400">({l.id.slice(0,8)})</span></li>)}</ul>
      <h3 className="mt-4 text-sm font-bold">Productions / transferts</h3><ul className="mt-1 space-y-1 text-sm">{!trace.orders.length&&!trace.transfers.length && <li className="text-slate-500">Aucune liaison connue.</li>}{trace.orders.map(o=><li key={o.id}>OF {o.numero} · {o.snapshot.name} · {o.status}</li>)}{trace.transfers.map(t=><li key={t.id}>Transfert {t.id.slice(0,8)} · {t.date} · {t.from} → {t.to}</li>)}</ul>
      <h3 className="mt-4 text-sm font-bold">Ventes reliées par lot</h3>{!trace.sales.length?<p className="mt-1 text-sm text-slate-500">Aucune vente reliée connue ; cela ne prouve pas l’absence de vente.</p>:<ul className="mt-1 space-y-1 text-sm">{trace.sales.map(({sale,details})=><li key={sale.id}>{sale.date} · vente {sale.id.slice(0,8)} · {article(sale.articleId)} · {details.map(d=>`${data.lots.find(l=>l.id===d.lotId)?.numero ?? d.lotId} × ${d.qty}`).join(' ; ')}</li>)}</ul>}
      {(trace.legacyTransferLots>0||trace.legacySales>0||trace.missingProducedLots>0) && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Liens incomplets dans la démo : {trace.legacyTransferLots} lot(s) de transfert sans source structurée, {trace.legacySales} vente(s) sans lien de lot vérifiable, {trace.missingProducedLots} lot(s) de production introuvable(s).</p>}</section>
      <section className={box}><h2 className="font-bold">Mouvements et blocages du lot source</h2><div className="mt-3 space-y-2 text-sm">{data.movements.filter(m=>m.lotId===lot.id).map(m=><p key={m.id} className="border-t py-2">{m.date} · {m.qte>0?'+':''}{m.qte} · {m.reference}</p>)}{data.lotEvents.filter(e=>e.lotId===lot.id).map(e=><p key={e.id} className="border-t py-2">{e.at} · {e.action} · {e.reason}</p>)}{!data.movements.some(m=>m.lotId===lot.id)&&!data.lotEvents.some(e=>e.lotId===lot.id) && <p className="text-slate-500">Aucun mouvement local disponible pour ce lot initial.</p>}</div><p className="mt-3 text-xs text-slate-500">La saisie d’une non-conformité reste manuelle dans <Link className="font-bold text-violet-700" href="/qualite">Qualité</Link>.</p></section></>}
  </>;
}
