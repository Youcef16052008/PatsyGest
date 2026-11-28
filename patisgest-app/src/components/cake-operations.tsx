"use client";
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { assignCakeProduction, createCake, payCake, advanceCake, setCakeTask, cakeTotals, moneyToCents, type CakeStatus, type State } from '@/lib/patisgest-store';
import { clearEstimatorDraft, loadEstimatorDraft, type EstimatorDraft } from '@/lib/portion-estimator';
import { whatsappOrderUrl } from '@/lib/whatsapp';
import { compareCakePriority } from '@/lib/cake-priority';
import { Tr } from './locale-provider';
import { Icon } from './workspace-icons';

const money=(cents:number)=>new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:2}).format(cents/100)+' DA';
const STATUTS:Record<CakeStatus,[string,string]>={devis:['Devis','عرض'],acompte:['Acompte reçu','تسبيق مستلم'],confirme:['Confirmé','مؤكدة'],produit:['Prêt','واجدة'],livre:['Livré','تسلّمت'],annule:['Annulé','ملغاة']};
const dateFr=(d:string)=>{const v=new Date(`${d}T12:00:00`);return Number.isNaN(v.getTime())?d:v.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});};
type Props={data:State; save:(state:State)=>boolean; notify:(message:string)=>void; canCreateOrEditQuotes?:boolean; role?:'proprietaire'|'labo'|'vendeur'};
function act(next:()=>State,props:Props,success:string) {try {if(props.save(next())) props.notify(success);} catch(err){props.notify(err instanceof Error?err.message:'Opération impossible.');}}

/**
 * Démonstration « Commandes & Gâteaux » — même logique que l'écran réel :
 * un formulaire court, puis une seule action par dossier.
 */
