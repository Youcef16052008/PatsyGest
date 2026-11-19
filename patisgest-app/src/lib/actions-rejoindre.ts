"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { equipeExperimentaleActive } from "./equipe-experimental";

export type RejoindreState = { erreur?: string; succes?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function clientVerifie() {
  if (!equipeExperimentaleActive()) return null;
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
  return db;
}

export async function demanderRattachement(_prev: RejoindreState, form: FormData): Promise<RejoindreState> {
  const code = String(form.get("code") ?? "").trim();
  const nom = String(form.get("nom") ?? "").trim();
  const role = String(form.get("role") ?? "");
  if (!uuid.test(code) || !nom || nom.length > 100 || !["vendeur", "labo"].includes(role)) return { erreur: "Code, nom ou rôle invalide." };
  try {
    const db = await clientVerifie();
    if (!db) return { erreur: "Compte vérifié ou fonctionnalité indisponible." };
    const { error } = await db.rpc("equipe_demander", { p_code: code, p_nom: nom, p_role: role });
    if (error) return { erreur: "Demande refusée. Vérifiez le code et l’état de votre compte." };
    revalidatePath("/rejoindre");
    return { succes: "Demande transmise. Consultez son statut ci-dessous ; aucun accès n’a été activé." };
  } catch { return { erreur: "Résultat non confirmé. Rechargez la page avant de réessayer." }; }
}

export async function repondreRattachement(_prev: RejoindreState, form: FormData): Promise<RejoindreState> {
  const id = String(form.get("id") ?? "");
  const choix = String(form.get("choix") ?? "");
  if (!uuid.test(id) || !["accepter_demande", "accepter_invitation", "refuser_invitation"].includes(choix)) return { erreur: "Choix invalide." };
  try {
    const db = await clientVerifie();
    if (!db) return { erreur: "Compte vérifié ou fonctionnalité indisponible." };
    const { error } = await db.rpc(`equipe_${choix}`, { p_id: id });
    if (error) return { erreur: "Action indisponible ou refusée. L’admission peut être verrouillée ; contactez le propriétaire." };
    revalidatePath("/rejoindre");
  } catch { return { erreur: "Résultat non confirmé. Rechargez la page avant de réessayer." }; }
  if (choix !== "refuser_invitation") redirect("/tableau-de-bord");
  return { succes: "Invitation refusée." };
}
