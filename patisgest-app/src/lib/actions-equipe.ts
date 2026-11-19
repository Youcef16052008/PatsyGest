"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import { createClient } from "./supabase/server";
import { equipeExperimentaleActive } from "./equipe-experimental";
import { WORKSPACE_LINKS } from "./workspace-nav";

export type EquipeActionState = { erreur?: string; succes?: string; code?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vérifier aussi côté serveur : masquer l'interface n'est pas une protection.
async function clientProprietaire() {
  if (!equipeExperimentaleActive()) return null;
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase" || ctx.role !== "proprietaire") return null;
  return createClient();
}

function sites(form: FormData): string[] | null {
  const values = form.getAll("sites");
  if (values.length < 1 || values.length > 100 || values.some(v => typeof v !== "string" || !uuid.test(v))) return null;
  const result = values as string[];
  return new Set(result.map(v => v.toLowerCase())).size === result.length ? result : null;
}

function revision(form: FormData): string | null {
  const value = String(form.get("revision") ?? "");
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value) || (value.length === 19 && value > "9223372036854775807")) return null;
  return value;
}

export async function modifierAffectationsEquipe(_prev: EquipeActionState, form: FormData): Promise<EquipeActionState> {
  const id = String(form.get("id") ?? "");
  const version = revision(form);
  const affectations = sites(form);
  const modules = form.getAll("modules");
  const permis = WORKSPACE_LINKS.filter(l => !["/parametres", "/tableau-de-bord"].includes(l.href)).map(l => l.href.slice(1));
  if (!uuid.test(id) || version === null || !affectations || modules.length > permis.length ||
      modules.some(m => typeof m !== "string" || !permis.includes(m)) || new Set(modules).size !== modules.length) {
    return { erreur: "Compte, version, sites ou modules invalides." };
  }
  try {
    const db = await clientProprietaire();
    if (!db) return { erreur: "Gestion d’équipe indisponible ou réservée au propriétaire." };
    const { error } = await db.rpc("equipe_modifier_affectations_versionnees", { p_utilisateur_id: id, p_revision: version, p_sites: affectations, p_modules: modules });
    if (error) return { erreur: error.code === "P0001" && error.message === "Affectations modifiees : rechargez la liste." ? "Les accès ont changé. Rechargez avant de recommencer." : "Modification refusée. Vérifiez les sites et rechargez la liste." };
    revalidatePath("/parametres");
    revalidatePath("/", "layout");
    return { succes: "Affectations enregistrées." };
  } catch { return { erreur: "Résultat non confirmé. Rechargez la liste avant de réessayer." }; }
}

export async function revoquerMembreEquipe(_prev: EquipeActionState, form: FormData): Promise<EquipeActionState> {
  const id = String(form.get("id") ?? "");
  const version = revision(form);
  if (!uuid.test(id) || version === null || form.get("confirmer") !== "oui") return { erreur: "Confirmez la révocation du membre." };
  try {
    const db = await clientProprietaire();
    if (!db) return { erreur: "Gestion d’équipe indisponible ou réservée au propriétaire." };
    const { error } = await db.rpc("equipe_revoquer_versionne", { p_utilisateur_id: id, p_revision: version });
    if (error) return { erreur: error.code === "P0001" && error.message === "Affectations modifiees : rechargez la liste." ? "Les accès ont changé. Rechargez avant de recommencer." : "Révocation refusée ou membre indisponible. Rechargez la liste." };
    revalidatePath("/parametres");
    return { succes: "Adhésion retirée. Le compte Auth lui-même n’a pas été supprimé." };
  } catch { return { erreur: "Résultat non confirmé. Rechargez la liste avant de réessayer." }; }
}

