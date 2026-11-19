import "server-only";
import type { SessionContext } from "./auth";
import { createClient } from "./supabase/server";

/** null signifie lecture impossible, jamais une autorisation implicite. */
export async function lireModulesDesactives(ctx: SessionContext): Promise<Set<string> | null> {
  if (ctx.mode === 'pilote-local') return new Set();
  try {
    const db = await createClient();
    const {data,error}=await db.rpc('mes_modules_desactives');
    if (error || !Array.isArray(data) || !data.every(v=>typeof v==='string')) return null;
    return new Set(data as string[]);
  } catch { return null; }
}
