import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { previewBloquee, routePubliquePreview } from "./lib/preview-guard";

/**
 * Rafraîchit la session Supabase à chaque requête (cookies à jour).
 * En mode hors-ligne / pare-feu (ex: environnement isolé), ne bloque jamais la requête
 * conformément au principe architectural « Hors-ligne par conception / Alerte, jamais blocage ».
 */
export async function proxy(request: NextRequest) {
  // Les variables Vercel Preview pointent actuellement sur la base pilote.
  // Bloquer même les POST/actions serveur ; ne pas dépendre du seul cookie.
  if (previewBloquee(process.env.VERCEL_ENV, process.env.PATISGEST_PREVIEW_BLOCKED)) {
    if (routePubliquePreview(request.nextUrl.pathname, request.method)) return NextResponse.next({ request });
    return new NextResponse("Aperçu temporairement indisponible : la base de test n'est pas isolée. Utilisez la production ou le calculateur public.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
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
