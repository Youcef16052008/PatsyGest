import { concepts, modules, stages, recettes, today, chiffres, da, filtrerArticles, statusStock, panierRecap, totaux, normaliser, url } from './model.mjs';
import { icon } from './icons.mjs';

export const h = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const badge = (label, tone = 'neutral') => `<span class="badge ${tone}"><i></i>${h(label)}</span>`;
const img = (id, cls = '', eager = false) => `<img class="${cls}" src="assets/${id}.webp" alt="" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
const pict = (item) => item.photo ? img(item.photo, 'article-image') : `<span class="article-symbol">${icon(item.icon)}</span>`;
const link = (r, vue, text, { cls = 'button', glyph = 'arrow', prepend = false } = {}) => {
  const svg = glyph ? icon(glyph, 16) : '';
  return `<a class="${cls}" data-vue="${vue}" href="${url({ ...r, vue })}">${prepend ? svg : ''}<span>${text}</span>${prepend ? '' : svg}</a>`;
};
const action = (id, text, glyph, cls = 'button secondary') => `<button type="button" class="${cls}" data-action="${id}">${glyph ? icon(glyph, 16) : ''}${text}</button>`;
const btnIcon = (id, label, glyph, entity = '') => `<button type="button" class="icon-button" data-action="${id}" ${entity ? `data-id="${h(entity)}"` : ''} aria-label="${h(label)}" title="${h(label)}">${icon(glyph, 17)}</button>`;
const recette = (id) => recettes.find((r) => r.id === id);
const dateLabel = `<span class="date-label">${icon('calendar', 16)} ${today}</span>`;

export function studio(r, favori) {
  const c = concepts.find(({ id }) => id === r.design);
  return `<div class="studio-top">
    <div class="studio-brand"><img src="assets/studio.svg" alt="" width="35" height="35"><div><span>PâtisGest <i></i> Design</span><h1>Studio de maquettes</h1></div></div>
    <div class="studio-tools">
      <span class="live"><i></i>Données fictives</span>
      <button class="studio-button" data-action="references" type="button">${icon('reference', 16)}<span>Références</span></button>
      <div class="devices" role="group" aria-label="Format de prévisualisation">${['bureau', 'mobile'].map((f) => `<button type="button" data-format="${f}" aria-pressed="${r.format === f}">${icon(f === 'bureau' ? 'monitor' : 'mobile', 16)}<span>${f === 'bureau' ? 'Bureau' : 'Mobile'}</span></button>`).join('')}</div>
    </div>
  </div>
  <nav class="concepts" aria-label="Choisir une maquette">${concepts.map((d) => `
    <a class="choice" href="${url({ ...r, design: d.id })}" data-design="${d.id}" ${d.id === r.design ? 'aria-current="true"' : ''}>
      <div class="mini mini-${d.id}" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="choice-label"><span><small>${d.no}</small>${d.name}${favori === d.id ? `<span class="choice-star">${icon('star', 13)}<span class="sr-only"> (favori)</span></span>` : ''}</span><p>${d.promise}</p></div>
    </a>`).join('')}</nav>
  <div class="studio-caption">
    <p><b>${c.no} / 05</b><span>${c.focus}</span></p>
    <div class="caption-tools">
      ${r.vue !== c.tryView ? link(r, c.tryView, c.tryLabel, { cls: 'studio-button compact', glyph: 'arrow' }) : ''}
      <button type="button" class="studio-button compact favorite" data-action="favori" aria-pressed="${favori === c.id}">${icon('star', 16)}<span>${favori === c.id ? 'Favori enregistré' : 'Garder en favori'}</span></button>
    </div>
  </div>`;
}

function brand(r) {
  return `<a href="${url({ ...r, vue: 'ensemble' })}" class="app-brand" data-vue="ensemble"><span class="brand-symbol">${icon('logo', 23)}</span><span><strong>PâtisGest</strong><small>Maison Amande</small></span></a>`;
}

export function workspace(r, state) {
  return `<div class="app-shell">
    <div class="app-chrome">
      ${brand(r)}
      <div class="nav-group"><span class="nav-eyebrow">ESPACE DE TRAVAIL</span><nav class="app-nav" aria-label="Modules de PâtisGest">${modules.map((m) => `
        <a href="${url({ ...r, vue: m.id })}" data-vue="${m.id}" ${m.id === r.vue ? 'aria-current="page"' : ''}>${icon(m.icon, 18)}<span class="nav-full">${m.name}</span><span class="nav-short">${m.short}</span></a>`).join('')}
      </nav></div>
      <div class="app-profile" title="Amina · Propriétaire (profil de démonstration)"><span class="avatar">AM</span><span class="profile-text"><b>Amina</b><small>Propriétaire</small></span></div>
    </div>
    <main id="workspace-main" tabindex="-1" data-view="${r.vue}">${view(r, state)}</main>
  </div>`;
}

function intro(eyebrow, title, text, tools = '') {
  return `<div class="page-intro"><div class="intro-copy"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2><p>${text}</p></div>${tools ? `<div class="intro-tools">${tools}</div>` : ''}</div>`;
}
function metric(title, value, meta, glyph, tone = '') {
  return `<article class="card metric"><div class="metric-top"><span>${title}</span><span class="metric-icon ${tone}">${icon(glyph, 17)}</span></div><strong>${value}</strong><p>${meta}</p></article>`;
}
function cardHead(label, side = '', sub = '') {
  return `<div class="card-head"><div><h3>${label}</h3>${sub ? `<p>${sub}</p>` : ''}</div>${side}</div>`;
}
function compte(state) {
  return { attente: state.ordres.filter((o) => o.stage === 'planifie').length, enCours: state.ordres.filter((o) => o.stage === 'encours').length, alertes: state.articles.filter((a) => statusStock(a).tone !== 'green') };
}

function alertes(r, state) {
  const { alertes: listes } = compte(state);
  return `<section class="card alerts-card">${cardHead('À surveiller', link(r, 'stocks', 'Voir les stocks', { cls: 'text-button' }))}
    <div class="alert-list">${listes.length ? listes.slice(0, 3).map((a) => {
      const s = statusStock(a);
      return `<button type="button" class="alert-row" data-action="article" data-id="${h(a.id)}"><span class="alert-symbol">${icon(a.proximo ? 'clock' : 'alert', 18)}</span><span><b>${h(a.nom)}</b><small>${a.proximo ? `Lot ${h(a.lot)} · DLC ${h(a.dlc)}` : `${chiffres.format(a.quantite)} ${h(a.unite)} restants · seuil ${chiffres.format(a.seuil)}`}</small></span>${badge(s.text, s.tone)}</button>`;
    }).join('') : '<p class="empty">Aucun lot à surveiller.</p>'}</div></section>`;
}
function agenda(r, state) {
  const aVenir = state.ordres.filter((o) => o.stage === 'planifie').sort((a, b) => a.heure.localeCompare(b.heure));
  return `<section class="card agenda-card">${cardHead('Prochaines fournées', link(r, 'production', 'Planning', { cls: 'text-button' }))}
    <div class="agenda-list">${aVenir.length ? aVenir.slice(0, 3).map((o) => `<button class="agenda-row" type="button" data-action="ordre" data-id="${h(o.id)}"><span class="heure">${h(o.heure)}</span><span><b>${h(recette(o.recette)?.nom)}</b><small>${o.qte} pièces · ${h(o.chef)}</small></span>${icon('chevron', 17)}</button>`).join('') : '<p class="empty">Plus de fournée à lancer.</p>'}</div></section>`;
}
function guideLink(r) {
  return `<section class="card guide-shortcut"><div class="metric-icon violet">${icon('guide')}</div><div><h3>Premiers pas</h3><p>Essayez le guide B sur un atelier vierge.</p></div>${link(r, 'guide', 'Me guider', { cls: 'button secondary' })}</section>`;
}

function atelier(r, state) {
  const { alertes: urgences, attente, enCours } = compte(state);
  return `<section class="atelier-hero">
    <div class="atelier-copy"><div class="hero-date"><span></span>${today} · Oran</div><h2>Bonjour, Amina<span>.</span></h2>
      <p>Fournées, stock et ventes : retrouvez l’essentiel de votre atelier.</p>
      <div class="hero-actions">${link(r, 'production', 'Voir la production')}${link(r, 'caisse', 'Ouvrir la caisse', { cls: 'button quiet', glyph: 'receipt', prepend: true })}</div>
    </div>
    <div class="atelier-photo">${img('hero', 'hero-photo', true)}<span class="photo-note">${icon('logo', 17)} MAISON AMANDE</span></div>
  </section>
  <div class="metric-grid">
    ${metric('Ventes du jour', da(state.ventes), `${state.ticket} tickets · Boutique`, 'trend', 'green')}
    ${metric('Fournées du jour', state.ordres.length, `${enCours} en cours · ${attente} à lancer`, 'layers', 'violet')}
    ${metric('Articles à surveiller', urgences.length, 'Seuil de stock ou DLC', 'alert', 'amber')}
  </div>
  <div class="dashboard-panels">${alertes(r, state)}${agenda(r, state)}</div>${guideLink(r)}`;
}

function graphique(state) {
  const longs = [8950, 10230, 9830, 12900, 11180, 14100, 10220, 12400, 13960, 12150, 16390, 15320, 17580, state.ventes];
  const series = longs.slice(-state.periode);
  const max = Math.ceil(Math.max(...series) / 5000) * 5000;
  const points = series.map((v, i) => [i * 560 / (series.length - 1), 150 - (v / max) * 135]);
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return `<section class="card chart-card">${cardHead('Ventes TTC', `<div class="period" role="group" aria-label="Période du graphique">${[7, 14].map((p) => `<button type="button" data-periode="${p}" aria-pressed="${p === state.periode}">${p} j</button>`).join('')}</div>`, 'Évolution en dinars')}
    <div class="chart-value"><strong>${da(series.reduce((s, n) => s + n, 0))}</strong><span>${state.periode} derniers jours</span></div>
    <figure class="chart" role="img" aria-label="Ventes sur ${state.periode} jours, de ${da(series[0])} à ${da(series.at(-1))}">
      <div class="chart-axis" aria-hidden="true">${[1, .75, .5, .25, 0].map((v) => `<span>${chiffres.format(max * v / 1000)}k</span>`).join('')}</div>
      <svg viewBox="0 0 560 150" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="remplissage" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="currentColor" stop-opacity=".21"/><stop offset="1" stop-color="currentColor" stop-opacity=".02"/></linearGradient></defs>
        ${[15, 48.75, 82.5, 116.25, 150].map((y) => `<path d="M0 ${y}H560" class="chart-gridline" vector-effect="non-scaling-stroke"/>`).join('')}
        <polygon fill="url(#remplissage)" points="0,150 ${line} 560,150"/>
        <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        ${points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="currentColor"/>`).join('')}
      </svg>
      <div class="chart-days" aria-hidden="true">${(state.periode === 7 ? ['11 nov.', '13 nov.', '15 nov.', '17 nov.'] : ['4 nov.', '8 nov.', '12 nov.', '17 nov.']).map((d) => `<span>${d}</span>`).join('')}</div>
    </figure>
  </section>`;
}

