"use server";

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";
import { parseVersionInput } from "./version-input";

export type RecettesState = { erreur?: string; succes?: string };

function mapError(error: { code?: string; message: string }): string {
  return messageUtilisateur(error, "Opération refusée");
}

async function requireWriter(): Promise<RecettesState | null> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };
  return null;
}

/** Création d'une famille de recette (RPC creer_famille). */
export async function createFamilleReal(_prev: RecettesState, formData: FormData): Promise<RecettesState> {
  const denied = await requireWriter();
  if (denied) return denied;
  const code = String(formData.get("code") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const produitId = String(formData.get("produitId") ?? "").trim();
  if (code.length < 1 || code.length > 20) return { erreur: "Code requis (20 max)." };
  if (nom.length < 1 || nom.length > 100) return { erreur: "Nom requis (100 max)." };
  if (!/^[0-9a-f-]{36}$/i.test(produitId)) return { erreur: "Produit invalide." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creer_famille", {
      p_code: code, p_nom: nom, p_produit_id: produitId,
    });
    if (error) return { erreur: mapError(error) };
    revalidatePath("/recettes");
    return { succes: `Famille ${code} créée.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/**
 * Création d'une version de recette (RPC creer_version) : lignes article ou
 * sous-recette en version figée, conversions d'unités et anti-cycle gérés
 * côté serveur. Une version utilisée par un OF n'est jamais modifiée.
 */
export async function createVersionReal(_prev: RecettesState, formData: FormData): Promise<RecettesState> {
  const denied = await requireWriter();
  if (denied) return denied;
  let input;
  try {
    input = parseVersionInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  const lignes = input.lignes.map((l) =>
    l.kind === "article"
      ? { articleId: l.articleId, q: l.q, u: l.u, parage: l.parage }
      : { subVersionId: l.subVersionId, q: l.q, u: l.u },
  );
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creer_version", {
      p_famille_id: input.familleId,
      p_rendement_qte: input.rendementQte,
      p_rendement_unite: input.rendementUnite,
      p_lignes: lignes,
      p_notes: input.notes,
      p_mo_min: input.moMin,
      p_energie: input.energie,
      p_emballage: input.emballage,
      p_frais_generaux: input.fraisGeneraux,
      p_cuisson_perte_pct: input.cuissonPertePct,
      p_active: input.active,
    });
    if (error) return { erreur: mapError(error) };
    const r = data as { version?: number; active?: boolean } | null;
    revalidatePath("/recettes");
    return { succes: `Version ${r?.version} créée${r?.active ? " et activée" : ""}.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Activation d'une version (RPC activer_version) : la précédente est désactivée. */
export async function activateVersionReal(_prev: RecettesState, formData: FormData): Promise<RecettesState> {
  const denied = await requireWriter();
  if (denied) return denied;
  const versionId = String(formData.get("versionId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) return { erreur: "Version invalide." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("activer_version", { p_version_id: versionId });
    if (error) return { erreur: mapError(error) };
    const r = data as { version?: number } | null;
    revalidatePath("/recettes");
    return { succes: `Version ${r?.version} activée (les autres sont désactivées).` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
