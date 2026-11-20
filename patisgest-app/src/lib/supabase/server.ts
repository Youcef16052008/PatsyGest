import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { previewBloquee } from "../preview-guard";

/**
 * Client Supabase côté serveur, AVEC la session de l'utilisateur.
 * Toutes les requêtes passent par la RLS (isolement client automatique).
 */
export async function createClient() {
  // Défense indépendante du proxy : une action serveur ou une route qui
  // le contournerait ne peut pas se connecter au pilote depuis un aperçu.
  if (previewBloquee(process.env.VERCEL_ENV, process.env.PATISGEST_PREVIEW_BLOCKED)) throw new Error("Accès Supabase désactivé en aperçu non isolé.");
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll: (async (cookiesToSet: Parameters<NonNullable<CookieMethodsServer["setAll"]>>[0]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appelé depuis un Server Component : le proxy rafraîchit la session.
          }
        }) as NonNullable<CookieMethodsServer["setAll"]>,
      },
    }
  );
}
