// Cette interface est limitée au développement local, et doit viser une base
// jetable. Ceci ne remplace pas les protections SQL ni le verrou d'admission.
export function equipeExperimentaleActive(env: NodeJS.ProcessEnv = process.env): boolean {
  // VERCEL_ENV : sur Vercel, la variable vaut toujours `production`, `preview` ou
  // `development` — jamais une chaîne vide. Une valeur vide (ou un blanc) ne peut
  // donc pas venir de Vercel : elle signifie « neutralisé explicitement », comme le
  // fait le harnais d'intégration qui lance `next dev` avec `VERCEL_ENV: ''`.
  //
  // J'avais d'abord testé la *présence* de la clé, pour être plus strict. C'était
  // trop strict d'un cran : ça fermait le module dans le harnais, donc `/rejoindre`
  // renvoyait une 404 et le test d'intégration échouait. La garde utile est « une
  // vraie valeur Vercel ferme le module » ; une chaîne vide n'en est pas une.
  const vercel = (env.VERCEL_ENV ?? "").trim();
  if (env.NODE_ENV !== "development" || vercel !== "" || env.PATSYGEST_EQUIPE_EXPERIMENTAL !== "true") return false;
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && url.port === "54321" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}
