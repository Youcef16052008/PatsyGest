/**
 * « Demain au labo » — proposition quotidienne de fabrication et de transfert,
 * validée par le chef (inspiré d'Almawarid & BakeSmart, adapté à PâtisGest).
 *
 * Formule transparente par produit fini pour la date cible `targetDate` :
 *   besoinVitrine        (demande boutique explicite OU moyenne comptoir des mêmes jours)
 * + commandesConfirmees  (pièces confirmées à préparer ce jour, jamais comptées deux fois)
 * = besoinBrut
 * − stockBoutiqueEligible (lots non bloqués ET non périmés à `targetDate`)
 * = besoinNetBoutique
 *   ├── aTransfererDuLabo (couvert par stock fini éligible déjà au labo)
 *   ├── dejaEnFabrication (OF planifiés/en cours pour cette date)
 *   └── aPreparer         (quantité nette proposée au lancement)
 *
 * Exemple de référence (passation §C) :
 *   22 ventes comptoir attendues + 6 pièces confirmées − 4 utilisables demain = 24 à préparer.
 *
 * Invariants :
 *  - Les demandes/devis non confirmés ne réservent rien et n'entrent pas dans le calcul.
 *  - Les lots bloqués ou dont la DLC < `targetDate` sont exclus du stock utilisable
 *    et signalés explicitement à la ligne.
 *  - Le calcul ne consomme aucun stock et ne crée aucun OF : seul le chef valide.
 *  - Chaque validation porte une référence stable (`buildTomorrowOfRef`) pour
 *    empêcher tout doublon d'OF en cas de double clic ou de reprise réseau.
 */

export type RestockStatus = "ouverte" | "planifiee" | "transferee" | "annulee";

export type RestockRequestItem = {
  id: string;
  targetDate: string;
  siteId: string;
  siteLabel: string;
  articleId: string;
  qty: number;
  motif: string;
  demandeur: string;
  statut: RestockStatus;
  ofNumero?: string | null;
  transfertRef?: string | null;
};

export type TomorrowProduct = {
  id: string;
  code: string;
  nom: string;
  unite: string;
  seuil: number;
  /** Recette active associée (si présente et accessible). */
  recipe?: {
    recipeId: string;
    versionId: string;
    version: number;
    nom: string;
    rendementBrut: number;
    moMin: number;
    /** Besoins matières pour 1 série de `rendementBrut` (parage & sous-recettes déjà étendus). */
    besoinsSerie: { articleId: string; code: string; nom: string; unite: string; qty: number }[];
  } | null;
};

export type TomorrowSale = {
  date: string;
  siteId: string;
  /** Seules les ventes comptoir (`caisse` / `z-import`) servent à la prévision vitrine. */
  source?: string | null;
  lignes: { articleId: string; qty: number }[];
};

export type TomorrowConfirmedOrder = {
  id: string;
  numero: string;
  clientNom: string;
  eventDate: string;
  /** Date du jalon de fabrication (par défaut eventDate − 1 jour). */
  productionDate: string;
  statut: string;
  /** Article fini rattaché (si commande sur modèle catalogue) ; null si gâteau sur mesure libre. */
  articleId?: string | null;
  /** Quantité en unité du produit (ou nombre de parts pour le sur-mesure). */
  qty: number;
  nbParts: number;
  notes?: string | null;
  /** Numéro d'OF déjà rattaché : empêche tout double comptage. */
  ofNumero?: string | null;
};

export type TomorrowLot = {
  id: string;
  articleId: string;
  siteId: string;
  siteRole: "labo" | "boutique";
  numero: string;
  qte: number;
  dlc: string | null;
  bloque: boolean;
};

export type TomorrowExistingOf = {
  id: string;
  numero: string;
  produitId: string | null;
  datePrevue: string;
  statut: string;
  qtePrevue: number;
  qteRealisee: number;
  clientRef?: string | null;
};

