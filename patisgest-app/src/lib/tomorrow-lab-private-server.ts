import 'server-only';
import { recettesPlanValides } from './tomorrow-recipe-guard';
import { expandRecipeNeeds, type ImpactArticle, type ImpactRecipeVersion, type ImpactRecipeLine, type UnitConversion } from './ingredient-impact';
import { computeTomorrowLabPlan, type RestockRequestItem, type TomorrowExistingOf, type TomorrowConfirmedOrder, type TomorrowProduct, type TomorrowSale } from './tomorrow-lab';
import { lireArticlesQuantites, lireLots, lirePages, lireSites, type WorkspaceDB } from './workspace-read';
import { jourUTC, plusJours } from './workspace-data';

/** Une erreur ou une limite de pagination ne doit jamais devenir un stock nul. */
export async function lirePlanLaboPrive(db: WorkspaceDB, clientId: string, requestedDate?: string) {
 const today=jourUTC();
 const targetDate=requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && !Number.isNaN(Date.parse(requestedDate)) && new Date(requestedDate).toISOString().slice(0,10)===requestedDate ? requestedDate : plusJours(today,1);
 const [articles,lots,sites,families,versions,conversions,orders,cakes,sales,requests] = await Promise.all([
  lireArticlesQuantites(db,clientId,true),lireLots(db,clientId,'labo'),lireSites(db,clientId),
  lirePages<{id:string;code:string;nom:string;produit_id:string|null}>((a,b)=>db.from('recette_familles').select('id,code,nom,produit_id').eq('client_id',clientId).order('id').range(a,b)),
  lirePages<{id:string;famille_id:string;version:number;active:boolean;rendement_qte:number;rendement_unite:string;cuisson_perte_pct:number;mo_min:number;ingredients:ImpactRecipeLine[]}>((a,b)=>db.from('labo_recette_versions').select('id,famille_id,version,active,rendement_qte,rendement_unite,cuisson_perte_pct,mo_min,ingredients').eq('client_id',clientId).order('id').range(a,b)),
  lirePages<{unite_from:string;unite_to:string;facteur:number}>((a,b)=>db.from('conversions').select('unite_from,unite_to,facteur').eq('client_id',clientId).order('id').range(a,b)),
  lirePages<{id:string;numero:string;date_prevue:string;statut:string;qte_prevue:number;qte_realisee:number;client_ref:string|null;famille_id:string}>((a,b)=>db.from('labo_ordres_fabrication').select('id,numero,date_prevue,statut,qte_prevue,qte_realisee,client_ref,famille_id').eq('client_id',clientId).eq('date_prevue',targetDate).order('id').range(a,b)),
  lirePages<{id:string;numero:string;client_nom:string;date_event:string;nb_parts:number;statut:string;of_id:string|null}>((a,b)=>db.from('labo_cakes').select('id,numero,client_nom,date_event,nb_parts,statut,of_id').eq('client_id',clientId).eq('statut','confirme').gte('date_event',targetDate).lte('date_event',plusJours(targetDate,2)).order('id').range(a,b)),
  lirePages<{site_id:string;date_vente:string;source:string|null;lignes:unknown}>((a,b)=>db.from('labo_ventes_quantites').select('site_id,date_vente,source,lignes').eq('client_id',clientId).gte('date_vente',plusJours(targetDate,-28)).lt('date_vente',targetDate).order('id').range(a,b)),
  lirePages<{id:string;site_id:string;article_id:string;date_cible:string;qte:number;motif:string;demandeur:string;statut:RestockRequestItem['statut']}>((a,b)=>db.from('demandes_reassort').select('id,site_id,article_id,date_cible,qte,motif,demandeur,statut').eq('client_id',clientId).gte('date_cible',today).order('id').range(a,b)),
 ]);
 if(!articles||!lots||!sites||!families||!versions||!conversions||!orders||!cakes||!sales||!requests) return {error:'Données indisponibles ou trop nombreuses : le plan n’a pas été calculé.'} as const;
 const labSites=sites.filter(s=>s.type==='laboratoire'||s.type==='labo'), boutiques=sites.filter(s=>s.type==='boutique');
 if(labSites.length!==1||boutiques.length!==1) return {error:'Le calcul demande exactement un laboratoire et une boutique : la répartition multisite doit encore être validée.'} as const;
 const labSite=labSites[0], boutique=boutiques[0];
 const familyById=new Map(families.map(f=>[f.id,f]));
 const impactArticles:ImpactArticle[]=articles.map(a=>({id:a.id,code:a.code,nom:a.nom,unite:a.unite}));
 const allVersions:ImpactRecipeVersion[]=versions.flatMap(v=>{const f=familyById.get(v.famille_id);return f?[{id:v.id,familleId:f.id,familleCode:f.code,familleNom:f.nom,produitId:f.produit_id,pvHt:0,version:Number(v.version),active:v.active,rendementQte:Number(v.rendement_qte),rendementUnite:v.rendement_unite,cuissonPct:Number(v.cuisson_perte_pct),moMin:Number(v.mo_min),tauxHoraire:0,chargesPct:0,emballage:0,energie:0,fraisGeneraux:0,ingredients:Array.isArray(v.ingredients)?v.ingredients:[]}]:[];});
 if(allVersions.length!==versions.length) return {error:'Une famille de recette manque : le plan n’a pas été calculé.'} as const;
 if(!recettesPlanValides(allVersions,impactArticles)) return {error:'Une recette comporte des références manquantes, invalides ou cycliques : le plan n’a pas été calculé.'} as const;
 const conv:UnitConversion[]=conversions.map(c=>({uniteFrom:c.unite_from,uniteTo:c.unite_to,facteur:Number(c.facteur)}));
 const active=new Map<string,ImpactRecipeVersion>();
 for(const v of allVersions) if(v.active&&v.produitId&&(!active.has(v.produitId)||active.get(v.produitId)!.version<v.version)) active.set(v.produitId,v);
 let conversionIncomplete=false;
 const products:TomorrowProduct[]=articles.filter(a=>a.niveau==='produit').map(a=>{
  const v=active.get(a.id);if(!v)return {...a,seuil:Number(a.seuil),recipe:null};
  const expanded=expandRecipeNeeds({version:v,allVersions,articles:impactArticles,conversions:conv});
  if(expanded.missingConversions.length) conversionIncomplete=true;
  return {...a,seuil:Number(a.seuil),recipe:{recipeId:v.familleId,versionId:v.id,version:v.version,nom:v.familleNom,rendementBrut:v.rendementQte,moMin:v.moMin,besoinsSerie:expanded.needs.map(n=>({articleId:n.articleId,code:n.code,nom:n.nom,unite:n.unite,qty:n.qty}))}};
 });
 if(conversionIncomplete) return {error:'Conversion d’unité manquante dans une recette : le plan n’a pas été calculé.'} as const;
 const siteMap=new Map(sites.map(s=>[s.id,s]));
 const restockRequests:RestockRequestItem[]=requests.map(r=>({id:r.id,targetDate:r.date_cible,siteId:r.site_id,siteLabel:siteMap.get(r.site_id)?.label??'Boutique',articleId:r.article_id,qty:Number(r.qte),motif:r.motif??'',demandeur:r.demandeur??'',statut:r.statut}));
 const existingOrders:TomorrowExistingOf[]=orders.map(o=>({id:o.id,numero:o.numero,produitId:familyById.get(o.famille_id)?.produit_id??null,datePrevue:o.date_prevue,statut:o.statut,qtePrevue:Number(o.qte_prevue),qteRealisee:Number(o.qte_realisee),clientRef:o.client_ref}));
 const confirmedOrders:TomorrowConfirmedOrder[]=cakes.map(c=>({id:c.id,numero:c.numero,clientNom:c.client_nom,eventDate:c.date_event,productionDate:plusJours(c.date_event,-1),statut:c.statut,articleId:null,qty:Number(c.nb_parts),nbParts:Number(c.nb_parts),notes:null,ofNumero:c.of_id?'associé':null}));
 const salesRows:TomorrowSale[]=sales.filter(v=>v.site_id===boutique.id).map(v=>({date:v.date_vente,siteId:v.site_id,source:v.source,lignes:Array.isArray(v.lignes)?v.lignes.flatMap(l=>l?.articleId&&Number(l.qty)>0?[{articleId:String(l.articleId),qty:Number(l.qty)}]:[]):[]}));
 const plan=computeTomorrowLabPlan({targetDate,labSiteId:labSite.id,products,sales:salesRows,restockRequests,confirmedOrders,lots:lots.filter(l=>l.siteId===labSite.id||l.siteId===boutique.id).map(l=>({id:l.id,articleId:l.articleId,siteId:l.siteId,siteRole:l.siteId===labSite.id?'labo':'boutique',numero:l.numero,qte:l.qte,dlc:l.dlc,bloque:l.bloque})),existingOrders});
 return {targetDate,labSite,boutiqueSites:[boutique],products:products.map(p=>({id:p.id,code:p.code,nom:p.nom,unite:p.unite})),restockRequests,plan};
}
