import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { clampTrialDays, signTrialLicense, type SubscriptionStatus } from "@/lib/trial-crypto";

export const dynamic = "force-dynamic";

export async function POST() {
  // Issue de secours, sans laquelle le verrou ne se lève jamais :
  // l'écran de verrouillage ne sonde QUE /api/licence/statut et ce heartbeat
  // (src/components/trial-guard-client.tsx). Avec `getSessionContext()` nu,
  // un client verrouillé recevait 401 : impossible de voir le paiement validé.
  // Ce heartbeat n'est pas une écriture métier : il rafraîchit la présence et
  // renvoie le jeton de statut. Les actions de vente/stock restent fermées.
  const ctx = await getSessionContext({ allowLocked: true });
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
