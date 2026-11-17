/**
 * US-15.1 / US-15.2 — identité de l'établissement et en-tête légal.
 *
 * Cahier §5 « Facture & ticket — mentions obligatoires : NIF, NIS, RC, n°,
 * date, lignes, TVA par taux, HT/TTC ». Le ticket de caisse n'affichait que
 * « PâtisGest — Caisse » : aucune mention légale, ce qui rend le ticket
 * non conforme pour un contrôle.
 *
 * Pur et testable : valide les identifiants algériens et décide si le ticket
 * peut être imprimé tel quel.
 */

export type Etablissement = {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  nif: string | null;
  nis: string | null;
  rc: string | null;
};

/** Les 3 identifiants exigés sur un ticket / une facture. */
export const IDENTIFIANTS_LEGAUX = ["nif", "nis", "rc"] as const;
export type IdentifiantLegal = (typeof IDENTIFIANTS_LEGAUX)[number];

export const LIBELLES_LEGAUX: Record<IdentifiantLegal, string> = {
  nif: "NIF (identifiant fiscal)",
  nis: "NIS (identifiant statistique)",
  rc: "RC (registre de commerce)",
};

/** Nettoie une saisie : espaces multiples réduits, bords coupés. */
function nettoyer(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Valide le NIF : 15 chiffres en Algérie (identifiant fiscal).
 * On tolère les espaces et les séparateurs de saisie, pas les lettres.
 */
export function validerNif(brut: string | null | undefined): { ok: boolean; valeur: string; erreur?: string } {
  const v = nettoyer(brut);
  if (v === "") return { ok: false, valeur: "", erreur: "NIF obligatoire." };
  const chiffres = v.replace(/[\s.-]/g, "");
  if (!/^\d+$/.test(chiffres)) {
    return { ok: false, valeur: v, erreur: "Le NIF ne doit contenir que des chiffres." };
  }
  if (chiffres.length !== 15) {
    return { ok: false, valeur: v, erreur: `Le NIF doit comporter 15 chiffres (saisi : ${chiffres.length}).` };
  }
  return { ok: true, valeur: v };
}

/** Valide le NIS : 15 chiffres, même forme que le NIF. */
export function validerNis(brut: string | null | undefined): { ok: boolean; valeur: string; erreur?: string } {
  const r = validerNif(brut);
  return { ...r, erreur: r.erreur?.replace("NIF", "NIS") };
}

/**
 * Valide le RC : format algérien libre mais structuré, ex. `31/00-123456B26`
 * (wilaya / registre). On exige au moins un chiffre et un séparateur `/`,
 * sans imposer une forme unique : les wilayas diffèrent.
 */
export function validerRc(brut: string | null | undefined): { ok: boolean; valeur: string; erreur?: string } {
  const v = nettoyer(brut);
  if (v === "") return { ok: false, valeur: "", erreur: "RC obligatoire." };
  if (v.length < 6 || v.length > 40) {
    return { ok: false, valeur: v, erreur: "RC invalide (6 à 40 caractères)." };
  }
  if (!/\d/.test(v)) return { ok: false, valeur: v, erreur: "Le RC doit contenir un numéro." };
  if (!/[/-]/.test(v)) {
    return { ok: false, valeur: v, erreur: "RC invalide : format attendu « wilaya/registre », ex. 31/00-123456B26." };
  }
  return { ok: true, valeur: v };
}

export type VerifIdentite = {
  complet: boolean;
  manquants: IdentifiantLegal[];
  erreurs: Partial<Record<IdentifiantLegal, string>>;
};

/** Vérifie les 3 identifiants et renvoie ce qui manque ou cloche. */
export function verifierIdentite(e: Partial<Etablissement> | null | undefined): VerifIdentite {
  const manquants: IdentifiantLegal[] = [];
  const erreurs: Partial<Record<IdentifiantLegal, string>> = {};
  const valeurs = {
    nif: validerNif(e?.nif),
    nis: validerNis(e?.nis),
    rc: validerRc(e?.rc),
  };
  for (const cle of IDENTIFIANTS_LEGAUX) {
    const r = valeurs[cle];
    if (!r.valeur) manquants.push(cle);
    else if (!r.ok && r.erreur) erreurs[cle] = r.erreur;
  }
  return {
    complet: manquants.length === 0 && Object.keys(erreurs).length === 0,
    manquants,
    erreurs,
  };
}

/**
 * Lignes d'en-tête imprimées sur le ticket. On n'affiche jamais un
 * identifiant absent : mieux vaut un ticket visiblement incomplet (et l'alerte
 * de `avertissementsTicket`) qu'une mention légale inventée.
 */
export function enteteTicket(e: Partial<Etablissement> | null | undefined): string[] {
  const nom = nettoyer(e?.nom);
  const lignes: string[] = [nom || "Établissement"];
  const adresse = nettoyer(e?.adresse);
  if (adresse) lignes.push(adresse);
  const tel = nettoyer(e?.telephone);
  if (tel) lignes.push(`Tél. ${tel}`);
  for (const cle of IDENTIFIANTS_LEGAUX) {
    const v = nettoyer(e?.[cle] as string | null | undefined);
    if (v) lignes.push(v.toUpperCase().startsWith(cle.toUpperCase()) ? v : `${cle.toUpperCase()} ${v}`);
  }
  return lignes;
}

/**
 * Avertissements bloquants pour l'impression d'un ticket. Non bloquants pour
 * l'encaissement : le cahier impose « alerte, jamais blocage » — une panne de
 * paramétrage ne doit pas empêcher une vente.
 */
export function avertissementsTicket(e: Partial<Etablissement> | null | undefined): string[] {
  const out: string[] = [];
  const { manquants, erreurs } = verifierIdentite(e);
  for (const m of manquants) out.push(`${LIBELLES_LEGAUX[m]} manquant — mention obligatoire sur le ticket.`);
  for (const cle of Object.keys(erreurs) as IdentifiantLegal[]) {
    out.push(`${LIBELLES_LEGAUX[cle]} : ${erreurs[cle]}`);
  }
  if (!nettoyer(e?.nom)) out.push("Nom de l'établissement manquant.");
  if (!nettoyer(e?.adresse)) out.push("Adresse manquante — exigée par le décret 13-378.");
  return out;
}
