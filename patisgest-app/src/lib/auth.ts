import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

import {
  canAccessModule,
  canCreateOrEditCakeQuotes,
  canDeleteRecipes,
  canManageCreditsAdmin,
  canManagePrices,
  canReadCosts,
  canSellAtPos,
  canUseCredits,
  canWrite,
  roleDisponible,
  type AppModule,
  type Role,
} from "./permissions";
import { comptePilotePropre } from "./pilot-account";
import { PILOT_ACCOUNTS } from "./pilot-accounts";
export { PILOT_ACCOUNTS } from "./pilot-accounts";

export {
  canAccessModule,
  canCreateOrEditCakeQuotes,
  canDeleteRecipes,
  canManageCreditsAdmin,
  canManagePrices,
  canReadCosts,
  canSellAtPos,
  canUseCredits,
  canWrite,
  roleDisponible,
};
export type { AppModule, Role };

export interface SessionContext {
  authUserId: string;
  email: string;
  nom: string;
  utilisateurId: string;
  clientId: string;
  clientNom: string;
  role: Role;
  mode: "supabase" | "pilote-local";
}

export const ROLE_LABELS: Record<Role, string> = {
  proprietaire: "Propriétaire",
  labo: "Laboratoire",
  vendeur: "Vendeur",
};

export const PILOT_COOKIE_NAME = "patisgest_pilot_session";

/** Le mode démo est explicite, non disponible en production, et isolé de Supabase. */
export function demoEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.PATISGEST_DEMO_MODE === "true" && (process.env.PATISGEST_DEMO_SECRET?.length ?? 0) >= 32;
}

/** Session complète : compte Auth Supabase ou session Pilote (hors-ligne / sandbox). */
export async function getSessionContext(): Promise<SessionContext | null> {
  const cookieStore = await cookies();
  const pilotCookie = cookieStore.get(PILOT_COOKIE_NAME)?.value;

  if (demoEnabled() && pilotCookie) {
    const [payload, signature] = pilotCookie.split(".");
    if (payload && signature) {
      const expected = createHmac("sha256", process.env.PATISGEST_DEMO_SECRET!).update(payload).digest("hex");
      const a = Buffer.from(signature); const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        try {
          const { email, expires } = JSON.parse(Buffer.from(payload, "base64url").toString());
          const account = typeof email === "string" ? comptePilotePropre(PILOT_ACCOUNTS, email) : null;
          if (account && typeof expires === "number" && expires > Date.now()) return { ...account, mode: "pilote-local" };
        } catch { /* invalid cookie */ }
      }
    }
  }

  try {
    const supabase = await createClient();
    const userRes = await Promise.race([
      supabase.auth.getUser(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);

    if (!userRes || !userRes.data?.user?.email) return null;
    const user = userRes.data.user;

    const { data } = await supabase
      .from("utilisateurs")
      .select("id, nom, client_id, role, clients ( nom )")
      .eq("auth_user_id", user.id)
      .single();

    if (!data) return null;
    const client = data.clients as unknown as { nom: string } | null;

    return {
      authUserId: user.id,
      email: user.email!,
      nom: (data.nom as string) ?? user.email!,
      utilisateurId: data.id as string,
      clientId: data.client_id as string,
      clientNom: client?.nom ?? "Votre établissement",
      role: data.role as Role,
      mode: "supabase",
    };
  } catch {
    return null;
  }
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

// `canWrite` / `canReadCosts` sont définis dans ./permissions (pur, testé)
// et ré-exportés en tête de fichier : une seule source de vérité.
