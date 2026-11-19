import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DOMAINE_SERVICE_PAR_DEFAUT, deciderRoutage } from "@/lib/domaines";

/**
 * Rafraîchit la session Supabase à chaque requête (cookies à jour).
 * En mode hors-ligne / pare-feu (ex: environnement isolé), ne bloque jamais la requête
 * conformément au principe architectural « Hors-ligne par conception / Alerte, jamais blocage ».
 */
export async function middleware(request: NextRequest) {
  // --- 1. Routage par hôte : `slug.patisgest.dz` → vitrine publique.
  // Décision pure, aucun appel réseau : elle doit rester instantanée même
  // si Supabase est injoignable (mode hors-ligne de la caisse).
  const routage = deciderRoutage(
    request.headers.get("host"),
    request.nextUrl.pathname,
    request.nextUrl.search,
    process.env.PATISGEST_DOMAINE ?? DOMAINE_SERVICE_PAR_DEFAUT,
  );
  if (routage.type === "reecrire") {
    // Réécriture sur la MÊME origine : l'URL du visiteur reste
    // `elyasmine.patisgest.dz`, seul le chemin interne change.
    const cible = request.nextUrl.clone();
    cible.pathname = routage.chemin;
    cible.search = routage.recherche;
    return NextResponse.rewrite(cible);
  }

  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  // Si une session pilote locale est active, inutile d'attendre un appel réseau bloqué
  if (process.env.NODE_ENV !== "production" && process.env.PATISGEST_DEMO_MODE === "true" && request.cookies.get("patisgest_pilot_session")?.value) {
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll: (async (
          cookiesToSet: Parameters<
            NonNullable<CookieMethodsServer["setAll"]>
          >[0]
        ) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        }) as NonNullable<CookieMethodsServer["setAll"]>,
      },
    });

    await Promise.race([
      supabase.auth.getUser(),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
  } catch {
    // Mode hors-ligne / sandbox : la session locale prend le relais
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
