import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { SessionContext } from '@/lib/auth';
import VersionForm, {type VersionRow} from './version-form';
import LabCakeForm from './lab-cake-form';
import TransferForm from './transfer-form';
import RecallForm from './recall-form';
import PlanningForms from './planning-forms';
import CommandeForms, {type CommandeRow} from './commande-forms';
import FournisseurForm from './fournisseur-form';
import {PageIntro, Notice} from './workspace-ui';
import { lirePlanLaboPrive } from '@/lib/tomorrow-lab-private-server';
import { TomorrowLabConnected } from './tomorrow-lab-panel';

export default async function LabWorkspace({module,ctx,disabled,requestedDate,tousSitesAutorises}:{disabled:Set<string>;requestedDate?:string;tousSitesAutorises:boolean;module:'recettes'|'cake-design'|'achats'|'transferts'|'tracabilite'|'planning';ctx:SessionContext}) {
 const db=await createClient();
 if(module==='cake-design') {
  const cakes=await db.from('labo_cakes').select('id,numero,client_nom,date_event,nb_parts,statut').eq('client_id',ctx.clientId).order('date_event',{ascending:false}).limit(100);
  return <><PageIntro title="Gâteaux sur commande" description="Dossiers et quantités du laboratoire."/><LabCakeForm cakes={(cakes.data??[]) as {id:string;numero:string;client_nom:string;date_event:string;nb_parts:number;statut:string}[]} unavailable={!!cakes.error}/></>;
 }
 if(module==='planning') {
  const sourcesDesactivees=["stocks","recettes","production","caisse","cake-design"].some(m=>disabled.has(m));
  const [tasks,ofs,demain]=await Promise.all([db.from('taches_planning').select('id,date_tache,tache,of_numero,fait').eq('client_id',ctx.clientId).order('date_tache').limit(100),db.from('labo_ordres_fabrication').select('numero').eq('client_id',ctx.clientId).order('numero',{ascending:false}).limit(50),sourcesDesactivees ? Promise.resolve({error:"Plan indisponible : un module source est désactivé."} as const) : lirePlanLaboPrive(db,ctx.clientId,requestedDate)]);
  if(tasks.error||ofs.error) return <Notice kind="warning">Le planning est indisponible. Vérifiez la connexion et les autorisations.</Notice>;
  return <><PageIntro title="Planning de production" description="Tâches et ordres de fabrication."/>{sourcesDesactivees ? <Notice kind="warning">Plan indisponible : un module source est désactivé.</Notice> : "error" in demain ? <Notice kind="warning">{demain.error}</Notice> : <TomorrowLabConnected {...demain} canValidate canCreateOf={!disabled.has("production")} canTransfer={!disabled.has("transferts")}/>}{tousSitesAutorises&&<PlanningForms tasks={(tasks.data??[]).map(t=>({id:t.id,date:t.date_tache,tache:t.tache,ofNumero:t.of_numero,fait:t.fait}))} ofNumeros={(ofs.data??[]).map(o=>o.numero)}/>}</>;
 }
 if(module==='transferts'||module==='tracabilite'||module==='achats') {
  const [articles,sites]=await Promise.all([db.from('labo_articles').select('id,code,nom,unite').eq('client_id',ctx.clientId).order('nom').limit(500),db.from('sites').select('id,nom').eq('client_id',ctx.clientId).order('nom')]);
  if(articles.error||sites.error) return <Notice kind="warning">Les articles ou les sites sont indisponibles.</Notice>;
  const articlesOptions=(articles.data??[]).map(a=>({id:a.id,label:`${a.code} · ${a.nom} (${a.unite})`}));
  const sitesOptions=(sites.data??[]).map(x=>({id:x.id,label:x.nom}));
  if(module==='transferts') return <><PageIntro title="Transferts" description="Déplacer des lots entre les sites."/><TransferForm articles={articlesOptions} sites={sitesOptions}/></>;
  if(module==='tracabilite') {
   const lots=await db.from('labo_lots').select('id,numero,article_id').eq('client_id',ctx.clientId).order('numero').limit(500);
   if(lots.error) return <Notice kind="warning">Les lots sont indisponibles.</Notice>;
   return <><PageIntro title="Traçabilité" description="Rappel et blocage des lots."/><RecallForm lots={(lots.data??[]).map(l=>({id:l.id,label:`${l.numero} · ${articlesOptions.find(a=>a.id===l.article_id)?.label??'Article'}`}))}/></>;
  }
  const [fournisseurs,commandes]=await Promise.all([db.from('fournisseurs').select('id,nom').eq('client_id',ctx.clientId).order('nom'),db.from('labo_bons_commande').select('id,numero,statut,fournisseur_id,lignes').eq('client_id',ctx.clientId).order('date_bc',{ascending:false}).limit(100)]);
  if(fournisseurs.error||commandes.error) return <Notice kind="warning">Les achats sont indisponibles.</Notice>;
  const opts=(fournisseurs.data??[]).map(f=>({id:f.id,label:f.nom}));
  const orders:CommandeRow[]=(commandes.data??[]).map(c=>({id:c.id,numero:c.numero,statut:c.statut,fournisseur:opts.find(f=>f.id===c.fournisseur_id)?.label??'Fournisseur',lignes:c.lignes as CommandeRow['lignes']}));
  return <><PageIntro title="Achats" description="Commandes et réceptions sans consultation des prix enregistrés."/><FournisseurForm/><CommandeForms fournisseurs={opts} articles={articlesOptions} sites={sitesOptions} commandes={orders} voirPrix={false}/></>;
 }
 const [articles,familles,versions]=await Promise.all([db.from('labo_articles').select('id,code,nom,niveau,unite').eq('client_id',ctx.clientId).order('nom').limit(300),db.from('recette_familles').select('id,code,nom,produit_id').eq('client_id',ctx.clientId).order('nom').limit(300),db.from('labo_recette_versions').select('id,famille_id,version,active,rendement_qte,rendement_unite').eq('client_id',ctx.clientId).limit(300)]);
 if(articles.error||familles.error||versions.error) return <Notice kind="warning">Recettes indisponibles. Vérifiez la connexion et les autorisations.</Notice>;
 const family=familles.data??[], rows=versions.data??[], arts=articles.data??[];
 const options=family.map(f=>({id:f.id,label:`${f.code} — ${f.nom}`}));
 const versionRows:VersionRow[]=rows.flatMap(v=>{const f=family.find(x=>x.id===v.famille_id);return f?[{id:v.id,familleId:v.famille_id,version:v.version,active:v.active,label:`${f.nom} · v${v.version} (${v.rendement_qte} ${v.rendement_unite})`}]:[];});
 return <><PageIntro title="Recettes" description="Ingrédients, quantités et versions de fabrication."/><VersionForm familles={options} articles={arts.map(a=>({id:a.id,label:`${a.code} · ${a.nom} (${a.unite})`}))} produits={arts.map(a=>({id:a.id,label:`${a.code} · ${a.nom}`}))} versions={versionRows} subVersions={versionRows.map(v=>({id:v.id,label:v.label}))}/></>;
}
