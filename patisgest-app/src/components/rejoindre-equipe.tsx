"use client";
import { useActionState } from "react";
import { demanderRattachement, repondreRattachement, type RejoindreState } from "@/lib/actions-rejoindre";

type Demande = { id: string; etablissement: string; role_demande: string; statut: string };
type Invitation = { id: string; etablissement: string; role: string; expire_le: string };
function Feedback({ state }: { state: RejoindreState }) {
  return <>{state.erreur && <p role="alert">{state.erreur}</p>}{state.succes && <p role="status">{state.succes}</p>}</>;
}
function DemanderForm() {
  const [state,action,pending]=useActionState(demanderRattachement,{});
  return <form action={action} className="space-y-3"><label className="pg-field">Code fourni par l’établissement<input name="code" className="pg-input" required maxLength={36}/></label>
    <label className="pg-field">Votre nom<input name="nom" className="pg-input" required maxLength={100}/></label>
    <label className="pg-field">Rôle demandé<select name="role" className="pg-input" defaultValue="vendeur"><option value="vendeur">Vendeur</option><option value="labo">Laboratoire</option></select></label>
    <button disabled={pending} className="pg-button">Demander un rattachement</button><Feedback state={state}/>
  </form>;
}
function Repondre({id,choix,label}:{id:string;choix:string;label:string}) {
  const [state,action,pending]=useActionState(repondreRattachement,{});
  return <form action={action} className="mt-2"><input type="hidden" name="id" value={id}/><input type="hidden" name="choix" value={choix}/><button disabled={pending} className="pg-button pg-button-secondary">{label}</button><Feedback state={state}/></form>;
}
export default function RejoindreEquipe({demandes,invitations}:{demandes:Demande[];invitations:Invitation[]}) {
  return <div className="space-y-5"><section className="pg-card pg-card-pad space-y-3"><h2>Vos demandes</h2>
    {demandes.length ? demandes.map(d=><div key={d.id} className="rounded-xl border p-3"><p><strong>{d.etablissement}</strong> · {d.role_demande} · {d.statut}</p>
      {d.statut==='approuvee' && <><p>Acceptez pour finaliser votre rattachement si l’admission est ouverte. Les modules restent désactivés jusqu’à attribution par le propriétaire.</p><Repondre id={d.id} choix="accepter_demande" label="Accepter le rattachement"/></>}
    </div>) : <p>Aucune demande.</p>}
    <details><summary>Nouvelle demande avec code</summary><DemanderForm/></details>
  </section><section className="pg-card pg-card-pad space-y-3"><h2>Vos invitations</h2>
    {invitations.length ? invitations.map(i=><div key={i.id} className="rounded-xl border p-3"><p><strong>{i.etablissement}</strong> · {i.role} · expire le {new Date(i.expire_le).toLocaleString('fr-FR')}</p>
      <Repondre id={i.id} choix="accepter_invitation" label="Accepter l’invitation"/><Repondre id={i.id} choix="refuser_invitation" label="Refuser l’invitation"/></div>) : <p>Aucune invitation disponible pour cette adresse vérifiée.</p>}
  </section></div>;
}
