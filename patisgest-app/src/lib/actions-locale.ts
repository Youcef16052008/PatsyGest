"use server";

import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { LOCALE_COOKIE, readLocale } from "./i18n";
import { requireAnyRoleContexte } from "./journal-actions-communs";

/**
 * Persiste le choix FR/AR dans le profil Supabase (migration 56) et dans le
 * cookie immédiat. En démo locale, il n'y a pas de profil à écrire : le cookie
 * suffit et l'action reste silencieusement sans effet.
 */
export async function enregistrerLangueUtilisateur(langue: string): Promise<{ ok: boolean }> {
  const next = readLocale(langue);
  const garde = await requireAnyRoleContexte();
  const store = await cookies();
  store.set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  if (garde.denied || !garde.ctx || garde.ctx.mode !== "supabase") return { ok: false };

  try {
    const db = await createClient();
    const { error } = await db.rpc("enregistrer_langue_utilisateur", { p_langue: next });
    return { ok: !error };
  } catch {
    // Une base non migrée ou momentanément indisponible ne doit pas casser le
    // basculement visuel : le cookie conserve la préférence de session.
    return { ok: false };
  }
}
