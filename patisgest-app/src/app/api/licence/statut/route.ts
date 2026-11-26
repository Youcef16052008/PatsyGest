import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { lireStatutEssaiServeur } from "@/lib/trial-server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Lu par l'écran de verrouillage : doit répondre même verrouillé, sinon
  // il est impossible de détecter le déverrouillage après paiement.
  const ctx = await getSessionContext({ allowLocked: true });
  if (!ctx) {
    return NextResponse.json({ erreur: "Session requise." }, { status: 401 });
  }
  if (ctx.mode !== "supabase") {
    return NextResponse.json({ mode: "pilote-local", ok: true });
  }
  const statut = await lireStatutEssaiServeur();
  if (!statut) {
    return NextResponse.json({ erreur: "Statut de licence indisponible." }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    mode: "supabase",
    verrouille: statut.verrouille,
    statutAbonnement: statut.statutAbonnement,
    joursRestants: statut.joursRestants,
    signedBundle: statut.signedBundle,
  });
}
