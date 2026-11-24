/**
 * MOD-15 / §8.3 — export comptable.
 *
 * Format exigé par le cahier des charges : « date, pièce, compte auxiliaire,
 * HT, TVA, TTC ». Pur et testable.
 *
 * Ce que ce module prend au sérieux :
 *
 * 1. **Les avoirs sont des montants négatifs.** Les oublier ou les passer en
 *    positif gonfle le chiffre d'affaires déclaré. Ce n'est pas un détail de
 *    présentation, c'est une erreur fiscale.
 * 2. **La réconciliation se vérifie avant de livrer.** Σ HT + Σ TVA doit égaler
 *    Σ TTC au centime. Si ce n'est pas le cas, `controleEquilibre` le dit et
 *    l'export n'est pas marqué versable — un export faux vaut moins qu'aucun
 *    export, parce qu'on lui fait confiance.
 * 3. **Une ligne anormale est signalée, jamais corrigée en silence.** Si une
 *    vente arrive avec un montant non numérique, on écrit 0 *et* on lève un
 *    drapeau `anomalie` que le comptable voit.
 *
 * Ce que ce module ne fait pas, volontairement : il ne choisit pas les comptes
 * du plan comptable algérien. Le compte auxiliaire est dérivé du site, ce qui
 * est stable et lisible ; le rattachement aux comptes 70x/445x est une décision
 * du comptable conseil (cf. CDC §2, « validation fiscale »), pas la nôtre.
 */

export type VenteComptable = {
  id: string;
  numero: string;
  date: string;
  site: string;
  totalHT: number;
  totalTTC: number;
  tva: number;
};

export type AvoirComptable = {
  id: string;
  numero: string;
  date: string;
  site: string;
  totalHT: number;
  totalTTC: number;
  tva: number;
};

export type EcritureComptable = {
  date: string;
  piece: string;
  compteAuxiliaire: string;
  ht: number;
  tva: number;
  ttc: number;
  /** Débit/crédit explicites : c'est ce que le comptable saisit réellement. */
  debit: number;
  credit: number;
  sens: "vente" | "avoir";
  anomalie: boolean;
};

export const entetesComptables = [
  "date",
  "piece",
  "compte_auxiliaire",
  "ht",
  "tva",
  "ttc",
  "sens",
  "anomalie",
] as const;

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

/** Compte auxiliaire stable : dérivé du site, normalisé. */
export function compteAuxiliaire(site: string): string {
  const propre = (site ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return propre ? `CLI-${propre}` : "CLI-DIVERS";
}

function ligne(
  src: { numero: string; date: string; site: string; totalHT: number; totalTTC: number; tva: number },
  sens: "vente" | "avoir",
): EcritureComptable {
  const signe = sens === "avoir" ? -1 : 1;
  const htBrut = Number(src.totalHT);
  const ttcBrut = Number(src.totalTTC);
  const tauxBrut = Number(src.tva);
  const nonFini =
    !Number.isFinite(htBrut) || !Number.isFinite(ttcBrut) || !Number.isFinite(tauxBrut);
  const ht = nonFini ? 0 : arrondi2(htBrut);
  const ttc = nonFini ? 0 : arrondi2(ttcBrut);
  // La TVA est ce qui a été encaissé en plus du HT : TTC − HT. C'est la seule
  // valeur qu'on puisse affirmer (le taux peut avoir changé en cours de mois).
  const tva = nonFini ? 0 : arrondi2(ttc - ht);
  // Contrôle indépendant : le taux déclaré doit reproduire le TTC. Si
  // 1 000 HT à 19 % donne 1 150 TTC, la ligne est incohérente en base et le
  // comptable doit le voir — sans quoi on lui livre une TVA qu'on n'explique pas.
  const attenduTTC = arrondi2(ht * (1 + (nonFini ? 0 : tauxBrut) / 100));
  const anomalie = nonFini || Math.abs(arrondi2(attenduTTC - ttc)) > 0.01;
  return {
    date: src.date,
    piece: src.numero,
    compteAuxiliaire: compteAuxiliaire(src.site),
    ht: arrondi2(signe * ht),
    tva: arrondi2(signe * tva),
    ttc: arrondi2(signe * ttc),
    debit: sens === "vente" ? arrondi2(ttc) : 0,
    credit: sens === "avoir" ? arrondi2(ttc) : 0,
    sens,
    anomalie,
  };
}

/** Construit les écritures, triées par date puis par pièce. */
export function ecrituresComptables(input: {
  ventes: VenteComptable[];
  avoirs: AvoirComptable[];
}): EcritureComptable[] {
  const lignes = [
    ...(input.ventes ?? []).map((v) => ligne(v, "vente")),
    ...(input.avoirs ?? []).map((a) => ligne(a, "avoir")),
  ];
  return lignes.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.piece !== b.piece) return a.piece < b.piece ? -1 : 1;
    return 0;
  });
}

export type ControleEquilibre = {
  /** true si Σ HT + Σ TVA = Σ TTC au centime. */
  ok: boolean;
  /** true si l'export peut être remis au comptable. */
  verse: boolean;
  ecart: number;
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  anomalies: number;
};

/**
 * Vérifie que l'export tient debout avant de le livrer.
 * `verse` est faux dès qu'il y a un écart ou une anomalie : un export qu'on ne
 * peut pas justifier ne doit pas partir.
 */
export function controleEquilibre(lignes: EcritureComptable[]): ControleEquilibre {
  let ht = 0;
  let tva = 0;
  let ttc = 0;
  let anomalies = 0;
  for (const l of lignes) {
    ht += l.ht;
    tva += l.tva;
    ttc += l.ttc;
    if (l.anomalie) anomalies += 1;
  }
  ht = arrondi2(ht);
  tva = arrondi2(tva);
  ttc = arrondi2(ttc);
  const ecart = arrondi2(ttc - (ht + tva));
  // Deux conditions distinctes, et il faut les tenir séparées :
  //  * `ok`      : la somme tient (Σ HT + Σ TVA = Σ TTC) ;
  //  * `verse`   : l'export est remettable au comptable, donc la somme tient
  //                ET aucune ligne n'est incohérente avec son taux de TVA.
  // Un export qui « tient » arithmétiquement parce qu'on a déduit la TVA du TTC
  // peut malgré tout contenir une ligne fausse. C'est `verse` qui bloque.
  const ok = Math.abs(ecart) < 0.005;
  return { ok, verse: ok && anomalies === 0, ecart, totalHT: ht, totalTVA: tva, totalTTC: ttc, anomalies };
}
