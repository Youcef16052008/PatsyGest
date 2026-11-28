/**
 * H16-06 — garde runtime des lignes PostgREST de l'export comptable.
 *
 * Le cast `as unknown as {...}[]` de la route ne valide rien : une ligne
 * incomplète produisait `NaN` ou une date `undefined` dans un CSV équilibré en
 * apparence. On refuse explicitement toute pièce malformée avant d'écrire le
 * fichier, sans jamais émettre de CSV partiel.
 */

export type LigneVenteComptableBrute = {
  id: string;
  numero: string;
  date_vente: string;
  total_ht: number;
  total_ttc: number;
  lignes: { tva?: number }[] | null;
};

export type LigneAvoirComptableBrute = {
  id: string;
  numero: string;
  cree_le: string;
  total_ht: number;
  total_ttc: number;
  tva_pct: number;
};

type Resultat<T> = { ok: true; lignes: T[] } | { ok: false; raison: string };

function texteNonVide(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function nombreFin(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Valide toutes les lignes de vente ; la première anomalie suffit à refuser l'export. */
export function validerLignesVentesComptables(lignes: unknown): Resultat<LigneVenteComptableBrute> {
  if (!Array.isArray(lignes)) return { ok: false, raison: "réponse ventes non tabulaire" };
  const sortie: LigneVenteComptableBrute[] = [];
  for (const [i, brut] of lignes.entries()) {
    if (!estObjet(brut)) return { ok: false, raison: `vente ${i + 1} malformée` };
    if (!texteNonVide(brut.id) || !texteNonVide(brut.numero) || !texteNonVide(brut.date_vente)) {
      return { ok: false, raison: `vente ${i + 1} : identifiant, numéro ou date manquant` };
    }
    const totalHt = nombreFin(brut.total_ht);
    const totalTtc = nombreFin(brut.total_ttc);
    if (totalHt === null || totalTtc === null) {
      return { ok: false, raison: `vente ${i + 1} : montant non numérique` };
    }
    let detail: { tva?: number }[] | null = null;
    if (brut.lignes !== null && brut.lignes !== undefined) {
      if (!Array.isArray(brut.lignes)) return { ok: false, raison: `vente ${i + 1} : lignes non tabulaires` };
      detail = [];
      for (const l of brut.lignes) {
        if (!estObjet(l)) return { ok: false, raison: `vente ${i + 1} : ligne de TVA malformée` };
        const tva = l.tva === undefined || l.tva === null ? undefined : nombreFin(l.tva);
        if (tva === null || (tva !== undefined && !Number.isFinite(tva))) {
          return { ok: false, raison: `vente ${i + 1} : TVA non numérique` };
        }
        detail.push(tva === undefined ? {} : { tva });
      }
    }
    sortie.push({
      id: String(brut.id),
      numero: String(brut.numero),
      date_vente: String(brut.date_vente),
      total_ht: totalHt,
      total_ttc: totalTtc,
      lignes: detail,
    });
  }
  return { ok: true, lignes: sortie };
}

/** Valide toutes les lignes d'avoir ; la première anomalie suffit à refuser l'export. */
export function validerLignesAvoirsComptables(lignes: unknown): Resultat<LigneAvoirComptableBrute> {
  if (!Array.isArray(lignes)) return { ok: false, raison: "réponse avoirs non tabulaire" };
  const sortie: LigneAvoirComptableBrute[] = [];
  for (const [i, brut] of lignes.entries()) {
    if (!estObjet(brut)) return { ok: false, raison: `avoir ${i + 1} malformé` };
    if (!texteNonVide(brut.id) || !texteNonVide(brut.numero) || !texteNonVide(brut.cree_le)) {
      return { ok: false, raison: `avoir ${i + 1} : identifiant, numéro ou date manquant` };
    }
    const totalHt = nombreFin(brut.total_ht);
    const totalTtc = nombreFin(brut.total_ttc);
    const tva = nombreFin(brut.tva_pct);
    if (totalHt === null || totalTtc === null || tva === null) {
      return { ok: false, raison: `avoir ${i + 1} : montant ou TVA non numérique` };
    }
    sortie.push({
      id: String(brut.id),
      numero: String(brut.numero),
      cree_le: String(brut.cree_le),
      total_ht: totalHt,
      total_ttc: totalTtc,
      tva_pct: tva,
    });
  }
  return { ok: true, lignes: sortie };
}
