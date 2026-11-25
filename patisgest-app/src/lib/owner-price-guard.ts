export type PriceAlertTargetType = "recette_libre" | "article" | "cake" | "nouveau_produit";
export type PriceAlertProductCategory = "gateau_entier" | "tarte" | "cake" | "recette" | "viennoiserie" | "autre";
export type OwnerAlertStatus = "en_attente" | "approuve" | "corrige" | "bloque";

export type OwnerPriceAlert = {
  id: string;
  type: "nouveau_prix_employe" | "prix_trop_bas";
  severite: "info" | "warning" | "critical";
  cibleType: PriceAlertTargetType;
  cibleId: string;
  nomProduit: string;
  categorie: PriceAlertProductCategory;
  prixSaisiDa: number;
  coutEstimeDa: number | null;
  prixConseilleDa: number | null;
  auteurNom: string;
  message: string;
  traiteStatut: OwnerAlertStatus;
  prixFinalDa: number | null;
  createdAt: string;
};

export const DEMO_OWNER_ALERTS_KEY_PREFIX = "patisgest.owner_alerts.v1.";

const CATEGORY_MIN_FLOOR_DA: Record<PriceAlertProductCategory, number> = {
  gateau_entier: 1200,
  tarte: 500,
  cake: 450,
  recette: 120,
  viennoiserie: 35,
  autre: 50,
};

export function evaluateEmployeePriceSubmission(input: {
  id?: string;
  cibleType: PriceAlertTargetType;
  cibleId?: string;
  nomProduit: string;
  categorie?: PriceAlertProductCategory;
  prixSaisiDa: number;
  coutEstimeDa?: number | null;
  auteurNom: string;
  auteurRole: string;
  nowIso?: string;
}): OwnerPriceAlert | null {
  if (input.auteurRole === "proprietaire") {
    return null;
  }

  const nom = input.nomProduit.trim();
  const prix = Math.round(Number(input.prixSaisiDa) * 100) / 100;
  const cout =
    input.coutEstimeDa != null && Number.isFinite(Number(input.coutEstimeDa)) && Number(input.coutEstimeDa) > 0
      ? Math.round(Number(input.coutEstimeDa) * 100) / 100
      : null;
  const categorie = input.categorie ?? "gateau_entier";
  const prixConseilleDa = cout != null ? Math.round(cout * 2.5) : null;
  const floor = CATEGORY_MIN_FLOOR_DA[categorie] ?? 50;

  const belowCostOrLowMargin = cout != null && prix <= cout * 1.25;
  const belowFloor = prix <= 0 || prix < floor;
  const tooLow = belowCostOrLowMargin || belowFloor;

  const fmt = (n: number) => `${new Intl.NumberFormat("fr-DZ").format(Math.round(n))} DA`;

  let message: string;
  if (tooLow) {
    const reason =
      cout != null && prix <= cout
        ? `Prix inférieur ou égal au coût estimé (${fmt(cout)}) !`
        : cout != null
          ? `Marge très faible par rapport au coût estimé (${fmt(cout)} · conseillé ${fmt(prixConseilleDa ?? cout * 2.5)}).`
          : `Prix inhabituellement bas pour cette catégorie (seuil repère ${fmt(floor)}).`;
    message = `Prix très bas signalé : ${input.auteurNom} a saisi ${fmt(prix)} pour « ${nom} ». ${reason}`;
  } else {
    message = `Nouveau prix saisi par ${input.auteurNom} : « ${nom} » à ${fmt(prix)} — À vérifier par le patron.`;
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    type: tooLow ? "prix_trop_bas" : "nouveau_prix_employe",
    severite: tooLow ? "critical" : "warning",
    cibleType: input.cibleType,
    cibleId: input.cibleId ?? "",
    nomProduit: nom,
    categorie,
    prixSaisiDa: prix,
    coutEstimeDa: cout,
    prixConseilleDa,
    auteurNom: input.auteurNom,
    message,
    traiteStatut: "en_attente",
    prixFinalDa: null,
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function resolveOwnerPriceAlert(
  alert: OwnerPriceAlert,
  decision: Exclude<OwnerAlertStatus, "en_attente">,
  nouveauPrixDa?: number | null,
): OwnerPriceAlert {
  if (decision === "corrige") {
    const p = Number(nouveauPrixDa);
    if (!Number.isFinite(p) || p <= 0) {
      throw new Error("Indiquez un nouveau prix positif en DA.");
    }
    return {
      ...alert,
      traiteStatut: "corrige",
      prixFinalDa: Math.round(p * 100) / 100,
    };
  }
  return {
    ...alert,
    traiteStatut: decision,
    prixFinalDa: decision === "approuve" ? alert.prixSaisiDa : null,
  };
}
