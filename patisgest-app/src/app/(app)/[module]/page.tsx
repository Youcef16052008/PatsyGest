import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { canWrite, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import DemoModule from "@/components/demo-module";
import StockWriteForms from "@/components/stock-write-forms";
import SaleForm from "@/components/sale-form";
import ZImportForm from "@/components/z-import-form";
import OfForms, { type OfOrder } from "@/components/of-forms";
import TransferForm from "@/components/transfer-form";
import ClotureForm from "@/components/cloture-form";
import QualityForms, { type NcRow } from "@/components/quality-forms";
import PlanningForms, { type TaskRow } from "@/components/planning-forms";
import CakeForms, { type CakeRow } from "@/components/cake-forms";
import CommandeForms, { type CommandeRow } from "@/components/commande-forms";
import { computePriceAlerts } from "@/lib/price-alerts";
import { computeReconciliation, type ClosingRecord, type SaleRecord } from "@/lib/reconciliation";
import ReconPanel from "@/components/recon-panel";

const modules = {
  stocks: { title:'Articles & stocks', tables:[['articles','Articles'],['lots','Lots']] },
  achats: { title:'Achats & fournisseurs', tables:[['fournisseurs','Fournisseurs'],['bons_commande','Bons de commande']] },
  recettes: { title:'Recettes & coûts', tables:[['recette_familles','Recettes'],['recette_versions','Versions']] },
  production: { title:'Production', tables:[['ordres_fabrication','Ordres de fabrication']] },
  transferts: { title:'Transferts', tables:[['transferts','Transferts']] },
  simulation: { title:'Simulation de prix', tables:[['recette_familles','Recettes'],['recette_versions','Versions'],['lots','Lots']] },
  planning: { title:'Planning de production', tables:[['taches_planning','Tâches'],['ordres_fabrication','Ordres de fabrication']] },
  tracabilite: { title:'Traçabilité des lots', tables:[['lots','Lots'],['mouvements','Mouvements']] },
  'cake-design': { title:'Cake Design Studio', tables:[['cakes','Devis et commandes']] },
  qualite: { title:'HACCP & qualité', tables:[['releve_temperatures','Températures'],['nettoyages','Nettoyages'],['non_conformites','Non-conformités']] },
  cloture: { title:'Clôture & pertes', tables:[['clotures','Clôtures']] },
  caisse: { title:'Caisse', tables:[['ventes','Ventes']] },
} as const;
type Module = keyof typeof modules;
export default async function ModulePage({ params }: { params: Promise<{module:string}> }) {
  const {module} = await params;
  if (!Object.hasOwn(modules,module)) notFound();
  const key=module as Module, info=modules[key], ctx=await requireSession();
  if (ctx.mode === 'pilote-local') return <DemoModule module={key} role={ctx.role}/>;
  const supabase=await createClient();
  const results=await Promise.all(info.tables.map(async ([table,label])=> {
    const {data,error}=await supabase.from(table).select('*').eq('client_id',ctx.clientId).limit(100);
    return {label,data,error};
  }));
  // Écritures réelles (RLS) : uniquement sur Stocks et pour les rôles autorisés.
  let writeForms: ReactNode = null;
  if (key==='stocks' && canWrite(ctx.role)) {
    const [sitesRes,fournRes]=await Promise.all([
      supabase.from('sites').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
      supabase.from('fournisseurs').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
    ]);
    const articleRows=(results.find(r=>r.label==='Articles')?.data ?? []) as {id:string;code:string;nom:string}[];
    writeForms=<StockWriteForms
      articles={articleRows.map(a=>({id:a.id,label:`${a.code} · ${a.nom}`}))}
      sites={((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>({id:s.id,label:s.nom}))}
      fournisseurs={((fournRes.data??[]) as {id:string;nom:string}[]).map(f=>({id:f.id,label:f.nom}))}
    />;
  } else if (key==='caisse') {
    // Vente réelle : tous les rôles authentifiés (le vendeur est le rôle caisse).
    const [sitesRes,produitsRes]=await Promise.all([
      supabase.from('sites').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
      supabase.from('articles').select('id, code, nom').eq('client_id',ctx.clientId).eq('niveau','produit').order('code'),
    ]);
    writeForms=<>
      <SaleForm
        articles={((produitsRes.data??[]) as {id:string;code:string;nom:string}[]).map(a=>({id:a.id,label:`${a.code} · ${a.nom}`}))}
        sites={((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>({id:s.id,label:s.nom}))}
      />
      {canWrite(ctx.role) && <ZImportForm sites={((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>({id:s.id,label:s.nom}))} />}
    </>;
  } else if (key==='production' && canWrite(ctx.role)) {
    // OF réels : création (besoins figés), lancement FEFO, clôture au coût connu.
    const [sitesRes,famRes,verRes]=await Promise.all([
      supabase.from('sites').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
      supabase.from('recette_familles').select('id, nom').eq('client_id',ctx.clientId),
      supabase.from('recette_versions').select('id, version, famille_id').eq('client_id',ctx.clientId).order('version'),
    ]);
    const famById=new Map(((famRes.data??[]) as {id:string;nom:string}[]).map(f=>[f.id,f.nom]));
    const versions=((verRes.data??[]) as {id:string;version:number;famille_id:string}[])
      .filter(v=>famById.has(v.famille_id))
      .map(v=>({id:v.id,label:`${famById.get(v.famille_id)} · v${v.version}`}));
    const ofRows=((results.find(r=>r.label==='Ordres de fabrication')?.data??[]) as OfOrder[]);
    writeForms=<OfForms versions={versions}
      sites={((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>({id:s.id,label:s.nom}))}
      orders={ofRows}/>;
  } else if (key==='transferts' && canWrite(ctx.role)) {
    const [sitesRes,artRes]=await Promise.all([
      supabase.from('sites').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
      supabase.from('articles').select('id, code, nom').eq('client_id',ctx.clientId).order('code'),
    ]);

  } else if (key==='cloture' && canWrite(ctx.role)) {
    // Clôture six flux (RPC saisir_cloture) : révisions et enrichissement côté serveur.
    const [sitesRes,artRes,clotRes,ventesRes]=await Promise.all([
      supabase.from('sites').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
      supabase.from('articles').select('id, code, nom, pu_ht').eq('client_id',ctx.clientId).eq('niveau','produit').eq('actif',true).order('nom'),
      supabase.from('clotures').select('id, date_cloture, site_id, revision, lignes').eq('client_id',ctx.clientId).order('date_cloture',{ascending:false}).limit(30),
      supabase.from('ventes').select('site_id, date_vente, lignes').eq('client_id',ctx.clientId).order('date_vente',{ascending:false}).limit(500),
    ]);
    const siteLabels=Object.fromEntries(((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>[s.id,s.nom]));
    const clotures=((clotRes.data??[]) as {id:string;date_cloture:string;site_id:string;revision:number;lignes:{articleId:string;code?:string;name?:string;vendu:number}[]}[])
      .map(c=>({id:c.id,date:c.date_cloture,siteId:c.site_id,revision:c.revision,lignes:c.lignes??[]}) as ClosingRecord);
    const sales=((ventesRes.data??[]) as {site_id:string;date_vente:string;lignes:{articleId:string;qty:number}[]}[])
      .map(v=>({siteId:v.site_id,date:v.date_vente,lignes:(v.lignes??[]).filter(l=>l.articleId&&typeof l.qty==='number')}) as SaleRecord);
    const recon=computeReconciliation(clotures,sales);
    writeForms=<>
      <ClotureForm
        sites={((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>({id:s.id,label:s.nom}))}
        articles={((artRes.data??[]) as {id:string;code:string;nom:string;pu_ht:number}[]).map(a=>({id:a.id,label:`${a.code} — ${a.nom} (${Number(a.pu_ht).toLocaleString('fr-FR')} DA)`}))}
      />
      <ReconPanel entries={recon} siteLabels={siteLabels} />
    </>;
  } else if (key==='qualite' && canWrite(ctx.role)) {
    // HACCP : relevés/nettoyages/NC en RLS + clôture NC tracée (RPC maj_non_conformite).
    const ncRows=((results.find(r=>r.label==='Non-conformités')?.data??[]) as {id:string;statut:string;type:string;description:string;action:string}[])
      .map(n=>({id:n.id,statut:n.statut,type:n.type,description:n.description,action:n.action}));
    writeForms=<QualityForms ncs={ncRows}/>;
  } else if (key==='planning' && canWrite(ctx.role)) {
    // Tâches réelles (insert + bascule fait).
    const [tasksRes,ofsRes]=await Promise.all([
      supabase.from('taches_planning').select('id, date_tache, tache, of_numero, fait').eq('client_id',ctx.clientId).order('date_tache').limit(100),
      supabase.from('ordres_fabrication').select('numero').eq('client_id',ctx.clientId).order('numero',{ascending:false}).limit(50),
    ]);
    writeForms=<PlanningForms
      tasks={((tasksRes.data??[]) as {id:string;date_tache:string;tache:string;of_numero:string;fait:boolean}[]).map(t=>({id:t.id,date:t.date_tache,tache:t.tache,ofNumero:t.of_numero,fait:t.fait}))}
      ofNumeros={((ofsRes.data??[]) as {numero:string}[]).map(o=>o.numero)}
    />;
  } else if (key==='cake-design') {
    // Cake Design : tous les rôles (démo), RPC creer_cake/evoluer_cake.
    const cakeRows=((results.find(r=>r.label==='Devis et commandes')?.data??[]) as {id:string;numero:string;statut:string;client_nom:string;prix_ht:number;acompte:number}[])
      .map(c=>({id:c.id,numero:c.numero,statut:c.statut,clientNom:c.client_nom,prixHt:c.prix_ht,acompte:c.acompte}));
    writeForms=<CakeForms cakes={cakeRows}/>;
  } else if (key==='achats' && canWrite(ctx.role)) {
    // BC multi-lignes + réceptions partielles/totales (RPC creer/recevoir_commande).
    const [artRes,sitesRes,histRes]=await Promise.all([
      supabase.from('articles').select('id, code, nom, pu_ht').eq('client_id',ctx.clientId).eq('actif',true).order('nom').limit(150),
      supabase.from('sites').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
      supabase.from('historique_prix').select('article_id, fournisseur_id, date_prix, pu').eq('client_id',ctx.clientId).order('date_prix',{ascending:false}).limit(300),
    ]);
    const priceAlerts=computePriceAlerts(((histRes.data??[]) as {article_id:string;fournisseur_id:string;date_prix:string;pu:number}[])
      .map(h=>({articleId:h.article_id,fournisseurId:h.fournisseur_id,datePrix:h.date_prix,pu:Number(h.pu)})));
    const fourRows=((results.find(r=>r.label==='Fournisseurs')?.data??[]) as {id:string;nom:string}[]);
    const fourById=new Map(fourRows.map(f=>[f.id,f.nom]));
    const cmdRows=((results.find(r=>r.label==='Bons de commande')?.data??[]) as {id:string;numero:string;statut:string;lignes:{articleId:string;qte:number;pu:number;recu:number}[]|null;fournisseur_id:string}[]);
    writeForms=<CommandeForms
      alerts={priceAlerts}
      fournisseurs={fourRows.map(f=>({id:f.id,label:f.nom}))}
      articles={((artRes.data??[]) as {id:string;code:string;nom:string;pu_ht:number}[]).map(a=>({id:a.id,label:`${a.code} — ${a.nom} (${Number(a.pu_ht).toLocaleString('fr-FR')} DA)`}))}
      sites={((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>({id:s.id,label:s.nom}))}
      commandes={cmdRows.map(c=>({id:c.id,numero:c.numero,statut:c.statut,fournisseur:fourById.get(c.fournisseur_id)??"",lignes:c.lignes??[]}))}
    />;
  }
  return <div>{writeForms}<p className="text-xs font-bold uppercase tracking-widest text-violet-600">{writeForms ? 'Supabase · Écritures sécurisées + lecture' : 'Supabase · Lecture seule'}</p><h1 className="mt-2 text-3xl font-black">{info.title}</h1><p className="mt-2 text-sm text-slate-500">{writeForms ? 'Les écritures ci-dessus sont transactionnelles et isolées par RLS.' : key==='simulation' ? 'La simulation interactive est disponible uniquement dans la démo locale ; voici les données distantes en lecture seule.' : 'Les opérations d’écriture sécurisées sont en cours de développement.'}</p><div className="mt-6 grid gap-5">{results.map(({label,data,error})=><section key={label} className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-bold">{label} · {data?.length ?? 0}</h2>{error ? <p role="alert" className="text-sm text-red-700">Impossible de charger les données : {error.message}</p> : data?.length ? <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{Object.keys(data[0]).filter(k=>!['client_id','created_at'].includes(k)).map(k=><th className="border-b p-2 text-xs text-slate-500" key={k}>{k}</th>)}</tr></thead><tbody>{data.map((row,i)=><tr key={i}>{Object.entries(row).filter(([k])=>!['client_id','created_at'].includes(k)).map(([k,v])=><td key={k} className="max-w-xs border-b p-2 align-top">{typeof v==='object' ? JSON.stringify(v) : String(v ?? '—')}</td>)}</tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">Aucune donnée.</p>}</section>)}</div></div>;
}