export type TomorrowLine = {
  articleId: string;
  code: string;
  nom: string;
  unite: string;
  /** Besoin vitrine attendu (demande boutique explicite OU moyenne historique comptoir). */
  besoinVitrine: number;
  sourceVitrine: "demande-boutique" | "meme-jour-semaine" | "moyenne-recente" | "seuil-secours" | "aucune";
  /** Pièces issues de commandes clients confirmées en plus (non déjà lancées en OF). */
  commandesConfirmees: number;
  commandesRefs: string[];
  /** Demandes de réassort ouvertes liées à cette ligne. */
  demandesIds: string[];
  besoinBrut: number;
  /** Stock boutique non bloqué et DLC >= targetDate. */
  stockBoutiqueUtilisable: number;
  /** Stock labo non bloqué et DLC >= targetDate (transférable). */
  stockLaboUtilisable: number;
  /** Lots exclus car DLC < targetDate (boutique + labo). */
  stockPerimeExclu: number;
  /** Lots exclus car bloqués (boutique + labo). */
  stockBloqueExclu: number;
  /** Quantité qu'on peut transférer du labo vers la boutique sans refabriquer. */
  aTransfererDuLabo: number;
  /** Quantité déjà couverte par des OF planifiés / en cours à cette date. */
  dejaEnFabrication: number;
  ofsExistants: string[];
  /** Quantité nette proposée à lancer au labo. */
  aPreparer: number;
  /** Explications lisibles de l'origine de la ligne. */
  raisons: string[];
  /** Recette active prête au lancement (null si aucune recette configurée). */
  recipe: {
    recipeId: string;
    versionId: string;
    version: number;
    nom: string;
    dureeEstimeeMin: number;
  } | null;
  /** Ruptures matières détectées pour cette ligne seule. */
  rupturesMatieres: { articleId: string; nom: string; unite: string; manque: number }[];
  /** Référence d'idempotence stable pour la création de l'OF. */
  clientRef: string | null;
};

export type TomorrowMaterialNeed = {
  articleId: string;
  code: string;
  nom: string;
  unite: string;
  besoin: number;
  disponibleLabo: number;
  perimeExcluLabo: number;
  bloqueExcluLabo: number;
  manque: number;
  produitsConcernes: string[];
};

export type TomorrowLabPlan = {
  targetDate: string;
  jourSemaineLabel: string;
  lignes: TomorrowLine[];
  /** Commandes Cake Design confirmées à fabriquer à `targetDate` (non liées à un article standard). */
  commandesSurMesure: TomorrowConfirmedOrder[];
  /** Couverture globale des matières premières au labo pour l'ensemble des quantités `aPreparer`. */
  matieres: TomorrowMaterialNeed[];
  chargeEstimeeMin: number;
  totalAPreparerLignes: number;
  totalATransfererLignes: number;
};

const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

function weekdayUtc(dateIso: string): number {
  return new Date(`${dateIso}T00:00:00Z`).getUTCDay();
}

export function isLotUsableOnDate(lot: Pick<TomorrowLot, "qte" | "dlc" | "bloque">, targetDate: string): boolean {
  if (lot.bloque || !(lot.qte > 0)) return false;
  if (lot.dlc && lot.dlc.slice(0, 10) < targetDate) return false;
  return true;
}

/**
 * Référence d'idempotence déterministe (<= 64 caractères) pour la validation
 * d'une ligne « Demain au labo » : un double clic ou un rejeu hors-ligne
 * renvoie l'OF déjà créé au lieu d'en ouvrir un second.
 */
export function buildTomorrowOfRef(targetDate: string, siteId: string, versionId: string): string {
  const cleanSite = siteId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const cleanVer = versionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  return `demain-${targetDate}-${cleanSite}-${cleanVer}`.slice(0, 64);
}