function pilotage(r, state) {
  const { alertes: urgences, enCours } = compte(state);
  return `${intro('TABLEAU DE BORD', 'Vue d’ensemble', 'Les chiffres de la boutique et les priorités du jour.', dateLabel)}
    <div class="metric-grid four">
      ${metric('Ventes aujourd’hui', da(state.ventes), 'Total TTC', 'trend', 'blue')}
      ${metric('Tickets', state.ticket, `${da(state.ventes / state.ticket)} / ticket`, 'receipt', 'violet')}
      ${metric('Lots à surveiller', urgences.length, 'Seuil ou date limite', 'alert', 'amber')}
      ${metric('Fournées en cours', enCours, `${state.ordres.length} au planning`, 'layers', 'green')}
    </div>
    <div class="dashboard-panels chart-layout">${graphique(state)}${alertes(r, state)}</div>
    ${agenda(r, state)}${guideLink(r)}`;
}

function essentiel(r, state) {
  const { alertes: a, attente } = compte(state);
  return `<div class="essential-wrap">
    ${intro('VOTRE JOURNÉE', 'Bonjour, Amina.', 'Une étape à la fois, à votre rythme.', dateLabel)}
    <section class="essential-guide">
      <div class="essential-top"><span class="guide-kicker">${icon('guide', 19)} Premiers pas</span><span class="round-count">${state.guide.fini ? 1 : 0} / 6</span></div>
      <h3>${state.guide.fini ? 'Votre ingrédient est prêt.' : 'Créez un ingrédient.'}</h3>
      <p>Un ingrédient sert à construire votre recette, puis à en calculer le coût.</p>
      <div class="essential-flow"><span>Ingrédient</span>${icon('arrow', 15)}<span>Recette</span>${icon('arrow', 15)}<span>Coût</span></div>
      <div class="essential-action">${link(r, 'guide', state.guide.fini ? 'Voir mon essai' : 'Me guider')}<span>Essai indépendant · atelier vierge</span></div>
    </section>
    <section class="card today-list">${cardHead('Aujourd’hui')}
      ${[['stocks','box','Vérifier les stocks',`${a.length} articles à surveiller`],['production','layers','Préparer les fournées',`${attente} à lancer`],['caisse','receipt','Ouvrir la caisse',`${state.ticket} tickets aujourd’hui`]].map(([v, ico, label, line]) => `<a href="${url({ ...r, vue: v })}" data-vue="${v}" class="today-row"><span class="metric-icon">${icon(ico, 19)}</span><span><b>${label}</b><small>${line}</small></span>${icon('chevron', 16)}</a>`).join('')}
    </section>
  </div>`;
}

