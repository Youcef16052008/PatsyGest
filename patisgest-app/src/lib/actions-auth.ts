"use server";

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { demoEnabled, PILOT_ACCOUNTS, PILOT_COOKIE_NAME } from "./auth";
import { createClient } from "./supabase/server";

export interface LoginState { erreur: string }

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("motdepasse") ?? "");
  if (!email || !password) return { erreur: "E-mail et mot de passe obligatoires." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { erreur: "Connexion impossible : vérifiez vos identifiants ou la disponibilité de Supabase." };
    (await cookies()).delete(PILOT_COOKIE_NAME);
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur. Utilisez la démo locale si elle est activée." };
  }
  redirect("/tableau-de-bord");
}

/** Ouvre uniquement une démo locale, jamais une session Supabase. */
export async function quickDemoLogin(formData: FormData): Promise<void> {
  if (!demoEnabled()) redirect("/connexion");
  const email = String(formData.get("email") ?? "").toLowerCase();
  if (!PILOT_ACCOUNTS[email]) redirect("/connexion");
  const payload = Buffer.from(JSON.stringify({ email, expires: Date.now() + 8 * 3600_000 })).toString("base64url");
  const signature = createHmac("sha256", process.env.PATISGEST_DEMO_SECRET!).update(payload).digest("hex");
  (await cookies()).set(PILOT_COOKIE_NAME, `${payload}.${signature}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 3600, secure: process.env.NODE_ENV === "production" });
  redirect("/tableau-de-bord");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const wasDemo = !!store.get(PILOT_COOKIE_NAME);
  store.delete(PILOT_COOKIE_NAME);
  if (!wasDemo) {
    try { const supabase = await createClient(); await supabase.auth.signOut(); } catch { /* network unavailable */ }
  }
  // Clear any pre-existing Supabase browser cookies even when leaving the local demo.
  for (const cookie of store.getAll()) {
    if (/^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)) store.delete(cookie.name);
  }
  redirect("/connexion");
}
