import { NextResponse } from "next/server";

/**
 * Sonde de disponibilité : sans secret, sans donnée personnelle, sans accès
 * Supabase. Elle répond « le processus applicatif est vivant et peut rendre
 * une réponse HTTP », rien de plus — un 200 ici ne dit donc pas que la base
 * répond (c'est volontaire : une sonde qui touche la base devient elle-même
 * une panne quand la base est en pause).
 *
 * Ne jamais y ajouter de version de schéma, d'identifiant de tenant, d'e-mail
 * ni de message d'erreur : la route est publique par construction.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { ok: true, service: "patisgest", ts: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