export function CakeOperations(props:Props) {
  const {data, canCreateOrEditQuotes = true, role = 'proprietaire'}=props;
  const isLabo = role === 'labo';
  const peutEncaisser = canCreateOrEditQuotes || role === 'vendeur';
  const [rows,setRows]=useState<number[]>([]);const [nextKey,setNextKey]=useState(0);
  const [draft,setDraft]=useState<EstimatorDraft|null>(()=>loadEstimatorDraft());
  const [openCreate,setOpenCreate]=useState(false);
  const [portionsVal,setPortionsVal]=useState('20');
  const [priceVal,setPriceVal]=useState('');
  const [notesVal,setNotesVal]=useState('');
  const [payId,setPayId]=useState('');

  function applyDraft(){
    if(!draft) return;
    setOpenCreate(true);
    setPortionsVal(String(Math.max(1,Math.min(10000,Math.round(draft.parts)))));
    if(!draft.coutIncomplet&&draft.prixHtPropose!=null&&draft.prixHtPropose>0) setPriceVal(String(draft.prixHtPropose));
    setNotesVal(prev=>(prev?`${prev} · ${draft.noteDevis}`:draft.noteDevis).slice(0,500));
    props.notify('Le calcul du moule est repris dans la nouvelle commande.');
  }
  function create(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget; const f=new FormData(form);
    try {
      const names=f.getAll('optionName'),costs=f.getAll('optionCost'),times=f.getAll('optionMinutes');
      const next=createCake(data,{client:String(f.get('client')),telephone:String(f.get('telephone')),eventDate:String(f.get('eventDate')),portions:Number(f.get('portions')),priceCents:moneyToCents(String(f.get('price'))),recipeId:String(f.get('recipeId')),productionQty:Number(f.get('productionQty')),notes:String(f.get('notes')),options:names.map((name,i)=>({name:String(name),costCents:moneyToCents(String(costs[i])),minutes:Number(times[i])}))});
      if(props.save(next)){form.reset();setRows([]);setNextKey(0);setPortionsVal('20');setPriceVal('');setNotesVal('');props.notify('Commande créée. Elle apparaît ci-dessous.');}
    } catch(err){props.notify(err instanceof Error?err.message:'Commande invalide.');}
  }
  function assign(e:FormEvent<HTMLFormElement>,id:string){e.preventDefault();const f=new FormData(e.currentTarget);act(()=>assignCakeProduction(data,id,String(f.get('recipeId')),Number(f.get('productionQty'))),props,'Fabrique choisie pour cette commande.');}
  function payment(e:FormEvent<HTMLFormElement>,id:string){e.preventDefault();const form=e.currentTarget;const f=new FormData(form);try {const next=payCake(data,id,moneyToCents(String(f.get('amount'))));if(props.save(next)){form.reset();setPayId('');props.notify('Encaissement enregistré.');}}catch(err){props.notify(err instanceof Error?err.message:'Montant invalide.');}}

  const cakeRow=(c:State['cakes'][number])=>{
    const t=cakeTotals(c);
    const [fr,ar]=STATUTS[c.status];
    const wa=whatsappOrderUrl({phone:c.telephone,client:c.client,numero:c.numero,eventDate:c.eventDate,parts:c.portions,resteDa:t.balance/100});
    return <li key={c.id} className="pg-cake-item">
      <div className="pg-cake-item-top">
        <div className="pg-cake-item-copy">
          <strong>{c.client}</strong>
          <span>{dateFr(c.eventDate)} · {c.portions} <Tr fr="parts" ar="حصة"/> · {c.numero}</span>
        </div>
        <span className="pg-badge"><Tr fr={fr} ar={ar}/></span>
      </div>
      {!isLabo && (
        <div className="pg-cake-money">
          <div><small><Tr fr="Prix" ar="السعر"/></small><b>{money(c.priceCents)}</b></div>
          <div><small><Tr fr="Acompte" ar="التسبيق"/></small><b>{money(t.paid)}</b></div>
          <div data-reste={t.balance>0||undefined}><small><Tr fr="Reste" ar="الباقي"/></small><b>{money(t.balance)}</b></div>
        </div>
      )}
      {c.status!=='livre'&&c.status!=='annule' && (
        <div className="pg-cake-actions">
          {peutEncaisser && t.balance>0 && c.status!=='produit' && (
            <button type="button" className="pg-button pg-button-secondary" onClick={()=>setPayId(payId===c.id?'':c.id)}>
              <Icon name="receipt" size={16}/> <Tr fr="Encaisser" ar="تحصيل"/>
            </button>
          )}
          {!isLabo && c.status==='acompte' && <button className="pg-button" onClick={()=>act(()=>advanceCake(data,c.id,'confirme'),props,'Commande confirmée.')}><Icon name="check" size={16}/> <Tr fr="Confirmer" ar="أكّد"/></button>}
          {(isLabo || canCreateOrEditQuotes) && c.status==='confirme' && <button className="pg-button" onClick={()=>act(()=>advanceCake(data,c.id,'produit'),props,'Commande marquée prête.')}><Icon name="cake" size={16}/> <Tr fr="Gâteau prêt" ar="الحلوة واجدة"/></button>}
          {!isLabo && c.status==='produit' && <button className="pg-button" disabled={t.balance>0} title={t.balance>0?'Reste à payer avant de livrer':undefined} onClick={()=>act(()=>advanceCake(data,c.id,'livre'),props,'Commande livrée / soldée.')}><Icon name="check" size={16}/> <Tr fr="Livré" ar="تسلّمت"/></button>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="pg-button pg-button-secondary">WhatsApp</a>}
        </div>
      )}
      {payId===c.id && (
        <form onSubmit={e=>payment(e,c.id)} className="pg-cake-pay">
          <label className="pg-field"><Tr fr="Montant reçu (DA)" ar="المبلغ المستلم (دج)"/><input name="amount" type="number" min="0.01" max={(t.balance/100).toFixed(2)} step="0.01" required className="pg-input"/></label>
          <button className="pg-button"><Icon name="check" size={16}/> <Tr fr="Enregistrer" ar="سجّل"/></button>
        </form>
      )}
      <details className="pg-cake-details">
        <summary><Tr fr="Plus" ar="زيادة"/></summary>
        <div className="pg-cake-details-body">
          {canCreateOrEditQuotes && !['livre','annule'].includes(c.status) && (
            <button className="pg-button pg-button-secondary pg-danger" onClick={()=>{if(window.confirm('Annuler cette commande ? Aucun remboursement automatique.')) act(()=>advanceCake(data,c.id,'annule'),props,'Commande annulée.');}}><Tr fr="Annuler la commande" ar="ألغي الطلبية"/></button>
          )}
          {!c.recipeId && canCreateOrEditQuotes && ['devis','acompte'].includes(c.status) && (
            <form onSubmit={e=>assign(e,c.id)} className="pg-cake-assign">
              <p className="pg-help"><Tr fr="Ancienne commande : choisissez la recette avant de confirmer." ar="طلبية قديمة : اختر الوصفة قبل التأكيد."/></p>
              <label className="pg-field"><Tr fr="Quel gâteau ?" ar="أشمن حلوة ؟"/><select name="recipeId" required defaultValue="" className="pg-input"><option value="">Choisir</option>{data.recipes.filter(r=>r.versions.length).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
              <label className="pg-field"><Tr fr="Combien ?" ar="قداش ؟"/><input name="productionQty" type="number" min="0.001" max="100000000" step="0.001" required className="pg-input"/></label>
              <button className="pg-button"><Tr fr="Associer" ar="اربط"/></button>
            </form>
          )}
          {c.notes && <p className="pg-help">{c.notes}</p>}
          {c.ofId && <p className="pg-help">OF : {data.productions.find(o=>o.id===c.ofId)?.numero ?? 'introuvable'}</p>}
          {!isLabo && c.options.length>0 && <ul className="pg-help">{c.options.map((o,i)=><li key={i}>• {o.name} · {money(o.costCents)} · {o.minutes} min</li>)}</ul>}
          <details>
            <summary className="pg-help"><Tr fr="Préparation et historique" ar="التحضير والسجل"/></summary>
            <div className="space-y-1">
              {c.tasks.map((task,i)=><label key={i} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={task.done} disabled={c.status==='annule'||c.status==='livre'} onChange={e=>act(()=>setCakeTask(data,c.id,i,e.target.checked),props,'Préparation mise à jour.')}/>{dateFr(task.dueDate)} · {task.name}</label>)}
              <p className="pg-help">{c.history.map(h=>STATUTS[h.status]?.[0] ?? h.status).join(' → ')}</p>
            </div>
          </details>
        </div>
      </details>
    </li>;
  };

  const tries=[...data.cakes].sort((a,b)=>compareCakePriority({status:a.status,date:a.eventDate,numero:a.numero},{status:b.status,date:b.eventDate,numero:b.numero}));
  const enCours=tries.filter(c=>!['livre','annule'].includes(c.status));
  const termines=tries.filter(c=>['livre','annule'].includes(c.status));

  return <div className="pg-stack">
    {draft && canCreateOrEditQuotes && (
      <div className="pg-cake-draft">
        <span><b><Tr fr="Un calcul vous attend :" ar="عندك حساب واجد :"/></b> {draft.modeleNom} · {draft.parts} <Tr fr="parts" ar="حصة"/> · {draft.formatLabel}{!draft.coutIncomplet&&draft.prixHtPropose!=null?` · ${draft.prixHtPropose.toLocaleString('fr-DZ')} DA`:' · coût partiel'}</span>
        <span className="pg-cake-draft-actions">
          <button type="button" onClick={applyDraft} className="pg-button"><Tr fr="Reprendre" ar="استعملو"/></button>
          <button type="button" onClick={()=>{clearEstimatorDraft();setDraft(null);}} className="pg-button pg-button-secondary"><Tr fr="Effacer" ar="امسح"/></button>
        </span>
      </div>
    )}

    {canCreateOrEditQuotes ? (
      <section className="pg-card pg-card-pad">
        <div className="pg-card-head">
          <div>
            <h2><Tr fr="Nouveau gâteau sur commande" ar="حلوة جديدة بطلبية"/></h2>
            <p><Tr fr="Six cases suffisent : qui, quand, combien de parts, quel prix." ar="ستّة خانات تكفي : شكون، وقتاش، قداش من حصة، وبقداش."/></p>
          </div>
          <Link href="/recettes" className="pg-text-link"><Tr fr="Calculer le moule et le prix" ar="احسب القالب والسعر"/> <Icon name="arrow" size={15}/></Link>
        </div>
        <details className="pg-cake-more" open={openCreate} onToggle={e=>setOpenCreate((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>+ <Tr fr="Écrire la commande" ar="اكتب الطلبية"/></summary>
          <form onSubmit={create} className="pg-cake-more-body pg-cake-form">
            <label className="pg-field pg-cake-wide"><Tr fr="Nom du client" ar="اسم العميل"/><input name="client" maxLength={100} required className="pg-input"/></label>
            <label className="pg-field"><Tr fr="Téléphone" ar="الهاتف"/><input name="telephone" type="tel" placeholder="0550 00 00 00" maxLength={40} className="pg-input"/></label>
            <label className="pg-field"><Tr fr="Date de retrait" ar="تاريخ السحب"/><input name="eventDate" type="date" min="2000-01-04" required className="pg-input"/></label>
            <label className="pg-field"><Tr fr="Nombre de parts" ar="عدد الحصص"/><input name="portions" type="number" min="1" max="10000" step="1" value={portionsVal} onChange={e=>setPortionsVal(e.target.value)} required className="pg-input"/></label>
            <label className="pg-field"><Tr fr="Prix total (DA)" ar="السعر الكلي (دج)"/><input name="price" type="number" min="0.01" max="1000000000" step="0.01" value={priceVal} onChange={e=>setPriceVal(e.target.value)} required className="pg-input" placeholder="4500"/></label>
            <label className="pg-field"><Tr fr="Quel gâteau ?" ar="أشمن حلوة ؟"/><select name="recipeId" required className="pg-input" defaultValue=""><option value="">Choisir</option>{data.recipes.filter(r=>r.versions.length>0).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label className="pg-field"><Tr fr="Combien ?" ar="قداش ؟"/><input name="productionQty" type="number" min="0.001" max="100000000" step="0.001" defaultValue="1" required className="pg-input"/></label>
            <label className="pg-field pg-cake-wide"><Tr fr="Heure de retrait, inscription, thème…" ar="وقت السحب، الكتابة، الثيم…"/><input name="notes" placeholder="Ex : retrait 15h · Joyeux anniversaire" maxLength={500} value={notesVal} onChange={e=>setNotesVal(e.target.value)} className="pg-input"/></label>
            <details className="pg-cake-more pg-cake-wide">
              <summary><Tr fr="Options (pas obligatoire)" ar="خيارات (ماشي إجباري)"/></summary>
              <div className="pg-cake-more-body">
                <div className="pg-cake-options">
                  {rows.map((row,index)=><div className="pg-cake-option" key={row}>
                    <label className="pg-field"><Tr fr="Option" ar="خيار"/><input name="optionName" maxLength={100} required className="pg-input"/></label>
                    <label className="pg-field"><Tr fr="Coût (DA)" ar="التكلفة (دج)"/><input name="optionCost" type="number" min="0" max="1000000000" step="0.01" defaultValue="0" required className="pg-input"/></label>
                    <label className="pg-field"><Tr fr="Minutes" ar="دقائق"/><input name="optionMinutes" type="number" min="0" max="100000" step="1" defaultValue="0" required className="pg-input"/></label>
                    <button type="button" onClick={()=>setRows(rows.filter(r=>r!==row))} className="pg-text-link pg-cake-option-remove" aria-label={`Retirer option ${index+1}`}><Tr fr="Retirer" ar="حيّد"/></button>
                  </div>)}
                  <button type="button" onClick={()=>{setRows([...rows,nextKey]);setNextKey(nextKey+1);}} className="pg-text-link">+ <Tr fr="Ajouter une option" ar="زيد خيار"/></button>
                </div>
              </div>
            </details>
            <button className="pg-button pg-cake-submit pg-cake-wide"><Icon name="check" size={18}/> <Tr fr="Créer la commande" ar="أُنشئ الطلبية"/></button>
          </form>
        </details>
      </section>
    ) : !isLabo && (
      <section className="pg-card pg-card-pad pg-help">
        <Tr fr="Espace comptoir : vous encaissez les acomptes, confirmez et livrez. Le patron crée les devis." ar="فضاء البيع : تحصّل التسبيق، تأكد وتسلم. صاحب المحل هو اللي يكتب الطلبيات."/>
      </section>
    )}

    <section className="pg-card pg-card-pad">
      <div className="pg-card-head">
        <div>
          <h2><Tr fr="Commandes en cours" ar="الطلبيات الجارية"/></h2>
          <p><Tr fr="Le retrait le plus proche d’abord. Un seul bouton par commande." ar="الأقرب سحباً في الأول. زر واحد لكل طلبية."/></p>
        </div>
        <span className="pg-badge">{enCours.length}</span>
      </div>
      {enCours.length===0 ? <p className="pg-muted"><Tr fr="Aucune commande en cours." ar="ما كاين حتى طلبية جارية."/></p> : <ul className="pg-cake-list">{enCours.map(cakeRow)}</ul>}
      {termines.length>0 && (
        <details className="pg-cake-more pg-cake-done">
          <summary><Tr fr="Terminés et annulés" ar="المنتهية والملغاة"/> ({termines.length})</summary>
          <ul className="pg-cake-done-list">{termines.map(c=><li key={c.id}><b>{c.client}</b> · {dateFr(c.eventDate)} · {money(c.priceCents)}<span className="pg-badge"><Tr fr={STATUTS[c.status][0]} ar={STATUTS[c.status][1]}/></span></li>)}</ul>
        </details>
      )}
    </section>
  </div>;
}
