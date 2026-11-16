"use server";

import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export interface LoginState {
  erreur: string;
}

/** Connexion e-mail + mot de passe (comptes créés par le fondateur). */
export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("motdepasse") ?? "");

  if (!email || !password) {
    return { erreur: "E-mail et mot de passe obligatoires." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { erreur: "E-mail ou mot de passe incorrect." };
  }

  redirect("/tableau-de-bord");
}

/** Déconnexion. */
export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
