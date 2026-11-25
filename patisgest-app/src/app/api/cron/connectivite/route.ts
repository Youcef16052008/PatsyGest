import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getMasterSession } from "@/lib/master-auth";
import { runOfflineDisconnectAlerts } from "@/lib/connectivite-cron";

export const dynamic = "force-dynamic";

function checkCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || secret.length < 12) return false;
  const auth = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  const candidate = auth.startsWith("Bearer ") ? auth.slice(7).trim() : headerSecret.trim();
  if (!candidate) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  const isCron = checkCronSecret(request);
  const master = isCron ? null : await getMasterSession();
  if (!isCron && !master) {
    return NextResponse.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const summary = await runOfflineDisconnectAlerts();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
