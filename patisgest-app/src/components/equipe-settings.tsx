"use client";

import { useActionState } from "react";
import { afficherCodeEquipe, annulerInvitationEquipe, creerInvitationEquipe, deciderDemande, modifierAffectationsEquipe, revoquerMembreEquipe, type EquipeActionState } from "@/lib/actions-equipe";
import { WORKSPACE_LINKS } from "@/lib/workspace-nav";
import type { SiteCompte } from "./sites-settings";

type Demande = { id: string; email: string; nom: string; role_demande: string; cree_le: string };
type Approbation = { id: string; email: string; nom: string; role_demande: string; sites: string[] };
type Invitation = { id: string; email: string; nom: string; role: string; sites: string[]; expire_le: string };
type Membre = { id: string; nom: string; email: string; role: string; sites: string[]; modules_desactives: string[]; revision: string };
export type EquipeDonnees = { demandes: Demande[]; approbations: Approbation[]; invitations: Invitation[]; membres: Membre[] };

function Feedback({ state }: { state: EquipeActionState }) {
  return <>{state.erreur && <p role="alert" className="text-red-700">{state.erreur}</p>}{state.succes && <p role="status">{state.succes}</p>}</>;
}
function SitesChoix({ sites, role }: { sites: SiteCompte[]; role?: string }) {
  const options = sites.filter(s => role !== "vendeur" || s.type === "boutique");
  return <fieldset className="space-y-1"><legend className="font-bold">Sites attribués</legend>
    {options.length === 0 ? <p>Aucun site adapté. Ajoutez d’abord un site.</p> : options.map(site => <label key={site.id} className="block"><input type="checkbox" name="sites" value={site.id}/> {site.nom} · {site.type}</label>)}
  </fieldset>;
}
function CodeForm({ renouveler = false }: { renouveler?: boolean }) {
  const [state, action, pending] = useActionState(afficherCodeEquipe, {});
  return <form action={action} className="space-y-2">
    {renouveler && <><input type="hidden" name="renouveler" value="oui"/><label className="block"><input type="checkbox" name="confirmer" value="oui" required/> Je comprends que l’ancien code ne fonctionnera plus.</label></>}
    <button className="pg-button pg-button-secondary" disabled={pending}>{pending ? "Chargement…" : renouveler ? "Renouveler le code" : "Afficher le code de demande"}</button>
    <Feedback state={state}/>{state.code && <p>Code : <code className="break-all select-all">{state.code}</code></p>}
  </form>;
}
function DemandeForm({ demande, sites }: { demande: Demande; sites: SiteCompte[] }) {
  const [state, action, pending] = useActionState(deciderDemande, {});
  return <div className="rounded-xl border p-3 space-y-3"><p><strong>{demande.nom}</strong> · {demande.email} · {demande.role_demande}</p>
    <form action={action} className="space-y-2"><input type="hidden" name="id" value={demande.id}/><input type="hidden" name="decision" value="approuver"/>
      <SitesChoix sites={sites} role={demande.role_demande}/><button disabled={pending} className="pg-button">Approuver sans activer</button>
    </form>
    <form action={action}><input type="hidden" name="id" value={demande.id}/><input type="hidden" name="decision" value="refuser"/><button disabled={pending} className="pg-button pg-button-secondary">Refuser</button></form>
    <Feedback state={state}/>
  </div>;
}
function AnnulerApprobation({ demande }: { demande: Approbation }) {
  const [state, action, pending] = useActionState(deciderDemande, {});
  return <form action={action} className="rounded-xl border p-3 space-y-2"><p><strong>{demande.nom}</strong> · {demande.email} · {demande.role_demande}</p>
    <input type="hidden" name="id" value={demande.id}/><input type="hidden" name="decision" value="annuler"/>
    <button disabled={pending} className="pg-button pg-button-secondary">Annuler l’approbation</button><Feedback state={state}/>
  </form>;
}
function InvitationForm({ sites }: { sites: SiteCompte[] }) {
  const [state, action, pending] = useActionState(creerInvitationEquipe, {});
  return <form action={action} className="space-y-3"><label className="pg-field">Nom<input className="pg-input" name="nom" maxLength={100} required/></label>
    <label className="pg-field">Adresse e-mail<input className="pg-input" type="email" name="email" maxLength={254} required/></label>
    <label className="pg-field">Rôle<select className="pg-input" name="role" required defaultValue="vendeur"><option value="vendeur">Vendeur</option><option value="labo">Laboratoire</option></select></label>
    <p>Un vendeur ne peut être affecté qu’aux boutiques. Les sites non autorisés seront refusés.</p><SitesChoix sites={sites}/>
    <button disabled={pending} className="pg-button">Enregistrer l’invitation</button><Feedback state={state}/>
  </form>;
}
function InvitationItem({ invitation, sites }: { invitation: Invitation; sites: SiteCompte[] }) {
  const [state, action, pending] = useActionState(annulerInvitationEquipe, {});
  const labels = invitation.sites.map(id => sites.find(site => site.id === id)?.nom ?? "Site indisponible").join(", ");
  return <form action={action} className="rounded-xl border p-3 space-y-2"><p><strong>{invitation.nom}</strong> · {invitation.email} · {invitation.role}</p>
    <p>Sites : {labels} · expiration : {new Date(invitation.expire_le).toLocaleString("fr-FR")}</p>
    <input type="hidden" name="id" value={invitation.id}/><label className="block"><input type="checkbox" name="confirmer" value="oui" required/> Confirmer l’annulation</label>
    <button disabled={pending} className="pg-button pg-button-secondary">Annuler l’invitation</button><Feedback state={state}/>
  </form>;
}
function MembreForm({ membre, sites }: { membre: Membre; sites: SiteCompte[] }) {
  const [state, action, pending] = useActionState(modifierAffectationsEquipe, {});
  const [revoke, revokeAction, revoking] = useActionState(revoquerMembreEquipe, {});
  const modules = WORKSPACE_LINKS.filter(l => !["/parametres", "/tableau-de-bord"].includes(l.href));
  const sitesInconnus = membre.sites.filter(id => !sites.some(site => site.id === id));
  return <details className="rounded-xl border p-3"><summary><strong>{membre.nom}</strong> · {membre.email} · {membre.role}</summary>
    {sitesInconnus.length > 0 && <p role="alert">Certains sites affectés ne sont pas dans la liste. Actualisez la page avant de modifier ce compte.</p>}
    <form action={action} className="space-y-3 mt-3">
      <input type="hidden" name="id" value={membre.id}/><input type="hidden" name="revision" value={membre.revision}/>
      <fieldset><legend className="font-bold">Sites attribués</legend>
        {sites.map(s => <label key={s.id} className="block"><input type="checkbox" name="sites" value={s.id} defaultChecked={membre.sites.includes(s.id)}/> {s.nom} · {s.type}{membre.role === "vendeur" && s.type !== "boutique" ? " — non autorisé pour vendeur" : ""}</label>)}
      </fieldset>
      <fieldset><legend className="font-bold">Modules activés</legend><p>Les droits effectifs restent limités par le rôle. Les modules non cochés seront désactivés.</p>
        {modules.map(m => <label key={m.href} className="block"><input type="checkbox" name="modules" value={m.href.slice(1)} defaultChecked={!membre.modules_desactives.includes(m.href.slice(1))}/> {m.title}</label>)}
      </fieldset>
      <button className="pg-button" disabled={pending || revoking || sitesInconnus.length > 0}>Enregistrer les affectations</button><Feedback state={state}/>
    </form>
    <form action={revokeAction} className="space-y-2 mt-4 border-t pt-3"><input type="hidden" name="id" value={membre.id}/><input type="hidden" name="revision" value={membre.revision}/>
      <p>La révocation retire l’adhésion et les accès, sans supprimer le compte Auth. Une requête déjà en cours peut ne pas être interrompue immédiatement.</p>
      <label className="block"><input type="checkbox" name="confirmer" value="oui" required/> Confirmer la révocation de {membre.nom}</label>
      <button className="pg-button pg-button-secondary" disabled={pending || revoking}>Révoquer l’adhésion</button><Feedback state={revoke}/>
    </form>
  </details>;
}
export default function EquipeSettings({ data, sites, error }: { data: EquipeDonnees; sites: SiteCompte[]; error: boolean }) {
  return <section className="pg-card pg-card-pad mt-6 space-y-4"><h2>Équipe · expérimental</h2>
    <p role="alert">Parcours non certifié. Aucune notification n’est envoyée par cette interface. L’admission reste verrouillée en base jusqu’à validation complète. Ne pas utiliser sur le pilote.</p>
    {error ? <p role="alert">Données d’équipe ou sites indisponibles. Aucune action n’est proposée ; rechargez la page.</p> : <>
      <h3>Membres existants</h3>
      {data.membres.length ? data.membres.map(m => <MembreForm key={`${m.id}-${m.revision}`} membre={m} sites={sites}/>) : <p>Aucun membre laboratoire ou vendeur.</p>}
      <p>Le code permet de demander un rattachement ; partagez-le uniquement par un canal de confiance. Une approbation n’active pas le compte.</p>
      <CodeForm/><details><summary>Renouveler le code de demande</summary><CodeForm renouveler/></details>
      <h3>Demandes en attente</h3>{data.demandes.length ? data.demandes.map(d => <DemandeForm key={d.id} demande={d} sites={sites}/>) : <p>Aucune demande.</p>}
      <h3>Approbations en attente d’acceptation</h3>{data.approbations.length ? data.approbations.map(d => <AnnulerApprobation key={d.id} demande={d}/>) : <p>Aucune approbation.</p>}
      <details><summary>Enregistrer une invitation</summary><p>L’invitation est liée à une adresse Auth vérifiée ; elle ne constitue pas un envoi de courrier et aucun accès n’est activé ici.</p><InvitationForm sites={sites}/></details>
      <h3>Invitations non annulées et non utilisées</h3>{data.invitations.length ? data.invitations.map(i => <InvitationItem key={i.id} invitation={i} sites={sites}/>) : <p>Aucune invitation.</p>}
    </>}
  </section>;
}
