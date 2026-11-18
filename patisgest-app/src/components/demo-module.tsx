"use client";
import { useState, type FormEvent } from 'react';
import { receive, type State, type Article } from '@/lib/patisgest-store';
import type { Role } from '@/lib/auth';
import { PurchaseOperations, ProductionOperations, TransferOperations } from './sprint2-operations';
import { RecipeOperations } from './recipe-operations';
import { ClosingOperations } from './closing-operations';
import { QualityOperations } from './quality-operations';
import { CakeOperations } from './cake-operations';
import { TraceOperations } from './trace-operations';
import { PlanningOperations } from './planning-operations';
import { SimulationOperations } from './simulation-operations';
import DemoCaisse from './demo-caisse';
import { useDemoWorkspace } from './demo-workspace';
import StockList from './stock-list';
import { DEMO_SITES, demoLots } from '@/lib/demo-workspace';
import { jourUTC } from '@/lib/workspace-data';
import { Disclosure, PageIntro } from './workspace-ui';

type Module = 'stocks'|'achats'|'recettes'|'caisse'|'production'|'transferts'|'cloture'|'qualite'|'cake-design'|'tracabilite'|'planning'|'simulation';
const field='w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
const btn='rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800';
const box='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
export default function DemoModule({ module, role, filtre, shop }: { module: Module; role: Role; filtre?: string; shop?: string }) {
  const { data, save: persist } = useDemoWorkspace();
  const [message, setMessage] = useState('');
  function save(next: State) {
    if (persist(next)) return true;
    setMessage('Enregistrement local impossible.');
    return false;
  }
  if (!data) return <p role="status">Chargement de la démo…</p>;
  const db=data; const canEdit=role!=='vendeur';
  function addArticle(e:FormEvent<HTMLFormElement>) { e.preventDefault(); const f=new FormData(e.currentTarget); const code=String(f.get('code')).trim(); const nom=String(f.get('nom')).trim(); if (!code||!nom||db.articles.some(a=>a.code.toLowerCase()===code.toLowerCase())) {setMessage('Code et nom requis ; le code doit être unique.'); return;} const a:Article={id:crypto.randomUUID(),code,nom,niveau:String(f.get('niveau'))==='produit'?'produit':'matiere',unite:String(f.get('unite')).trim()||'pcs',seuil:Number(f.get('seuil')),prix:Number(f.get('prix')),tva:19}; if (!Number.isFinite(a.seuil)||a.seuil<0||!Number.isFinite(a.prix)||a.prix<0) {setMessage('Valeurs invalides.');return;} if (save({...db,articles:[...db.articles,a]})) { e.currentTarget.reset(); setMessage('Article ajouté localement.'); } }
  function addLot(e:FormEvent<HTMLFormElement>) {e.preventDefault(); const f=new FormData(e.currentTarget); try {const next=receive(db,{articleId:String(f.get('article')),numero:String(f.get('numero')).trim(),site:String(f.get('site')),qte:Number(f.get('qte')),pu:Number(f.get('pu')),dlc:String(f.get('dlc'))});if (save(next)) {e.currentTarget.reset();setMessage('Lot réceptionné localement.');}} catch(err){setMessage(err instanceof Error?err.message:'Erreur');}}
  const title={stocks:'Articles & stocks',achats:'Achats & fournisseurs',recettes:'Recettes & coûts',caisse:'Caisse',production:'Production',transferts:'Transferts',cloture:'Clôture & pertes',qualite:'HACCP & qualité','cake-design':'Cake Design Studio',tracabilite:'Traçabilité des lots',planning:'Planning de production',simulation:'Simulation de prix'}[module];
  return <div className="pg-stack"><PageIntro title={title} label={module === "stocks" ? "Inventaire" : module === "caisse" ? "Boutique" : module === "production" ? "Laboratoire" : undefined}
    description={module === "stocks" ? "Retrouvez vos produits, vos ingrédients et les quantités par site." : module === "caisse" ? "Choisissez un produit, vérifiez la quantité et enregistrez la vente." : undefined}
    actions={module === "stocks" && canEdit && <a href="#nouvel-article" className="pg-button pg-button-secondary">Gérer le stock</a>}/>
    {message && <p role="status" className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">{message}</p>}
    {module === 'stocks' && <>
      <StockList key={filtre ?? "tous"} articles={db.articles.slice().sort((a,b) => a.nom.localeCompare(b.nom,"fr"))} lots={demoLots(db)} sites={DEMO_SITES} today={jourUTC()} filtre={filtre}/>
      {canEdit && <div id="nouvel-article"><Disclosure title="Nouvel article" description="Créer un produit fini ou un ingrédient." icon="plus">
        <form onSubmit={addArticle} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="pg-field">Nom de l’article<input name="nom" required maxLength={120} placeholder="Mille-feuille" className="pg-input"/></label>
          <label className="pg-field">Code article<input name="code" required maxLength={40} placeholder="PF-005" className="pg-input"/></label>
          <label className="pg-field">Type<select name="niveau" className="pg-input"><option value="produit">Produit fini</option><option value="matiere">Ingrédient</option></select></label>
          <label className="pg-field">Unité<input name="unite" defaultValue="pcs" required maxLength={20} className="pg-input"/></label>
          <label className="pg-field">Seuil d’alerte<input name="seuil" type="number" min="0" step="any" defaultValue="0" className="pg-input"/></label>
          <label className="pg-field">Prix de vente HT (DA)<input name="prix" type="number" min="0" step="0.01" defaultValue="0" className="pg-input"/></label>
          <div><button className="pg-button">Ajouter l’article</button></div>
        </form>
      </Disclosure></div>}
    </>}
    {module==='achats' && <><PurchaseOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/><section className={box}><h2 className="mb-3 font-bold">Fournisseurs de démonstration</h2><div className="grid gap-2 sm:grid-cols-3">{db.suppliers.map(s=><div key={s} className="rounded-lg bg-slate-50 p-3 text-sm">🏭 {s}</div>)}</div></section>{canEdit && <section className={box}><h2 className="mb-3 font-bold">Réceptionner un lot</h2><form onSubmit={addLot} className="grid gap-3 sm:grid-cols-3"><select name="article" aria-label="Article" className={field}>{db.articles.map(a=><option value={a.id} key={a.id}>{a.nom}</option>)}</select><input name="numero" placeholder="Numéro de lot" required className={field}/><select name="site" aria-label="Site" className={field}><option>Labo</option><option>Boutique</option></select><input name="qte" type="number" min="0.0001" step="any" placeholder="Quantité" required className={field}/><input name="pu" type="number" min="0" step="any" placeholder="Prix unitaire HT" required className={field}/><label className="text-xs text-slate-500">DLC (facultative)<input name="dlc" type="date" className={field}/></label><button className={btn}>Réceptionner</button></form></section>}</>}
    {module==='production' && <ProductionOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module==='transferts' && <TransferOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module==='simulation' && <SimulationOperations data={db}/>}
    {module==='planning' && <PlanningOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module==='tracabilite' && <TraceOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module==='cake-design' && <CakeOperations data={db} save={save} notify={setMessage}/>}
    {module==='qualite' && <QualityOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module==='cloture' && <ClosingOperations data={db} save={save} notify={setMessage}/>}
    {module==='recettes' && <RecipeOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module === 'caisse' && <DemoCaisse canEdit={canEdit} shop={shop}/>}
  </div>;
}