/** Calcule la proposition complète « Demain au labo » pour `targetDate`. */
export function computeTomorrowLabPlan(params: {
  targetDate: string;
  labSiteId?: string;
  products: readonly TomorrowProduct[];
  sales?: readonly TomorrowSale[];
  restockRequests?: readonly RestockRequestItem[];
  confirmedOrders?: readonly TomorrowConfirmedOrder[];
  lots?: readonly TomorrowLot[];
  existingOrders?: readonly TomorrowExistingOf[];
  /** Si fourni, remplace la prévision historique par un besoin vitrine explicite par articleId. */
  manualForecast?: Readonly<Record<string, number>>;
}): TomorrowLabPlan {
  const {
    targetDate,
    labSiteId = "labo",
    products,
    sales = [],
    restockRequests = [],
    confirmedOrders = [],
    lots = [],
    existingOrders = [],
    manualForecast,
  } = params;

  if (!DATE_RE.test(targetDate) || Number.isNaN(Date.parse(`${targetDate}T00:00:00Z`))) {
    throw new Error("Date cible invalide (AAAA-MM-JJ).");
  }

  const targetDow = weekdayUtc(targetDate);
  const jourSemaineLabel = JOURS_FR[targetDow];

  // 1. Historique des ventes comptoir (strictement antérieur à targetDate).
  // Agrégation par (articleId, date) pour calculer la moyenne des mêmes jours de semaine.
  const dailySalesByArticle = new Map<string, Map<string, number>>();
  const allSaleDates = new Set<string>();
  const sameDowDates = new Set<string>();

  for (const s of sales) {
    const d = s.date.slice(0, 10);
    if (!DATE_RE.test(d) || d >= targetDate) continue;
    allSaleDates.add(d);
    if (weekdayUtc(d) === targetDow) sameDowDates.add(d);
    for (const l of s.lignes ?? []) {
      if (!(l.qty > 0)) continue;
      let byDate = dailySalesByArticle.get(l.articleId);
      if (!byDate) dailySalesByArticle.set(l.articleId, (byDate = new Map()));
      byDate.set(d, round4((byDate.get(d) ?? 0) + l.qty));
    }
  }

  // 2. Demandes de réassort boutique ouvertes pour targetDate.
  const openRequestsByArticle = new Map<string, RestockRequestItem[]>();
  for (const req of restockRequests) {
    if (req.targetDate !== targetDate || req.statut !== "ouverte" || !(req.qty > 0)) continue;
    const arr = openRequestsByArticle.get(req.articleId) ?? [];
    arr.push(req);
    openRequestsByArticle.set(req.articleId, arr);
  }

  // 3. Commandes confirmées à préparer à targetDate (statut === 'confirme' uniquement :
  //    les devis non validés sont exclus, et les commandes déjà marquées 'produit'/'livre'
  //    ou déjà liées à un OF ne sont jamais comptées deux fois).
  const activeOfNumbers = new Set(existingOrders.map((o) => o.numero));
  const confirmedByArticle = new Map<string, TomorrowConfirmedOrder[]>();
  const commandesSurMesure: TomorrowConfirmedOrder[] = [];
  const productIds = new Set(products.map((p) => p.id));

  for (const cmd of confirmedOrders) {
    if (cmd.statut !== "confirme") continue;
    if (cmd.productionDate !== targetDate) continue;
    if (cmd.ofNumero && activeOfNumbers.has(cmd.ofNumero)) continue;
    if (cmd.articleId && productIds.has(cmd.articleId)) {
      const arr = confirmedByArticle.get(cmd.articleId) ?? [];
      arr.push(cmd);
      confirmedByArticle.set(cmd.articleId, arr);
    } else {
      commandesSurMesure.push(cmd);
    }
  }

  // 4. Stock par article (séparation utilisable à targetDate vs périmé vs bloqué).
  const stockStats = (articleId: string, role?: "labo" | "boutique") => {
    let usable = 0;
    let expired = 0;
    let blocked = 0;
    for (const l of lots) {
      if (l.articleId !== articleId || !(l.qte > 0)) continue;
      if (role && l.siteRole !== role) continue;
      if (l.bloque) blocked = round4(blocked + l.qte);
      else if (l.dlc && l.dlc.slice(0, 10) < targetDate) expired = round4(expired + l.qte);
      else usable = round4(usable + l.qte);
    }
    return { usable, expired, blocked };
  };

  // 5. OF existants sur targetDate (planifiés / en cours / partiels).
  const ofsByProduct = new Map<string, TomorrowExistingOf[]>();
  for (const o of existingOrders) {
    if (!o.produitId || o.datePrevue !== targetDate) continue;
    if (!["planifie", "encours", "partiel"].includes(o.statut)) continue;
    const arr = ofsByProduct.get(o.produitId) ?? [];
    arr.push(o);
    ofsByProduct.set(o.produitId, arr);
  }

  // 6. Calcul ligne par ligne + accumulation des besoins matières.
  const lignesRaw: { line: TomorrowLine; prod: TomorrowProduct }[] = [];
  const matAcc = new Map<
    string,
    { articleId: string; code: string; nom: string; unite: string; besoin: number; produits: Set<string> }
  >();

  for (const prod of products) {
    const raisons: string[] = [];
    const reqs = openRequestsByArticle.get(prod.id) ?? [];
    const byDate = dailySalesByArticle.get(prod.id);

    let besoinVitrine = 0;
    let sourceVitrine: TomorrowLine["sourceVitrine"] = "aucune";

    if (manualForecast && Object.hasOwn(manualForecast, prod.id)) {
      besoinVitrine = round4(Math.max(0, manualForecast[prod.id] ?? 0));
      sourceVitrine = "demande-boutique";
      if (besoinVitrine > 0) raisons.push(`Ventes comptoir attendues : ${besoinVitrine} ${prod.unite}`);
    } else if (reqs.length > 0) {
      besoinVitrine = round4(reqs.reduce((s, r) => s + r.qty, 0));
      sourceVitrine = "demande-boutique";
      const details = reqs
        .map((r) => `${r.siteLabel} (${r.qty} ${prod.unite}${r.motif ? ` · ${r.motif}` : ""})`)
        .join(", ");
      raisons.push(`Demande boutique : ${besoinVitrine} ${prod.unite} — ${details}`);
    } else if (sameDowDates.size > 0 && byDate) {
      let sum = 0;
      for (const d of sameDowDates) sum += byDate.get(d) ?? 0;
      if (sum > 0) {
        besoinVitrine = Math.ceil(sum / sameDowDates.size);
        sourceVitrine = "meme-jour-semaine";
        raisons.push(
          `Ventes comptoir attendues (${sameDowDates.size} ${jourSemaineLabel}${sameDowDates.size > 1 ? "s" : ""} observé${sameDowDates.size > 1 ? "s" : ""}) : ${besoinVitrine} ${prod.unite}`,
        );
      }
    }

    if (sourceVitrine === "aucune" && allSaleDates.size > 0 && byDate) {
      let sum = 0;
      for (const q of byDate.values()) sum += q;
      if (sum > 0) {
        besoinVitrine = Math.ceil(sum / allSaleDates.size);
        sourceVitrine = "moyenne-recente";
        raisons.push(
          `Moyenne comptoir récente (${allSaleDates.size} j) : ${besoinVitrine} ${prod.unite}`,
        );
      }
    }

    const cmds = confirmedByArticle.get(prod.id) ?? [];
    const commandesConfirmees = round4(cmds.reduce((s, c) => s + c.qty, 0));
    const commandesRefs = cmds.map((c) => c.numero);
    if (commandesConfirmees > 0) {
      raisons.push(
        `Commandes confirmées en plus : +${commandesConfirmees} ${prod.unite} (${commandesRefs.join(", ")})`,
      );
    }

    const bout = stockStats(prod.id, "boutique");
    const lab = stockStats(prod.id, "labo");
    const stockPerimeExclu = round4(bout.expired + lab.expired);
    const stockBloqueExclu = round4(bout.blocked + lab.blocked);

    // Secours : si ni historique ni demande, mais produit sous le seuil d'alerte en boutique.
    if (sourceVitrine === "aucune" && commandesConfirmees === 0 && prod.seuil > 0 && bout.usable < prod.seuil) {
      besoinVitrine = round4(prod.seuil);
      sourceVitrine = "seuil-secours";
      raisons.push(`Reconstitution du seuil boutique : ${prod.seuil} ${prod.unite} (sans historique de ventes)`);
    }

    const besoinBrut = round4(besoinVitrine + commandesConfirmees);
    const ofs = ofsByProduct.get(prod.id) ?? [];
    const dejaEnFabrication = round4(
      ofs.reduce((s, o) => s + Math.max(0, o.qtePrevue - o.qteRealisee), 0),
    );

    if (besoinBrut === 0 && dejaEnFabrication === 0 && stockPerimeExclu === 0) continue;

    if (bout.usable > 0) {
      raisons.push(`Stock boutique utilisable le ${targetDate} : −${bout.usable} ${prod.unite}`);
    }
    if (stockPerimeExclu > 0) {
      raisons.push(`${stockPerimeExclu} ${prod.unite} exclu(s) : DLC dépassée avant le ${targetDate}`);
    }
    if (stockBloqueExclu > 0) {
      raisons.push(`${stockBloqueExclu} ${prod.unite} exclu(s) : lot bloqué`);
    }

    const besoinNetBoutique = round4(Math.max(0, besoinBrut - bout.usable));
    const aTransfererDuLabo = round4(Math.min(besoinNetBoutique, lab.usable));
    if (aTransfererDuLabo > 0) {
      raisons.push(`Déjà prêt au labo (à transférer) : −${aTransfererDuLabo} ${prod.unite}`);
    }
    if (dejaEnFabrication > 0) {
      raisons.push(
        `Déjà en OF pour le ${targetDate} : −${dejaEnFabrication} ${prod.unite} (${ofs.map((o) => o.numero).join(", ")})`,
      );
    }

    const aPreparer = round4(Math.max(0, besoinNetBoutique - aTransfererDuLabo - dejaEnFabrication));
    const rec = prod.recipe ?? null;
    const dureeEstimeeMin =
      rec && rec.rendementBrut > 0 && aPreparer > 0
        ? Math.ceil((aPreparer / rec.rendementBrut) * rec.moMin)
        : 0;

    if (rec && rec.rendementBrut > 0 && aPreparer > 0) {
      const scale = aPreparer / rec.rendementBrut;
      for (const b of rec.besoinsSerie) {
        const q = round4(b.qty * scale);
        if (!(q > 0)) continue;
        const prev = matAcc.get(b.articleId);
        if (!prev) {
          matAcc.set(b.articleId, {
            articleId: b.articleId,
            code: b.code,
            nom: b.nom,
            unite: b.unite,
            besoin: q,
            produits: new Set([prod.nom]),
          });
        } else {
          prev.besoin = round4(prev.besoin + q);
          prev.produits.add(prod.nom);
        }
      }
    }

    lignesRaw.push({
      prod,
      line: {
        articleId: prod.id,
        code: prod.code,
        nom: prod.nom,
        unite: prod.unite,
        besoinVitrine,
        sourceVitrine,
        commandesConfirmees,
        commandesRefs,
        demandesIds: reqs.map((r) => r.id),
        besoinBrut,
        stockBoutiqueUtilisable: bout.usable,
        stockLaboUtilisable: lab.usable,
        stockPerimeExclu,
        stockBloqueExclu,
        aTransfererDuLabo,
        dejaEnFabrication,
        ofsExistants: ofs.map((o) => o.numero),
        aPreparer,
        raisons,
        recipe: rec
          ? {
              recipeId: rec.recipeId,
              versionId: rec.versionId,
              version: rec.version,
              nom: rec.nom,
              dureeEstimeeMin,
            }
          : null,
        rupturesMatieres: [],
        clientRef: rec ? buildTomorrowOfRef(targetDate, labSiteId, rec.versionId) : null,
      },
    });
  }

  // 7. Couverture matières premières au labo (lots non bloqués et DLC >= targetDate).
  const matieres: TomorrowMaterialNeed[] = [...matAcc.values()]
    .map((m) => {
      const st = stockStats(m.articleId, "labo");
      const manque = round4(Math.max(0, m.besoin - st.usable));
      return {
        articleId: m.articleId,
        code: m.code,
        nom: m.nom,
        unite: m.unite,
        besoin: m.besoin,
        disponibleLabo: st.usable,
        perimeExcluLabo: st.expired,
        bloqueExcluLabo: st.blocked,
        manque,
        produitsConcernes: [...m.produits].sort((a, b) => a.localeCompare(b, "fr")),
      };
    })
    .sort((a, b) => (b.manque > 0 ? 1 : 0) - (a.manque > 0 ? 1 : 0) || a.nom.localeCompare(b.nom, "fr"));

  const matById = new Map(matieres.map((m) => [m.articleId, m]));

  // Attacher les ruptures matières à chaque ligne concernée.
  const lignes = lignesRaw
    .map(({ prod, line }) => {
      const rec = prod.recipe;
      if (!rec || !(line.aPreparer > 0)) return line;
      const rupturesMatieres = rec.besoinsSerie.flatMap((b) => {
        const m = matById.get(b.articleId);
        return m && m.manque > 0
          ? [{ articleId: m.articleId, nom: m.nom, unite: m.unite, manque: m.manque }]
          : [];
      });
      return { ...line, rupturesMatieres };
    })
    .sort(
      (a, b) =>
        (b.aPreparer > 0 ? 1 : 0) - (a.aPreparer > 0 ? 1 : 0) ||
        (b.aTransfererDuLabo > 0 ? 1 : 0) - (a.aTransfererDuLabo > 0 ? 1 : 0) ||
        a.nom.localeCompare(b.nom, "fr"),
    );

  const chargeEstimeeMin = lignes.reduce((s, l) => s + (l.recipe?.dureeEstimeeMin ?? 0), 0);

  return {
    targetDate,
    jourSemaineLabel,
    lignes,
    commandesSurMesure,
    matieres,
    chargeEstimeeMin,
    totalAPreparerLignes: lignes.filter((l) => l.aPreparer > 0).length,
    totalATransfererLignes: lignes.filter((l) => l.aTransfererDuLabo > 0).length,
  };
}
