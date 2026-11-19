// Cette interface est limitée au développement local, et doit viser une base
// jetable. Ceci ne remplace pas les protections SQL ni le verrou d'admission.
export function equipeExperimentaleActive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "development" || env.VERCEL_ENV || env.PATSYGEST_EQUIPE_EXPERIMENTAL !== "true") return false;
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && url.port === "54321" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}
