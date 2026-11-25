import test from "node:test";
import assert from "node:assert/strict";
import {
  addToCart,
  checkCartStock,
  computeCartTotals,
  parseCartSaleInput,
  removeFromCart,
  setCartLineQty,
  stepCartLine,
} from "../src/lib/pos-cart.ts";
import { createQueuedCartSale, enqueueSale, queuedSaleLines, queuedSaleSummary, removeSale } from "../src/lib/sale-queue.ts";
import { computeCashReconciliation, computeReconciliation, parseCashDrawerDeclaration } from "../src/lib/reconciliation.ts";
import { computeTomorrowLabPlan } from "../src/lib/tomorrow-lab.ts";
import { addDailyClosing, addRestockRequest, sellCart, transferStock, updateRestockRequests } from "../src/lib/patisgest-store.ts";
import { createDemoWorkspace, demoIngredientImpact, demoTomorrowPlan } from "../src/lib/demo-workspace.ts";

const P1 = "11111111-1111-4111-8111-000000000001";
const P2 = "11111111-1111-4111-8111-000000000002";
const SITE = "22222222-2222-4222-8222-000000000001";
const TICKET = "33333333-3333-4333-8333-000000000001";

test("Panier caisse multiproduit : ajout cumulatif, centimes exacts, TVA mixtes et alertes stock/DLC", () => {
  let cart = [];
  cart = addToCart(cart, { id: P1, label: "Croissant", unit: "pcs", prixHT: 84.03, tva: 19 }, 2);
  cart = addToCart(cart, { id: P2, label: "Mille-feuille", unit: "pcs", prixHT: 229.36, tva: 9 }, 1);
  cart = addToCart(cart, { id: P1, label: "Croissant", unit: "pcs", prixHT: 84.03, tva: 19 }, 1);
  assert.equal(cart.length, 2);
  assert.equal(cart[0].qte, 3);
  assert.equal(cart[1].qte, 1);

  const totals = computeCartTotals(cart);
  assert.equal(totals.valide, true);
  assert.equal(Math.round((totals.totalHT + totals.totalTVA) * 100), Math.round(totals.totalTTC * 100));

  const alerts = checkCartStock(
    cart,
    SITE,
    { [SITE]: { [P1]: 2, [P2]: 5 } },
    { [SITE]: { [P1]: 4 } },
  );
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].manquant, 1);
  assert.equal(alerts[0].perimeExclu, 4);

  cart = stepCartLine(cart, P1, -1);
  assert.equal(cart[0].qte, 2);
  cart = setCartLineQty(cart, P2, 3);
  assert.equal(cart[1].qte, 3);
  cart = removeFromCart(cart, P1);
  assert.equal(cart.length, 1);
});

test("Panier caisse : validation serveur stricte et file hors-ligne idempotente", () => {
  const fd = new FormData();
  fd.set("siteId", SITE);
  fd.set("ticket", TICKET);
  fd.set("modePaiement", "cheque_virement");
  fd.set("lignesJson", JSON.stringify([{ articleId: P1, qte: 2 }, { articleId: P2, qte: 1 }]));
  const parsed = parseCartSaleInput(fd);
  assert.equal(parsed.modePaiement, "cheque_virement");
  assert.equal(parsed.lignes.length, 2);

  // Panier vide refusé
  const emptyFd = new FormData();
  emptyFd.set("siteId", SITE);
  emptyFd.set("ticket", TICKET);
  emptyFd.set("lignesJson", "[]");
  assert.throws(() => parseCartSaleInput(emptyFd));

  // File hors-ligne : double enqueue du même UUID de ticket ne duplique jamais
  const sale = createQueuedCartSale({
    ticket: TICKET,
    siteId: SITE,
    siteLabel: "Boutique",
    modePaiement: "especes",
    lignes: [
      { articleId: P1, articleLabel: "Croissant", qte: 3 },
      { articleId: P2, articleLabel: "Éclair", qte: 2 },
    ],
  });
  let q = enqueueSale([], sale);
  q = enqueueSale(q, sale);
  assert.equal(q.length, 1);
  assert.equal(queuedSaleLines(q[0]).length, 2);
  assert.match(queuedSaleSummary(q[0]), /\+\s*1/);
  assert.equal(removeSale(q, TICKET).length, 0);
});

