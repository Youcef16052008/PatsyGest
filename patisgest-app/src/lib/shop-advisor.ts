import {
  estLotEligible,
  plusJours,
  type StockArticle,
  type StockLot,
  type VentesJour,
} from "./workspace-data.ts";
import { productVelocity, topSellingProducts, type DashboardSale } from "./dashboard-insights.ts";

export type ShopActivity = "mixte" | "boulangerie" | "patisserie" | "cake_shop";
export type AlgerianVatRegime = "ifu_0" | "reel_dz";

export type ShopOverheadConfig = {
  monthlyRentDa: number;
  monthlyPayrollDa: number;
  monthlyUtilitiesDa: number;
  openDaysPerMonth: number;
  targetFoodCostPct: number;
  tvaRegime: AlgerianVatRegime;
  shopActivity: ShopActivity;
};

export const DEFAULT_OVERHEAD_CONFIG: ShopOverheadConfig = {
  monthlyRentDa: 65000,
  monthlyPayrollDa: 140000,
  monthlyUtilitiesDa: 35000,
  openDaysPerMonth: 30,
  targetFoodCostPct: 35,
  tvaRegime: "ifu_0",
  shopActivity: "mixte",
};

export const OVERHEAD_STORAGE_KEY_PREFIX = "patisgest.overhead.v1.";

export type AdvisorSeverity = "critique" | "urgent" | "conseil" | "bravo";
export type AdvisorCategory = "ventes" | "tresorerie" | "pertes" | "stock" | "marges";

export type AdvisorRecommendation = {
  id: string;
  severity: AdvisorSeverity;
  category: AdvisorCategory;
  title: string;
  detail: string;
  actionLabel: string;
  actionHref: string;
};

export type ShopHealthReport = {
  score: number;
  status: "sain" | "vigilance" | "danger";
  statusLabel: string;
  monthlyFixedCostsDa: number;
  dailyFixedCostsDa: number;
  grossMarginPct: number;
  dailyBreakEvenDa: number;
  monthlyBreakEvenDa: number;
  todayRevenueDa: number;
  todayProgressPct: number;
  remainingToBreakEvenTodayDa: number;
  todayNetResultDa: number;
  equivalentTopProduct: { nom: string; units: number; unit: string } | null;
  equivalentTickets: number | null;
  avgTicketDa: number | null;
  revenue7dDa: number;
  revenue30dDa: number;
  monthCoveragePct: number;
  weekTrendPct: number | null;
  creditExposurePct: number | null;
  expiringSoonCount: number;
  expiredCount: number;
  zeroPriceProductsCount: number;
  recommendations: AdvisorRecommendation[];
};

export function sanitizeOverheadConfig(raw: Partial<ShopOverheadConfig> | null | undefined): ShopOverheadConfig {
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const act = raw?.shopActivity;
  const shopActivity: ShopActivity =
    act === "boulangerie" || act === "patisserie" || act === "cake_shop" || act === "mixte"
      ? act
      : DEFAULT_OVERHEAD_CONFIG.shopActivity;
  const tvaRegime: AlgerianVatRegime = raw?.tvaRegime === "reel_dz" ? "reel_dz" : "ifu_0";
  return {
    monthlyRentDa: Math.round(num(raw?.monthlyRentDa, DEFAULT_OVERHEAD_CONFIG.monthlyRentDa, 0, 50_000_000)),
    monthlyPayrollDa: Math.round(num(raw?.monthlyPayrollDa, DEFAULT_OVERHEAD_CONFIG.monthlyPayrollDa, 0, 50_000_000)),
    monthlyUtilitiesDa: Math.round(num(raw?.monthlyUtilitiesDa, DEFAULT_OVERHEAD_CONFIG.monthlyUtilitiesDa, 0, 50_000_000)),
    openDaysPerMonth: Math.round(num(raw?.openDaysPerMonth, DEFAULT_OVERHEAD_CONFIG.openDaysPerMonth, 1, 31)),
    targetFoodCostPct: Math.round(num(raw?.targetFoodCostPct, DEFAULT_OVERHEAD_CONFIG.targetFoodCostPct, 10, 85)),
    tvaRegime,
    shopActivity,
  };
}

