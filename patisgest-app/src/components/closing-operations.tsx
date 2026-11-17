"use client";
import { useState, type FormEvent } from 'react';
import { addDailyClosing, closingStats, type ClosingInputLine, type DailyClosing, type State } from '@/lib/patisgest-store';

const box='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const field='w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
const btn='rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800';
const money=(n:number)=>new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:2}).format(n)+' DA';
const format=(n:number)=>new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:4}).format(n);
const flux=[['produit','Fabriqué'],['vendu','Vendu'],['reporte','Reporté'],['jete','Jeté'],['casse','Casse / erreur'],['offert','Offert / don / personnel']] as const;
type Props={data:State; save:(state:State)=>boolean; notify:(message:string)=>void};
function Detail({entry}:{entry:DailyClosing}) {
  const stats=closingStats(entry);
  return <><div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">CA déclaré HT estimé</span><p className="font-bold">{money(stats.caHT)}</p></div><div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Manque à gagner estimé HT</span><p className="font-bold">{money(stats.manque)}</p></div><div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Taux de perte</span><p className="font-bold">{stats.lossRate===null?'Non calculable':`${format(stats.lossRate)} %`}</p></div></div>
    {!stats.unit && <p className="mt-2 text-xs text-amber-800">Unités différentes : pas de taux global. Consultez les taux par produit.</p>}
    <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-slate-500"><th className="p-2">Produit</th>{flux.map(([key,label])=><th className="p-2" key={key}>{label}</th>)}<th className="p-2">Perte</th></tr></thead><tbody>{entry.lines.map(l=><tr className="border-t" key={l.articleId}><td className="p-2"><b>{l.name}</b><br/><span className="text-xs text-slate-500">{l.unit} · PV {money(l.priceHT)} HT</span></td>{flux.map(([key])=><td className="p-2" key={key}>{format(l[key])}</td>)}<td className="p-2">{l.produit>0?`${format((l.jete+l.casse)/l.produit*100)} %`:'—'}</td></tr>)}</tbody></table></div></>;
}
export function ClosingOperations(props:Props) {
  const {data,save,notify}=props;
  const products=data.articles.filter(a=>a.niveau==='produit');
  const [rows,setRows]=useState([0]);const [nextKey,setNextKey]=useState(1);
  function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget,f=new FormData(form);const ids=f.getAll('article');
    const arrays=Object.fromEntries(flux.map(([key])=>[key,f.getAll(key)])) as Record<(typeof flux)[number][0],FormDataEntryValue[]>;
    const lines:ClosingInputLine[]=ids.map((articleId,i)=>({articleId:String(articleId),produit:Number(arrays.produit[i]),vendu:Number(arrays.vendu[i]),reporte:Number(arrays.reporte[i]),jete:Number(arrays.jete[i]),casse:Number(arrays.casse[i]),offert:Number(arrays.offert[i])}));
    try {const next=addDailyClosing(data,String(f.get('date')),String(f.get('site')),lines,f.get('revise')==='on'); if(save(next)){form.reset();setRows([0]);setNextKey(1);notify('Clôture enregistrée localement, sans modifier les stocks.');}} catch(err){notify(err instanceof Error?err.message:'Clôture impossible.');}
  }
  const groups=new Map<string,DailyClosing[]>();
  for(const c of data.closings) {const key=`${c.date}|${c.site}`;groups.set(key,[...(groups.get(key)??[]),c]);}
  const grouped=Array.from(groups.values()).map(group=>group.slice().sort((a,b)=>b.revision-a.revision)).sort((a,b)=>b[0].date.localeCompare(a[0].date));
  return <><section className={box}><h2 className="font-bold">Saisir une clôture · 6 flux</h2><p className="mt-2 text-sm text-slate-600">Fabriqué, vendu, reporté, jeté, casse et offert. Taux de perte : (jeté + casse) ÷ fabriqué. Saisie déclarative : la clôture ne modifie pas les stocks, les ventes ou les recettes ; elle ne rapproche pas automatiquement la caisse.</p><p className="mt-2 text-xs text-slate-500">Il peut y avoir du stock initial ou des transferts : les flux ne sont pas supposés s’équilibrer. Les valeurs HT utilisent le prix de vente au moment de la saisie.</p>
    <form onSubmit={submit} className="mt-4 space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Date<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0,10)} className={field}/></label><label className="text-xs font-semibold text-slate-600">Site<select name="site" className={field}><option>Boutique</option><option>Labo</option></select></label></div>
      <div className="space-y-4">{rows.map((row,index)=><fieldset key={row} className="rounded-xl border p-3"><legend className="px-1 text-sm font-bold">Produit {index+1}</legend><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-600">Produit<select name="article" required className={field}>{products.map(a=><option key={a.id} value={a.id}>{a.nom} ({a.unite})</option>)}</select></label>{flux.map(([key,label])=><label className="text-xs font-semibold text-slate-600" key={key}>{label}<input name={key} type="number" min="0" max="1000000000" step="0.0001" defaultValue="0" required className={field}/></label>)}</div><button type="button" disabled={rows.length===1} onClick={()=>setRows(rows.filter(k=>k!==row))} className="mt-2 text-sm font-semibold text-red-700 disabled:opacity-30">Retirer ce produit</button></fieldset>)}</div>
      <button type="button" onClick={()=>{setRows([...rows,nextKey]);setNextKey(nextKey+1);}} className="block text-sm font-bold text-violet-700">+ Ajouter un produit</button>
      <label className="flex items-start gap-2 text-sm text-slate-600"><input name="revise" type="checkbox" className="mt-1"/> Corriger une clôture existante pour cette date et ce site (une nouvelle révision est conservée).</label><button disabled={!products.length} className={`${btn} disabled:opacity-50`}>Enregistrer la clôture</button>{!products.length && <p className="text-sm text-red-700">Créez d’abord un produit fini.</p>}</form></section>
    <section className={box}><h2 className="mb-3 font-bold">Historique des clôtures</h2>{!grouped.length && <p className="text-sm text-slate-500">Aucune clôture enregistrée.</p>}<div className="space-y-4">{grouped.map(group=><div key={`${group[0].date}-${group[0].site}`} className="rounded-xl border p-4"><h3 className="mb-3 font-bold">{group[0].date} · {group[0].site} · Révision {group[0].revision}</h3><Detail entry={group[0]}/>{group.length>1 && <details className="mt-4"><summary className="cursor-pointer text-sm font-bold text-violet-700">Anciennes révisions ({group.length-1})</summary>{group.slice(1).map(c=><div className="mt-3 border-t pt-3" key={c.id}><h4 className="mb-2 text-sm font-bold">Révision {c.revision}</h4><Detail entry={c}/></div>)}</details>}</div>)}</div></section></>;
}
