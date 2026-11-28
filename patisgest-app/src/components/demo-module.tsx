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
import { useTranslator } from './locale-provider';
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
import { jourLocal } from '@/lib/workspace-data';
import { Disclosure, Notice, PageIntro } from './workspace-ui';
import { Icon } from './workspace-icons';

type Module = 'stocks'|'achats'|'recettes'|'caisse'|'production'|'transferts'|'cloture'|'qualite'|'cake-design'|'tracabilite'|'planning'|'simulation';
const field='pg-input';
const btn='pg-button';
const box='pg-card pg-card-pad';
export default function DemoModule({ module, role, filtre, shop }: { module: Module; role: Role; filtre?: string; shop?: string }) {
  const { data, save: persist } = useDemoWorkspace();
  const tx = useTranslator();
  const [message, setMessage] = useState('');
  function save(next: State) {
    if (persist(next)) return true;
    setMessage('Enregistrement local impossible.');
    return false;
  }
  if (!data) return <p role="status">{tx("Chargement de la démo…")}</p>;
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
  const title={stocks:isSeller?'Ce qu’il y a en boutique':'Mes stocks',achats:'Achats & fournisseurs',recettes:isOwner?'Mes recettes & mes prix':'Mes recettes',caisse:'Caisse rapide',production:'Production',transferts:'Transferts',cloture:isSeller?'Comptage de caisse':'Clôture & pertes',qualite:'HACCP & qualité','cake-design':'Commandes & Gâteaux',tracabilite:'Traçabilité des lots',planning:'Planning de production',simulation:'Simulation de prix'}[module];
  const descriptions: Partial<Record<Module, string>> = {
    stocks: isSeller
      ? "Regardez ce qui reste, et demandez au labo ce qui manque."
      : "Ce qui reste, ce qui manque, et ce qui vient d’arriver.",
    caisse: "Grosses tuiles visuelles pour encaisser vite au comptoir.",
    recettes: isOwner
      ? "Écrivez une recette, voyez son coût et choisissez votre prix."
      : "Notez vos recettes et leurs quantités (sans les coûts).",
    "cake-design": "Mariages, anniversaires, acomptes payés, reste à encaisser et WhatsApp client.",
    cloture: isSeller ? "Comptez les espèces de votre tiroir en fin de journée." : undefined,
  };
  const today = jourLocal();
  const lots = demoLots(db);
  const stockSuggestions = module === 'recettes'
    ? db.articles.filter((a) => a.niveau === 'matiere').map((a) => {
        const latestLot = db.lots.filter((l) => l.articleId === a.id && l.pu > 0).at(-1);
        return { id: a.id, nom: a.nom, unite: a.unite, prixUnitaireDa: latestLot ? latestLot.pu : null };
      })
    : [];
  return <div className="pg-stack"><PageIntro title={title} label={module === "stocks" ? "Inventaire" : module === "caisse" ? "Boutique" : module === "production" ? "Laboratoire" : undefined}
    description={descriptions[module]}
    actions={
      module === "caisse" ? (
        <Link href="/cake-design" className="pg-button pg-button-secondary">Acomptes &amp; commandes →</Link>
      ) : module === "production" ? (
        <Link href="/planning#demain-au-labo" className="pg-button pg-button-secondary">Demain au labo →</Link>
      ) : undefined
    }/>
    {message && <p role="status" className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">{message}</p>}
    {module === 'stocks' && <>
      {canEdit && <div id="nouvel-article" className="pg-stack">
        <section className="pg-card pg-card-pad pg-stock-actions" aria-label="Entrée de stock">
          <div className="pg-card-head">
            <div>
              <h2>Que voulez-vous faire ?</h2>
              <p>Deux gestes suffisent : ce qui arrive, ou un nouveau produit.</p>
            </div>
          </div>
          <div className="pg-stock-action-buttons">
            <details className="pg-stock-action" id="arrive">
              <summary><span className="pg-emblem"><Icon name="box" size={20}/></span><span><b>Ça vient d’arriver</b><small>Farine, beurre, gâteaux reçus…</small></span></summary>
              <form onSubmit={addLot} className="pg-stock-form">
                <div className="pg-stock-form-row">
                  <label className="pg-field pg-stock-form-wide">Quel article ?
                    <select name="article" className="pg-input" defaultValue="">
                      <option value="">— choisir —</option>
                      {db.articles.map((a) => <option value={a.id} key={a.id}>{a.nom} ({a.unite})</option>)}
                    </select>
                  </label>
                  <label className="pg-field">Combien ?<input name="qte" type="number" inputMode="decimal" min="0.0001" step="any" placeholder="0" required className="pg-input" /></label>
                  {isOwner && <label className="pg-field">Prix d’achat (DA)<input name="pu" type="number" inputMode="decimal" min="0" step="any" placeholder="0" required className="pg-input" /></label>}
                  <label className="pg-field">Où ?<select name="site" className="pg-input"><option>Labo</option><option>Boutique</option></select></label>
                </div>
                <details className="pg-recipe-more">
                  <summary className="pg-stock-plus"><Icon name="plus" size={14}/> Plus d’options (n° de bon, DLC)</summary>
                  <div className="pg-stock-form-row">
                    <label className="pg-field">N° de bon / facture<input name="numero" placeholder={`BON-${today.slice(0, 4)}`} className="pg-input" /></label>
                    <label className="pg-field">À consommer avant <span className="pg-hint">facultatif</span><input name="dlc" type="date" className="pg-input" /></label>
                  </div>
                </details>
                <div className="pg-stock-form-actions"><button className="pg-button">C’est entré en stock</button></div>
              </form>
            </details>

            <details className="pg-stock-action" id="article">
              <summary><span className="pg-emblem"><Icon name="plus" size={20}/></span><span><b>Nouvel article</b><small>Un produit ou un ingrédient à vendre</small></span></summary>
              <form onSubmit={addArticle} className="pg-stock-form">
                <div className="pg-stock-form-row">
                  <label className="pg-field pg-stock-form-wide">Nom<input name="nom" required maxLength={120} placeholder="Ex : Mille-feuille, Farine T45…" className="pg-input" /></label>
                  <label className="pg-field">C’est…<select name="niveau" className="pg-input"><option value="produit">Un gâteau à vendre</option><option value="matiere">Un ingrédient</option></select></label>
                  <label className="pg-field">Unité<select name="unite" defaultValue="pcs" className="pg-input"><option value="pcs">pièces</option><option value="kg">kg</option><option value="g">g</option><option value="L">litres</option><option value="ml">ml</option></select></label>
                  <label className="pg-field">{isLabo ? 'Prix proposé au patron (DA)' : 'Prix de vente (DA)'}<input name="prix" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={0} className="pg-input" /></label>
                </div>
                <details className="pg-recipe-more">
                  <summary className="pg-stock-plus"><Icon name="plus" size={14}/> Plus d’options (code, seuil, TVA)</summary>
                  <div className="pg-stock-form-row">
                    <label className="pg-field">Code article <span className="pg-hint">auto si vide</span><input name="code" maxLength={40} placeholder="PF-005" className="pg-input" /></label>
                    <label className="pg-field">Alerter sous… <span className="pg-hint">0 = jamais</span><input name="seuil" type="number" min="0" step="any" defaultValue={0} className="pg-input" /></label>
                    {isOwner && (
                      <label className="pg-field">TVA
                        <select name="tva" defaultValue="19" className="pg-input">
                          <option value="19">19 % — pâtisserie, gâteaux</option>
                          <option value="9">9 % — farine, lait, œufs</option>
                          <option value="0">0 % — exonéré / artisan</option>
                        </select>
                      </label>
                    )}
                  </div>
                </details>
                <div className="pg-stock-form-actions"><button className="pg-button">Ajouter l’article</button></div>
              </form>
            </details>
          </div>
        </section>
        <Disclosure title="J’ai une facture du fournisseur" description="Prenez-la en photo : les lignes sont recopiées, vous vérifiez, puis ça entre en stock." icon="store">
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
      <StockList key={filtre ?? "tous"} articles={(isOwner ? db.articles : db.articles.map((a) => ({ ...a, prix: 0, tva: 0 }))).slice().sort((a,b) => a.nom.localeCompare(b.nom,"fr"))} lots={lots} sites={DEMO_SITES} today={today} filtre={filtre}/>
      {isSeller && (
        <RestockRequestQuickForm
          mode="demo"
          articles={db.articles.filter((a) => a.niveau === "produit").map((p) => ({ id: p.id, label: `${p.nom} · ${p.code}` }))}
          sites={DEMO_SITES.filter((s) => s.type === "boutique").map((s) => ({ id: s.id, label: s.label }))}
        />
      )}
      <Disclosure title="Photos des gâteaux" description="Une photo par gâteau : elle s’affiche sur la caisse tactile." icon="cake">
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
