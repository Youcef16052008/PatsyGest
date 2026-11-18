export const concepts = [
  { id: 'atelier', no: '01', name: 'Atelier', promise: 'Identité artisanale', focus: 'Une photo d’atelier, un accueil chaleureux et les actions du jour à portée de main.', tryView: 'ensemble', tryLabel: 'Voir l’accueil' },
  { id: 'pilotage', no: '02', name: 'Pilotage', promise: 'Indicateurs et alertes', focus: 'Des chiffres lisibles d’un coup d’œil, un menu latéral et des stocks faciles à filtrer.', tryView: 'ensemble', tryLabel: 'Voir les indicateurs' },
  { id: 'fabrication', no: '03', name: 'Mise en place', promise: 'Production en colonnes', focus: 'Les fournées passent de « À lancer » à « En cours », puis « Terminées ». Essayez de faire avancer une fiche.', tryView: 'ensemble', tryLabel: 'Voir les fournées' },
  { id: 'comptoir', no: '04', name: 'Comptoir', promise: 'Caisse tactile', focus: 'De grandes tuiles produits à gauche, le ticket et le total à droite. Essayez une vente fictive.', tryView: 'ensemble', tryLabel: 'Essayer la caisse' },
  { id: 'essentiel', no: '05', name: 'Essentiel', promise: 'Mobile et premiers pas', focus: 'Une action prioritaire et des instructions courtes. Le guide B se teste sur un atelier vierge.', tryView: 'guide', tryLabel: 'Essayer le guide B' },
];

export const modules = [
  { id: 'ensemble', name: 'Vue d’ensemble', short: 'Accueil', icon: 'home' },
  { id: 'stocks', name: 'Stocks', short: 'Stocks', icon: 'box' },
  { id: 'recettes', name: 'Recettes', short: 'Recettes', icon: 'book' },
  { id: 'production', name: 'Production', short: 'Labo', icon: 'layers' },
  { id: 'caisse', name: 'Caisse', short: 'Caisse', icon: 'receipt' },
];

export const stages = [
  { id: 'planifie', name: 'À lancer', tone: 'violet' },
  { id: 'encours', name: 'En cours', tone: 'amber' },
  { id: 'termine', name: 'Terminées', tone: 'green' },
];

export const recettes = [
  { id: 'croissant', nom: 'Croissant au beurre', categorie: 'Viennoiseries', version: 3, portions: 48, cout: 53.4, pv: 120, ingredients: [['Farine T55', '2,4 kg'], ['Beurre de tourage', '1,1 kg'], ['Sucre semoule', '180 g']] },
  { id: 'pain', nom: 'Pain au chocolat', categorie: 'Viennoiseries', version: 2, portions: 36, cout: 69.2, pv: 150, ingredients: [['Farine T55', '1,8 kg'], ['Beurre de tourage', '780 g'], ['Chocolat noir', '540 g']] },
  { id: 'eclair', nom: 'Éclair chocolat', categorie: 'Pâtisseries', version: 2, portions: 32, cout: 102, pv: 210, ingredients: [['Farine T55', '550 g'], ['Crème entière', '2 L'], ['Chocolat noir', '640 g']] },
  { id: 'tarte', nom: 'Tartelette citron', categorie: 'Pâtisseries', version: 1, portions: 24, cout: 116, pv: 240, ingredients: [['Farine T55', '720 g'], ['Beurre de tourage', '480 g'], ['Citron', '12 pcs']] },
];

