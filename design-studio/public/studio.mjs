import { lireUrl, url, init, concepts, recettes, stages, chiffres, da, filtrerArticles, statusStock, panierRecap, totaux, suiteOF, normaliser } from './model.mjs';
import { studio, workspace, stockRows, produitsCaisse, h, badge } from './views.mjs';
import { icon } from './icons.mjs';

const header = document.getElementById('studio');
const preview = document.getElementById('preview');
const dialog = document.getElementById('dialog');
const notification = document.getElementById('notification');
const state = init();
let route = lireUrl(location.search);
let favori = '';
let flash;
let retourFocus;
let prochaineFiche = 1;
try { favori = localStorage.getItem('patisgest-studio-favori') ?? ''; } catch { /* préférence facultative */ }

function avertir(message) {
  clearTimeout(flash);
  notification.textContent = message;
  flash = setTimeout(() => { notification.textContent = ''; }, 3400);
}

const focusAttrs = ['data-action', 'data-id', 'aria-label', 'data-format', 'data-design', 'data-vue', 'data-filtre', 'data-categorie', 'data-presentation', 'data-periode'];
function identifieFocus(e) {
  if (!e?.matches('button,a,input,select')) return '';
  if (e.id) return `#${CSS.escape(e.id)}`;
  const attrs = focusAttrs.filter((a) => e.hasAttribute(a));
  return attrs.length ? e.tagName.toLowerCase() + attrs.map((a) => `[${a}="${CSS.escape(e.getAttribute(a))}"]`).join('') : '';
}
function afficheStudio() {
  const focus = header.contains(document.activeElement) ? identifieFocus(document.activeElement) : '';
  header.innerHTML = studio(route, favori);
  if (focus) header.querySelector(focus)?.focus({ preventScroll: true });
}
function afficheApp({ main = false, guide = false } = {}) {
  const selector = preview.contains(document.activeElement) ? identifieFocus(document.activeElement) : '';
  preview.dataset.theme = route.design;
  preview.classList.toggle('is-mobile', route.format === 'mobile');
  preview.innerHTML = workspace(route, state);
  if (guide) (preview.querySelector('.guide-form :is(input,select,button[type=submit])') ?? preview.querySelector('.guide-success button'))?.focus();
  else if (selector && !main) preview.querySelector(selector)?.focus({ preventScroll: true });
  else if (main) preview.querySelector('main')?.focus({ preventScroll: true });
}
function navigation(transition, { scroll = false } = {}) {
  const prochaine = { ...route, ...transition };
  if (url(prochaine) === url(route)) return;
  const changerVue = prochaine.vue !== route.vue;
  route = prochaine;
  history.pushState(null, '', url(route));
  afficheStudio();
  afficheApp({ main: changerVue && scroll });
  if (changerVue && scroll && preview.getBoundingClientRect().top < 0) preview.scrollIntoView({ block: 'start' });
}
window.addEventListener('popstate', () => {
  route = lireUrl(location.search);
  afficheStudio();
  afficheApp();
});

const references = [
  ['Tartine Bakery', 'Atelier · photographie de gestes et de produits pour évoquer le métier.', 'https://tartinebakery.com/'],
  ['Shopify Polaris', 'Pilotage · tableau d’inventaire avec recherche, filtres et statuts.', 'https://shopify.dev/docs/api/app-home/patterns/compositions/index-table'],
  ['Atlassian · Kanban', 'Mise en place · colonnes par état, cartes avec quantité et heure.', 'https://www.atlassian.com/agile/kanban/boards'],
  ['Square · Item grid', 'Comptoir · tuiles produit et accès direct pendant l’encaissement.', 'https://squareup.com/help/ca/en/article/8334-set-up-item-grid'],
  ['GOV.UK · Task list', 'Essentiel · distinguer clairement les tâches faites et à faire. Le guide B garde ses dépendances métier.', 'https://design-system.service.gov.uk/components/task-list/'],
  ['W3C · WCAG 2.2', 'Toutes les pistes · commandes espacées, libellées et visibles au clavier.', 'https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html'],
];
const modalBtn = (action, label, cls = 'button secondary') => `<button type="button" class="${cls}" data-action="${action}">${label}</button>`;
function montre(titre, meta, contenu, boutons = '', wide = false) {
  if (!dialog.open) retourFocus = document.activeElement;
  dialog.dataset.theme = route.design;
  dialog.classList.toggle('wide', wide);
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.innerHTML = `<div class="dialog-top"><div><h2 id="dialog-title">${h(titre)}</h2>${meta ? `<p>${h(meta)}</p>` : ''}</div><button class="dialog-close" type="button" data-action="fermer" aria-label="Fermer" autofocus>${icon('close', 17)}</button></div><div class="dialog-body">${contenu}</div>${boutons ? `<div class="dialog-actions">${boutons}</div>` : ''}`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[autofocus]')?.focus({ preventScroll: true });
}
dialog.addEventListener('close', () => {
  dialog.replaceChildren();
  if (retourFocus?.isConnected) retourFocus.focus({ preventScroll: true });
  else preview.querySelector('main')?.focus({ preventScroll: true });
  retourFocus = null;
});
const fiche = (values) => `<dl class="info-table">${values.map(([label, value]) => `<dt>${h(label)}</dt><dd>${h(value)}</dd>`).join('')}</dl>`;

