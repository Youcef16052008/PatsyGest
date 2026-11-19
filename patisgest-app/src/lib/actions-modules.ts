"use server";
import { revalidatePath } from 'next/cache';
import { getSessionContext } from './auth';
import { createClient } from './supabase/server';
import { WORKSPACE_LINKS } from './workspace-nav';

export type ModuleActionState = {erreur?:string; succes?:string};
export async function modifierModule(_prev:ModuleActionState,form:FormData):Promise<ModuleActionState> {
  const ctx=await getSessionContext();
  if (!ctx || ctx.role!=='proprietaire' || ctx.mode!=='supabase') return {erreur:'Réservé au propriétaire connecté.'};
  const utilisateur=String(form.get('utilisateur')??''), moduleKey=String(form.get('module')??''), actif=String(form.get('actif')??'');
  const eligible=WORKSPACE_LINKS.some(l=>l.href===`/${moduleKey}` && !['/parametres','/tableau-de-bord'].includes(l.href));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(utilisateur)||!eligible||!['true','false'].includes(actif)) return {erreur:'Paramètres invalides.'};
  try {
    const db=await createClient();
    const {error}=await db.rpc('modifier_acces_module',{p_utilisateur_id:utilisateur,p_module:moduleKey,p_actif:actif==='true'});
    if(error) return {erreur:'Modification refusée. Vérifiez les accès et réessayez.'};
    revalidatePath('/', 'layout');
    return {succes:'Accès enregistré.'};
  } catch { return {erreur:'Modification impossible : connexion indisponible.'}; }
}