test("Rapprochement fin de journée : séparation stricte produits (qtés) vs tiroir-caisse (DA TTC)", () => {
  const caisseBilan = parseCashDrawerDeclaration({
    fondInitial: "5000",
    sortiesEspeces: "500",
    especesComptees: "6400",
    motifSortie: "Achat glace",
  });
  assert.ok(caisseBilan);

  const clotures = [
    { id: "c1", date: "2026-11-18", siteId: SITE, revision: 1, lignes: [{ articleId: P1, code: "CRO", name: "Croissant", vendu: 10 }] },
    {
      id: "c2",
      date: "2026-11-18",
      siteId: SITE,
      revision: 2,
      lignes: [
        { articleId: P1, code: "CRO", name: "Croissant", vendu: 12 },
        { articleId: P2, code: "MF", name: "Mille-feuille", vendu: 4 },
      ],
      caisseBilan,
    },
  ];
  const ventes = [
    { siteId: SITE, date: "2026-11-18", lignes: [{ articleId: P1, qty: 10 }, { articleId: P2, qty: 2 }], totalTTC: 2000, modePaiement: "especes", source: "caisse" },
    { siteId: SITE, date: "2026-11-18", lignes: [{ articleId: P1, qty: 2 }, { articleId: P2, qty: 3 }], totalTTC: 1200, modePaiement: "cheque_virement", source: "caisse" },
    { siteId: SITE, date: "2026-11-18", lignes: [], totalTTC: 800, modePaiement: null, source: "z-import" },
  ];

  const prod = computeReconciliation(clotures, ventes);
  assert.equal(prod.length, 1);
  assert.equal(prod[0].revision, 2);
  assert.equal(prod[0].lignes.find((l) => l.articleId === P1)?.ecart, 0);
  assert.equal(prod[0].lignes.find((l) => l.articleId === P2)?.ecart, 1);

  const cash = computeCashReconciliation(clotures, ventes);
  assert.equal(cash.length, 1);
  assert.equal(cash[0].fondInitial, 5000);
  assert.equal(cash[0].ventesEspecesTTC, 2000);
  assert.equal(cash[0].sortiesEspeces, 500);
  assert.equal(cash[0].attenduTiroir, 6500);
  assert.equal(cash[0].especesComptees, 6400);
  assert.equal(cash[0].ecartEspeces, -100);
  assert.equal(cash[0].ventesAutreTTC, 1200);
  assert.equal(cash[0].ventesImportZTTC, 800);
});