const popup = {
  references() {
    montre('Les références de conception', 'Des idées d’organisation, pas des interfaces copiées.', `<ul class="reference-list">${references.map(([nom, usage, adresse]) => `<li><a href="${adresse}" target="_blank" rel="noopener noreferrer"><span><b>${nom}</b><small>${usage}</small></span>${icon('external', 16)}</a></li>`).join('')}</ul><p class="reference-note"><b>Pour choisir :</b> essayez la même tâche dans deux maquettes — trouver un lot, lancer une fournée ou ajouter un article au ticket. Le changement de maquette garde l’écran et les données d’essai.</p>`, '', true);
  },
  article(a) {
    if (!a) return;
    const statut = statusStock(a);
    montre(a.nom, `${a.code} · ${a.type === 'matiere' ? 'Matière première' : 'Produit fini'}`, `${badge(statut.text, statut.tone)}${fiche([['Stock disponible', `${chiffres.format(a.quantite)} ${a.unite}`],['Seuil d’alerte', `${chiffres.format(a.seuil)} ${a.unite}`],['Prochain lot', a.lot],['Date limite', a.dlc]])}`, modalBtn('fermer', 'Fermer'));
  },
  recette(r) {
    if (!r) return;
    montre(r.nom, `Version ${r.version} · Active · ${r.portions} pièces par fournée`, `<p class="eyebrow">Ingrédients par fournée</p>${fiche(r.ingredients)}<br>${fiche([['Coût de revient par pièce', da(r.cout, true)],['Prix de vente HT', da(r.pv, true)]])}`, modalBtn('fermer', 'Fermer'));
  },
  ordre(o) {
    if (!o) return;
    const s = stages.find(({ id }) => id === o.stage);
    const prochaine = suiteOF(o.stage);
    montre(recettes.find(({ id }) => id === o.recette)?.nom, `${o.id} · Ordre de fabrication d’essai`, `${badge(s.name, s.tone)}${fiche([['Pièces prévues', o.qte],['Heure', o.heure],['Site', 'Laboratoire'],['Responsable', o.chef]])}`, `${modalBtn('fermer', 'Fermer')}${prochaine ? `<button type="button" class="button" data-action="avancer-ordre" data-id="${h(o.id)}">${o.stage === 'planifie' ? 'Démarrer la fournée' : 'Terminer la fournée'} ${icon('arrow', 16)}</button>` : ''}`);
  },
  planifier() {
    montre('Planifier une fournée', 'L’ordre est ajouté uniquement au tableau de cet aperçu.', `<form data-form="planifier"><div class="field-grid">
      <label class="field full">Recette<select name="recette">${recettes.map((r) => `<option value="${r.id}">${r.nom}</option>`).join('')}</select></label>
      <label class="field">Quantité (pièces)<input type="number" name="qte" min="1" max="9999" step="1" value="24" required></label>
      <label class="field">Heure prévue<input type="time" name="heure" value="12:00" required></label></div>
      <p class="form-error" role="alert"></p><div class="form-actions">${modalBtn('fermer', 'Annuler')}<button type="submit" class="button">Planifier ${icon('check', 16)}</button></div></form>`);
  },
  ajouterArticle() {
    montre('Ajouter un article', 'Formulaire de démonstration · aucun enregistrement dans PâtisGest.', `<form data-form="article"><div class="field-grid">
      <label class="field">Nom<input name="nom" required maxlength="100" placeholder="Poudre d’amande"></label>
      <label class="field">Code<input name="code" required maxlength="40" placeholder="MP-AMA"></label>
      <label class="field">Type<select name="type"><option value="matiere">Matière première</option><option value="produit">Produit fini</option></select></label>
      <label class="field">Unité<select name="unite"><option>kg</option><option>g</option><option>L</option><option>ml</option><option>pcs</option></select></label>
      <label class="field">Stock initial<input type="number" min="0" max="100000" step="any" name="qte" value="0" required></label>
      <label class="field prix-article" hidden>Prix de vente HT (DA)<input type="number" name="prix" min="0" max="1000000" step="0.01" value="100" disabled></label></div>
      <p class="form-error" role="alert"></p><div class="form-actions">${modalBtn('fermer', 'Annuler')}<button type="submit" class="button">Ajouter à l’aperçu ${icon('check', 16)}</button></div></form>`);
  },
  ticket(lignes, total) {
    montre('Vente simulée', 'Le stock et les chiffres de l’aperçu ont été mis à jour. Aucun paiement effectué.', `<div class="print-ticket"><h3>MAISON AMANDE</h3><p>Boutique · Oran</p><p>Ticket d’essai n° ${String(state.ticket).padStart(3, '0')}</p><div class="print-lines">${lignes.map((a) => `<div><span>${a.qte} × ${h(a.nom)}</span><b>${da(a.prix * a.qte, true)}</b></div>`).join('')}</div><div class="print-total"><span>Total HT</span><b>${da(total.ht, true)}</b></div><div class="print-total"><span>TVA (exemple)</span><b>${da(total.tva, true)}</b></div><div class="print-total"><b>Total TTC</b><b>${da(total.ttc, true)}</b></div><div class="print-lines"><p>MAQUETTE · SANS VALEUR FISCALE</p></div></div>`, `${modalBtn('imprimer', `${icon('print', 16)} Imprimer le ticket`)}${modalBtn('fermer', 'Nouveau ticket', 'button')}`);
  },
};