export function stockRows(state) {
  const items = filtrerArticles(state.articles, state.alerte, state.recherche);
  if (!items.length) return '<tr><td class="empty" colspan="5">Aucun article ne correspond à cette recherche.</td></tr>';
  return items.map((a) => {
    const s = statusStock(a);
    return `<tr><th scope="row"><button type="button" class="stock-name" data-action="article" data-id="${h(a.id)}">${pict(a)}<span><b>${h(a.nom)}</b><small>${h(a.code)}</small></span></button></th><td class="stock-type">${a.type === 'matiere' ? 'Matière première' : 'Produit fini'}</td><td><strong>${chiffres.format(a.quantite)} ${h(a.unite)}</strong></td><td class="stock-dlc">${h(a.dlc)}</td><td>${badge(s.text, s.tone)}</td></tr>`;
  }).join('');
}
function stocks(r, state) {
  const alertesCount = compte(state).alertes.length;
  return `${intro('INVENTAIRE', 'Articles & stocks', 'Quantités, seuils et dates limites des lots de l’atelier.', action('ajouter-article', 'Ajouter un article', 'plus', 'button'))}
    <section class="card stock-card" aria-label="Inventaire de démonstration">
      <div class="list-tools"><div class="chips" role="group" aria-label="Filtrer les articles">${[['tous','Tous'],['alerte',`À surveiller · ${alertesCount}`],['matiere','Matières'],['produit','Produits']].map(([id, label]) => `<button type="button" data-filtre="${id}" aria-pressed="${id === state.alerte}">${label}</button>`).join('')}</div><label class="search">${icon('search', 17)}<span class="sr-only">Rechercher un article</span><input type="search" id="stock-search" autocomplete="off" placeholder="Nom ou code…" value="${h(state.recherche)}"></label></div>
      <div class="table-wrap"><table><thead><tr><th scope="col">Article</th><th scope="col" class="stock-type">Type</th><th scope="col">Stock</th><th scope="col" class="stock-dlc">Prochaine DLC</th><th scope="col">État</th></tr></thead><tbody id="stock-rows">${stockRows(state)}</tbody></table></div>
      <div id="stock-count" class="list-foot" aria-live="polite">${filtrerArticles(state.articles,state.alerte,state.recherche).length} article(s) affiché(s)</div>
    </section>`;
}
function repertoire(r) {
  return `${intro('RECETTES & COÛTS', 'Vos recettes', 'Rendement, versions actives et coût de revient par portion.')}
    <div class="recipe-grid">${recettes.map((a) => `<article class="card recipe-card">
      <div class="recipe-photo">${img(a.id)}<span class="version">Version ${a.version} · Active</span></div>
      <div class="recipe-details"><span class="eyebrow">${a.categorie}</span><h3>${a.nom}</h3><p>${a.portions} pièces par fournée</p><div class="recipe-cost"><div><small>Coût / pièce</small><b>${da(a.cout)}</b></div><div><small>Marge brute</small><b>${Math.round(100 * (1 - a.cout / a.pv))} %</b></div></div><button type="button" class="button secondary" data-action="recette" data-id="${a.id}">Voir la fiche ${icon('arrow', 16)}</button></div>
    </article>`).join('')}</div>${guideLink(r)}`;
}

