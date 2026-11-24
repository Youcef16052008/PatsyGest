// Cette interface est limitée au développement local, et doit viser une base
// jetable. Ceci ne remplace pas les protections SQL ni le verrou d'admission.
export function equipeExperimentaleActive(env: NodeJS.ProcessEnv = process.env): boolean {
  // VERCEL_ENV : la variable est définie par Vercel sur TOUS ses environnements, et
  // sa simple présence suffit — y compris une chaîne vide. Un test a montré que
  // `VERCEL_ENV: ''` active le module : « défini mais vide » n'est pas « absent ».
  // On teste donc la présence de la clé, pas sa valeur. C'est plus strict, et c'est
  // le sens voulu : sur Vercel, le module est fermé, point.
  const surVercel = "VERCEL_ENV" in env && env.VERCEL_ENV !== undefined;
  if (env.NODE_ENV !== "development" || surVercel || env.PATSYGEST_EQUIPE_EXPERIMENTAL !== "true") return false;
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && url.port === "54321" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}