function avanceGuide() {
  afficheApp({ guide: true });
}
function encaisser() {
  const lignes = panierRecap(state.articles, state.panier);
  if (!lignes.length) return;
  if (lignes.some((p) => p.qte > p.quantite)) {
    avertir('Stock insuffisant : ajustez les quantités du ticket.');
    return;
  }
  const total = totaux(lignes);
  for (const a of state.articles) if (a.type === 'produit') a.quantite -= state.panier[a.id] ?? 0;
  state.ticket += 1;
  state.ventes = Math.round((state.ventes + total.ttc) * 100) / 100;
  state.panier = {};
  afficheApp();
  popup.ticket(lignes, total);
}

const actions = {
  references: popup.references,
  favori() {
    favori = favori === route.design ? '' : route.design;
    try { localStorage.setItem('patisgest-studio-favori', favori); } catch { /* possible en iframe privée */ }
    afficheStudio();
    avertir(favori ? `${concepts.find((c) => c.id === favori).name} est votre favori dans cet aperçu.` : 'Favori retiré.');
  },
  fermer() { dialog.close(); },
  imprimer() { window.print(); },
  article: (id) => popup.article(state.articles.find((a) => a.id === id)),
  recette: (id) => popup.recette(recettes.find((r) => r.id === id)),
  ordre: (id) => popup.ordre(state.ordres.find((o) => o.id === id)),
  'ajouter-article': popup.ajouterArticle,
  planifier: popup.planifier,
  'plus-panier': (id) => changePanier(id, 1),
  'moins-panier': (id) => changePanier(id, -1),
  vider() { state.panier = {}; afficheApp({ main: true }); },
  encaisser,
  'avancer-ordre'(id) {
    const o = state.ordres.find((item) => item.id === id);
    const suite = o && suiteOF(o.stage);
    if (!suite) return;
    o.stage = suite;
    dialog.close();
    afficheApp();
    avertir(`${o.id} · ${suite === 'encours' ? 'Fournée démarrée' : 'Fournée terminée'}.`);
  },
  'guide-retour'() { if (state.guide.groupe > 0) { state.guide.groupe -= 1; avanceGuide(); } },
  'guide-recommencer'() { state.guide = init().guide; avanceGuide(); },
};
function changePanier(id, delta) {
  const produit = state.articles.find((a) => a.id === id && a.type === 'produit');
  if (!produit) return;
  const nouvelle = Math.max(0, Math.min(produit.quantite, (state.panier[id] ?? 0) + delta));
  if (nouvelle) state.panier[id] = nouvelle;
  else delete state.panier[id];
  afficheApp();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-design],a[data-vue]');
  if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
    e.preventDefault();
    navigation(a.dataset.design ? { design: a.dataset.design } : { vue: a.dataset.vue }, { scroll: preview.contains(a) });
    return;
  }
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const { action, id, format, filtre, categorie, presentation, periode } = b.dataset;
  if (action && Object.hasOwn(actions, action)) actions[action](id);
  else if (format) navigation({ format });
  else if (filtre || categorie || presentation || periode) {
    if (filtre) state.alerte = filtre;
    if (categorie) state.categorie = categorie;
    if (presentation) state.presentation = presentation;
    if (periode) state.periode = Number(periode);
    afficheApp();
  }
});
document.addEventListener('input', (e) => {
  const v = e.target.value;
  if (e.target.id === 'stock-search') {
    state.recherche = v;
    document.getElementById('stock-rows').innerHTML = stockRows(state);
    document.getElementById('stock-count').textContent = `${filtrerArticles(state.articles, state.alerte, v).length} article(s) affiché(s)`;
  } else if (e.target.id === 'product-search') {
    state.rechercheCaisse = v;
    document.getElementById('product-grid').innerHTML = produitsCaisse(state);
  } else if (e.target.closest('form[data-form="guide"]') && ['nom','code','unite'].includes(e.target.name)) {
    state.guide[e.target.name] = v;
  }
});
document.addEventListener('change', (e) => {
  if (e.target.name !== 'type' || e.target.form?.dataset.form !== 'article') return;
  const prix = e.target.form.querySelector('.prix-article');
  const produit = e.target.value === 'produit';
  prix.hidden = !produit;
  prix.querySelector('input').disabled = !produit;
  e.target.form.elements.unite.value = produit ? 'pcs' : 'kg';
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const texte = (cle) => String(fd.get(cle) ?? '').trim();
  const erreur = (msg) => {
    const feedback = form.querySelector('.form-error');
    if (feedback) feedback.textContent = msg;
    else avertir(msg);
  };
  switch (form.dataset.form) {
    case 'guide':
      if (state.guide.groupe === 0) {
        if (!texte('nom') || !texte('code')) return erreur('Indiquez un nom et un code.');
        state.guide.nom = texte('nom'); state.guide.code = texte('code');
      } else if (state.guide.groupe === 1) state.guide.unite = texte('unite');
      if (state.guide.groupe === 2) state.guide.fini = true;
      else state.guide.groupe += 1;
      avanceGuide();
      break;
    case 'planifier': {
      const recette = texte('recette'); const heure = texte('heure'); const qte = Number(texte('qte'));
      if (!recettes.some((r) => r.id === recette) || !Number.isInteger(qte) || qte < 1 || qte > 9999 || !/^\d{2}:\d{2}$/.test(heure)) return erreur('Choisissez une recette, une quantité et une heure valides.');
      state.ordres.push({ id: `OF-${String(26 + prochaineFiche++).padStart(3,'0')}`, recette, qte, heure, stage: 'planifie', chef: 'Sara' });
      dialog.close(); afficheApp(); avertir('Fournée ajoutée au planning d’essai.');
      break;
    }
    case 'article': {
      const nom = texte('nom'); const code = texte('code'); const quantite = Number(texte('qte'));
      const type = texte('type'); const unite = texte('unite'); const prix = Number(texte('prix'));
      if (!nom || !code) return erreur('Indiquez un nom et un code.');
      if (state.articles.some((a) => normaliser(a.code) === normaliser(code))) return erreur('Ce code existe déjà dans la maquette.');
      if (!Number.isFinite(quantite) || quantite < 0 || (type === 'produit' && !Number.isInteger(quantite))) return erreur('Indiquez une quantité valide. Pour un produit, saisissez un nombre entier.');
      if (type === 'produit' && (!Number.isFinite(prix) || prix < 0)) return erreur('Le prix est invalide.');
      state.articles.unshift({ id: `article-${prochaineFiche++}`, nom, code, type, unite, quantite, seuil: 0, dlc: '—', lot: '—', icon: 'box', ...(type === 'produit' && { prix, categorie: 'Pâtisseries' }) });
      state.alerte = 'tous'; state.recherche = '';
      dialog.close(); afficheApp(); avertir('Article ajouté dans cet aperçu uniquement.');
      break;
    }
  }
});

afficheStudio();
afficheApp();