test("Demain au labo : prévision jour-type + demande boutique + commandes confirmées − stock utilisable (hors périmés)", () => {
  // 2026-11-19 est un jeudi ; 2026-11-12 et 2026-11-05 sont les jeudis précédents
  const plan = computeTomorrowLabPlan({
    targetDate: "2026-11-19",
    labSiteId: "labo",
    products: [
      {
        id: P1,
        code: "PF-CRO",
        nom: "Croissant",
        unite: "pcs",
        seuil: 10,
        recipe: {
          recipeId: "rec1",
          versionId: "v1",
          version: 1,
          nom: "Croissant",
          rendementBrut: 20,
          moMin: 45,
          besoinsSerie: [{ articleId: "beurre", code: "BEU", nom: "Beurre", unite: "kg", qty: 1 }],
        },
      },
    ],
    sales: [
      { date: "2026-11-12", siteId: "boutique", lignes: [{ articleId: P1, qty: 30 }] },
      { date: "2026-11-05", siteId: "boutique", lignes: [{ articleId: P1, qty: 40 }] }, // moyenne jeudi = 35
    ],
    restockRequests: [
      { id: "r1", targetDate: "2026-11-19", siteId: "boutique", siteLabel: "Boutique", articleId: P1, qty: 42, motif: "Séminaire", demandeur: "Amine", statut: "ouverte" },
    ],
    confirmedOrders: [
      { id: "ck1", numero: "CK-01", clientNom: "Nadia", eventDate: "2026-11-20", productionDate: "2026-11-19", statut: "confirme", qty: 20, nbParts: 20, notes: "Entremets" },
      { id: "ck2", numero: "CK-02", clientNom: "Brouillon", eventDate: "2026-11-20", productionDate: "2026-11-19", statut: "devis", qty: 50, nbParts: 50, notes: "Non confirmé" },
    ],
    lots: [
      { id: "l1", articleId: P1, siteId: "boutique", siteRole: "boutique", numero: "LOT-1", qte: 5, dlc: "2026-11-20", bloque: false },
      { id: "l2", articleId: P1, siteId: "boutique", siteRole: "boutique", numero: "LOT-2", qte: 12, dlc: "2026-11-18", bloque: false }, // périmé demain !
      { id: "l3", articleId: P1, siteId: "labo", siteRole: "labo", numero: "LOT-3", qte: 7, dlc: "2026-11-21", bloque: false },
      { id: "l4", articleId: "beurre", siteId: "labo", siteRole: "labo", numero: "LOT-4", qte: 0.5, dlc: "2026-12-01", bloque: false },
      { id: "l5", articleId: "beurre", siteId: "labo", siteRole: "labo", numero: "LOT-5", qte: 5, dlc: "2026-12-01", bloque: true },
    ],
    existingOrders: [{ id: "of1", numero: "OF-1", produitId: P1, qtePrevue: 10, qteRealisee: 0, statut: "planifie", datePrevue: "2026-11-19" }],
  });

  // Commandes confirmées : seul CK-01 retenu (jamais le devis non confirmé)
  assert.equal(plan.commandesSurMesure.length, 1);
  assert.equal(plan.commandesSurMesure[0].numero, "CK-01");

  const line = plan.lignes[0];
  assert.equal(line.besoinVitrine, 42);
  assert.equal(line.sourceVitrine, "demande-boutique");
  assert.equal(line.stockBoutiqueUtilisable, 5);
  assert.equal(line.stockPerimeExclu, 12);
  assert.equal(line.stockLaboUtilisable, 7);
  assert.equal(line.aTransfererDuLabo, 7);
  assert.equal(line.dejaEnFabrication, 10);
  assert.equal(line.aPreparer, 20);

  // Besoin beurre pour 20 pcs = 1 kg vs 0,5 kg éligible (5 kg bloqués exclus) → manque 0,5 kg
  const beu = plan.matieres.find((m) => m.articleId === "beurre");
  assert.ok(beu);
  assert.equal(beu.manque, 0.5);
  assert.equal(beu.bloqueExcluLabo, 5);
});

