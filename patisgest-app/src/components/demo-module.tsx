"use client";
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { receive, type State, type Article } from '@/lib/patisgest-store';
import { canAccessModule, type Role } from '@/lib/permissions';
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
import FreeRecipesWorkspace from './free-recipes-workspace';
import KitchenLabScreen from './kitchen-lab-screen';
import ProductPhotoPicker from './product-photo-picker';
import InvoicePhotoIntake from './invoice-photo-intake';
import SellerBlindClosing from './seller-blind-closing';
import RestockRequestQuickForm from './restock-request-quick-form';
import {
  DEMO_OWNER_ALERTS_KEY_PREFIX,
  evaluateEmployeePriceSubmission,
  type OwnerPriceAlert,
} from '@/lib/owner-price-guard';
import { DEMO_SITES, demoLots, demoOrders } from '@/lib/demo-workspace';
import { jourLocal, stockArticle, indexLots } from '@/lib/workspace-data';
import { Disclosure, Notice, PageIntro } from './workspace-ui';

type Module = 'stocks'|'achats'|'recettes'|'caisse'|'production'|'transferts'|'cloture'|'qualite'|'cake-design'|'tracabilite'|'planning'|'simulation';
const field='pg-input';
const btn='pg-button';
const box='pg-card pg-card-pad';
export default function DemoModule({ module, role, filtre, shop }: { module: Module; role: Role; filtre?: string; shop?: string }) {
  const { data, save: persist } = useDemoWorkspace();
  const [message, setMessage] = useState('');
  function save(next: State) {
    if (persist(next)) return true;
    setMessage('Enregistrement local impossible.');
    return false;
  }
  if (!data) return <p role="status">Chargement de la démo…</p>;
  if (!canAccessModule(role, module)) {
    return (
      <Notice kind="warning">
        Ce module n’est pas disponible pour votre rôle.{" "}
        <Link href="/tableau-de-bord" className="font-bold underline">
          Retour au tableau de bord
        </Link>
      </Notice>
    );
  }
  const db=data;
  const isOwner = role === 'proprietaire';
  const isLabo = role === 'labo';
  const isSeller = role === 'vendeur';
  const canEdit = role !== 'vendeur';
  function addArticle(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const code=String(f.get('code')).trim();
    const nom=String(f.get('nom')).trim();
    if (!code||!nom||db.articles.some(a=>a.code.toLowerCase()===code.toLowerCase())) {setMessage('Code et nom requis ; le code doit être unique.'); return;}
    const prixTtc=Number(f.get('prix') ?? 0);
    const tva=isOwner ? Number(f.get('tva')??0) : 0;
    if (!Number.isFinite(prixTtc)||prixTtc<0||!Number.isFinite(tva)||tva<0||tva>100) {setMessage('Valeurs invalides.');return;}
    const prixHt = isOwner ? (tva>0?Math.round((prixTtc/(1+tva/100))*100)/100:prixTtc) : 0;
    const a:Article={id:crypto.randomUUID(),code,nom,niveau:String(f.get('niveau'))==='produit'?'produit':'matiere',unite:String(f.get('unite')).trim()||'pcs',seuil:Number(f.get('seuil')),prix:prixHt,tva};
    if (!Number.isFinite(a.seuil)||a.seuil<0) {setMessage('Valeurs invalides.');return;}
    if (save({...db,articles:[...db.articles,a]})) {
      if (isLabo && prixTtc > 0) {
        const alert = evaluateEmployeePriceSubmission({
          cibleType: "article",
          cibleId: a.id,
          nomProduit: a.nom,
          categorie: a.niveau === "produit" ? "gateau_entier" : "autre",
          prixSaisiDa: Math.round(prixTtc * 100) / 100,
          coutEstimeDa: null,
          auteurNom: "Labo",
          auteurRole: "labo",
        });
        if (alert) {
          try {
            const alertKey = `${DEMO_OWNER_ALERTS_KEY_PREFIX}demo`;
            const raw = window.localStorage.getItem(alertKey);
            const list: OwnerPriceAlert[] = raw ? JSON.parse(raw) : [];
            window.localStorage.setItem(alertKey, JSON.stringify([alert, ...(Array.isArray(list) ? list : [])]));
            window.dispatchEvent(new Event("patisgest-owner-alerts"));
          } catch {
            /* ignore */
          }
        }
        setMessage(`Article « ${a.nom} » créé (prix suggéré ${Math.round(prixTtc)} DA transmis au propriétaire pour validation).`);
      } else {
        setMessage(isLabo ? 'Article créé (en attente de prix par le propriétaire pour la caisse).' : 'Article ajouté localement.');
      }
      e.currentTarget.reset();
    }
  }
  function addLot(e:FormEvent<HTMLFormElement>) {e.preventDefault(); const f=new FormData(e.currentTarget); try {const next=receive(db,{articleId:String(f.get('article')),numero:String(f.get('numero')).trim(),site:String(f.get('site')),qte:Number(f.get('qte')),pu:isOwner?Number(f.get('pu')):0,dlc:String(f.get('dlc'))});if (save(next)) {e.currentTarget.reset();setMessage('Lot réceptionné localement.');}} catch(err){setMessage(err instanceof Error?err.message:'Erreur');}}
  const title={stocks:isSeller?'Stocks boutique & Réassort':'Stocks & Achats',achats:'Achats & fournisseurs',recettes:isOwner?'Recettes & Coûts':'Recettes & grammages',caisse:'Caisse rapide',production:'Production',transferts:'Transferts',cloture:isSeller?'Comptage de caisse':'Clôture & pertes',qualite:'HACCP & qualité','cake-design':'Commandes & Gâteaux',tracabilite:'Traçabilité des lots',planning:'Planning de production',simulation:'Simulation de prix'}[module];
  const descriptions: Partial<Record<Module, string>> = {
    stocks: isSeller
      ? "Consultez les quantités disponibles et demandez un réassort au laboratoire."
      : "Voyez ce qui manque en un coup d’œil et enregistrez vos achats ou réceptions.",
    caisse: "Grosses tuiles visuelles pour encaisser vite au comptoir.",
    recettes: isOwner
      ? "Écrivez vos recettes librement en DA, calculez vos moules et vos marges."
      : "Notez vos recettes, quantités et moules (sans coûts ni marges).",
    "cake-design": "Mariages, anniversaires, acomptes payés, reste à encaisser et WhatsApp client.",
    cloture: isSeller ? "Comptez les espèces de votre tiroir en fin de journée." : undefined,
  };
  const today = jourLocal();
  const lots = demoLots(db);
  const lotsByArt = indexLots(lots);
  const lowStocks = module === 'stocks'
    ? db.articles.map((a) => ({ a, ...stockArticle(a, lotsByArt.get(a.id) ?? [], today) })).filter((x) => x.signals.length > 0)
    : [];
  const stockSuggestions = module === 'recettes'
    ? db.articles.filter((a) => a.niveau === 'matiere').map((a) => {
        const latestLot = db.lots.filter((l) => l.articleId === a.id && l.pu > 0).at(-1);
        return { id: a.id, nom: a.nom, unite: a.unite, prixUnitaireDa: latestLot ? latestLot.pu : null };
      })
    : [];
  return <div className="pg-stack"><PageIntro title={title} label={module === "stocks" ? "Inventaire" : module === "caisse" ? "Boutique" : module === "production" ? "Laboratoire" : undefined}
    description={descriptions[module]}
    actions={
      module === "stocks" && canEdit ? (
        <a href="#nouvel-article" className="pg-button pg-button-secondary">Achat / Nouvel article</a>
      ) : module === "caisse" ? (
        <Link href="/cake-design" className="pg-button pg-button-secondary">Acomptes &amp; commandes →</Link>
      ) : module === "production" ? (
        <Link href="/planning#demain-au-labo" className="pg-button pg-button-secondary">Demain au labo →</Link>
      ) : undefined
    }/>
    {message && <p role="status" className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">{message}</p>}
    {module === 'stocks' && <>
      {lowStocks.length > 0 && (
        <Notice kind="warning">
          <b>{lowStocks.length} article{lowStocks.length > 1 ? 's' : ''} à surveiller / commander :</b>{' '}
          {lowStocks.slice(0, 5).map((x) => `${x.a.nom} (${x.quantity} ${x.a.unite})`).join(' · ')}
        </Notice>
      )}
      <StockList key={filtre ?? "tous"} articles={(isOwner ? db.articles : db.articles.map((a) => ({ ...a, prix: 0, tva: 0 }))).slice().sort((a,b) => a.nom.localeCompare(b.nom,"fr"))} lots={lots} sites={DEMO_SITES} today={today} filtre={filtre}/>
      {isSeller && (
        <RestockRequestQuickForm
          mode="demo"
          articles={db.articles.filter((a) => a.niveau === "produit").map((p) => ({ id: p.id, label: `${p.nom} · ${p.code}` }))}
          sites={DEMO_SITES.filter((s) => s.type === "boutique").map((s) => ({ id: s.id, label: s.label }))}
        />
      )}
      {canEdit && <div id="nouvel-article" className="pg-stack">
        <Disclosure title="Importer une facture / bon fournisseur (photo)" description="Prenez en photo ou dictez les lignes du bon, vérifiez, puis entrez en stock." icon="store">
          <InvoicePhotoIntake
            mode="demo"
            canReadCosts={isOwner}
            articles={db.articles.map((a) => ({ id: a.id, nom: a.nom, unite: a.unite }))}
            sites={DEMO_SITES}
            onDemoReceiveLines={(items) => {
              let next = db;
              for (const item of items) {
                next = receive(next, {
                  articleId: item.articleId,
                  numero: item.numero,
                  site: item.site,
                  qte: item.qte,
                  pu: isOwner ? item.pu : 0,
                  dlc: "",
                });
              }
              if (save(next)) {
                setMessage(`${items.length} ligne(s) ajoutée(s) au stock local.`);
              }
            }}
          />
        </Disclosure>
        <Disclosure title="Achat rapide / Réception de marchandise" description="Ajouter du stock reçu d’un fournisseur." icon="store">
          <form onSubmit={addLot} className="grid gap-3 sm:grid-cols-3">
            <label className="pg-field">Article<select name="article" className="pg-input">{db.articles.map(a=><option value={a.id} key={a.id}>{a.nom} ({a.unite})</option>)}</select></label>
            <label className="pg-field">N° Lot / Facture<input name="numero" placeholder="Ex : LOT-01" required className="pg-input"/></label>
            <label className="pg-field">Destination<select name="site" className="pg-input"><option>Labo</option><option>Boutique</option></select></label>
            <label className="pg-field">Quantité reçue<input name="qte" type="number" min="0.0001" step="any" placeholder="Quantité" required className="pg-input"/></label>
            {isOwner && <label className="pg-field">Prix d’achat unitaire (DA)<input name="pu" type="number" min="0" step="any" placeholder="DA" required className="pg-input"/></label>}
            <label className="pg-field">Date péremption (optionnel)<input name="dlc" type="date" className="pg-input"/></label>
            <div><button className="pg-button">Enregistrer l’entrée</button></div>
          </form>
        </Disclosure>
        <Disclosure title="Nouvel article" description={isLabo ? "Créer un produit fini ou un ingrédient (prix soumis au propriétaire)." : "Créer un produit fini ou un ingrédient."} icon="plus">
        <form onSubmit={addArticle} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="pg-field">Nom de l’article<input name="nom" required maxLength={120} placeholder="Mille-feuille" className="pg-input"/></label>
          <label className="pg-field">Code article<input name="code" required maxLength={40} placeholder="PF-005" className="pg-input"/></label>
          <label className="pg-field">Type<select name="niveau" className="pg-input"><option value="produit">Produit fini</option><option value="matiere">Ingrédient</option></select></label>
          <label className="pg-field">Unité<input name="unite" defaultValue="pcs" required maxLength={20} className="pg-input"/></label>
          <label className="pg-field">Seuil d’alerte<input name="seuil" type="number" min="0" step="any" defaultValue="0" className="pg-input"/></label>
          <label className="pg-field">{isLabo ? "Prix suggéré pour validation patron (DA, optionnel)" : "Prix de vente en boutique (DA)"}<input name="prix" type="number" min="0" step="0.01" defaultValue="0" className="pg-input"/></label>
          {isOwner && (
            <label className="pg-field">Régime TVA (Algérie · LF 2026)
              <select name="tva" defaultValue="0" className="pg-input">
                <option value="0">0 % — Exonéré / IFU</option>
                <option value="9">9 % — Taux réduit (farine, pain, lait)</option>
                <option value="19">19 % — Taux normal (pâtisserie, cake)</option>
              </select>
            </label>
          )}
          <div><button className="pg-button">Ajouter l’article</button></div>
        </form>
      </Disclosure>
      <Disclosure title="Photos des produits (Caisse tactile)" description="Prenez ou choisissez une photo réelle pour chaque gâteau en boutique." icon="cake">
        <ProductPhotoPicker
          mode="demo"
          scopeKey="demo"
          products={db.articles.filter((a) => a.niveau === "produit").map((a) => ({ id: a.id, nom: a.nom }))}
        />
      </Disclosure>
      </div>}
    </>}
    {module==='achats' && <><PurchaseOperations data={db} canEdit={canEdit} canReadCosts={isOwner} save={save} notify={setMessage}/><section className={box}><h2 className="mb-3 font-bold">Fournisseurs de démonstration</h2><div className="grid gap-2 sm:grid-cols-3">{db.suppliers.map(s=><div key={s} className="rounded-lg bg-slate-50 p-3 text-sm">🏭 {s}</div>)}</div></section>{canEdit && <section className={box}><h2 className="mb-3 font-bold">Réceptionner un lot</h2><form onSubmit={addLot} className="grid gap-3 sm:grid-cols-3"><select name="article" aria-label="Article" className={field}>{db.articles.map(a=><option value={a.id} key={a.id}>{a.nom}</option>)}</select><input name="numero" placeholder="Numéro de lot" required className={field}/><select name="site" aria-label="Site" className={field}><option>Labo</option><option>Boutique</option></select><input name="qte" type="number" min="0.0001" step="any" placeholder="Quantité" required className={field}/>{isOwner && <input name="pu" type="number" min="0" step="any" placeholder="Prix unitaire (DA)" required className={field}/>}<label className="text-xs text-slate-500">DLC (facultative)<input name="dlc" type="date" className={field}/></label><button className={btn}>Réceptionner</button></form></section>}</>}
    {module==='production' && (
      <div className="pg-stack">
        <KitchenLabScreen
          mode="demo"
          scopeKey="demo"
          today={today}
          auteurNom={role === 'labo' ? 'Labo' : 'Équipe'}
          auteurRole={role}
          orders={demoOrders(db)}
          cakes={db.cakes.map((c) => ({
            id: c.id,
            numero: c.numero,
            client: c.client,
            eventDate: c.eventDate,
            portions: c.portions,
            statut: c.status,
            notes: c.notes,
          }))}
        />
        <ProductionOperations data={db} canEdit={canEdit} canReadCosts={isOwner} save={save} notify={setMessage}/>
      </div>
    )}
    {module==='transferts' && <TransferOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module==='simulation' && <SimulationOperations data={db}/>}
    {module==='planning' && <PlanningOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module==='tracabilite' && <TraceOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module==='cake-design' && <CakeOperations data={db} save={save} notify={setMessage} canCreateOrEditQuotes={isOwner} role={role}/>}
    {module==='qualite' && <QualityOperations data={db} canEdit={canEdit} save={save} notify={setMessage}/>}
    {module==='cloture' && (
      isSeller
        ? <SellerBlindClosing sites={DEMO_SITES.filter((s) => s.type === 'boutique').map((s) => ({ id: s.id, label: s.label }))} mode="demo" today={today} />
        : <ClosingOperations data={db} save={save} notify={setMessage}/>
    )}
    {module==='recettes' && (
      <FreeRecipesWorkspace
        scopeKey="demo"
        stockSuggestions={stockSuggestions}
        canEdit={canEdit}
        sessionMode="demo"
        canReadCosts={isOwner}
        userRole={role}
        userName={role === 'labo' ? 'Labo' : 'Équipe'}
        stockLinkedNode={<RecipeOperations data={db} canEdit={canEdit} canReadCosts={isOwner} save={save} notify={setMessage}/>}
      />
    )}
    {module === 'caisse' && <DemoCaisse canEdit={isOwner} canManageCreditsAdmin={isOwner} shop={shop}/>}
  </div>;
}
