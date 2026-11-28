import { createClient } from "@supabase/supabase-js";
import { previewBloquee } from "../preview-guard";

/**
 * Client Supabase privilégié (service_role) réservé aux routes serveur
 * (/master, cron connectivité, création de compte provisionnée).
 * Jamais importé côté client.
 */
export function createAdminClient() {
  if (previewBloquee(process.env.VERCEL_ENV, process.env.PATISGEST_PREVIEW_BLOCKED)) {
    throw new Error("Accès Supabase désactivé en aperçu non isolé.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
