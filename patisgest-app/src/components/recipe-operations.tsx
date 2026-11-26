"use client";
import { useState, type FormEvent } from 'react';
import { addRecipeVersion, createRecipe, recipeCost, type Recipe, type RecipeInput, type State } from '@/lib/patisgest-store';

const box='pg-card pg-card-pad';
const field='pg-input';
const btn='pg-button';
const money=(n:number)=>new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:2}).format(n)+' DA';
type Props={data:State; canEdit:boolean; canReadCosts?:boolean; save:(state:State)=>boolean; notify:(message:string)=>void};

type Row={key:number; articleId:string; qty:number; parage:number};
function RecipeForm({data,recipe,canReadCosts=true,save,notify}:{data:State; recipe?:Recipe; canReadCosts?:boolean; save:Props['save']; notify:Props['notify']}) {
  const previous=recipe?.versions.at(-1);
  const materials=data.articles.filter(a=>a.niveau==='matiere'||a.niveau==='sous_recette');
  const products=data.articles.filter(a=>a.niveau==='produit'||a.niveau==='sous_recette');
  const [rows,setRows]=useState<Row[]>(()=>previous?.ingredients.map((i,index)=>({key:index,...i})) ?? [{key:0,articleId:materials[0]?.id ?? '',qty:1,parage:0}]);
  const [nextKey,setNextKey]=useState(rows.length);
  function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form=e.currentTarget; const f=new FormData(form);
    const ids=f.getAll('ingredient'), qty=f.getAll('quantity'), parage=f.getAll('parage');
    const input:RecipeInput={
      baseYield:Number(f.get('yield')),
      lossPercent:Number(f.get('loss')),
      labourMinutes:Number(f.get('minutes')),
      hourlyRate:canReadCosts?Number(f.get('rate')):(previous?.hourlyRate??0),
      chargesPercent:canReadCosts?Number(f.get('charges')):(previous?.chargesPercent??0),
      packaging:canReadCosts?Number(f.get('packaging')):(previous?.packaging??0),
      energy:canReadCosts?Number(f.get('energy')):(previous?.energy??0),
      overhead:canReadCosts?Number(f.get('overhead')):(previous?.overhead??0),
      ingredients:ids.map((articleId,i)=>({articleId:String(articleId),qty:Number(qty[i]),parage:Number(parage[i])})),
    };
    try {
      const next=recipe ? addRecipeVersion(data,recipe.id,input) : createRecipe(data,String(f.get('name')),String(f.get('product')),input);
      if (save(next)) {
        if (!recipe) {
          form.reset();
          setRows([{key:0,articleId:materials[0]?.id ?? '',qty:1,parage:0}]);
          setNextKey(1);
        }
        notify(recipe ? `Nouvelle version de ${recipe.name} enregistrée.` : 'Recette créée.');
      }
    } catch (err) {notify(err instanceof Error?err.message:'Erreur de recette.');}
  }
  return <form onSubmit={submit} className="mt-4 space-y-4">
    {!recipe && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Nom de la recette<input name="name" required maxLength={100} className={field}/></label><label className="text-xs font-semibold text-slate-600">Produit fini<select name="product" required className={field}>{products.map(a=><option key={a.id} value={a.id}>{a.nom} ({a.unite})</option>)}</select></label></div>}
    <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-600">Rendement brut<input name="yield" type="number" min="0.0001" step="0.0001" required defaultValue={previous?.baseYield ?? 20} className={field}/></label><label className="text-xs font-semibold text-slate-600">Perte cuisson %<input name="loss" type="number" min="0" max="99.99" step="0.01" required defaultValue={previous?.lossPercent ?? 0} className={field}/></label><label className="text-xs font-semibold text-slate-600">Main-d’œuvre (minutes)<input name="minutes" type="number" min="0" max="1000000000" step="0.01" required defaultValue={previous?.labourMinutes ?? 0} className={field}/></label>{canReadCosts && <><label className="text-xs font-semibold text-slate-600">Taux horaire (DA)<input name="rate" type="number" min="0" max="1000000000" step="0.01" required defaultValue={previous?.hourlyRate ?? 0} className={field}/></label><label className="text-xs font-semibold text-slate-600">Charges sur main-d’œuvre %<input name="charges" type="number" min="0" max="1000" step="0.01" required defaultValue={previous?.chargesPercent ?? 0} className={field}/></label><label className="text-xs font-semibold text-slate-600">Emballage (DA)<input name="packaging" type="number" min="0" max="1000000000" step="0.01" required defaultValue={previous?.packaging ?? 0} className={field}/></label><label className="text-xs font-semibold text-slate-600">Énergie (DA)<input name="energy" type="number" min="0" max="1000000000" step="0.01" required defaultValue={previous?.energy ?? 0} className={field}/></label><label className="text-xs font-semibold text-slate-600">Frais généraux (DA)<input name="overhead" type="number" min="0" max="1000000000" step="0.01" required defaultValue={previous?.overhead ?? 0} className={field}/></label></>}</div>
    <fieldset><legend className="font-bold">Ingrédients</legend><p className="my-2 text-xs text-slate-500">Quantités dans l’unité de l’article, pour le rendement brut. Une ligne par matière.</p><div className="space-y-2">{rows.map((row,index)=><div key={row.key} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]"><label className="text-xs text-slate-500">Matière {index+1}<select name="ingredient" required defaultValue={row.articleId} className={field}>{materials.map(a=><option key={a.id} value={a.id}>{a.nom} ({a.unite})</option>)}</select></label><label className="text-xs text-slate-500">Quantité<input name="quantity" type="number" min="0.0001" step="0.0001" required defaultValue={row.qty} className={field}/></label><label className="text-xs text-slate-500">Parage %<input name="parage" type="number" min="0" max="100" step="0.01" required defaultValue={row.parage} className={field}/></label><button type="button" disabled={rows.length===1} onClick={()=>setRows(rows.filter(r=>r.key!==row.key))} className="self-end rounded-lg border p-2 text-sm disabled:opacity-30" aria-label={`Retirer ingrédient ${index+1}`}>Retirer</button></div>)}</div><button type="button" onClick={()=>{setRows([...rows,{key:nextKey,articleId:materials[0]?.id ?? '',qty:1,parage:0}]);setNextKey(nextKey+1);}} className="mt-3 text-sm font-bold text-violet-700">+ Ajouter un ingrédient</button></fieldset>
    <button disabled={!products.length||!materials.length} className={`${btn} disabled:opacity-50`}>{recipe ? 'Enregistrer une nouvelle version' : 'Créer la recette'}</button>{(!products.length||!materials.length) && <p className="text-xs text-red-700">Créez d’abord un produit fini et une matière.</p>}
  </form>;
}
export function RecipeOperations(props:Props) {
  const {data,canEdit,canReadCosts=true}=props;
  return <>{canReadCosts && <p className="text-sm text-slate-500">Coût estimé à partir du premier lot FEFO actuel du laboratoire ; les anciennes versions restent disponibles. Les coûts historiques ne sont pas figés.</p>}{data.recipes.map(recipe=>{
    const v=recipe.versions.at(-1)!; const cost=recipeCost(data,recipe.id); const product=data.articles.find(a=>a.id===recipe.productId);
    return <section key={recipe.id} className={box}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">{recipe.name} · v{v.version}</h2><p className="text-sm text-slate-500">Produit : {product?.nom ?? 'introuvable'} · rendement brut {v.baseYield} {product?.unite} · cuisson {v.lossPercent} %</p></div>{canReadCosts && <div className="rounded-xl bg-violet-50 px-4 py-2 text-violet-800"><div className="text-xs font-semibold">Coût / unité estimé</div><b className="text-xl">{cost.missingPrices.length?'Prix incomplet':money(cost.perUnit)}</b></div>}</div>
      {canReadCosts && cost.missingPrices.length>0 && <p role="alert" className="mt-3 text-sm text-red-700">Prix FEFO absent ou incomplet : {cost.missingPrices.join(', ')}. Le total n’est pas complet.</p>}
      <div className="mt-4 space-y-2 text-sm">{cost.lines.map(l=><div key={l.articleId} className="flex flex-wrap justify-between gap-2 border-t pt-2"><span>{l.article} · {l.qty} {data.articles.find(a=>a.id===l.articleId)?.unite ?? ''} (+{l.parage} % parage){canReadCosts ? ` × ${money(l.unitPrice)}` : ''}</span>{canReadCosts && <b>{money(l.qty*(1+l.parage/100)*l.unitPrice)}</b>}</div>)}{canReadCosts && [['Main-d’œuvre chargée',cost.labour],['Emballage',cost.packaging],['Énergie',cost.energy],['Frais généraux',cost.overhead],['Total coût',cost.total],['Rendement net',cost.yieldNet]].map(([label,value])=><div key={String(label)} className="flex justify-between border-t pt-2"><span>{label}</span><b>{label==='Rendement net'?`${value} ${product?.unite ?? ''}`:money(Number(value))}</b></div>)}{!canReadCosts && <div className="flex justify-between border-t pt-2"><span>Rendement net</span><b>{cost.yieldNet} {product?.unite ?? ''}</b></div>}{canReadCosts && !cost.missingPrices.length && product && <div className="flex justify-between border-t pt-2"><span>Marge unitaire estimée (prix {money(product.prix)})</span><b>{money(product.prix-cost.perUnit)}</b></div>}</div>
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-bold text-violet-700">Historique des versions ({recipe.versions.length})</summary><div className="mt-2 space-y-2">{recipe.versions.slice().reverse().map(old=><div key={old.version} className="rounded-lg bg-slate-50 p-3"><b>v{old.version}</b> · rendement {old.baseYield} · cuisson {old.lossPercent} % · {old.ingredients.map(i=>`${data.articles.find(a=>a.id===i.articleId)?.nom ?? i.articleId} ${i.qty} (+${i.parage} %)`).join(' · ')}{canReadCosts && <><br/>MO : {old.labourMinutes} min × {money(old.hourlyRate)}/h + {old.chargesPercent} % · emballage {money(old.packaging)} · énergie {money(old.energy)} · frais {money(old.overhead)}</>}</div>)}</div></details>
      {canEdit && <details className="mt-4"><summary className="cursor-pointer text-sm font-bold text-violet-700">Créer une nouvelle version</summary><RecipeForm key={v.version} data={data} recipe={recipe} canReadCosts={canReadCosts} save={props.save} notify={props.notify}/></details>}
    </section>;
  })}{canEdit && <section className={box}><details><summary className="cursor-pointer font-bold text-violet-700">+ Nouvelle recette</summary><RecipeForm data={data} canReadCosts={canReadCosts} save={props.save} notify={props.notify}/></details></section>}</>;
}