function orderCard(o, tone) {
  const a = recette(o.recette);
  return `<article class="order-card"><div class="order-top"><span>${h(o.id)}</span><span>${icon('clock', 14)} ${h(o.heure)}</span></div>
    <h4>${h(a?.nom)}</h4><p>${o.qte} pièces · Laboratoire</p>
    <div class="order-bottom"><span class="order-assignee"><span class="avatar avatar-small ${tone}">${h(o.chef[0])}</span>${h(o.chef)}</span><button type="button" data-action="ordre" data-id="${h(o.id)}" class="text-button">${o.stage === 'termine' ? 'Voir' : o.stage === 'encours' ? 'Terminer' : 'Démarrer'} ${icon('chevron', 15)}</button></div>
  </article>`;
}
function production(r, state) {
  const sort = (a, b) => a.heure.localeCompare(b.heure);
  const counts = compte(state);
  return `${intro('LABORATOIRE', r.vue === 'ensemble' ? 'Les fournées du jour' : 'Plan de production', 'Retrouvez ce qui est à lancer, en préparation ou terminé.', action('planifier', 'Planifier une fournée', 'plus', 'button'))}
    <div class="board-tools"><div>${dateLabel}<span class="board-count">${counts.enCours} en cours</span></div><div class="period" role="group" aria-label="Vue de la production"><button type="button" data-presentation="tableau" aria-pressed="${state.presentation === 'tableau'}">${icon('layers', 15)} Colonnes</button><button type="button" data-presentation="liste" aria-pressed="${state.presentation === 'liste'}">${icon('list', 15)} Liste</button></div></div>
    ${state.presentation === 'tableau' ? `<div class="kanban">${stages.map((s) => {
      const os = state.ordres.filter((o) => o.stage === s.id).sort(sort);
      return `<section class="lane ${s.tone}" aria-label="${s.name}"><div class="lane-head"><span class="lane-dot"></span><h3>${s.name}</h3><span class="lane-count">${os.length}</span></div><div class="lane-cards">${os.map((o) => orderCard(o, s.tone)).join('') || '<p class="empty">Aucune fournée.</p>'}</div></section>`;
    }).join('')}</div>` : `<div class="card table-wrap"><table class="order-table"><thead><tr><th scope="col">Fabrication</th><th scope="col">Heure</th><th scope="col">Quantité</th><th scope="col">État</th></tr></thead><tbody>${[...state.ordres].sort(sort).map((o) => {
      const s = stages.find(({id}) => id === o.stage);
      return `<tr><th scope="row"><button type="button" class="table-link" data-action="ordre" data-id="${h(o.id)}"><b>${h(recette(o.recette)?.nom)}</b><small>${h(o.id)} · ${h(o.chef)}</small></button></th><td>${h(o.heure)}</td><td>${o.qte} pcs</td><td>${badge(s.name, s.tone)}</td></tr>`;
    }).join('')}</tbody></table></div>`}
    ${r.vue === 'ensemble' ? `<div class="dashboard-panels">${alertes(r, state)}${guideLink(r)}</div>` : ''}`;
}

