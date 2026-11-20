"use client";
import { useActionState } from 'react';
import { WORKSPACE_LINKS } from '@/lib/workspace-nav';
import { modifierModule, type ModuleActionState } from '@/lib/actions-modules';

export type ModulesCompte={utilisateur_id:string;nom:string;role:string;modules_desactives:string[]};
const modules=WORKSPACE_LINKS.filter(l=>!['/tableau-de-bord','/parametres'].includes(l.href));
export default function ModulesSettings({accounts,error}:{accounts:ModulesCompte[];error:boolean}) {
 const [state,action,pending]=useActionState<ModuleActionState,FormData>(modifierModule,{});
 return <section className="pg-card pg-card-pad mt-6"><div className="pg-card-head"><div><h2>Accès aux modules</h2><p>Activez ou désactivez chaque module par compte. Les rôles continuent de limiter les actions ; ce réglage ne crée pas de privilèges supplémentaires. L’accueil et les paramètres restent accessibles.</p></div></div>
  {error?<p role="alert">Gestion des accès indisponible. Vérifiez la connexion et la migration de contrôle des modules.</p>:accounts.length===0?<p>Aucun compte trouvé.</p>:<div className="space-y-4">{accounts.map(account=><details key={account.utilisateur_id} className="rounded-xl border p-4"><summary className="cursor-pointer font-bold">{account.nom} · {account.role} · {account.modules_desactives.length} désactivé(s)</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{modules.map(m=>{const key=m.href.slice(1),on=!account.modules_desactives.includes(key);return <form action={action} key={key} className="flex items-center justify-between gap-3 rounded-lg border p-3"><input type="hidden" name="utilisateur" value={account.utilisateur_id}/><input type="hidden" name="module" value={key}/><input type="hidden" name="actif" value={String(!on)}/><span className="text-sm"><b>{m.title}</b><small className="block">{on?'Activé':'Désactivé'}</small></span><button disabled={pending} className="pg-button pg-button-secondary" aria-label={`${on?'Désactiver':'Activer'} ${m.title} pour ${account.nom}`}>{on?'Désactiver':'Activer'}</button></form>})}</div></details>)}</div>}
  {state.erreur&&<p role="alert">{state.erreur}</p>}{state.succes&&<p role="status">{state.succes}</p>}
 </section>;
}