export function analyzeShopHealth(input: {
  today: string;
  config?: Partial<ShopOverheadConfig> | null;
  series: VentesJour[] | null;
  sales: DashboardSale[] | null;
  articles: (StockArticle & { prixTTC?: number })[] | null;
  lots: StockLot[] | null;
  shopIds: string[] | null;
  openCreditsDa: number;
  pendingPriceAlertsCount: number;
  estimatedMarginPct?: number | null;
}): ShopHealthReport {
  const cfg = sanitizeOverheadConfig(input.config);
  const monthlyFixedCostsDa = cfg.monthlyRentDa + cfg.monthlyPayrollDa + cfg.monthlyUtilitiesDa;
  const dailyFixedCostsDa = Math.round(monthlyFixedCostsDa / cfg.openDaysPerMonth);
  const grossMarginPct =
    input.estimatedMarginPct != null && Number.isFinite(input.estimatedMarginPct) && input.estimatedMarginPct >= 15 && input.estimatedMarginPct <= 90
      ? Math.round(input.estimatedMarginPct)
      : 100 - cfg.targetFoodCostPct;
  const grossMarginRatio = Math.max(0.15, Math.min(0.9, grossMarginPct / 100));

  const dailyBreakEvenDa = monthlyFixedCostsDa > 0 ? Math.round(dailyFixedCostsDa / grossMarginRatio) : 0;
  const monthlyBreakEvenDa = monthlyFixedCostsDa > 0 ? Math.round(monthlyFixedCostsDa / grossMarginRatio) : 0;

  const series = input.series ?? [];
  const todayEntry = series.find((d) => d.day === input.today) ?? series.at(-1);
  const todayRevenueDa = Math.round((todayEntry?.ttc ?? 0) * 100) / 100;
  const todayTickets = todayEntry?.tickets ?? 0;

  const revenue7dDa = Math.round(
    series
      .filter((d) => d.day >= plusJours(input.today, -6) && d.day <= input.today)
      .reduce((acc, d) => acc + d.ttc, 0),
  );
  const prev7dDa = Math.round(
    series
      .filter((d) => d.day >= plusJours(input.today, -13) && d.day <= plusJours(input.today, -7))
      .reduce((acc, d) => acc + d.ttc, 0),
  );
  const revenue30dDa = Math.round(
    series
      .filter((d) => d.day >= plusJours(input.today, -29) && d.day <= input.today)
      .reduce((acc, d) => acc + d.ttc, 0),
  );
  const totalTickets30d = series
    .filter((d) => d.day >= plusJours(input.today, -29) && d.day <= input.today)
    .reduce((acc, d) => acc + d.tickets, 0);

  const avgTicketDa =
    todayTickets > 0 && todayRevenueDa > 0
      ? Math.round(todayRevenueDa / todayTickets)
      : totalTickets30d > 0 && revenue30dDa > 0
        ? Math.round(revenue30dDa / totalTickets30d)
        : null;

  const weekTrendPct =
    prev7dDa > 0 ? Math.round(((revenue7dDa - prev7dDa) / prev7dDa) * 1000) / 10 : null;

  const todayProgressPct =
    dailyBreakEvenDa > 0 ? Math.min(200, Math.round((todayRevenueDa / dailyBreakEvenDa) * 100)) : 100;
  const remainingToBreakEvenTodayDa = Math.max(0, Math.round(dailyBreakEvenDa - todayRevenueDa));
  const todayNetResultDa = Math.round(todayRevenueDa * grossMarginRatio - dailyFixedCostsDa);
  const monthCoveragePct =
    monthlyBreakEvenDa > 0 ? Math.round((revenue30dDa / monthlyBreakEvenDa) * 100) : 100;

  // Produit #1 pour exprimer l'objectif restant en nombre concret de ventes
  const topProducts = topSellingProducts(input.sales, input.articles, input.today, 7) ?? [];
  const bestSeller = topProducts.find((p) => p.qty > 0 && p.revenueDa > 0);
  const bestSellerUnitPrice = bestSeller ? bestSeller.revenueDa / bestSeller.qty : 0;
  const fallbackProduct = (input.articles ?? []).find((a) => a.niveau === "produit" && (a.prixTTC ?? 0) > 0);
  const refUnitPrice = bestSellerUnitPrice > 0 ? bestSellerUnitPrice : (fallbackProduct?.prixTTC ?? 0);
  const refProductName = bestSeller?.nom ?? fallbackProduct?.nom ?? null;
  const refProductUnit = bestSeller?.unite ?? fallbackProduct?.unite ?? "pcs";

  const equivalentTopProduct =
    remainingToBreakEvenTodayDa > 0 && refProductName && refUnitPrice > 0
      ? {
          nom: refProductName,
          units: Math.max(1, Math.ceil(remainingToBreakEvenTodayDa / refUnitPrice)),
          unit: refProductUnit,
        }
      : null;

  const equivalentTickets =
    remainingToBreakEvenTodayDa > 0 && avgTicketDa && avgTicketDa > 0
      ? Math.max(1, Math.ceil(remainingToBreakEvenTodayDa / avgTicketDa))
      : null;

  // Lots proches de péremption (<= 2 jours) ou déjà périmés
  const soonLimit = plusJours(input.today, 2);
  const activeLots = (input.lots ?? []).filter((l) => l.qte > 0 && !l.bloque);
  const expiringSoonCount = activeLots.filter(
    (l) => l.dlc != null && l.dlc >= input.today && l.dlc <= soonLimit,
  ).length;
  const expiredCount = activeLots.filter((l) => l.dlc != null && l.dlc < input.today).length;

  const finishedProducts = (input.articles ?? []).filter((a) => a.niveau === "produit");
  const zeroPriceProductsCount = finishedProducts.filter((a) => (a.prixTTC ?? 0) <= 0).length;

  const creditExposurePct =
    input.openCreditsDa > 0 && revenue30dDa > 0
      ? Math.round((input.openCreditsDa / revenue30dDa) * 100)
      : input.openCreditsDa > 0
        ? 100
        : 0;

  const velocity = productVelocity(input.sales, input.articles, input.lots, input.today, input.shopIds) ?? [];
  const criticalVelocity = velocity.filter((v) => v.days < 1.5);

  const outOfStockFinished = (input.articles && input.lots)
    ? finishedProducts.filter((a) => {
        const qty = (input.lots ?? [])
          .filter((l) => l.articleId === a.id && estLotEligible(l, input.today))
          .reduce((s, l) => s + l.qte, 0);
        return qty <= 0;
      })
    : [];

  // Score de survie & santé (100 max, pénalités pondérées)
  let score = 100;
  const recommendations: AdvisorRecommendation[] = [];

  if (remainingToBreakEvenTodayDa > 0 && dailyBreakEvenDa > 0) {
    const gapRatio = remainingToBreakEvenTodayDa / dailyBreakEvenDa;
    score -= gapRatio > 0.65 ? 18 : gapRatio > 0.3 ? 11 : 5;
    const unitsText = equivalentTopProduct
      ? ` (environ ${equivalentTopProduct.units} ${equivalentTopProduct.unit} de ${equivalentTopProduct.nom}${
          equivalentTickets ? ` ou ${equivalentTickets} tickets clients` : ""
        })`
      : equivalentTickets
        ? ` (environ ${equivalentTickets} tickets clients)`
        : "";
    recommendations.push({
      id: "daily-breakeven-gap",
      severity: gapRatio > 0.5 ? "urgent" : "conseil",
      category: "ventes",
      title: `Il manque ${remainingToBreakEvenTodayDa.toLocaleString("fr-FR")} DA à vendre aujourd’hui`,
      detail: `Pour couvrir vos charges du jour (${dailyFixedCostsDa.toLocaleString("fr-FR")} DA/j) avec ~${grossMarginPct} % de marge brute, visez ${dailyBreakEvenDa.toLocaleString("fr-FR")} DA${unitsText}. Proposez des formules goûter / boîtes assorties ou relancez vos commandes sur WhatsApp.`,
      actionLabel: "Ouvrir la caisse",
      actionHref: "/caisse",
    });
  } else if (dailyBreakEvenDa > 0 && todayRevenueDa >= dailyBreakEvenDa) {
    recommendations.push({
      id: "daily-breakeven-ok",
      severity: "bravo",
      category: "ventes",
      title: `Seuil du jour dépassé (+${Math.max(0, todayNetResultDa).toLocaleString("fr-FR")} DA de bénéfice net)`,
      detail: `Vos charges quotidiennes (${dailyFixedCostsDa.toLocaleString("fr-FR")} DA) sont déjà couvertes aujourd’hui. Chaque vente supplémentaire augmente directement votre trésorerie nette.`,
      actionLabel: "Voir le tiroir caisse",
      actionHref: "/cloture",
    });
  }

  if (monthlyBreakEvenDa > 0 && series.length >= 7 && monthCoveragePct < 85) {
    score -= monthCoveragePct < 55 ? 25 : 15;
    recommendations.push({
      id: "monthly-survival-risk",
      severity: "critique",
      category: "ventes",
      title: `Risque de déficit mensuel : seulement ${monthCoveragePct} % du seuil 30 jours atteint`,
      detail: `Votre CA sur 30 jours (${revenue30dDa.toLocaleString("fr-FR")} DA) est sous le point mort mensuel (${monthlyBreakEvenDa.toLocaleString("fr-FR")} DA). Priorités : pousser les packs famille / gâteaux sur commande (marge élevée), supprimer les invendus et vérifier vos prix de vente.`,
      actionLabel: "Simuler mes prix",
      actionHref: "/simulation",
    });
  }

  if (input.openCreditsDa > 0 && (creditExposurePct ?? 0) > 15) {
    score -= creditExposurePct > 35 ? 20 : 12;
    recommendations.push({
      id: "credits-cash-trap",
      severity: "critique",
      category: "tresorerie",
      title: `Trésorerie bloquée : ${input.openCreditsDa.toLocaleString("fr-FR")} DA en crédits non encaissés`,
      detail: `Les crédits clients & cafés représentent ${creditExposurePct} % de votre CA 30 jours (seuil sain < 15 %). Relancez les débiteurs sur WhatsApp avant de réinvestir en matières premières.`,
      actionLabel: "Relancer les crédits",
      actionHref: "#carnet-credits",
    });
  }

  if (expiringSoonCount > 0 || expiredCount > 0) {
    score -= expiredCount > 0 ? 14 : 8;
    recommendations.push({
      id: "anti-waste-dlc",
      severity: expiredCount > 0 ? "critique" : "urgent",
      category: "pertes",
      title:
        expiredCount > 0
          ? `${expiredCount} lot(s) périmé(s) + ${expiringSoonCount} lot(s) DLC ≤ 48h`
          : `Anti-gaspi : ${expiringSoonCount} lot(s) expirent sous 48h`,
      detail:
        expiredCount > 0
          ? "Écartez immédiatement les lots dépassés du comptoir et passez les lots proches en promotion fin de journée (-25 %) pour sauver la marge au lieu de jeter."
          : "Passez ces produits ou matières en offre fin de journée (-20 % à -30 %) ou en production prioritaire aujourd’hui pour rester sous 5 % de pertes.",
      actionLabel: "Voir les lots DLC",
      actionHref: "/stocks?filtre=alerte",
    });
  }

  if (criticalVelocity.length > 0 || outOfStockFinished.length > 0) {
    score -= 10;
    const names = [
      ...criticalVelocity.map((v) => `${v.nom} (~${v.days.toFixed(1)}j)`),
      ...outOfStockFinished.slice(0, 2).map((a) => `${a.nom} (0)`),
    ]
      .slice(0, 3)
      .join(", ");
    recommendations.push({
      id: "stockout-lost-sales",
      severity: "urgent",
      category: "stock",
      title: `Ventes menacées : stock critique sur ${names}`,
      detail:
        "Une vitrine vide fait partir le client chez le concurrent. Planifiez une fournée ou un transfert labo → boutique dès maintenant sur vos produits les plus demandés.",
      actionLabel: "Lancer la production",
      actionHref: "/production",
    });
  }

  if (weekTrendPct !== null && weekTrendPct <= -15) {
    score -= 12;
    recommendations.push({
      id: "weekly-drop",
      severity: "urgent",
      category: "ventes",
      title: `Baisse d’activité de ${Math.abs(weekTrendPct).toFixed(0)} % sur les 7 derniers jours`,
      detail:
        "Vérifiez la disponibilité des produits du matin (pain, croissants, café/goûter), animez votre carnet clients sur WhatsApp et proposez une boîte dégustation week-end.",
      actionLabel: "Voir le carnet commandes",
      actionHref: "/cake-design",
    });
  }

  if (zeroPriceProductsCount > 0 || input.pendingPriceAlertsCount > 0) {
    score -= 10;
    recommendations.push({
      id: "pricing-margin-guard",
      severity: "critique",
      category: "marges",
      title:
        input.pendingPriceAlertsCount > 0
          ? `${input.pendingPriceAlertsCount} prix saisi(s) par l’équipe à vérifier`
          : `${zeroPriceProductsCount} produit(s) fini(s) sans prix de vente`,
      detail:
        "Vendre sans coût de revient vérifié ou sous le coût matières détruit la caisse à petit feu. Validez chaque tarif (objectif coût matières 28–35 % du prix de vente).",
      actionLabel: "Vérifier les recettes & prix",
      actionHref: "/recettes",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "shop-steady",
      severity: "conseil",
      category: "ventes",
      title: "Activité stable — optimisez le panier moyen",
      detail:
        "Objectif mondial boulangerie/pâtisserie : gardez le coût matières entre 28 % et 35 %, les pertes sous 5 %, et proposez des ventes additionnelles (boîtes de 6, commandes d’événements) pour augmenter chaque ticket.",
      actionLabel: "Créer une recette rentable",
      actionHref: "/recettes",
    });
  }

  // Trier par priorité : critique -> urgent -> conseil -> bravo
  const rank: Record<AdvisorSeverity, number> = {
    critique: 0,
    urgent: 1,
    conseil: 2,
    bravo: 3,
  };
  recommendations.sort((a, b) => rank[a.severity] - rank[b.severity]);

  score = Math.max(5, Math.min(100, Math.round(score)));
  const status: ShopHealthReport["status"] =
    score >= 75 ? "sain" : score >= 50 ? "vigilance" : "danger";
  const statusLabel =
    status === "sain"
      ? "Boutique saine"
      : status === "vigilance"
        ? "À surveiller"
        : "Action urgente requise";

  return {
    score,
    status,
    statusLabel,
    monthlyFixedCostsDa,
    dailyFixedCostsDa,
    grossMarginPct,
    dailyBreakEvenDa,
    monthlyBreakEvenDa,
    todayRevenueDa,
    todayProgressPct,
    remainingToBreakEvenTodayDa,
    todayNetResultDa,
    equivalentTopProduct,
    equivalentTickets,
    avgTicketDa,
    revenue7dDa,
    revenue30dDa,
    monthCoveragePct,
    weekTrendPct,
    creditExposurePct,
    expiringSoonCount,
    expiredCount,
    zeroPriceProductsCount,
    recommendations,
  };
}