const inventaire = [
  { id: 'far', code: 'MP-FAR', nom: 'Farine T55', type: 'matiere', unite: 'kg', quantite: 18.5, seuil: 5, dlc: '26 nov.', lot: 'L-2611', icon: 'grain' },
  { id: 'beu', code: 'MP-BEU', nom: 'Beurre de tourage', type: 'matiere', unite: 'kg', quantite: 2.4, seuil: 5, dlc: '22 nov.', lot: 'L-2212', icon: 'box' },
  { id: 'cre', code: 'MP-CRE', nom: 'Crème entière', type: 'matiere', unite: 'L', quantite: 8, seuil: 3, dlc: '18 nov.', lot: 'L-1814', proximo: true, icon: 'drop' },
  { id: 'cho', code: 'MP-CHO', nom: 'Chocolat noir', type: 'matiere', unite: 'kg', quantite: 6.8, seuil: 2, dlc: '08 déc.', lot: 'L-0823', icon: 'box' },
  { id: 'suc', code: 'MP-SUC', nom: 'Sucre semoule', type: 'matiere', unite: 'kg', quantite: 12, seuil: 3, dlc: '15 déc.', lot: 'L-1541', icon: 'grain' },
  ...recettes.map((r, i) => ({
    id: r.id, code: `PF-${r.id.slice(0, 3).toUpperCase()}`, nom: r.nom, type: 'produit', unite: 'pcs',
    quantite: [36, 24, 18, 12][i], seuil: 5, dlc: '19 nov.', lot: `PF-171${i}`, photo: r.id, prix: r.pv, categorie: r.categorie,
  })),
];

const ordres = [
  { id: 'OF-024', recette: 'tarte', qte: 24, heure: '10:30', stage: 'planifie', chef: 'Sara' },
  { id: 'OF-025', recette: 'eclair', qte: 32, heure: '11:30', stage: 'planifie', chef: 'Lina' },
  { id: 'OF-022', recette: 'pain', qte: 36, heure: '09:15', stage: 'encours', chef: 'Sara' },
  { id: 'OF-023', recette: 'croissant', qte: 48, heure: '09:45', stage: 'encours', chef: 'Lina' },
  { id: 'OF-021', recette: 'croissant', qte: 36, heure: '07:00', stage: 'termine', chef: 'Sara' },
];

const vues = new Set([...modules.map((m) => m.id), 'guide']);
const designs = new Set(concepts.map((c) => c.id));
export function lireUrl(search) {
  const params = new URLSearchParams(search);
  const design = params.get('design');
  const vue = params.get('vue');
  return {
    design: designs.has(design) ? design : 'atelier',
    vue: vues.has(vue) ? vue : 'ensemble',
    format: params.get('format') === 'mobile' ? 'mobile' : 'bureau',
  };
}
export function url({ design, vue, format }) {
  return `?${new URLSearchParams({ design, vue, ...(format === 'mobile' && { format }) })}`;
}

export const chiffres = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const montant = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const da = (n, exact = false) => `${(exact ? montant : chiffres).format(n)} DA`;

export const today = 'Mardi 17 novembre';
export function init() {
  return {
    articles: structuredClone(inventaire), ordres: structuredClone(ordres), panier: { croissant: 2, eclair: 1 }, ticket: 48, ventes: 18650,
    alerte: 'tous', recherche: '', categorie: 'tous', rechercheCaisse: '', periode: 7, presentation: 'tableau',
    guide: { groupe: 0, nom: '', code: '', unite: 'kg', fini: false },
  };
}
export function statusStock(a) {
  if (a.quantite === 0) return { tone: 'red', text: 'Épuisé' };
  if (a.quantite <= a.seuil) return { tone: 'amber', text: 'Stock bas' };
  if (a.proximo) return { tone: 'amber', text: 'DLC proche' };
  return { tone: 'green', text: 'Disponible' };
}
export function normaliser(s) {
  return s.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '');
}
export function filtrerArticles(articles, filtre, recherche) {
  const texte = normaliser(recherche);
  return articles.filter((a) => (filtre === 'tous' || filtre === a.type || (filtre === 'alerte' && statusStock(a).tone !== 'green'))
    && normaliser(`${a.nom} ${a.code}`).includes(texte));
}
export function suiteOF(stage) {
  const index = stages.findIndex((s) => s.id === stage);
  return index >= 0 ? stages[index + 1]?.id : undefined;
}
export function panierRecap(articles, panier) {
  return articles.filter((a) => a.type === 'produit' && panier[a.id] > 0).map((a) => ({ ...a, qte: panier[a.id] }));
}
export function totaux(lignes) {
  const centimes = lignes.reduce((s, p) => s + Math.round(p.prix * 100) * p.qte, 0);
  const tva = Math.round(centimes * 0.19);
  return { ht: centimes / 100, tva: tva / 100, ttc: (centimes + tva) / 100 };
}