export async function afficherCodeEquipe(_prev: EquipeActionState, form: FormData): Promise<EquipeActionState> {
  try {
    const db = await clientProprietaire();
    if (!db) return { erreur: "Gestion d’équipe indisponible ou réservée au propriétaire." };
    const renouveler = form.get("renouveler") === "oui";
    if (renouveler && form.get("confirmer") !== "oui") return { erreur: "Confirmez le renouvellement : l’ancien code cessera de fonctionner." };
    const { data, error } = await db.rpc("equipe_code", { p_renouveler: renouveler });
    if (error || typeof data !== "string" || !uuid.test(data)) return { erreur: "Code indisponible. Vérifiez la configuration et réessayez." };
    return { code: data, succes: renouveler ? "Code renouvelé. L’ancien code ne fonctionne plus." : "Code de demande affiché." };
  } catch { return { erreur: "Connexion indisponible ; vérifiez l’état avant de réessayer." }; }
}

export async function deciderDemande(_prev: EquipeActionState, form: FormData): Promise<EquipeActionState> {
  const id = String(form.get("id") ?? "");
  const decision = String(form.get("decision") ?? "");
  if (!uuid.test(id) || !["approuver", "refuser", "annuler"].includes(decision)) return { erreur: "Demande invalide." };
  const affectations = decision === "approuver" ? sites(form) : null;
  if (decision === "approuver" && !affectations) return { erreur: "Choisissez au moins un site valide." };
  try {
    const db = await clientProprietaire();
    if (!db) return { erreur: "Gestion d’équipe indisponible ou réservée au propriétaire." };
    const rpc = decision === "approuver" ? "equipe_approuver_demande" : decision === "refuser" ? "equipe_refuser_demande" : "equipe_annuler_approbation";
    const args = decision === "approuver" ? { p_id: id, p_sites: affectations } : { p_id: id };
    const { error } = await db.rpc(rpc, args);
    if (error) return { erreur: "Décision refusée ou demande devenue indisponible. Rechargez la liste." };
    revalidatePath("/parametres");
    return { succes: decision === "approuver" ? "Demande approuvée. Aucun accès n’est activé par cette décision." : "Décision enregistrée." };
  } catch { return { erreur: "Résultat non confirmé. Rechargez la liste avant de réessayer." }; }
}

export async function creerInvitationEquipe(_prev: EquipeActionState, form: FormData): Promise<EquipeActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const nom = String(form.get("nom") ?? "").trim();
  const role = String(form.get("role") ?? "");
  const affectations = sites(form);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nom || nom.length > 100 || !["vendeur", "labo"].includes(role) || !affectations) {
    return { erreur: "Adresse, nom, rôle ou sites invalides." };
  }
  try {
    const db = await clientProprietaire();
    if (!db) return { erreur: "Gestion d’équipe indisponible ou réservée au propriétaire." };
    const { error } = await db.rpc("equipe_inviter", { p_email: email, p_nom: nom, p_role: role, p_sites: affectations });
    if (error) return { erreur: "Invitation refusée. Vérifiez les sites et réessayez." };
    revalidatePath("/parametres");
    return { succes: "Invitation enregistrée. Aucun e-mail n’a été envoyé et aucun accès n’est encore activé." };
  } catch { return { erreur: "Résultat non confirmé. Rechargez la liste avant de réessayer." }; }
}

export async function annulerInvitationEquipe(_prev: EquipeActionState, form: FormData): Promise<EquipeActionState> {
  const id = String(form.get("id") ?? "");
  if (!uuid.test(id) || form.get("confirmer") !== "oui") return { erreur: "Confirmez l’annulation de l’invitation." };
  try {
    const db = await clientProprietaire();
    if (!db) return { erreur: "Gestion d’équipe indisponible ou réservée au propriétaire." };
    const { error } = await db.rpc("equipe_annuler_invitation", { p_id: id });
    if (error) return { erreur: "Invitation indisponible ou annulation refusée. Rechargez la liste." };
    revalidatePath("/parametres");
    return { succes: "Invitation annulée." };
  } catch { return { erreur: "Résultat non confirmé. Rechargez la liste avant de réessayer." }; }
}
