import LabWorkspace from "@/components/lab-workspace";
import { lireModulesDesactives } from "@/lib/modules-access";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { canReadCosts, canWrite, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import DemoModule from "@/components/demo-module";
import ClotureForm from "@/components/cloture-form";
import QualityForms, { type NcRow } from "@/components/quality-forms";
import PlanningForms from "@/components/planning-forms";
import CakeForms from "@/components/cake-forms";
import CommandeForms from "@/components/commande-forms";
import TransferForm from "@/components/transfer-form";
import { IngredientImpactConnected, type QuickPriceAlert } from "@/components/ingredient-impact-panel";
import { TomorrowLabConnected } from "@/components/tomorrow-lab-panel";
import { computePriceAlerts } from "@/lib/price-alerts";
import { computeCashReconciliation, computeReconciliation, type CashDrawerDeclaration, type ClosingRecord, type SaleRecord } from "@/lib/reconciliation";
import { lireVentesPeriode } from "@/lib/workspace-read";
import { lireDemainAuLabo } from "@/lib/tomorrow-lab-server";
import { jourUTC, plusJours } from "@/lib/workspace-data";
import ReconPanel from "@/components/recon-panel";
import VersionForm, { type VersionRow } from "@/components/version-form";
import RecallForm from "@/components/recall-form";
import SimulationForm from "@/components/simulation-form";
import CostSheetForm from "@/components/cost-sheet-form";
import QualityAlertsPanel from "@/components/quality-alerts-panel";
import { computeQualityAlerts, type AlerteQualite } from "@/lib/quality-alerts";
import ExportPanel from "@/components/export-panel";
import { TABLES_EXPORT } from "@/lib/csv";
import { etapePourModule } from "@/lib/onboarding";
import ModuleGuide from "@/components/module-guide";
import FournisseurForm from "@/components/fournisseur-form";
import StockWorkspace from "@/components/stock-workspace";
import CashWorkspace from "@/components/cash-workspace";
import ProductionWorkspace from "@/components/production-workspace";
import { PageIntro } from "@/components/workspace-ui";

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

const moduleDescriptions: Partial<Record<Module, string>> = {
  achats: "Préparez les commandes et retrouvez vos fournisseurs.",
  recettes: "Organisez vos recettes et les versions utilisées en production.",
  simulation: "Comparez vos prix de vente et vos marges par produit.",
  transferts: "Retrouvez les mouvements de stock entre vos sites.",
  planning: "Préparez la journée et suivez les tâches du laboratoire.",
  tracabilite: "Retrouvez l’origine et les mouvements de chaque lot.",
  'cake-design': "Suivez les devis, acomptes et livraisons de gâteaux sur commande.",
  qualite: "Contrôlez vos températures, nettoyages et alertes.",
  cloture: "Faites le bilan des ventes et des pertes par site.",
};
const columnLabels: Record<string, string> = {
  numero: "Référence", nom: "Nom", statut: "État", code: "Code", qte: "Quantité", qte_rest: "Reste en stock", qte_init: "Quantité reçue",
  dlc: "DLC", date_reception: "Réception", pv_ht: "Prix de vente HT", prix_ht: "Montant HT", pu: "Prix unitaire", fait: "Terminé", bloque: "Bloqué",
  date_event: "Date de l’événement", client_nom: "Client", nb_parts: "Parts", rendement_qte: "Rendement", rendement_unite: "Unité",
  responsable: "Responsable", motif: "Motif", mode_paiement: "Règlement",
};
const readableValue = (value: unknown) => value == null ? '—' : typeof value === 'boolean' ? value ? 'Oui' : 'Non'
  : Array.isArray(value) ? value.every(v => typeof v === 'string') ? value.join(', ') || '—' : '—' : typeof value === 'object' ? '—' : String(value);


const modulesCout = new Set<Module>(['recettes', 'simulation']);
// Le récapitulatif liste les références, pas les ingrédients ni les coûts fournisseurs.
const tablesCout = {
  recette_familles: 'id, code, nom, produit_id',
  recette_versions: 'id, famille_id, version, active, rendement_qte, rendement_unite',
  parametres_couts: 'id',
  bons_commande: 'id, numero, statut, fournisseur_id, date_commande, notes',
  historique_prix: 'id, article_id, fournisseur_id, date_prix, pu',
} as const;
const colonnesLotsSansCout = 'id, numero, article_id, site_id, qte_init, qte_rest, dlc, date_reception, bloque';

function estTableCout(table: string): table is keyof typeof tablesCout {
  return Object.hasOwn(tablesCout, table);
}

async function buildQualiteAlerts(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string, role: 'proprietaire' | 'labo' | 'vendeur'): Promise<AlerteQualite[] | null> {
  const [tRes,nRes,ncRes,lotRes,articleRes,tkRes]=await Promise.all([
    supabase.from('releve_temperatures').select('frigo_nom,date_releve,temperature,seuil_max').eq('client_id',clientId).order('date_releve',{ascending:false}).limit(300),
    supabase.from('nettoyages').select('zone,date_nettoyage,fait').eq('client_id',clientId).order('date_nettoyage',{ascending:false}).limit(200),
    supabase.from('non_conformites').select('type,lot_numero,statut,date_nc').eq('client_id',clientId).order('date_nc',{ascending:false}).limit(200),
    supabase.from(role==='labo'?'labo_lots':role==='vendeur'?'vendeur_lots':'lots').select('numero,dlc,qte_rest,bloque,article_id').eq('client_id',clientId).gt('qte_rest',0).order('dlc').limit(500),
    supabase.from(role==='labo'?'labo_articles':'articles').select('id,code,nom').eq('client_id',clientId).limit(1000),
    supabase.from('taches_planning').select('tache,date_tache,fait').eq('client_id',clientId).order('date_tache',{ascending:false}).limit(200),
  ]);
  if(tRes.error||nRes.error||ncRes.error||lotRes.error||articleRes.error||tkRes.error) return null;
  const articles=new Map((articleRes.data??[]).map(a=>[a.id,a]));
  const lots=(lotRes.data??[]).flatMap(l=>{const a=articles.get(l.article_id);return a?[{numero:l.numero,code:a.code,nom:a.nom,dlc:l.dlc,qteRest:l.qte_rest,bloque:l.bloque}]:[];});
  return computeQualityAlerts({
    today: new Date().toISOString().slice(0,10),
    temperatures: (tRes.data??[]).map(t=>({frigoNom:t.frigo_nom,dateReleve:t.date_releve,temperature:t.temperature,seuilMax:t.seuil_max})),
    nettoyages: (nRes.data??[]).map(n=>({zone:n.zone,dateNettoyage:n.date_nettoyage,fait:n.fait})),
    nonConformites: (ncRes.data??[]).map(n=>({type:n.type,lotNumero:n.lot_numero,statut:n.statut,dateNc:n.date_nc})),
    lots,
    taches: (tkRes.data??[]).map(t=>({tache:t.tache,dateTache:t.date_tache,fait:t.fait})),
  });
}

function firstParam(v?: string | string[]): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
}

