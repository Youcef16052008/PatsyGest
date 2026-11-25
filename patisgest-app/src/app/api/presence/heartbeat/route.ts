import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { clampTrialDays, signTrialLicense, type SubscriptionStatus } from "@/lib/trial-crypto";

export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ erreur: "Session requise." }, { status: 401 });
  }
  if (ctx.mode !== "supabase") {
    return NextResponse.json({ ok: true, mode: "pilote-local" });
  }
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("enregistrer_presence_utilisateur", {
      p_telephone: null,
    });
    if (error || !data || typeof data !== "object") {
      return NextResponse.json({ erreur: "Enregistrement de présence impossible." }, { status: 503 });
    }
    const row = data as Record<string, unknown>;
    const statutRaw = String(row.statut_abonnement ?? "essai");
    const statut: SubscriptionStatus =
      statutRaw === "paye" || statutRaw === "suspendu" ? statutRaw : "essai";
    const trialDays = clampTrialDays(row.essai_duree_jours);
    const startedAtMs = Date.parse(String(row.essai_debut_at ?? "")) || Date.now();
    const expiresAtMs = Date.parse(String(row.essai_fin_at ?? "")) || startedAtMs + trialDays * 86_400_000;
    const nowMs = Date.parse(String(row.server_now ?? "")) || Date.now();
    const licenseVersion = Number(row.license_version ?? 1) || 1;
    const clientNom = String(row.client_nom ?? ctx.clientNom);
    const clientId = String(row.client_id ?? ctx.clientId);

    const { token, publicJwk } = signTrialLicense({
      clientId,
      clientNom,
      statut,
      trialDays,
      startedAtMs,
      expiresAtMs,
      issuedAtMs: nowMs,
      licenseVersion,
    });

    return NextResponse.json({
      ok: true,
      verrouille: Boolean(row.verrouille),
      signedBundle: {
        token,
        publicJwk,
        payload: {
          clientId,
          clientNom,
          statut,
          trialDays,
          startedAtMs,
          expiresAtMs,
          issuedAtMs: nowMs,
          licenseVersion,
        },
      },
    });
  } catch {
    return NextResponse.json({ erreur: "Service indisponible." }, { status: 503 });
  }
}