test("Démo intégrée : panier multiproduit idempotent, transfert responsable, réassort, impact beurre et clôture séparée", () => {
  let state = createDemoWorkspace();
  const prods = state.articles.filter((a) => a.niveau === "produit");
  assert.ok(prods.length >= 2);
  const countBefore = state.sales.length;

  // 1. Vente panier 2 produits avec ticket UUID + idempotence au rejeu
  state = sellCart(state, [{ articleId: prods[0].id, qty: 2 }, { articleId: prods[1].id, qty: 1 }], {
    ticket: "ticket-idem-1",
    modePaiement: "cheque_virement",
  });
  assert.equal(state.sales.length, countBefore + 1);
  assert.equal(state.sales[0].modePaiement, "cheque_virement");
  assert.equal(state.sales[0].lines?.length, 2);
  const replayed = sellCart(state, [{ articleId: prods[0].id, qty: 2 }, { articleId: prods[1].id, qty: 1 }], {
    ticket: "ticket-idem-1",
    modePaiement: "cheque_virement",
  });
  assert.equal(replayed.sales.length, state.sales.length, "aucun doublon au rejeu");

  // 2. Impact hausse du beurre (a2) dans la démo (touche les produits au beurre & sous-recette pâte feuilletée)
  const beurre = state.articles.find((a) => a.niveau === "matiere" && /beurre/i.test(a.nom)) ?? state.articles.find((a) => a.niveau === "matiere");
  const impact = demoIngredientImpact(state, { articleId: beurre.id, ancienPu: 1400, nouveauPu: 1800 });
  assert.ok(impact.recettes.length >= 1);
  assert.ok(impact.recettes.every((r) => r.deltaParPart > 0));

  // 3. Demande de réassort boutique + plan « Demain au labo » + transfert tracé
  const croissant = state.articles.find((a) => a.niveau === "produit");
  const tomorrow = "2026-11-19";
  state = addRestockRequest(state, { articleId: croissant.id, targetDate: tomorrow, qty: 50, motif: "Vitrine matin", demandeur: "Amine" });
  const reqId = state.restockRequests[0].id;
  const plan = demoTomorrowPlan(state, tomorrow);
  assert.ok(plan.lignes.some((l) => l.articleId === croissant.id && l.besoinVitrine >= 50));

  state = transferStock(state, beurre.id, 1, "Labo", "Boutique", { responsable: "Sara", motif: "Test" });
  assert.equal(state.transfers.at(-1)?.responsable, "Sara");
  state = updateRestockRequests(state, [reqId], "planifiee", { ofId: "OF-999" });
  assert.equal(state.restockRequests.find((r) => r.id === reqId)?.status, "planifiee");

  // 4. Clôture avec comptage tiroir-caisse séparé
  state = addDailyClosing(
    state,
    "2026-11-18",
    "Boutique",
    [{ articleId: croissant.id, produit: 30, vendu: 25, reporte: 3, jete: 1, casse: 1, offert: 0 }],
    true,
    { fondInitial: 5000, sortiesEspeces: 0, especesComptees: 8500, motifSortie: "RAS" },
  );
  assert.equal(state.closings.at(-1)?.caisseBilan?.fondInitial, 5000);
});


test("Demain : ignore les sources autres que la caisse et ne recompte pas une commande liée", () => {
  const product={id:P1,code:"P",nom:"Produit",unite:"pcs",seuil:0};
  const plan=computeTomorrowLabPlan({targetDate:"2026-11-19",products:[product],sales:[
    {date:"2026-11-12",siteId:SITE,source:"caisse",lignes:[{articleId:P1,qty:10}]},
    {date:"2026-11-12",siteId:SITE,source:"cake",lignes:[{articleId:P1,qty:1000}]},
  ],confirmedOrders:[{id:"c1",numero:"CK-1",clientNom:"Test",eventDate:"2026-11-20",productionDate:"2026-11-19",statut:"confirme",articleId:P1,qty:50,nbParts:50,ofNumero:"OF-existant"}]});
  assert.equal(plan.lignes[0].besoinVitrine,10);
  assert.equal(plan.lignes[0].commandesConfirmees,0);
});


test("Demain : un OF de gâteau sur commande ne couvre pas le besoin de vitrine", () => {
 const plan=computeTomorrowLabPlan({targetDate:"2026-11-19",products:[{id:P1,code:"P",nom:"Produit",unite:"pcs",seuil:0}],
  manualForecast:{[P1]:10},existingOrders:[{id:"of",numero:"OF-CAKE",produitId:P1,datePrevue:"2026-11-19",statut:"planifie",qtePrevue:10,qteRealisee:0,clientRef:"cake:devis"}]});
 assert.equal(plan.lignes[0].dejaEnFabrication,0);
 assert.equal(plan.lignes[0].aPreparer,10);
});
