/** Données métier, marques et noms propres : volontairement non traduits en AR. */
export const DONNEES_PURES: readonly string[] = [
  "A",
  "Aïcha",
  "Aïcha (Propriétaire)",
  "Amine",
  "FR",
  "Baklawa aux amandes (Plateau 40 pièces) — photo de la recette",
  "Beurre",
  "Beurre pâtissier",
  "Crème liquide 35 %",
  "Croissant au beurre",
  "Éclair chocolat",
  "Layer Cake Anniversaire Chocolat (16 قطع) — photo de la recette",
  "Maison Amande",
  "Mille-feuille vanille maison — photo de la recette",
  "Œufs, sucre & farine (dacquoise)",
  "Pain au chocolat",
  "PâtisGest",
  "PâtisGest · Espace de gestion",
  "Plaquette chocolat & décor finition",
  "Praliné amande-noisette",
  "Sara",
  "Tartelette citron",
  "Sucre",
];

const NOMS_DONNEES: readonly string[] = [
  ...DONNEES_PURES.filter((nom) => nom.length > 3),
  "Laiterie El Bahdja", "Crème mousseline vanille", "Boutique", "Vitrine du matin",
  "plateau entreprise", "cake drum", "topper", "ruban", "Supabase", "Vercel",
];
const MOTIFS_DONNEES: readonly RegExp[] = [
  /·\s*OF-[0-9A-F]+/u,
  /— photo de la recette/u,
  /\b(?:SUPABASE_SERVICE_ROLE_KEY|PATISGEST_MASTER_KEY|CRON_SECRET|Twilio network error|Webhook network error|AppearanceProvider)\b/u,
  /\b(?:RC|OF|PF|MAT)-\d+/u,
  /\b(?:TK|DEV|BC|OF|MAT|PF|BEU|FAR|SUC|ECL|TP|CR|SR)-[0-9A-Z-]+/u,
  /\b\d{4}-\d{2}-\d{2}\b/u,
  /\b(?:J-\d|v\d|Ø|cm³|×\d|→)/u,
  /\b[a-f0-9]{8,}\b/u,
  /\b\d{4}-\d{2}-\d{2}T[\d:.]+Z\b/u,
  /\bZ\b/u,
  /\b[a-f0-9]{8,}\b/u,
  /\b\d{4}-\d{2}-\d{2}T[\d:.]+Z\b/u,
  /\b(?:TK|DEV|BC|OF|MAT|PF|BEU|FAR|SUC|ECL|TP|CR|SR)-[0-9A-Z-]+\b/u,
  /\b(?:NIF|NIS|RC|FEFO|RLS|Supabase|Vercel|UE|IFU|TVA|HACCP|CGU|DA|cm³|Ø|J-\d|v\d|×\d)\b/u,
  /\b(?:réalisées|avec TVA|Suggéré|Réception du|Déjà en OF|Stock boutique|Ventes comptoir|Moyenne comptoir|Demande boutique|Crème mousseline vanille|Laiterie El Bahdja|Vitrine du matin|plateau entreprise|Acompte payé|Confirmé)\b/u,
];

/** Vrai si la chaîne contient une donnée ou un nom propre pouvant rester latin. */
export function contientDonnee(fr: string): boolean {
  return DONNEES_PURES.includes(fr)
    || NOMS_DONNEES.some((nom) => fr.includes(nom))
    || MOTIFS_DONNEES.some((motif) => motif.test(fr));
}

/** Vrai si la chaîne entière est une donnée, sans libellé d'interface à traduire. */
export function estDonneePure(fr: string): boolean {
  return DONNEES_PURES.includes(fr)
    || /·\s*OF-[0-9A-F]+/u.test(fr)
    || /^PâtisGest\b/u.test(fr)
    || /^Maison Amande\b/u.test(fr);
}
