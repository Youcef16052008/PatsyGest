import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { nomClientDepuisJointure } from "./auth-session";
import { lireStatutEssaiPartage } from "./trial-server";
import { essaiActif } from "./licence-mode";

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

/**
 * `getSessionContext` renvoie `null` pour DEUX raisons très différentes :
 * pas de session, ou essai verrouillé. Les appelants qui doivent distinguer
 * les deux (page d'accueil, routage de la racine) utilisent celui-ci.
 */
export type RaisonSansSession = "aucune-session" | "essai-verrouille";

export type ResultatSession =
  | { ctx: SessionContext; raison: null }
  | { ctx: null; raison: RaisonSansSession };

export interface OptionsSession {
  /**
   * `true` : ne pas appliquer le verrou d'essai. Réservé aux issues de
   * secours NON mutantes — l'écran de verrouillage doit pouvoir se rendre,
   * sonder le déverrouillage, et le propriétaire verrouillé doit pouvoir
   * exporter ses propres données (promesse « aucune donnée en otage »).
   * Par défaut `false` : tout le reste échoue fermé.
   */
  allowLocked?: boolean;
}

/*
 * Le statut d'essai est lu via `lireStatutEssaiPartage()` (trial-server.ts),
 * qui garantit UN SEUL appel RPC par requête même si le layout et la garde de
 * session le demandent tous les deux dans le même rendu.
 */

/** Session complète : compte Auth Supabase ou session Pilote (hors-ligne / sandbox). */
export async function getSessionContext(options: OptionsSession = {}): Promise<SessionContext | null> {
  return (await getSessionContextDetaille(options)).ctx;
}

/**
 * Comme `getSessionContext`, mais indique POURQUOI il n'y a pas de session.
 * Sert uniquement au routage d'affichage : un essai verrouillé ne doit pas
 * être renvoyé vers `/connexion`, sinon la reconnexion ne mène nulle part.
 */
export async function getSessionContextDetaille(
  options: OptionsSession = {},
): Promise<ResultatSession> {
  const ctx = await lireContexteBrut();
  if (!ctx) return { ctx: null, raison: "aucune-session" };
  if (options.allowLocked || ctx.mode !== "supabase") return { ctx, raison: null };

  /*
   * Interrupteur unique du mode « tout gratuit » (`licence-mode.ts`).
   *
   * Tant que `modeGratuit()` est actif — c'est le DÉFAUT — il n'y a ni essai
   * qui s'écoule, ni verrouillage, ni paiement : on ne lit donc même pas la
   * licence. Sans cette garde, le verrou serveur réactiverait l'expiration
   * d'essai que `PATISGEST_MODE_GRATUIT=1` a précisément pour but d'éteindre,
   * et court-circuiterait le seul interrupteur prévu pour la décision.
   *
   * Le jour où l'abonnement s'ouvre (`PATISGEST_MODE_GRATUIT=0`), le verrou
   * serveur s'active de lui-même : aucune autre modification n'est requise.
   */
  if (!essaiActif()) return { ctx, raison: null };

  // Échec ouvert assumé : RPC en erreur ou réponse vide ⇒ PAS verrouillé.
  // Une panne de base ne doit jamais mettre un atelier en production dehors.
  const essai = await lireStatutEssaiPartage().catch(() => null);
  if (essai?.verrouille === true) return { ctx: null, raison: "essai-verrouille" };
  return { ctx, raison: null };
}

/** Lecture brute de la session, SANS aucune règle métier. */
async function lireContexteBrut(): Promise<SessionContext | null> {
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
    // La jointure peut être un objet, un tableau (forme PostgREST classique)
    // ou vide : `nomClientDepuisJointure` gère les trois sans cast opaque.
    const nomClient = nomClientDepuisJointure(data.clients);

    return {
      authUserId: user.id,
      email: user.email!,
      nom: (data.nom as string) ?? user.email!,
      utilisateurId: data.id as string,
      clientId: data.client_id as string,
      clientNom: nomClient ?? "Votre établissement",
      role: data.role as Role,
      mode: "supabase",
    };
  } catch {
    return null;
  }
}

/** Exige une session (sinon → page de connexion). */
export async function requireSession(options: OptionsSession = {}): Promise<SessionContext> {
  const ctx = await getSessionContext(options);
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
