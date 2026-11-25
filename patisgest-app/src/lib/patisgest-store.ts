/** Moteur de démonstration local. Aucune donnée n'est synchronisée avec Supabase. */
import type { PaymentMode } from './pos-cart.ts';
import type { CashDrawerDeclaration } from './reconciliation.ts';

export type Article = { id: string; code: string; nom: string; niveau: 'matiere' | 'sous_recette' | 'produit'; unite: string; seuil: number; prix: number; tva: number };
export type Lot = { id: string; articleId: string; site: string; numero: string; qte: number; pu: number; dlc: string; date: string; bloque: boolean; congele: boolean; costEstimated?: boolean; origin?: LotOrigin };
export type LotOrigin = {type:'purchase'; purchaseId:string; supplier:string} | {type:'production'; productionId:string} | {type:'transfer'; fromLotId:string; transferId:string};
export type Movement = { id: string; lotId: string; articleId: string; qte: number; reference: string; date: string };
export type SaleCartLine = { articleId: string; qty: number; unitPriceHT: number; vatPercent: number; totalHT: number; totalTTC: number; missing: number; lots: string[]; lotDetails: {lotId:string; qty:number}[] };
export type Sale = { id: string; numero?: string; articleId: string; qty: number; totalHT: number; totalTTC: number; missing: number; lots: string[]; lotDetails?: {lotId:string; qty:number}[]; lines?: SaleCartLine[]; modePaiement?: PaymentMode; date: string; source?: 'caisse'|'z-import'; unitPriceHT?:number; vatPercent?:number };
export type RestockRequest = { id: string; targetDate: string; site: string; articleId: string; qty: number; motif: string; demandeur: string; status: 'ouverte'|'planifiee'|'transferee'|'annulee'; ofId?: string; transferId?: string; createdAt: string };
export type State = { articles: Article[]; lots: Lot[]; movements: Movement[]; sales: Sale[]; suppliers: string[]; purchases: PurchaseOrder[]; productions: ProductionOrder[]; transfers: Transfer[]; recipes: Recipe[]; closings: DailyClosing[]; temperatures: TemperatureReading[]; cleanings: CleaningRecord[]; incidents: QualityIncident[]; cakes: CakeOrder[]; lotEvents: LotEvent[]; planningTasks: PlanningTask[]; dailyCapacity:number; zImports: ZImport[]; restockRequests?: RestockRequest[] };
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const id = () => crypto.randomUUID();
/** Arrondi monétaire au centime, calculé en centimes entiers : le total d'un ticket Z ou panier est toujours la somme exacte de ses lignes. */
const moneyCents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const roundMoney = (n: number) => moneyCents(n) / 100;
export const seed: State = {
  articles: [
    { id:'farine',code:'MAT-001',nom:'Farine pâtissière',niveau:'matiere',unite:'kg',seuil:10,prix:0,tva:19 },
    { id:'beurre',code:'MAT-002',nom:'Beurre',niveau:'matiere',unite:'kg',seuil:5,prix:0,tva:19 },
    { id:'sucre',code:'MAT-003',nom:'Sucre',niveau:'matiere',unite:'kg',seuil:8,prix:0,tva:19 },
    { id:'eclair',code:'PF-001',nom:'Éclair chocolat',niveau:'produit',unite:'pcs',seuil:10,prix:250,tva:19 },
  ],
  lots: [
    { id:'l1',articleId:'farine',site:'Labo',numero:'FAR-01',qte:25,pu:90,dlc:'2027-02-01',date:'2026-10-01',bloque:false,congele:false },
    { id:'l2',articleId:'farine',site:'Labo',numero:'FAR-02',qte:15,pu:100,dlc:'2027-04-01',date:'2026-11-01',bloque:false,congele:false },
    { id:'l3',articleId:'beurre',site:'Labo',numero:'BEU-01',qte:8,pu:700,dlc:'2027-01-01',date:'2026-11-01',bloque:false,congele:false },
    { id:'l4',articleId:'sucre',site:'Labo',numero:'SUC-01',qte:30,pu:120,dlc:'2027-06-01',date:'2026-11-01',bloque:false,congele:false },
    { id:'l5',articleId:'eclair',site:'Boutique',numero:'ECL-01',qte:20,pu:100,dlc:'2027-01-02',date:'2026-11-01',bloque:false,congele:false },
  ], movements: [], sales: [], suppliers: ['Moulins d’Oran', 'Laiterie El Bahdja', 'Épicerie Pro'], purchases:[], productions:[], transfers:[], recipes:[defaultRecipe()], closings:[], temperatures:[], cleanings:[], incidents:[], cakes:[], lotEvents:[], planningTasks:[], dailyCapacity:480, zImports:[], restockRequests:[]
};
/** Lots éligibles FEFO : exclut toujours les bloqués, et exclut les lots périmés (dlc < asOf) dès qu'une date de référence est fournie. */
export function fefo(lots: Lot[], articleId: string, site?: string, asOf?: string): Lot[] {
  return lots.filter(l => l.articleId === articleId && (!site || l.site === site) && !l.bloque && l.qte > 0 && (!asOf || !l.dlc || l.dlc >= asOf))
    .slice().sort((a,b) => Number(a.congele)-Number(b.congele) || (a.dlc || '9999').localeCompare(b.dlc || '9999') || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function receive(state: State, input: Omit<Lot, 'id'|'date'|'bloque'|'congele'>): State {
  if (!state.articles.some(a => a.id === input.articleId) || !input.numero.trim() || !positive(input.qte) || !Number.isFinite(input.pu) || input.pu < 0) throw new Error('Vérifiez le lot, la quantité et le prix.');
  const lot: Lot = { ...input, id:id(), date:today(), bloque:false, congele:false };
  return { ...state, lots:[...state.lots,lot], movements:[...state.movements,{id:id(), lotId:lot.id, articleId:lot.articleId, qte:lot.qte, reference:'Réception '+lot.numero, date:today()}] };
}
/** Vente panier multiproduit atomique et idempotente par ticket (exclut lots bloqués et périmés). */
export function sellCart(
  state: State,
  items: readonly { articleId: string; qty: number }[],
  opts: { ticket?: string; modePaiement?: PaymentMode; date?: string; site?: string } = {},
): State {
  const ticketId = (opts.ticket ?? '').trim() || id();
  // Idempotence : rejouer un ticket déjà enregistré retourne l'état intact, sans seconde sortie de stock.
  if (state.sales.some(s => s.id === ticketId)) return state;
  if (!items.length || items.length > 50) throw new Error('Le panier doit contenir entre 1 et 50 produits.');
  const modePaiement: PaymentMode = opts.modePaiement && ['especes','cheque_virement'].includes(opts.modePaiement) ? opts.modePaiement : 'especes';
  const saleDate = opts.date && isValidDate(opts.date) ? opts.date : today();
  const site = opts.site ?? 'Boutique';
  // Fusionner les doublons éventuels avant validation et déstockage.
  const merged = new Map<string, number>();
  for (const it of items) {
    if (!positive(it.qty)) throw new Error('Produit ou quantité invalide.');
    const nextQty = round4((merged.get(it.articleId) ?? 0) + it.qty);
    if (!positive(nextQty) || nextQty > 1e8) throw new Error('Produit ou quantité invalide.');
    merged.set(it.articleId, nextQty);
  }
  const validated = [...merged.entries()].map(([articleId, qty]) => {
    const article = state.articles.find(a => a.id === articleId && a.niveau === 'produit');
    if (!article || !Number.isFinite(article.prix) || article.prix <= 0 || !Number.isFinite(article.tva) || article.tva < 0 || article.tva > 100) {
      throw new Error('Produit, prix ou quantité invalide.');
    }
    return { article, qty };
  });
  let workingLots = state.lots;
  const newMovements: Movement[] = [];
  const saleLines: SaleCartLine[] = [];
  let sumHT = 0, sumTTC = 0, sumMissing = 0, sumQty = 0;
  const allLots: string[] = [];
  const allDetails: {lotId:string; qty:number}[] = [];

  for (const { article, qty } of validated) {
    let rest = qty;
    const used: { lot: Lot; qty: number }[] = [];
    for (const lot of fefo(workingLots, article.id, site, saleDate)) {
      if (rest <= 0) break;
      const take = round4(Math.min(rest, lot.qte));
      if (take <= 0) break;
      used.push({ lot, qty: take });
      rest = round4(rest - take);
    }
    workingLots = workingLots.map(l => {
      const u = used.find(x => x.lot.id === l.id);
      return u ? { ...l, qte: round4(l.qte - u.qty) } : l;
    });
    for (const u of used) {
      newMovements.push({ id: id(), lotId: u.lot.id, articleId: article.id, qte: -u.qty, reference: 'Vente ' + ticketId, date: saleDate });
      allLots.push(u.lot.numero);
      allDetails.push({ lotId: u.lot.id, qty: u.qty });
    }
    if (rest > 0) {
      newMovements.push({ id: id(), lotId: '', articleId: article.id, qte: -rest, reference: 'Écart de vente ' + ticketId, date: saleDate });
    }
    const cHT = moneyCents(qty * article.prix);
    const cTTC = moneyCents(qty * article.prix * (1 + article.tva / 100));
    sumHT += cHT;
    sumTTC += cTTC;
    sumMissing = round4(sumMissing + rest);
    sumQty = round4(sumQty + qty);
    saleLines.push({
      articleId: article.id,
      qty,
      unitPriceHT: article.prix,
      vatPercent: article.tva,
      totalHT: cHT / 100,
      totalTTC: cTTC / 100,
      missing: rest,
      lots: used.map(x => x.lot.numero),
      lotDetails: used.map(x => ({ lotId: x.lot.id, qty: x.qty })),
    });
  }

  const first = saleLines[0];
  const numero = `TK-${ticketId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const sale: Sale = {
    id: ticketId,
    numero,
    articleId: first.articleId,
    qty: saleLines.length === 1 ? first.qty : sumQty,
    totalHT: sumHT / 100,
    totalTTC: sumTTC / 100,
    missing: sumMissing,
    lots: allLots,
    lotDetails: allDetails,
    lines: saleLines,
    modePaiement,
    date: saleDate,
    source: 'caisse',
  };
  return { ...state, lots: workingLots, movements: [...state.movements, ...newMovements], sales: [sale, ...state.sales] };
}
export function sell(state: State, articleId: string, qty: number, modePaiement: PaymentMode = 'especes'): State {
  return sellCart(state, [{ articleId, qty }], { modePaiement });
}
/** Une version est figée ; chaque changement crée une nouvelle version active. */
export type RecipeIngredient = {articleId:string; qty:number; parage:number; unite?:string};
export type RecipeVersion = {version:number; baseYield:number; lossPercent:number; labourMinutes:number; hourlyRate:number; chargesPercent:number; packaging:number; energy:number; overhead:number; ingredients:RecipeIngredient[]};
export type Recipe = {id:string; name:string; productId:string; versions:RecipeVersion[]};
export type RecipeInput = Omit<RecipeVersion, 'version'>;
function defaultRecipe():Recipe {
  return {id:'recette-eclair',name:'Éclair chocolat',productId:'eclair',versions:[{version:1,baseYield:20,lossPercent:5,labourMinutes:60,hourlyRate:500,chargesPercent:25,packaging:200,energy:100,overhead:100,ingredients:[{articleId:'farine',qty:2,parage:0},{articleId:'beurre',qty:1,parage:5},{articleId:'sucre',qty:0.5,parage:0}]}]};
}
function unitFactor(from: string | undefined, to: string | undefined): number {
  const a = (from ?? '').trim().toLowerCase(), b = (to ?? '').trim().toLowerCase();
  if (!a || !b || a === b) return 1;
  if (a === 'g' && b === 'kg') return 0.001;
  if (a === 'kg' && b === 'g') return 1000;
  if (a === 'ml' && b === 'l') return 0.001;
  if (a === 'cl' && b === 'l') return 0.01;
  if (a === 'l' && b === 'ml') return 1000;
  return 1;
}
/** Parage augmente la consommation ; cuisson réduit le rendement ; coût hors TVA ; sous-recettes valorisées récursivement. */
export function recipeCost(state:State, recipeId='recette-eclair', versionNumber?:number, asOf=today(), depth=0): {
  lines: (RecipeIngredient & { id: string; article: string; unitPrice: number; costEstimated: boolean })[];
  materials: number; labour: number; packaging: number; energy: number; overhead: number; yieldNet: number; total: number; perUnit: number; missingPrices: string[];
} {
  const recipe=state.recipes.find(r=>r.id===recipeId);
  const version=versionNumber === undefined ? recipe?.versions.at(-1) : recipe?.versions.find(v=>v.version===versionNumber);
  if (!recipe || !version) throw new Error('Recette ou version introuvable.');
  const lines=version.ingredients.map(i=>{
    const art=state.articles.find(a=>a.id===i.articleId);
    const factor=unitFactor(i.unite, art?.unite);
    const lot=fefo(state.lots,i.articleId,'Labo',asOf)[0];
    if (lot && lot.pu > 0) {
      return {...i,id:i.articleId,article:art?.nom ?? i.articleId,unitPrice:lot.pu*factor,costEstimated:!!lot.costEstimated};
    }
    if (art?.niveau==='sous_recette' && depth < 3) {
      const sub=state.recipes.find(r=>r.productId===art.id);
      if (sub) {
        const subCost=recipeCost(state,sub.id,undefined,asOf,depth+1);
        return {...i,id:i.articleId,article:art.nom,unitPrice:subCost.perUnit*factor,costEstimated:subCost.missingPrices.length>0};
      }
    }
    return {...i,id:i.articleId,article:art?.nom ?? i.articleId,unitPrice:0,costEstimated:true};
  });
  const missingPrices=lines.filter(l=>l.costEstimated).map(l=>l.article);
  const materials=lines.reduce((sum,l)=>sum+l.qty*(1+l.parage/100)*l.unitPrice,0);
  const labour=version.labourMinutes/60*version.hourlyRate*(1+version.chargesPercent/100);
  const {packaging,energy,overhead}=version;
  const yieldNet=version.baseYield*(1-version.lossPercent/100);
  const total=materials+labour+packaging+energy+overhead;
  return {lines,materials,labour,packaging,energy,overhead,yieldNet,total,perUnit:total/yieldNet,missingPrices};
}
function validateRecipe(state:State, productId:string, name:string, input:RecipeInput) {
  if (!name.trim() || !state.articles.some(a=>a.id===productId && (a.niveau==='produit' || a.niveau==='sous_recette'))) throw new Error('Choisissez un nom et un produit fini.');
  if (!positive(input.baseYield) || !Number.isFinite(input.lossPercent) || input.lossPercent<0 || input.lossPercent>=100 || !Number.isFinite(input.chargesPercent) || input.chargesPercent<0 || input.chargesPercent>1000) throw new Error('Rendement, perte de cuisson ou charges invalide.');
  if ([input.labourMinutes,input.hourlyRate,input.packaging,input.energy,input.overhead].some(x=>!Number.isFinite(x)||x<0||x>1e9)) throw new Error('Les coûts et la durée doivent être positifs ou nuls.');
  if (!input.ingredients.length || input.ingredients.length>100) throw new Error('Ajoutez au moins un ingrédient (100 maximum).');
  const ids=new Set<string>();
  for (const item of input.ingredients) {
    if (item.articleId===productId || !state.articles.some(a=>a.id===item.articleId && (a.niveau==='matiere' || a.niveau==='sous_recette')) || ids.has(item.articleId) || !positive(item.qty) || !Number.isFinite(item.parage) || item.parage<0 || item.parage>100) throw new Error('Ingrédient invalide ou en double : utilisez une matière, une quantité positive et un parage de 0 à 100 %.');
    ids.add(item.articleId);
  }
}
export function createRecipe(state:State, name:string, productId:string, input:RecipeInput):State {
  validateRecipe(state,productId,name,input);
  if (state.recipes.some(r=>r.name.toLocaleLowerCase()===name.trim().toLocaleLowerCase())) throw new Error('Ce nom de recette existe déjà.');
  const recipe:Recipe={id:id(),name:name.trim(),productId,versions:[{...structuredClone(input),version:1}]};
  return {...state,recipes:[...state.recipes,recipe]};
}
export function addRecipeVersion(state:State, recipeId:string, input:RecipeInput):State {
  const recipe=state.recipes.find(r=>r.id===recipeId);
  if (!recipe) throw new Error('Recette introuvable.');
  validateRecipe(state,recipe.productId,recipe.name,input);
  const version={...structuredClone(input),version:Math.max(...recipe.versions.map(v=>v.version))+1};
  return {...state,recipes:state.recipes.map(r=>r.id===recipeId?{...r,versions:[...r.versions,version]}:r)};
}

/** Une commande de démonstration comporte une seule ligne, réceptionnable en plusieurs fois. */
export type PurchaseOrder = { id:string; numero:string; fournisseur:string; articleId:string; qty:number; received:number; pu:number; date:string; status:'commande'|'partiel'|'recu' };
export type Consumption = { articleId:string; lotId:string; numero:string; qty:number; pu:number; costEstimated?:boolean };
export type ProductionOrder = {
  id:string; numero:string; date:string; plannedDate?:string; planned:number; completed:number; status:'planifie'|'encours'|'partiel'|'termine'; clientRef?:string;
  snapshot:{ productId:string; name:string; version:number; baseYield:number; ingredients:{articleId:string; qty:number; parage:number; unite?:string}[]; overhead:number };
  consumption:Consumption[]; shortages:{articleId:string; qty:number}[]; producedLotIds:string[];
};
export type Transfer = { id:string; ref?:string; date:string; articleId:string; qty:number; from:string; to:string; lotIds:string[]; lotNumbers?:string[]; responsable?:string; motif?:string };

// Existing browser data from the first iteration can be opened without losing edits.
export function upgradeState(raw: State): State {
  return {...raw, purchases:raw.purchases ?? [], productions:raw.productions ?? [], transfers:raw.transfers ?? [], recipes:raw.recipes ?? [defaultRecipe()], closings:raw.closings ?? [], temperatures:raw.temperatures ?? [], cleanings:raw.cleanings ?? [], incidents:raw.incidents ?? [], cakes:raw.cakes ?? [], lotEvents:raw.lotEvents ?? [], planningTasks:raw.planningTasks ?? [], dailyCapacity:raw.dailyCapacity ?? 480, zImports:raw.zImports ?? [], restockRequests:raw.restockRequests ?? []};
}
const round4 = (n:number) => Math.round(n*10000)/10000;
const positive = (n:number) => Number.isFinite(n) && n >= 0.0001 && Math.abs(round4(n)-n)<1e-9;
export function createPurchase(state:State, supplier:string, articleId:string, qty:number, pu:number):State {
  if (!state.suppliers.includes(supplier) || !state.articles.some(a=>a.id===articleId) || !positive(qty) || !Number.isFinite(pu) || pu<0) throw new Error('Fournisseur, article, quantité ou prix invalide.');
  const order:PurchaseOrder={id:id(),numero:`BC-${id().slice(0,8).toUpperCase()}`,fournisseur:supplier,articleId,qty,received:0,pu,date:today(),status:'commande'};
  return {...state,purchases:[...(state.purchases ?? []),order]};
}
export function receivePurchase(state:State, orderId:string, qty:number, numero:string, dlc:string, site:string):State {
  const order=(state.purchases ?? []).find(o=>o.id===orderId);
  if (!order || order.status==='recu' || !positive(qty) || qty > round4(order.qty-order.received) || !['Labo','Boutique'].includes(site)) throw new Error('Quantité supérieure au reste à recevoir ou commande invalide.');
  const next=receive(state,{articleId:order.articleId,site,numero:numero.trim(),qte:qty,pu:order.pu,dlc});
  const received=round4(order.received+qty);
  const receivedLotId=next.lots[next.lots.length-1].id;
  return {...next,lots:next.lots.map(l=>l.id===receivedLotId?{...l,origin:{type:'purchase',purchaseId:order.id,supplier:order.fournisseur}}:l),movements:next.movements.map((m,i)=>i===next.movements.length-1?{...m,reference:`Réception ${order.numero} · ${numero}`} :m),purchases:state.purchases.map(o=>o.id===orderId?{...o,received,status:received>=o.qty?'recu':'partiel'}:o)};
}
export function createProduction(state:State, qty:number, recipeId='recette-eclair', plannedDate=today(), clientRef?:string, recipeVersion?:number):State {
  if (!isValidDate(plannedDate)) throw new Error('Date prévue invalide.');
  if (!positive(qty)) throw new Error('La quantité prévue doit être positive.');
  const cleanRef = (clientRef ?? '').trim();
  // Idempotence : valider deux fois une proposition « Demain au labo » ne crée jamais de doublon.
  if (cleanRef && (state.productions ?? []).some(o => o.clientRef === cleanRef)) return state;
  const recipe=state.recipes.find(r=>r.id===recipeId), version=recipeVersion === undefined ? recipe?.versions.at(-1) : recipe?.versions.find(v=>v.version===recipeVersion);
  if (!recipe || !version) throw new Error('Recette introuvable.');
  validateRecipe(state,recipe.productId,recipe.name,version);
  const snapshot:ProductionOrder['snapshot']={productId:recipe.productId,name:recipe.name,version:version.version,baseYield:version.baseYield,ingredients:structuredClone(version.ingredients),overhead:version.labourMinutes/60*version.hourlyRate*(1+version.chargesPercent/100)+version.packaging+version.energy+version.overhead};
  const order:ProductionOrder={id:id(),numero:`OF-${id().slice(0,8).toUpperCase()}`,date:today(),plannedDate,planned:qty,completed:0,status:'planifie',...(cleanRef?{clientRef:cleanRef}:{}),snapshot,consumption:[],shortages:[],producedLotIds:[]};
  return {...state,productions:[...(state.productions ?? []),order]};
}
/** Consomme des lots FEFO éligibles (non bloqués, non périmés) au coût réel ; les manques sont explicitement journalisés. */
function consume(state:State, articleId:string, qty:number, site:string, reference:string, asOf=today()) {
  let remaining=qty;
  const used:Consumption[]=[];
  for (const lot of fefo(state.lots,articleId,site,asOf)) {
    if (remaining<=0) break;
    const take=round4(Math.min(remaining,lot.qte));
    if (take<=0) break;
    used.push({articleId,lotId:lot.id,numero:lot.numero,qty:take,pu:lot.pu,costEstimated:lot.costEstimated || lot.pu<=0});
    remaining=round4(remaining-take);
  }
  const movements:Movement[]=used.map(u=>({id:id(),lotId:u.lotId,articleId,qte:-u.qty,reference,date:asOf}));
  if (remaining>0) movements.push({id:id(),lotId:'',articleId,qte:-remaining,reference:reference+' — manquant',date:asOf});
  const next={...state,lots:state.lots.map(l=>{const u=used.find(x=>x.lotId===l.id);return u?{...l,qte:round4(l.qte-u.qty)}:l;}),movements:[...state.movements,...movements]};
  return {next,used,missing:remaining};
}
export function startProduction(state:State, orderId:string):State {
  const order=(state.productions ?? []).find(o=>o.id===orderId);
  if (!order || order.status!=='planifie') throw new Error('Cet ordre ne peut pas être lancé.');
  let next=state; const all:Consumption[]=[]; const shortages:ProductionOrder['shortages']=[];
  for (const ing of order.snapshot.ingredients) {
    const art=next.articles.find(a=>a.id===ing.articleId);
    const qty=round4(ing.qty*unitFactor(ing.unite,art?.unite)*(order.planned/order.snapshot.baseYield)*(1+ing.parage/100));
    const result=consume(next,ing.articleId,qty,'Labo',order.numero,today());
    next=result.next; all.push(...result.used);
    if (result.missing>0) shortages.push({articleId:ing.articleId,qty:result.missing});
  }
  return {...next,productions:next.productions.map(o=>o.id===orderId?{...o,status:'encours',consumption:all,shortages}:o)};
}
export function completeProduction(state:State, orderId:string, qty:number, numero:string, dlc:string):State {
  const order=(state.productions ?? []).find(o=>o.id===orderId);
  if (!order || !['encours','partiel'].includes(order.status) || !positive(qty) || qty>round4(order.planned-order.completed)) throw new Error('Quantité ou état de production invalide.');
  const knownMaterial=order.consumption.reduce((sum,c)=>sum+c.qty*c.pu,0);
  // Known cost only: shortages are never silently treated as a verified real cost.
  const cost=(knownMaterial+order.snapshot.overhead*order.planned/order.snapshot.baseYield)/order.planned;
  const next=receive(state,{articleId:order.snapshot.productId,site:'Labo',numero:numero.trim(),qte:qty,pu:cost,dlc});
  const lotId=next.lots[next.lots.length-1].id, completed=round4(order.completed+qty);
  // An in-progress order must not create an available lot after a consumed lot was blocked.
  const blockedInput=order.consumption.some(c=>state.lots.find(l=>l.id===c.lotId)?.bloque);
  const event:LotEvent={id:id(),at:new Date().toISOString(),lotId,action:'bloque',reason:`Production ${order.numero} : un lot consommé est bloqué`};
  return {...next,lotEvents:blockedInput?[...next.lotEvents,event]:next.lotEvents,movements:next.movements.map((m,i)=>i===next.movements.length-1?{...m,reference:`Production ${order.numero} · ${numero}`} :m),lots:next.lots.map(l=>l.id===lotId?{...l,bloque:blockedInput,costEstimated:order.shortages.length>0||order.consumption.some(c=>c.costEstimated),origin:{type:'production',productionId:order.id}}:l),productions:next.productions.map(o=>o.id===orderId?{...o,completed,status:completed>=o.planned?'termine':'partiel',producedLotIds:[...o.producedLotIds,lotId]}:o)};
}
export function transferStock(
  state:State,
  articleId:string,
  qty:number,
  from:string,
  to:string,
  meta: { responsable?: string; motif?: string; asOf?: string } = {},
):State {
  if (!state.articles.some(a=>a.id===articleId) || !positive(qty) || !['Labo','Boutique'].includes(from) || !['Labo','Boutique'].includes(to) || from===to) throw new Error('Transfert invalide.');
  const refDate = meta.asOf && isValidDate(meta.asOf) ? meta.asOf : today();
  const available=fefo(state.lots,articleId,from,refDate).reduce((n,l)=>n+l.qte,0);
  // Transfers cannot fabricate inventory nor move blocked/expired stock.
  if (qty>round4(available)) throw new Error('Stock éligible insuffisant pour ce transfert (lots bloqués ou périmés exclus).');
  const responsable = (meta.responsable ?? '').trim().slice(0, 80);
  const motif = (meta.motif ?? '').trim().slice(0, 160);
  const transferId=id(), ref=`TR-${transferId.replace(/-/g,'').slice(0,8).toUpperCase()}`;
  const result=consume(state,articleId,qty,from,'Transfert '+transferId,today());
  let next=result.next; const lotIds:string[]=[]; const lotNumbers:string[]=[];
  for (const used of result.used) {
    const source=state.lots.find(l=>l.id===used.lotId)!;
    lotNumbers.push(source.numero);
    next=receive(next,{articleId,site:to,numero:source.numero,qte:used.qty,pu:used.pu,dlc:source.dlc});
    // Preserve freeze status and link to source in the immutable movement reference.
    const newLot=next.lots[next.lots.length-1]; lotIds.push(newLot.id);
    next={...next,lots:next.lots.map(l=>l.id===newLot.id?{...l,congele:source.congele,costEstimated:source.costEstimated,origin:{type:'transfer',fromLotId:source.id,transferId}}:l),movements:next.movements.map(m=>m.lotId===newLot.id?{...m,reference:`Transfert ${transferId} depuis ${source.numero} (${source.id})${responsable ? ' · '+responsable : ''}`} :m)};
  }
  return {...next,transfers:[...(state.transfers ?? []),{id:transferId,ref,date:today(),articleId,qty,from,to,lotIds,lotNumbers,...(responsable?{responsable}:{}),...(motif?{motif}:{})} ]};
}

export function addRestockRequest(
  state: State,
  input: { targetDate: string; site?: string; articleId: string; qty: number; motif?: string; demandeur?: string },
): State {
  const site = input.site ?? 'Boutique';
  if (!isValidDate(input.targetDate) || site !== 'Boutique') throw new Error('Date cible ou boutique invalide.');
  if (!state.articles.some(a => a.id === input.articleId && a.niveau === 'produit') || !positive(input.qty) || input.qty > 1e8) {
    throw new Error('Produit ou quantité demandée invalide.');
  }
  const motif = (input.motif ?? '').trim().slice(0, 200);
  const demandeur = (input.demandeur ?? '').trim().slice(0, 80);
  const req: RestockRequest = {
    id: id(),
    targetDate: input.targetDate,
    site,
    articleId: input.articleId,
    qty: input.qty,
    motif,
    demandeur,
    status: 'ouverte',
    createdAt: new Date().toISOString(),
  };
  return { ...state, restockRequests: [req, ...(state.restockRequests ?? [])] };
}

export function updateRestockRequests(
  state: State,
  ids: readonly string[],
  status: RestockRequest['status'],
  link: { ofId?: string; transferId?: string } = {},
): State {
  if (!ids.length) return state;
  const target = new Set(ids);
  return {
    ...state,
    restockRequests: (state.restockRequests ?? []).map(r =>
      target.has(r.id) ? { ...r, status, ...(link.ofId ? { ofId: link.ofId } : {}), ...(link.transferId ? { transferId: link.transferId } : {}) } : r,
    ),
  };
}

export type ClosingInputLine = { articleId:string; produit:number; vendu:number; reporte:number; jete:number; casse:number; offert:number };
export type ClosingLine = ClosingInputLine & { name:string; unit:string; priceHT:number };
export type DailyClosing = { id:string; date:string; site:string; revision:number; lines:ClosingLine[]; caisseBilan?:CashDrawerDeclaration | null };
/** Les six flux produits et le comptage espèces facultatif sont saisis séparément : ils ne modifient ni stocks ni ventes. */
export function addDailyClosing(state:State, date:string, site:string, lines:ClosingInputLine[], revise=false, caisseBilan:CashDrawerDeclaration | null = null):State {
  if (!isValidDate(date) || !['Labo','Boutique'].includes(site)) throw new Error('Date ou site invalide.');
  const previous=state.closings.filter(c=>c.date===date&&c.site===site);
  if (previous.length && !revise) throw new Error('Une clôture existe déjà pour ce site et cette date. Cochez la case de correction pour créer une nouvelle révision.');
  if (!lines.length || lines.length>100) throw new Error('Ajoutez au moins un produit (100 maximum).');
  const ids=new Set<string>();
  const snapshots=lines.map(line=>{
    const article=state.articles.find(a=>a.id===line.articleId && a.niveau==='produit');
    if (!article || ids.has(line.articleId) || [line.produit,line.vendu,line.reporte,line.jete,line.casse,line.offert].some(n=>!Number.isFinite(n) || n<0 || n>1e9 || Math.abs(round4(n)-n)>1e-9)) throw new Error('Produit en double ou quantité invalide (0 ou plus, quatre décimales maximum).');
    if (!Number.isFinite(article.prix) || article.prix<0) throw new Error('Prix du produit invalide.');
    ids.add(line.articleId);
    return {...line, name:article.nom, unit:article.unite, priceHT:article.prix};
  });
  const closing:DailyClosing={id:id(),date,site,revision:previous.length?Math.max(...previous.map(c=>c.revision))+1:1,lines:snapshots,...(caisseBilan?{caisseBilan}:{})};
  return {...state,closings:[...state.closings,closing]};
}
export function closingStats(closing:DailyClosing) {
  const unitSet=new Set(closing.lines.map(l=>l.unit));
  const totals=closing.lines.reduce((acc,l)=>({produit:acc.produit+l.produit,vendu:acc.vendu+l.vendu,reporte:acc.reporte+l.reporte,jete:acc.jete+l.jete,casse:acc.casse+l.casse,offert:acc.offert+l.offert,caHT:acc.caHT+l.vendu*l.priceHT,manque:acc.manque+(l.jete+l.casse)*l.priceHT}),{produit:0,vendu:0,reporte:0,jete:0,casse:0,offert:0,caHT:0,manque:0});
  return {...totals,caHT:roundMoney(totals.caHT),manque:roundMoney(totals.manque),unit:unitSet.size===1?closing.lines[0].unit:null,lossRate:unitSet.size===1 && totals.produit>0?(totals.jete+totals.casse)/totals.produit*100:null};
}

/** Registre HACCP de démonstration : seuil maximum saisi par l'utilisateur, pas un avis réglementaire. */
export type TemperatureReading = {id:string; date:string; equipment:string; max:number; temperature:number; agent:string};
export type CleaningRecord = {id:string; date:string; zone:string; done:boolean; agent:string};
export type QualityIncident = {id:string; date:string; type:string; description:string; lotId:string; lotNumero:string; action:string; status:'ouverte'|'cloturee'; history:{at:string;status:'ouverte'|'cloturee';action:string}[]};
export type IncidentInput = Pick<QualityIncident,'date'|'type'|'description'|'lotId'|'action'>;
function isValidDate(date:string):boolean {return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;}
function requiredText(s:string,max:number) {return typeof s==='string' && s.trim().length>0 && s.trim().length<=max;}
function optionalText(s:string,max:number) {return typeof s==='string' && s.trim().length<=max;}
export function addTemperature(state:State, input:Omit<TemperatureReading,'id'>):State {
  if (!isValidDate(input.date) || !requiredText(input.equipment,80) || !optionalText(input.agent,80) || !Number.isFinite(input.temperature) || !Number.isFinite(input.max) || input.temperature< -100 || input.temperature>200 || input.max< -100 || input.max>200) throw new Error('Relevé invalide : date, équipement et températures entre -100 et 200 °C requis.');
  return {...state,temperatures:[...state.temperatures,{...input,id:id(),equipment:input.equipment.trim(),agent:input.agent.trim()}]};
}
export function addCleaning(state:State, input:Omit<CleaningRecord,'id'>):State {
  if (!isValidDate(input.date) || !requiredText(input.zone,80) || !optionalText(input.agent,80) || typeof input.done!=='boolean') throw new Error('Nettoyage invalide : vérifiez la date et la zone.');
  return {...state,cleanings:[...state.cleanings,{...input,id:id(),zone:input.zone.trim(),agent:input.agent.trim()}]};
}
export function addIncident(state:State,input:IncidentInput):State {
  if (!isValidDate(input.date) || !requiredText(input.type,80) || !requiredText(input.description,500) || !optionalText(input.action,500)) throw new Error('Non-conformité invalide : date, type et description sont requis.');
  const lot=input.lotId ? state.lots.find(l=>l.id===input.lotId) : undefined;
  if (input.lotId && !lot) throw new Error('Lot introuvable.');
  const action=input.action.trim();
  const incident:QualityIncident={...input,id:id(),type:input.type.trim(),description:input.description.trim(),lotNumero:lot?.numero ?? '',action,status:'ouverte',history:[{at:new Date().toISOString(),status:'ouverte',action}]};
  return {...state,incidents:[...state.incidents,incident]};
}
export function updateIncident(state:State, incidentId:string, status:'ouverte'|'cloturee', action:string):State {
  const incident=state.incidents.find(n=>n.id===incidentId);
  if (!incident || !['ouverte','cloturee'].includes(status) || !optionalText(action,500)) throw new Error('Non-conformité ou action invalide.');
  if (status===incident.status) throw new Error('Statut déjà appliqué.');
  if (status==='cloturee' && !requiredText(action,500)) throw new Error('Renseignez une action corrective avant de clôturer.');
  const trimmed=action.trim();
  return {...state,incidents:state.incidents.map(n=>n.id===incidentId?{...n,status,action:trimmed,history:[...n.history,{at:new Date().toISOString(),status,action:trimmed}]}:n)};
}

export type CakeStatus = 'devis'|'acompte'|'confirme'|'produit'|'livre'|'annule';
export type CakeOption = {name:string; costCents:number; minutes:number};
export type CakeTask = {name:string; offset:number; dueDate:string; done:boolean};
export type CakePayment = {id:string; at:string; type:'acompte'|'solde'; cents:number};
export type CakeOrder = {id:string; numero:string; client:string; telephone:string; eventDate:string; portions:number; priceCents:number; options:CakeOption[]; notes:string; status:CakeStatus; payments:CakePayment[]; tasks:CakeTask[]; history:{at:string;status:CakeStatus}[]; recipeId?:string; recipeVersion?:number; productionQty?:number; ofId?:string};
export type CakeInput = Pick<CakeOrder,'client'|'telephone'|'eventDate'|'portions'|'priceCents'|'options'|'notes'> & {recipeId:string; productionQty:number};
const validCents=(n:number)=>Number.isSafeInteger(n) && n>=0 && n<=100_000_000_000;
/** Utilisez des centimes entiers pour ne pas franchir le seuil de 30 % par erreur d'arrondi. */
export function moneyToCents(value:string):number {
  if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(value.trim())) throw new Error('Montant invalide : au maximum deux décimales.');
  const [whole,decimal='']=value.trim().replace(',','.').split('.');
  const n=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  if (!validCents(n)) throw new Error('Montant trop élevé.');
  return n;
}
function cakeDate(eventDate:string, offset:number):string {
  const date=new Date(eventDate+'T00:00:00Z'); date.setUTCDate(date.getUTCDate()+offset);
  return date.toISOString().slice(0,10);
}
export function createCake(state:State,input:CakeInput):State {
  if (!requiredText(input.client,100) || !optionalText(input.telephone,40) || !optionalText(input.notes,500) || (!isValidDate(input.eventDate) || input.eventDate<'2000-01-04') || !Number.isSafeInteger(input.portions) || input.portions<1 || input.portions>10000 || !validCents(input.priceCents) || input.priceCents===0) throw new Error('Vérifiez le client, la date, les parts et le prix HT strictement positif.');
  if (input.options.length>50 || input.options.some(o=>!requiredText(o.name,100) || !validCents(o.costCents) || !Number.isSafeInteger(o.minutes) || o.minutes<0 || o.minutes>100000)) throw new Error('Option invalide : nom, coût et durée sont requis.');
  const recipe=state.recipes.find(r=>r.id===input.recipeId), version=recipe?.versions.at(-1);
  if (!recipe || !version || (!positive(input.productionQty) || input.productionQty>100000000 || Math.round(input.productionQty*1000)/1000!==input.productionQty)) throw new Error('Recette et quantité à fabriquer obligatoires.');
  validateRecipe(state,recipe.productId,recipe.name,version);
  const cake:CakeOrder={...input,recipeVersion:version.version,client:input.client.trim(),telephone:input.telephone.trim(),notes:input.notes.trim(),options:input.options.map(o=>({...o,name:o.name.trim()})),id:id(),numero:`DEV-${id().slice(0,8).toUpperCase()}`,status:'devis',payments:[],tasks:[{name:'Achats matières et supports',offset:-3,dueDate:cakeDate(input.eventDate,-3),done:false},{name:'Production',offset:-1,dueDate:cakeDate(input.eventDate,-1),done:false},{name:'Livraison / retrait',offset:0,dueDate:input.eventDate,done:false}],history:[{at:new Date().toISOString(),status:'devis'}]};
  return {...state,cakes:[...state.cakes,cake]};
}
/** Complète un ancien devis sans modifier les commandes déjà confirmées. */
export function assignCakeProduction(state:State,cakeId:string,recipeId:string,productionQty:number):State {
  const cake=state.cakes.find(c=>c.id===cakeId);
  if (!cake || !['devis','acompte'].includes(cake.status) || cake.ofId) throw new Error('Devis non modifiable.');
  const recipe=state.recipes.find(r=>r.id===recipeId), version=recipe?.versions.at(-1);
  if (!recipe || !version || (!positive(productionQty) || productionQty>100000000 || Math.round(productionQty*1000)/1000!==productionQty)) throw new Error('Recette et quantité à fabriquer obligatoires.');
  validateRecipe(state,recipe.productId,recipe.name,version);
  return {...state,cakes:state.cakes.map(c=>c.id===cakeId?{...c,recipeId,recipeVersion:version.version,productionQty}:c)};
}
export function cakeTotals(cake:CakeOrder) {
  const deposit=cake.payments.filter(p=>p.type==='acompte').reduce((sum,p)=>sum+p.cents,0);
  const paid=cake.payments.reduce((sum,p)=>sum+p.cents,0);
  const required=Math.ceil(cake.priceCents*30/100);
  return {deposit,paid,required,balance:cake.priceCents-paid,optionsCost:cake.options.reduce((sum,o)=>sum+o.costCents,0),minutes:cake.options.reduce((sum,o)=>sum+o.minutes,0)};
}
/** Simulation seulement : aucun paiement réel ni écriture en caisse. */
export function payCake(state:State,cakeId:string,cents:number):State {
  const cake=state.cakes.find(c=>c.id===cakeId);
  if (!cake || !['devis','acompte','confirme','produit'].includes(cake.status) || !validCents(cents) || cents===0) throw new Error('Paiement ou statut invalide.');
  const total=cakeTotals(cake);
  if (cents>total.balance) throw new Error('Le montant dépasse le solde restant.');
  const payment:CakePayment={id:id(),at:new Date().toISOString(),type:cake.status==='devis'||cake.status==='acompte'?'acompte':'solde',cents};
  const status:CakeStatus=cake.status==='devis'?'acompte':cake.status;
  return {...state,cakes:state.cakes.map(c=>c.id===cakeId?{...c,status,payments:[...c.payments,payment],history:status!==c.status?[...c.history,{at:payment.at,status}]:c.history}:c)};
}
export function advanceCake(state:State,cakeId:string,next:CakeStatus):State {
  const cake=state.cakes.find(c=>c.id===cakeId);
  if (!cake) throw new Error('Devis introuvable.');
  if (next==='confirme' && ['confirme','produit','livre'].includes(cake.status) && cake.ofId) return state;
  const allowed:Record<CakeStatus,CakeStatus[]>={devis:['annule'],acompte:['confirme','annule'],confirme:['produit','annule'],produit:['livre','annule'],livre:[],annule:[]};
  if (!allowed[cake.status].includes(next)) throw new Error('Transition de statut impossible.');
  const totals=cakeTotals(cake);
  if (next==='confirme' && totals.deposit<totals.required) throw new Error('Acompte insuffisant : au moins 30 % du prix HT sont requis.');
  if (next==='annule' && cake.ofId) throw new Error('Un OF est lié : traitez son devenir au laboratoire avant toute annulation.');
  if (next==='produit' && cake.ofId && !state.productions.some(o=>o.id===cake.ofId && o.status==='termine' && o.producedLotIds.length>0)) throw new Error('Terminez l’OF et créez le lot avant de marquer produit.');
  if (next==='livre' && totals.balance!==0) throw new Error('Le solde doit être entièrement enregistré avant de marquer livré / soldé.');
  let updated=state; let ofId=cake.ofId;
  if (next==='confirme') {
    if (!cake.recipeId || cake.recipeVersion===undefined || !cake.productionQty) throw new Error('Associez une recette et une quantité avant confirmation.');
    const ref=`cake:${cake.id}`;
    updated=createProduction(state,cake.productionQty,cake.recipeId,cake.eventDate,ref,cake.recipeVersion);
    ofId=updated.productions.find(o=>o.clientRef===ref)?.id;
    if (!ofId) throw new Error('Création de l’ordre impossible.');
  }
  const event={at:new Date().toISOString(),status:next};
  return {...updated,cakes:updated.cakes.map(c=>c.id===cakeId?{...c,status:next,ofId,history:[...c.history,event]}:c)};
}
export function setCakeTask(state:State,cakeId:string,index:number,done:boolean):State {
  const cake=state.cakes.find(c=>c.id===cakeId);
  if (!cake || cake.status==='annule' || cake.status==='livre' || !Number.isInteger(index) || index<0 || index>=cake.tasks.length || typeof done!=='boolean') throw new Error('Tâche ou commande invalide.');
  return {...state,cakes:state.cakes.map(c=>c.id===cakeId?{...c,tasks:c.tasks.map((t,i)=>i===index?{...t,done}:t)}:c)};
}

export type LotEvent = {id:string; at:string; lotId:string; action:'bloque'|'debloque'; reason:string};
/** Sélection et recherches sur identifiants, jamais par numéro de lot non unique. */
export function traceLot(state:State, lotId:string) {
  if (!state.lots.some(l=>l.id===lotId)) throw new Error('Lot introuvable.');
  const affected=new Set<string>([lotId]); const orders=new Set<string>(); const transfers=new Set<string>();
  const pending=[lotId];
  while (pending.length) {
    const current=pending.shift()!;
    for (const order of state.productions) {
      if (!order.consumption.some(c=>c.lotId===current)) continue;
      orders.add(order.id);
      for (const child of order.producedLotIds) if (state.lots.some(l=>l.id===child) && !affected.has(child)) {affected.add(child);pending.push(child);}
    }
    for (const child of state.lots) {
      if (child.origin?.type!=='transfer' || child.origin.fromLotId!==current) continue;
      transfers.add(child.origin.transferId);
      if (!affected.has(child.id)) {affected.add(child.id);pending.push(child.id);}
    }
  }
  const saleLinks=state.sales.flatMap(s=>{
    // Older sales have no structured list, but their movement references include the exact sale ID.
    const details=s.lotDetails ?? state.movements.filter(m=>m.reference===`Vente ${s.id}` && m.lotId).map(m=>({lotId:m.lotId,qty:-m.qte}));
    const matches=details.filter(d=>affected.has(d.lotId));
    return matches.length?[{sale:s,details:matches}]:[];
  });
  const legacyTransferLots=state.transfers.flatMap(t=>t.lotIds).filter(lotId=>state.lots.find(l=>l.id===lotId)?.origin?.type!=='transfer').length;
  const legacySales=state.sales.filter(s=>!s.lotDetails && s.lots.length>0 && !state.movements.some(m=>m.reference===`Vente ${s.id}` && m.lotId)).length;
  const missingProducedLots=state.productions.flatMap(o=>o.producedLotIds).filter(id=>!state.lots.some(l=>l.id===id)).length;
  return {lots:state.lots.filter(l=>affected.has(l.id)),orders:state.productions.filter(o=>orders.has(o.id)),transfers:state.transfers.filter(t=>transfers.has(t.id)),sales:saleLinks,legacyTransferLots,legacySales,missingProducedLots};
}
/** Blocage local uniquement, avec motif. Ne crée pas de notification ou de rappel réel. */
export function setLotBlocked(state:State,lotIds:string[],blocked:boolean,reason:string):State {
  if (typeof blocked!=='boolean' || !requiredText(reason,500) || !lotIds.length || lotIds.some(id=>!state.lots.some(l=>l.id===id))) throw new Error('Lot ou motif invalide.');
  const targets=new Set(lotIds), changed=state.lots.filter(l=>targets.has(l.id) && l.bloque!==blocked);
  if (!changed.length) throw new Error(blocked?'Les lots sélectionnés sont déjà bloqués.':'Les lots sélectionnés sont déjà débloqués.');
  const at=new Date().toISOString();
  const events:LotEvent[]=changed.map(l=>({id:id(),at,lotId:l.id,action:blocked?'bloque':'debloque',reason:reason.trim()}));
  return {...state,lots:state.lots.map(l=>targets.has(l.id)?{...l,bloque:blocked}:l),lotEvents:[...state.lotEvents,...events]};
}

export type PlanningTask={id:string; date:string; name:string; orderId:string; duration:number; responsible:string; done:boolean};
export function createPlanningTask(state:State,input:Omit<PlanningTask,'id'|'done'>):State {
  if (!isValidDate(input.date) || !requiredText(input.name,100) || !optionalText(input.responsible,100) || !Number.isInteger(input.duration) || input.duration<0 || input.duration>100000 || (input.orderId!=='' && !state.productions.some(o=>o.id===input.orderId))) throw new Error('Tâche invalide : vérifiez la date, le nom, la durée et l’ordre lié.');
  return {...state,planningTasks:[...state.planningTasks,{...input,id:id(),name:input.name.trim(),responsible:input.responsible.trim(),done:false}]};
}
export function markPlanningTask(state:State,taskId:string,done:boolean):State {
  if (typeof done!=='boolean' || !state.planningTasks.some(t=>t.id===taskId)) throw new Error('Tâche introuvable ou statut invalide.');
  return {...state,planningTasks:state.planningTasks.map(t=>t.id===taskId?{...t,done}:t)};
}
export function removePlanningTask(state:State,taskId:string):State {
  if (!state.planningTasks.some(t=>t.id===taskId)) throw new Error('Tâche introuvable.');
  return {...state,planningTasks:state.planningTasks.filter(t=>t.id!==taskId)};
}
export function setDailyCapacity(state:State,minutes:number):State {
  if (!Number.isInteger(minutes) || minutes<1 || minutes>100000) throw new Error('La capacité doit être un nombre entier de minutes entre 1 et 100 000.');
  return {...state,dailyCapacity:minutes};
}
export function rescheduleProduction(state:State,orderId:string,plannedDate:string):State {
  const order=state.productions.find(o=>o.id===orderId);
  if (!order || order.status!=='planifie' || !isValidDate(plannedDate)) throw new Error('Ordre non planifié ou date invalide.');
  return {...state,productions:state.productions.map(o=>o.id===orderId?{...o,plannedDate}:o)};
}
/** Besoins des OF planifiés jusqu'à la date choisie, non réservés, sur le stock Labo actuel. */
export function planningOverview(state:State,date:string) {
  if (!isValidDate(date)) throw new Error('Date invalide.');
  const tasks=state.planningTasks.filter(t=>t.date===date);
  const orders=state.productions.filter(o=>o.status==='planifie' && o.plannedDate && o.plannedDate<=date);
  const unscheduled=state.productions.filter(o=>o.status==='planifie' && !o.plannedDate);
  const need=new Map<string,number>();
  for (const order of orders) for (const ing of order.snapshot.ingredients) {
    const art=state.articles.find(a=>a.id===ing.articleId);
    const qty=round4(ing.qty*unitFactor(ing.unite,art?.unite)*(order.planned/order.snapshot.baseYield)*(1+ing.parage/100));
    need.set(ing.articleId,round4((need.get(ing.articleId) ?? 0)+qty));
  }
  const needs=Array.from(need,([articleId,required])=>{
    const available=round4(fefo(state.lots,articleId,'Labo',date).reduce((sum,l)=>sum+l.qte,0));
    return {articleId,required,available,missing:round4(Math.max(0,required-available))};
  });
  const load=tasks.reduce((sum,t)=>sum+t.duration,0), outstanding=tasks.filter(t=>!t.done).reduce((sum,t)=>sum+t.duration,0);
  return {tasks,orders,unscheduled,needs,load,outstanding,capacity:state.dailyCapacity,overloaded:load>state.dailyCapacity};
}

/** Simulation HT non persistée : la variation ne s'applique qu'aux matières. */
export function simulatePrice(state:State, recipeId:string, price:number, materialVariation:number) {
  if (!Number.isFinite(price) || price<0 || price>1e9 || !Number.isFinite(materialVariation) || materialVariation< -100 || materialVariation>1000) throw new Error('Prix HT ou variation matière invalide.');
  const cost=recipeCost(state,recipeId);
  if (cost.missingPrices.length) return {missingPrices:cost.missingPrices,result:null};
  const simulatedMaterials=cost.materials*(1+materialVariation/100);
  const simulatedTotal=simulatedMaterials+cost.labour+cost.packaging+cost.energy+cost.overhead;
  const unitCost=simulatedTotal/cost.yieldNet;
  const margin=price-unitCost;
  return {missingPrices:[],result:{baseUnitCost:cost.perUnit,simulatedMaterials,simulatedTotal,unitCost,margin,marginRate:price>0?margin/price*100:null,coefficient:unitCost>0?price/unitCost:null,suggestions:[2.5,3,3.5].map(coefficient=>({coefficient,price:unitCost*coefficient,margin:unitCost*(coefficient-1)}))}};
}

export type ZInputLine={code:string; qty:number; priceHT:number; articleId:string; vatPercent:number};
export type ZImport={id:string; date:string; site:'Boutique'; register:string; zNumber:string; lines:ZInputLine[]; totalHT:number; totalTTC:number; saleIds:string[]; importedAt:string};
export type ZPreview={lines:ZInputLine[]; totalHT:number; totalTTC:number; similar:ZImport[]};
/** Format strict : une ligne code;quantité;prix unitaire HT, sans en-tête ni guillemets. */
export function previewZ(state:State,date:string,register:string,zNumber:string,csv:string):ZPreview {
  if (!isValidDate(date) || !requiredText(register,80) || !requiredText(zNumber,80) || !requiredText(csv,50000)) throw new Error('Date, caisse, numéro Z et données sont obligatoires.');
  if (state.zImports.some(z=>z.date===date && z.site==='Boutique' && z.register.toLocaleUpperCase()===register.trim().toLocaleUpperCase() && z.zNumber.toLocaleUpperCase()===zNumber.trim().toLocaleUpperCase())) throw new Error('Ce numéro Z a déjà été importé pour cette caisse et cette date.');
  const rows=csv.split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
  if (!rows.length || rows.length>100) throw new Error('Ajoutez entre 1 et 100 lignes.');
  const lines=rows.map((row,index)=>{
    const parts=row.split(';').map(s=>s.trim());
    if (parts.length!==3 || !parts[0] || !/^\d+(?:[.,]\d{1,4})?$/.test(parts[1]) || !/^\d+(?:[.,]\d{1,2})?$/.test(parts[2])) throw new Error(`Ligne ${index+1} invalide : utilisez code;quantité;prix HT (sans en-tête).`);
    const qty=Number(parts[1].replace(',','.')), priceHT=Number(parts[2].replace(',','.'));
    if (!positive(qty) || qty>1e6 || !Number.isFinite(priceHT) || priceHT<0 || priceHT>1e9) throw new Error(`Quantité ou prix invalide à la ligne ${index+1}.`);
    const matches=state.articles.filter(a=>a.code.toLocaleUpperCase()===parts[0].toLocaleUpperCase() && a.niveau==='produit');
    if (matches.length!==1) throw new Error(`Code produit inconnu ou ambigu à la ligne ${index+1} : ${parts[0]}. Aucun import n'a été effectué.`);
    const article=matches[0];
    if (!Number.isFinite(article.tva) || article.tva<0 || article.tva>100) throw new Error(`TVA invalide pour ${article.code}.`);
    return {code:article.code,qty,priceHT,articleId:article.id,vatPercent:article.tva};
  });
  // Somme des lignes arrondies au centime : identique à la somme des ventes créées à l'import.
  const totalHT=lines.reduce((s,l)=>s+moneyCents(l.qty*l.priceHT),0)/100;
  const totalTTC=lines.reduce((s,l)=>s+moneyCents(l.qty*l.priceHT*(1+l.vatPercent/100)),0)/100;
  const similar=state.zImports.filter(z=>z.date===date && z.site==='Boutique' && Math.abs(z.totalHT-totalHT)<0.005);
  return {lines,totalHT,totalTTC,similar};
}
/** Toutes les lignes sont validées avant les mouvements : aucune ligne inconnue n'est ignorée. */
export function importZ(state:State,date:string,register:string,zNumber:string,csv:string,confirmSimilar=false):State {
  const preview=previewZ(state,date,register,zNumber,csv);
  if (preview.similar.length && !confirmSimilar) throw new Error('Un autre Z du même jour a le même total HT. Vérifiez et confirmez cet import distinct.');
  let next=state;const zId=id(), saleIds:string[]=[];
  for (const line of preview.lines) {
    const saleId=id(), reference=`Vente ${saleId}`;
    const result=consume(next,line.articleId,line.qty,'Boutique',reference,date);
    const sale:Sale={id:saleId,articleId:line.articleId,qty:line.qty,totalHT:moneyCents(line.qty*line.priceHT)/100,totalTTC:moneyCents(line.qty*line.priceHT*(1+line.vatPercent/100))/100,missing:result.missing,lots:result.used.map(u=>u.numero),lotDetails:result.used.map(u=>({lotId:u.lotId,qty:u.qty})),date,source:'z-import',unitPriceHT:line.priceHT,vatPercent:line.vatPercent};
    next={...result.next,sales:[sale,...result.next.sales]};saleIds.push(saleId);
  }
  const z:ZImport={id:zId,date,site:'Boutique',register:register.trim(),zNumber:zNumber.trim(),lines:preview.lines,totalHT:preview.totalHT,totalTTC:preview.totalTTC,saleIds,importedAt:new Date().toISOString()};
  return {...next,zImports:[...next.zImports,z]};
}