export function produitsCaisse(state) {
  const selection = state.articles.filter((a) => a.type === 'produit' && (state.categorie === 'tous' || a.categorie === state.categorie)
    && normaliser(`${a.nom} ${a.code}`).includes(normaliser(state.rechercheCaisse)));
  return selection.length ? selection.map((a) => `<button type="button" class="product" data-action="plus-panier" data-id="${h(a.id)}" ${a.quantite <= (state.panier[a.id] ?? 0) ? 'disabled' : ''}>
    <div class="product-picture">${a.photo ? img(a.photo) : `<div class="product-placeholder">${icon('logo', 34)}</div>`}</div><div class="product-info"><div><b>${h(a.nom)}</b><small>${da(totaux([{ ...a, qte: 1 }]).ttc)} TTC · ${chiffres.format(a.quantite)} en stock</small></div><span class="product-plus">${icon('plus', 16)}<span class="sr-only">Ajouter au ticket</span></span></div>
  </button>`).join('') : '<p class="empty">Aucun produit trouvé.</p>';
}
function caisse(r, state) {
  const lignes = panierRecap(state.articles, state.panier);
  const total = totaux(lignes);
  return `${intro('BOUTIQUE · ORAN', r.vue === 'ensemble' ? 'Le comptoir' : 'Caisse', 'Composez un ticket d’essai sans encaisser de paiement.', `<span class="counter-pill">${icon('store', 17)} Boutique principale</span>`)}
    <div class="pos-layout">
      <section class="card catalog"><div class="catalog-head"><h3>Produits</h3><label class="search">${icon('search', 17)}<span class="sr-only">Rechercher un produit</span><input type="search" id="product-search" autocomplete="off" placeholder="Rechercher…" value="${h(state.rechercheCaisse)}"></label></div>
        <div class="chips" role="group" aria-label="Catégories de produits">${['tous','Viennoiseries','Pâtisseries'].map((c) => `<button type="button" data-categorie="${c}" aria-pressed="${state.categorie === c}">${c === 'tous' ? 'Tout' : c}</button>`).join('')}</div>
        <div class="catalog-grid" id="product-grid">${produitsCaisse(state)}</div>
      </section>
      <section class="card ticket" aria-label="Ticket en cours">
        <div class="ticket-head"><span class="metric-icon green">${icon('receipt', 21)}</span><div><small>TICKET D’ESSAI</small><h3>Vente en cours</h3></div><span>#${String(state.ticket + 1).padStart(3, '0')}</span></div>
        ${lignes.length ? `<div class="ticket-lines">${lignes.map((a) => `<div class="ticket-row"><div><b>${h(a.nom)}</b><small>${da(a.prix * a.qte, true)} HT</small></div><div class="quantity">${btnIcon('moins-panier', `Retirer un ${a.nom}`, 'minus', a.id)}<b>${a.qte}</b>${a.qte < a.quantite ? btnIcon('plus-panier', `Ajouter un ${a.nom}`, 'plus', a.id) : ''}</div></div>`).join('')}</div>` : `<div class="ticket-empty">${icon('receipt', 30)}<p>Ajoutez un produit pour commencer.</p></div>`}
        <div class="pos-total"><div><span>Sous-total HT</span><b>${da(total.ht, true)}</b></div><div><span>TVA d’exemple (19 %)</span><b>${da(total.tva, true)}</b></div><div class="grand-total"><span>Total TTC</span><strong>${da(total.ttc, true)}</strong></div></div>
        <button type="button" class="button encaisser" data-action="encaisser" ${lignes.length ? '' : 'disabled'}>Simuler la vente ${icon('arrow', 18)}</button>
        ${lignes.length ? action('vider', 'Vider le ticket', undefined, 'text-button clear-ticket') : ''}
      </section>
    </div>`;
}

