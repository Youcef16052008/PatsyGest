import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Role = "proprietaire" | "labo" | "vendeur";

export interface SessionContext {
  authUserId: string;
  email: string;
  utilisateurId: string;
  clientId: string;
  clientNom: string;
  role: Role;
}

export const ROLE_LABELS: Record<Role, string> = {
  proprietaire: "Propriétaire",
  labo: "Laboratoire",
  vendeur: "Vendeur",
};

/** Session complète : compte Auth + ligne utilisateurs + client + rôle. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await supabase
    .from("utilisateurs")
    .select("id, client_id, role, clients ( nom )")
    .eq("auth_user_id", user.id)
    .single();

  if (!data) return null;
  const client = data.clients as unknown as { nom: string } | null;

  return {
    authUserId: user.id,
    email: user.email,
    utilisateurId: data.id as string,
    clientId: data.client_id as string,
    clientNom: client?.nom ?? "Ma pâtisserie",
    role: data.role as Role,
  };
}

/** Exige une session (sinon → page de connexion). */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/connexion");
  return ctx;
}

/** Exige un rôle parmi la liste (sinon → dashboard). */
export async function requireRole(
  ...roles: Role[]
): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!roles.includes(ctx.role)) redirect("/tableau-de-bord");
  return ctx;
}

/** Qui peut écrire (stocks, recettes, OF...) : propriétaire + labo. */
export function canWrite(role: Role): boolean {
  return role === "proprietaire" || role === "labo";
}
