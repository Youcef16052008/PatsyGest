"use client";
import { useActionState } from 'react';
import { evolveCakeReal } from '@/lib/actions-cakes';

type Cake={id:string;numero:string;client_nom:string;date_event:string;nb_parts:number;statut:string};
export default function LabCakeForm({cakes,unavailable}:{cakes:Cake[];unavailable:boolean}) {
 const [evolution,evolve,evolving]=useActionState(evolveCakeReal,{});
 return <div className="pg-stack">
  <p className="pg-notice" role="status">La création et l’édition des devis sont réservées au comptoir. Le laboratoire peut suivre les dossiers des sites attribués et marquer la production terminée.</p>
  <section className="pg-card pg-card-pad"><h2>Dossiers de production</h2>
   {unavailable ? <p role="alert">Les dossiers sont indisponibles.</p> : cakes.length===0 ? <p>Aucun dossier disponible.</p> :
    <ul>{cakes.map(c=><li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><span><b>{c.numero} · {c.client_nom}</b><br/>{c.nb_parts} parts · {c.date_event} · {c.statut}</span>{c.statut==='confirme'&&<form action={evolve}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="transition" value="produit"/><button className="pg-button pg-button-secondary" disabled={evolving}>Marquer produit</button></form>}</li>)}</ul>}
   {evolution.erreur&&<p role="alert">{evolution.erreur}</p>}{evolution.succes&&<p role="status">{evolution.succes}</p>}
  </section>
 </div>;
}