function guide(r, state) {
  const g = state.guide;
  const labels = ['Nom et code', 'Type et unité', 'Enregistrer'];
  const champ = (l, key, sample, n) => `<label class="field">${l}<input name="${key}" required maxlength="${n}" placeholder="${sample}" value="${h(g[key])}" autocomplete="off"></label>`;
  const fields = [
    `<h3>Nommez votre ingrédient</h3><p>Par exemple, « Farine T55 ».</p><div class="field-grid">${champ('Nom','nom','Farine T55',120)}${champ('Code','code','MP-FAR',40)}</div>`,
    `<h3>Choisissez l’unité</h3><p>Par exemple, le kg pour la farine.</p><div class="field-grid"><div class="field">Type<span class="field-fixed">Matière première</span></div><label class="field">Unité<select name="unite">${['kg','g','L','ml','pcs'].map((u) => `<option ${u === g.unite ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>`,
    `<h3>Vérifiez la fiche</h3><p>Les champs précédents n’ont encore rien créé.</p><div class="guide-summary"><b>${h(g.nom)}</b><span>${h(g.code)} · Matière première · ${h(g.unite)}</span></div>`,
  ];
  return `<div class="guide-wrap">${intro('ATELIER VIERGE · DÉMONSTRATION', 'Premiers pas', 'Testez le premier jalon du guide B, sans modifier les stocks de la maquette.', link(r, 'ensemble', 'Quitter le guide', { cls: 'text-button', glyph: 'back', prepend: true }))}
    <div class="card guide-card"><div class="guide-top"><span>${icon('guide', 18)} Guide B · Ingrédient</span><output aria-label="Progression du guide">${g.fini ? 1 : 0} / 6</output></div>
      ${g.fini ? `<div class="guide-success"><span class="metric-icon green">${icon('check', 23)}</span><h3>Ingrédient créé</h3><p><b>${h(g.nom)}</b> a été ajouté dans cet essai. Le guide complet proposerait ensuite de créer un produit fini.</p>${action('guide-recommencer', 'Recommencer l’essai', 'back')}</div>` : `
        <ol class="guide-steps" aria-label="Groupes de champs">${labels.map((l, i) => `<li ${i === g.groupe ? 'aria-current="step"' : ''}><b>${i < g.groupe ? icon('check', 13) : i + 1}</b>${l}</li>`).join('')}</ol>
        <form data-form="guide" class="guide-form">${fields[g.groupe]}
          <div class="form-actions">${g.groupe > 0 ? action('guide-retour', 'Retour', 'back', 'button secondary') : ''}<button type="submit" class="button">${g.groupe === 2 ? 'Enregistrer l’ingrédient' : 'Continuer'}${icon(g.groupe === 2 ? 'check' : 'arrow', 16)}</button></div>
        </form>`}
    </div>${link(r, 'stocks', 'Voir le module Stocks', { cls: 'text-button' })}</div>`;
}
function view(r, state) {
  switch (r.vue) {
    case 'stocks': return stocks(r, state);
    case 'recettes': return repertoire(r);
    case 'production': return production(r, state);
    case 'caisse': return caisse(r, state);
    case 'guide': return guide(r, state);
    default: {
      if (r.design === 'pilotage') return pilotage(r, state);
      if (r.design === 'fabrication') return production(r, state);
      if (r.design === 'comptoir') return caisse(r, state);
      if (r.design === 'essentiel') return essentiel(r, state);
      return atelier(r, state);
    }
  }
}