export default async function ModulePage({ params, searchParams }: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{
    guide?: string | string[];
    filtre?: string | string[];
    matiere?: string | string[];
    ancien?: string | string[];
    nouveau?: string | string[];
    demain?: string | string[];
  }>;
}) {
  const {module} = await params;
  if (!Object.hasOwn(modules,module)) notFound();
  const key=module as Module, info=modules[key], ctx=await requireSession();
  const modulesDesactives = await lireModulesDesactives(ctx);
  if (modulesDesactives === null) return <p role="alert">Les autorisations sont indisponibles. Réessayez ou contactez le propriétaire.</p>;
  if (modulesDesactives.has(key)) return <p role="alert">Ce module est désactivé pour votre compte. Contactez le propriétaire.</p>;
  const coutsAutorises = canReadCosts(ctx.role);
  if (modulesCout.has(key) && !coutsAutorises && !(ctx.role === 'labo' && key === 'recettes')) redirect('/tableau-de-bord');
  const recherche = await searchParams;
  const filtre = recherche.filtre === 'alerte' ? 'alerte' : undefined;
  let limitationSites: ReactNode = null;
  let tousSitesAutorises = true;
  if (ctx.mode === 'supabase' && ctx.role !== 'proprietaire' && ['achats','qualite','planning','tracabilite'].includes(key)) {
    let resultat: boolean | null = null;
    try {
      const {data,error}=await (await createClient()).rpc('patisgest_tous_sites_autorises');
      if (!error && typeof data === 'boolean') resultat=data;
    } catch { /* refuser si la vérification est indisponible */ }
    if (resultat === null) return <p role="alert">Vérification des sites indisponible. Contactez le propriétaire.</p>;
    if (!resultat) {
      tousSitesAutorises = false;
      if (key !== 'planning') return <p role="alert">Cette fonction utilise des données non attribuées à un site et reste indisponible sans accès à tous les sites. Contactez le propriétaire.</p>;
      limitationSites=<p role="status">Les tâches sans site sont indisponibles sans accès à tous les sites. Les demandes et ordres de vos sites restent accessibles.</p>;
    }
  }
  if (ctx.mode === 'supabase' && ctx.role === 'labo' && (key === 'recettes' || key === 'cake-design' || key === 'achats' || key === 'transferts' || key === 'tracabilite' || key === 'planning')) return <>{limitationSites}<LabWorkspace module={key} ctx={ctx} disabled={modulesDesactives} requestedDate={firstParam(recherche.demain)} tousSitesAutorises={tousSitesAutorises}/></>;
  if (ctx.mode === 'supabase' && ctx.role === 'labo' && !['stocks','production','qualite'].includes(key)) return <p role="alert">Ce module n’est pas encore disponible en vue laboratoire sans données financières.</p>;
  if (ctx.mode === 'pilote-local') return <DemoModule module={key} role={ctx.role} filtre={filtre} shop={ctx.clientNom}/>;
  const tables = info.tables.filter(([table]) => coutsAutorises || !estTableCout(table));
  const cleGuide = coutsAutorises && canWrite(ctx.role) ? etapePourModule(key, recherche.guide) : undefined;
  const supabase=await createClient();
  if (cleGuide) return <ModuleGuide key={cleGuide} cle={cleGuide} ctx={ctx} db={supabase} module={key} titre={info.title} />;
  if (key === 'stocks') return <StockWorkspace ctx={ctx} db={supabase} filtre={filtre}/>;
  if (key === 'caisse') return <CashWorkspace ctx={ctx} db={supabase}/>;
  if (key === 'production') return <ProductionWorkspace ctx={ctx} db={supabase}/>;
  const results=await Promise.all(tables.map(async ([table,label])=> {
    const colonnes = estTableCout(table) ? tablesCout[table] : '*';
    const source=ctx.role==='vendeur' ? (table==='lots' ? 'vendeur_lots' : table==='ordres_fabrication' ? 'vendeur_ordres_fabrication' : table) : table;
    const {data,error}=await supabase.from(source).select(colonnes).eq('client_id',ctx.clientId).limit(100)
      .overrideTypes<Record<string, unknown>[], { merge: false }>();
    return {label,data:table==='lots'&&!coutsAutorises?(data??[]).map(({pu: _pu,...rest})=>rest):data,error};
  }));
  let writeForms: ReactNode = null;
  if (key==='simulation' && coutsAutorises) {
    // Impact d'une hausse matière + fiche RC-01..RC-10 + simulation globale.
    const [famRes, sArtRes, histRes, fourRes]=await Promise.all([
      supabase.from('recette_familles').select('produit_id').eq('client_id',ctx.clientId),
      supabase.from('articles').select('id, code, nom, niveau, unite').eq('client_id',ctx.clientId).order('nom').limit(300),
      supabase.from('historique_prix').select('article_id, fournisseur_id, date_prix, pu').eq('client_id',ctx.clientId).order('date_prix',{ascending:false}).limit(300),
      supabase.from('fournisseurs').select('id, nom').eq('client_id',ctx.clientId),
    ]);
    const allArts=(sArtRes.data??[]) as {id:string;code:string;nom:string;niveau:string;unite:string}[];
    const artById=new Map(allArts.map(a=>[a.id,a]));
    const fourById=new Map(((fourRes.data??[]) as {id:string;nom:string}[]).map(f=>[f.id,f.nom]));
    const famProds=new Set(((famRes.data??[]) as {produit_id:string}[]).map(f=>f.produit_id));
    const sProduits=allArts
      .filter(a=>famProds.has(a.id))
      .map(a=>({id:a.id,label:`${a.code} · ${a.nom}`}));
    const histRows=((histRes.data??[]) as {article_id:string;fournisseur_id:string;date_prix:string;pu:number}[]);
    const rawAlerts=computePriceAlerts(histRows
      .map(h=>({articleId:h.article_id,fournisseurId:h.fournisseur_id,datePrix:h.date_prix,pu:Number(h.pu)})));
    const quickAlerts: QuickPriceAlert[]=rawAlerts.flatMap(al=>{
      const art=artById.get(al.articleId);
      if(!art||art.niveau==='produit') return [];
      const fNom=fourById.get(al.fournisseurId)??'Fournisseur';
      return [{articleId:al.articleId,label:`${art.code} · ${art.nom} (${fNom})`,ancienPu:al.previous,nouveauPu:al.latest,variationPct:al.deltaPct,sourceAncien:`Dernier prix ${fNom}`,sourceNouveau:`Réception du ${al.dateLatest} (${fNom})`}];
    });
    const alertByArt=new Map(quickAlerts.map(a=>[a.articleId,a]));
    const latestByArt=new Map<string,{pu:number;date:string;fNom:string}>();
    for(const h of histRows){if(!latestByArt.has(h.article_id)) latestByArt.set(h.article_id,{pu:Number(h.pu),date:h.date_prix,fNom:fourById.get(h.fournisseur_id)??'Fournisseur'});}
    const ingredients=allArts
      .filter(a=>a.niveau!=='produit')
      .map(a=>{
        const al=alertByArt.get(a.id);
        const lt=latestByArt.get(a.id);
        return {
          id:a.id,
          label:`${a.code} · ${a.nom}`,
          unite:a.unite||'u',
          defaultAncien:al?.ancienPu??lt?.pu??null,
          sourceAncien:al?.sourceAncien??(lt?`Réception ${lt.date} (${lt.fNom})`:undefined),
          defaultNouveau:al?.nouveauPu??null,
          sourceNouveau:al?.sourceNouveau,
        };
      });
    const pAnc = Number(firstParam(recherche.ancien));
    const pNouv = Number(firstParam(recherche.nouveau));
    writeForms=<>
      <IngredientImpactConnected
        ingredients={ingredients}
        alerts={quickAlerts}
        initialArticleId={firstParam(recherche.matiere)}
        initialAncien={Number.isFinite(pAnc) && pAnc >= 0 ? pAnc : undefined}
        initialNouveau={Number.isFinite(pNouv) && pNouv >= 0 ? pNouv : undefined}
      />
      <CostSheetForm produits={sProduits}/>
      <SimulationForm produits={sProduits} />
    </>;
  } else if (key==='transferts' && canWrite(ctx.role)) {
    const [tArtRes, tSitesRes] = await Promise.all([
      supabase.from('articles').select('id, code, nom, unite').eq('client_id', ctx.clientId).order('nom').limit(300),
      supabase.from('sites').select('id, nom').eq('client_id', ctx.clientId).order('nom'),
    ]);
    writeForms=<TransferForm
      articles={((tArtRes.data??[]) as {id:string;code:string;nom:string;unite:string}[]).map(a=>({id:a.id,label:`${a.code} · ${a.nom} (${a.unite})`}))}
      sites={((tSitesRes.data??[]) as {id:string;nom:string}[]).map(s=>({id:s.id,label:s.nom}))}
    />;
  } else if (key==='tracabilite') {
    // Rapport de rappel + blocage en cascade (lecture pour tous les rôles).
    const [lotRes,artRes]=await Promise.all([
      supabase.from(ctx.role==='vendeur'?'vendeur_lots':'lots').select('id,numero,article_id').eq('client_id',ctx.clientId).order('numero'),
      supabase.from('articles').select('id,nom,code').eq('client_id',ctx.clientId).limit(1000),
    ]);
    const arts=new Map((artRes.data??[]).map(a=>[a.id,a]));
    const lotRows=(lotRes.data??[]).flatMap(l=>{const a=arts.get(l.article_id); return a?[{id:l.id,label:`${l.numero} · ${a.code} ${a.nom}`}]:[];});
    writeForms=lotRes.error||artRes.error ? <p role="alert">Les lots de traçabilité sont indisponibles.</p> : <RecallForm lots={lotRows} />;
  } else if (key==='recettes' && coutsAutorises && canWrite(ctx.role)) {
    // Versions immuables : articles ou sous-recettes figées + activation.
    const artRes=await supabase.from('articles').select('id, code, nom, niveau, unite').eq('client_id',ctx.clientId).order('nom').limit(150);
    const verRes=await supabase.from('recette_versions')
      .select('id, famille_id, version, active, rendement_qte, rendement_unite, recette_familles!inner(nom, code, produit_id)')
      .eq('client_id',ctx.clientId).order('version',{ascending:false});
    const artRows=((artRes.data??[]) as {id:string;code:string;nom:string;niveau:string;unite:string}[]);
    const articles=artRows.map(a=>({id:a.id,label:`${a.code} · ${a.nom} (${a.unite})`}));
    const produits=artRows.map(a=>({id:a.id,label:`${a.code} · ${a.nom} — ${a.niveau}`}));
    type FamEmbed={nom:string;code:string;produit_id:string};
    const verRows=((verRes.data??[]) as {id:string;famille_id:string;version:number;active:boolean;rendement_qte:number;rendement_unite:string;recette_familles:FamEmbed|FamEmbed[]}[])
      .map(v=>({...v,fam:Array.isArray(v.recette_familles)?v.recette_familles[0]:v.recette_familles}))
      .filter(v=>v.fam);
    const famRows=((results.find(r=>r.label==='Recettes')?.data??[]) as {id:string;code:string;nom:string;produit_id:string}[]);
    const familles=famRows.map(f=>({id:f.id,label:`${f.code} — ${f.nom}`}));
    const subVersions=verRows.map(v=>({id:v.id,label:`${v.fam.nom} · v${v.version} (${v.rendement_qte} ${v.rendement_unite})`}));
    const versionRows: VersionRow[]=verRows.map(v=>({id:v.id,familleId:v.famille_id,version:v.version,active:v.active,label:`${v.fam.nom} · v${v.version} (${v.rendement_qte} ${v.rendement_unite})`}));
    writeForms=<VersionForm familles={familles} articles={articles} subVersions={subVersions} versions={versionRows} produits={produits} />;
  } else if (key==='cloture' && canWrite(ctx.role)) {
    // Clôture six flux + comptage tiroir-caisse séparé (repli pré-migration 21 sur caisse_bilan).
    const loadClotures = async () => {
      const full = await supabase
        .from('clotures')
        .select('id, date_cloture, site_id, revision, lignes, caisse_bilan')
        .eq('client_id', ctx.clientId)
        .order('date_cloture', { ascending: false })
        .limit(60);
      if (full.error && /caisse_bilan|column|42703/i.test(`${full.error.code ?? ''} ${full.error.message ?? ''}`)) {
        return supabase
          .from('clotures')
          .select('id, date_cloture, site_id, revision, lignes')
          .eq('client_id', ctx.clientId)
          .order('date_cloture', { ascending: false })
          .limit(60);
      }
      return full;
    };
    const [sitesRes,artRes,clotRes]=await Promise.all([
      supabase.from('sites').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
      supabase.from('articles').select('id, code, nom, pv_ht').eq('client_id',ctx.clientId).eq('niveau','produit').order('nom'),
      loadClotures(),
    ]);
    const siteLabels=Object.fromEntries(((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>[s.id,s.nom]));
    const clotures=((clotRes.data??[]) as {id:string;date_cloture:string;site_id:string;revision:number;lignes:{articleId:string;code?:string;name?:string;vendu:number}[];caisse_bilan?:CashDrawerDeclaration|null}[])
      .map(c=>({id:c.id,date:c.date_cloture,siteId:c.site_id,revision:c.revision,lignes:c.lignes??[],caisseBilan:c.caisse_bilan??null}) as ClosingRecord);
    const dates = clotures.map(c => c.date).filter(Boolean).sort();
    const ventesPeriode = dates.length > 0
      ? await lireVentesPeriode(supabase, ctx.clientId, dates[0], dates[dates.length - 1])
      : { rows: [], truncated: false };
    const venteRows = ventesPeriode?.rows ?? [];
    const sales: SaleRecord[] = venteRows.map(v=>({
      siteId:v.siteId,
      date:v.date,
      lignes:v.lignes,
      totalTTC:v.totalTTC,
      modePaiement:v.modePaiement,
      source:v.source,
    }));
    const recon=computeReconciliation(clotures,sales);
    const cashRecon=computeCashReconciliation(clotures,sales);
    writeForms=<>
      <ClotureForm
        sites={((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>({id:s.id,label:s.nom}))}
        articles={((artRes.data??[]) as {id:string;code:string;nom:string;pv_ht:number|null}[]).map(a=>({id:a.id,label:`${a.code} — ${a.nom} (${Number(a.pv_ht??0).toLocaleString('fr-FR')} DA HT)`}))}
      />
      <ReconPanel entries={recon} cashEntries={cashRecon} siteLabels={siteLabels} ventesTronquees={Boolean(ventesPeriode?.truncated)} ventesChargees={venteRows.length} />
      <ExportPanel tables={TABLES_EXPORT.filter(t=>!t.cout||canReadCosts(ctx.role)).map(t=>({cle:t.cle,titre:t.titre,cout:t.cout}))} />
    </>;
  } else if (key==='qualite' && canWrite(ctx.role)) {
    // HACCP : relevés/nettoyages/NC en RLS + clôture NC tracée (RPC maj_non_conformite)
    // + rappels qualité calculés côté serveur.
    const ncRows=((results.find(r=>r.label==='Non-conformités')?.data??[]) as {id:string;statut:string;type:string;description:string;action:string}[])
      .map(n=>({id:n.id,statut:n.statut,type:n.type,description:n.description,action:n.action}));
    const alertes=await buildQualiteAlerts(supabase, ctx.clientId, ctx.role);
    writeForms=<>{alertes ? <QualityAlertsPanel alerts={alertes}/> : <p role="alert">Alertes qualité indisponibles : vérifiez la connexion et les autorisations.</p>}<QualityForms ncs={ncRows}/></>;
  } else if (key==='qualite') {
    // Rappels qualité visibles même en lecture (vendeur).
    const alertes=await buildQualiteAlerts(supabase, ctx.clientId, ctx.role);
    writeForms=alertes ? <QualityAlertsPanel alerts={alertes}/> : <p role="alert">Alertes qualité indisponibles : vérifiez la connexion et les autorisations.</p>;
  } else if (key==='planning') {
    // « Demain au labo » (propriétaire/labo) + demandes de réassort boutique (tous rôles, y compris vendeur).
    const rawDate = firstParam(recherche.demain);
    const targetDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : plusJours(jourUTC(), 1);
    const demainData = await lireDemainAuLabo(supabase, ctx.clientId, ctx.role, targetDate);
    const planningSourcesDesactivees = ["stocks", "recettes", "production", "caisse", "cake-design"].some(m=>modulesDesactives.has(m));
    const tomorrowProps = {
      targetDate: demainData.targetDate,
      boutiqueSites: demainData.boutiqueSites,
      labSite: demainData.labSite,
      products: demainData.products,
      restockRequests: demainData.restockRequests,
      plan: planningSourcesDesactivees ? null : demainData.plan,
    };
    if (canWrite(ctx.role)) {
      const [tasksRes,ofsRes]=await Promise.all([
        supabase.from('taches_planning').select('id, date_tache, tache, of_numero, fait').eq('client_id',ctx.clientId).order('date_tache').limit(100),
        supabase.from('ordres_fabrication').select('numero').eq('client_id',ctx.clientId).order('numero',{ascending:false}).limit(50),
      ]);
      writeForms=<>
        {(demainData.erreur || planningSourcesDesactivees) && <p role="alert">{demainData.erreur ?? "Plan indisponible : un module source est désactivé."}</p>}
        <TomorrowLabConnected {...tomorrowProps} canValidate={canReadCosts(ctx.role)} canCreateOf={!modulesDesactives.has("production")} canTransfer={!modulesDesactives.has("transferts")} />
        {tousSitesAutorises && <PlanningForms
          tasks={((tasksRes.data??[]) as {id:string;date_tache:string;tache:string;of_numero:string;fait:boolean}[]).map(t=>({id:t.id,date:t.date_tache,tache:t.tache,ofNumero:t.of_numero,fait:t.fait}))}
          ofNumeros={((ofsRes.data??[]) as {numero:string}[]).map(o=>o.numero)}
        />}
      </>;
    } else {
      writeForms=<TomorrowLabConnected {...tomorrowProps} canValidate={false} />;
    }
  } else if (key==='cake-design') {
    const [recipeRes, siteRes, linkRes] = await Promise.all([
      supabase.rpc('cake_options_production'),
      supabase.from('sites').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
      supabase.rpc('cake_liens_production'),
    ]);
    const links = (linkRes.data ?? []) as {cake_id:string;of_numero:string;lots:{numero:string}[]}[];
    const cakeRows=((results.find(r=>r.label==='Devis et commandes')?.data??[]) as {id:string;numero:string;statut:string;client_nom:string;telephone:string|null;date_event:string;nb_parts:number;prix_ht:number;tva_pct:number;acompte:number;notes:string|null;cgv:boolean;cgv_version:string|null;version_id:string|null;of_id:string|null;origine?:string|null}[])
      .map(c=>{const lien=links.find(l=>l.cake_id===c.id);return {id:c.id,numero:c.numero,statut:c.statut,ofId:c.of_id??null,origineVitrine:c.origine==='vitrine',clientNom:c.client_nom,telephone:c.telephone,dateEvent:c.date_event,nbParts:c.nb_parts,prixHt:c.prix_ht,tvaPct:Number(c.tva_pct??0),acompte:c.acompte,notes:c.notes,cgv:c.cgv,cgvVersion:c.cgv_version,versionId:c.version_id,ofNumero:lien?.of_numero??null,lots:lien?.lots??[]};});
    writeForms=<CakeForms cakes={cakeRows} recipes={(recipeRes.data??[]) as {version_id:string;nom:string;version:number;rendement_qte:number;rendement_unite:string}[]} sites={(siteRes.data??[]) as {id:string;nom:string}[]} optionsError={Boolean(recipeRes.error || siteRes.error || linkRes.error)} role={ctx.role}/>;
  } else if (key==='achats' && canWrite(ctx.role)) {
    // BC multi-lignes + réceptions partielles/totales (RPC creer/recevoir_commande).
    const [artRes,sitesRes,histRes]=await Promise.all([
      supabase.from('articles').select('id, code, nom, pv_ht').eq('client_id',ctx.clientId).order('nom').limit(300),
      supabase.from('sites').select('id, nom').eq('client_id',ctx.clientId).order('nom'),
      supabase.from('historique_prix').select('article_id, fournisseur_id, date_prix, pu').eq('client_id',ctx.clientId).order('date_prix',{ascending:false}).limit(300),
    ]);
    const priceAlerts=computePriceAlerts(((histRes.data??[]) as {article_id:string;fournisseur_id:string;date_prix:string;pu:number}[])
      .map(h=>({articleId:h.article_id,fournisseurId:h.fournisseur_id,datePrix:h.date_prix,pu:Number(h.pu)})));
    const fourRows=((results.find(r=>r.label==='Fournisseurs')?.data??[]) as {id:string;nom:string}[]);
    const fourById=new Map(fourRows.map(f=>[f.id,f.nom]));
    const bcRes=await supabase.from('bons_commande').select('id, numero, statut, lignes, fournisseur_id').eq('client_id',ctx.clientId).order('numero',{ascending:false}).limit(100);
    const cmdRows=((bcRes.data??[]) as {id:string;numero:string;statut:string;lignes:{articleId:string;qte:number;pu:number;recu:number}[]|null;fournisseur_id:string}[]);
    writeForms=<><FournisseurForm /><CommandeForms
      alerts={priceAlerts}
      fournisseurs={fourRows.map(f=>({id:f.id,label:f.nom}))}
      articles={((artRes.data??[]) as {id:string;code:string;nom:string;pv_ht:number|null}[]).map(a=>({id:a.id,label:a.pv_ht&&Number(a.pv_ht)>0?`${a.code} — ${a.nom} (PV ${Number(a.pv_ht).toLocaleString('fr-FR')} DA HT)`:`${a.code} — ${a.nom}`}))}
      sites={((sitesRes.data??[]) as {id:string;nom:string}[]).map(s=>({id:s.id,label:s.nom}))}
      commandes={cmdRows.map(c=>({id:c.id,numero:c.numero,statut:c.statut,fournisseur:fourById.get(c.fournisseur_id)??"",lignes:c.lignes??[]}))}
    /></>;
  }
  return <>
    <PageIntro title={info.title} description={moduleDescriptions[key]}/>
    {limitationSites}
    <div className="pg-stack">{writeForms}{results.map(({label,data,error}) => {
      const cols = Object.keys(data?.[0] ?? {}).filter(k => !['id','created_at','updated_at','client_ref'].includes(k) && !k.endsWith('_id')
        && data?.some(r => r[k] != null && (typeof r[k] !== 'object' || Array.isArray(r[k]) && (r[k] as unknown[]).every(v => typeof v === 'string'))));
      return <section key={label} className="pg-card pg-card-pad"><div className="pg-card-head"><h2>{label}</h2></div>
        {error ? <p role="alert" className="text-sm text-red-700">Impossible de charger les données. Rechargez la page.</p> : data?.length && cols.length ?
          <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{cols.map(k => <th className="border-b p-2 text-xs text-slate-600" scope="col" key={k}>{columnLabels[k] ?? k.replaceAll('_',' ')}</th>)}</tr></thead>
          <tbody>{data.map((row,i) => <tr key={i}>{cols.map(k => <td key={k} className="max-w-xs wrap-anywhere border-b p-2 align-top">{readableValue(row[k])}</td>)}</tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">{data?.length ? 'Aucun détail à afficher.' : 'Aucun enregistrement.'}</p>}
      </section>;
    })}</div>
  </>;
}
