"use client";

import Image from "next/image";
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  addToCart,
  checkCartStock,
  computeCartTotals,
  MAX_CART_QTE,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES_SAISIE,
  removeFromCart,
  setCartLineQty,
  stepCartLine,
  type CartItem,
  type PaymentMode,
} from "@/lib/pos-cart";
import { correspond, dinars, quantite, siteCaisse, type CatalogProduct, type SiteStock, type WorkspaceSite } from "@/lib/workspace-data";
import { EmptyState } from "./workspace-ui";
import { Icon } from "./workspace-icons";

const PAGE_SIZE = 12;

export default function SaleComposer({
  articles,
  sites,
  stock,
  expiredStock = null,
  onSubmit,
  busy = false,
  demo = false,
  status,
}: {
  articles: CatalogProduct[];
  sites: WorkspaceSite[];
  stock: SiteStock | null;
  expiredStock?: SiteStock | null;
  busy?: boolean;
  demo?: boolean;
  status?: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const id = useId();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [modePaiement, setModePaiement] = useState<PaymentMode>("especes");
  const [chosenSite, chooseSite] = useState(() => siteCaisse(sites));
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [cartError, setCartError] = useState<string | null>(null);
  const ticket = useRef<HTMLElement>(null);

  const site = sites.find((s) => s.id === chosenSite) ?? sites.find((s) => s.id === siteCaisse(sites));
  const currentStock = (p: CatalogProduct) => (stock && site ? (stock[site.id]?.[p.id] ?? 0) : null);
  const currentExpired = (p: CatalogProduct) => (expiredStock && site ? (expiredStock[site.id]?.[p.id] ?? 0) : 0);
  const prixUnitaire = (p: CatalogProduct) =>
    p.prixHT != null && p.tva != null && Number.isFinite(p.prixHT) && Number.isFinite(p.tva)
      ? Math.round(p.prixHT * (1 + p.tva / 100) * 100) / 100
      : null;

  const noms = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of articles) map.set(a.label, (map.get(a.label) ?? 0) + 1);
    return map;
  }, [articles]);

  const qtyInCart = useMemo(() => new Map(cart.map((c) => [c.articleId, c.qte])), [cart]);
  const totals = useMemo(() => computeCartTotals(cart), [cart]);
  const stockAlerts = useMemo(
    () => (site ? checkCartStock(cart, site.id, stock, expiredStock) : []),
    [cart, site, stock, expiredStock],
  );

  const rows = articles.filter((p) => correspond(`${p.label} ${p.code ?? ""}`, search));
  const canSell = Boolean(site && totals.valide) && !busy;

  const serializedLines = useMemo(
    () =>
      JSON.stringify(
        totals.lignes
          .filter((l) => l.qteValide)
          .map((l) => ({ articleId: l.articleId, qte: l.qte })),
      ),
    [totals.lignes],
  );

  function ajouterProduit(product: CatalogProduct) {
    try {
      setCartError(null);
      setCart((prev) => {
        const next = addToCart(prev, product, 1);
        const updated = next.find((x) => x.articleId === product.id);
        if (updated) {
          setQtyDrafts((d) => ({ ...d, [product.id]: String(updated.qte) }));
        }
        return next;
      });
    } catch (e) {
      setCartError(e instanceof Error ? e.message : "Panier complet.");
    }
  }

  function modifierQte(articleId: string, raw: string) {
    setQtyDrafts((d) => ({ ...d, [articleId]: raw }));
    const n = raw.trim() === "" ? Number.NaN : Number(raw);
    setCart((prev) => setCartLineQty(prev, articleId, n));
  }

  function ajusterLigne(articleId: string, delta: number) {
    setCart((prev) => {
      const next = stepCartLine(prev, articleId, delta);
      const updated = next.find((x) => x.articleId === articleId);
      setQtyDrafts((d) => {
        const copy = { ...d };
        if (updated) copy[articleId] = String(updated.qte);
        else delete copy[articleId];
        return copy;
      });
      return next;
    });
  }

  function retirerLigne(articleId: string) {
    setCart((prev) => removeFromCart(prev, articleId));
    setQtyDrafts((d) => {
      const copy = { ...d };
      delete copy[articleId];
      return copy;
    });
  }

  function viderPanier() {
    setCart([]);
    setQtyDrafts({});
    setCartError(null);
  }

  return (
    <div className="pg-pos">
      <section className="pg-card pg-card-pad pg-catalog" aria-labelledby={`${id}-catalog`}>
        <div className="pg-card-head">
          <div>
            <h2 id={`${id}-catalog`}>Produits à vendre</h2>
            <p>Touchez un ou plusieurs produits pour composer le panier client (stocks éligibles FEFO).</p>
          </div>
          {status}
        </div>
        <div className="pg-pos-toolbar">
          <div className="pg-search">
            <Icon name="search" size={18} />
            <input
              type="search"
              className="pg-input"
              placeholder="Rechercher un produit…"
              aria-label="Rechercher un produit"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(PAGE_SIZE);
              }}
            />
          </div>
          {sites.length > 1 ? (
            <label className="pg-field pg-pos-site">
              <span>Site de vente</span>
              <select
                value={site?.id ?? ""}
                className="pg-input"
                onChange={(e) => chooseSite(e.target.value)}
                disabled={busy}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            site && (
              <span className="pg-pos-only-site">
                <Icon name="store" size={17} /> {site.label}
              </span>
            )
          )}
        </div>
        {!!articles.length && (
          <div className="pg-pos-subbar">
            <p className="pg-list-count" role="status">
              {rows.length} {rows.length === 1 ? "produit" : "produits"}
            </p>
            {cart.length > 0 && (
              <button
                type="button"
                className="pg-button pg-button-secondary pg-pos-jump"
                onClick={() => ticket.current?.focus()}
              >
                Voir le panier ({cart.length})
              </button>
            )}
          </div>
        )}
        {cartError && (
          <p role="alert" className="pg-quantity-warning">
            <Icon name="alert" size={16} /> {cartError}
          </p>
        )}
        {rows.length ? (
          <div className="pg-product-grid" role="group" aria-label="Produits">
            {rows.slice(0, limit).map((a, index) => {
              const dispo = currentStock(a);
              const perime = currentExpired(a);
              const price = prixUnitaire(a);
              const inCart = qtyInCart.get(a.id) ?? 0;
              return (
                <button
                  type="button"
                  key={a.id}
                  className="pg-product"
                  aria-pressed={inCart > 0}
                  disabled={busy}
                  onClick={() => ajouterProduit(a)}
                >
                  <span className="pg-product-body">
                    <span className="pg-product-icon pg-emblem">
                      <Icon name="cake" size={20} />
                    </span>
                    <span className="pg-product-copy">
                      <strong>{a.label}</strong>
                      <span className="pg-product-stock" data-empty={dispo === 0}>
                        {dispo === null
                          ? "Stock indisponible"
                          : `${quantite(dispo, a.unit)} utilisable${dispo > 1 ? "s" : ""}`}
                        {perime > 0 ? ` · ${quantite(perime)} DLC dépassée` : ""}
                      </span>
                      {price !== null && <small>{dinars(price)} TTC</small>}
                      {(noms.get(a.label) ?? 0) > 1 && a.code && <small>{a.code}</small>}
                    </span>
                    <span className="pg-product-select" data-count={inCart > 0 || undefined}>
                      {inCart > 0 ? (
                        <strong className="pg-product-qty">{quantite(inCart)}</strong>
                      ) : (
                        <Icon name="plus" size={18} />
                      )}
                    </span>
                  </span>
                  {a.photo && (
                    <Image
                      className="pg-product-photo"
                      src={a.photo}
                      alt=""
                      width={480}
                      height={336}
                      loading={index < 2 ? "eager" : "lazy"}
                      unoptimized
                    />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="cake"
            title={articles.length ? "Aucun produit trouvé" : "Aucun produit à vendre"}
            text={
              articles.length
                ? "Essayez un autre nom ou effacez la recherche."
                : "Créez un produit fini dans Stocks pour l’afficher ici."
            }
          />
        )}
        {rows.length > limit && (
          <button
            type="button"
            className="pg-button pg-button-secondary mt-3"
            onClick={() => setLimit(limit + PAGE_SIZE)}
          >
            Afficher plus de produits
          </button>
        )}
      </section>

      <section
        ref={ticket}
        tabIndex={-1}
        className="pg-card pg-card-pad pg-sale-draft"
        aria-labelledby={`${id}-draft`}
      >
        <div className="pg-sale-draft-head">
          <span className="pg-emblem">
            <Icon name="receipt" size={22} />
          </span>
          <div style={{ flex: 1 }}>
            <p className="pg-kicker">{demo ? "Simulation panier" : "Panier client"}</p>
            <h2 id={`${id}-draft`}>
              Ticket en cours{cart.length > 0 ? ` (${cart.length})` : ""}
            </h2>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              className="pg-btn pg-btn-sec pg-btn-xs"
              disabled={busy}
              onClick={viderPanier}
            >
              Vider
            </button>
          )}
        </div>

        {!sites.length ? (
          <p className="pg-muted">Aucun site de vente configuré.</p>
        ) : cart.length === 0 ? (
          <EmptyState
            title="Panier vide"
            text="Touchez un ou plusieurs produits : chaque clic ajoute au même ticket client sans effacer le précédent."
            icon="receipt"
          />
        ) : (
          <form onSubmit={onSubmit} onReset={viderPanier} className="pg-sale-draft-form">
            <input type="hidden" name="siteId" value={site?.id ?? ""} />
            <input type="hidden" name="lignesJson" value={serializedLines} />
            <input type="hidden" name="modePaiement" value={modePaiement} />
            {/* Compatibilité premier article */}
            <input type="hidden" name="articleId" value={cart[0].articleId} />

            <ul className="pg-cart-list" aria-label="Articles du panier">
              {totals.lignes.map((line) => {
                const draftVal = qtyDrafts[line.articleId] ?? (Number.isFinite(line.qte) ? String(line.qte) : "");
                return (
                  <li key={line.articleId} className="pg-cart-item">
                    <div className="pg-cart-item-top">
                      <div>
                        <strong>{line.label}</strong>
                        <small className="pg-cart-unit">
                          {line.unitTTC !== null
                            ? `${dinars(line.unitTTC)} TTC${line.unit ? ` / ${line.unit}` : ""}`
                            : "Tarif à vérifier"}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="pg-icon-button pg-cart-remove"
                        disabled={busy}
                        aria-label={`Retirer ${line.label} du panier`}
                        onClick={() => retirerLigne(line.articleId)}
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </div>
                    <div className="pg-cart-item-controls">
                      <div className="pg-stepper">
                        <button
                          type="button"
                          disabled={busy}
                          className="pg-icon-button"
                          aria-label={`Diminuer ${line.label}`}
                          onClick={() => ajusterLigne(line.articleId, -1)}
                        >
                          <Icon name="minus" size={16} />
                        </button>
                        <input
                          type="number"
                          min="0.0001"
                          max={MAX_CART_QTE}
                          step="any"
                          inputMode="decimal"
                          aria-label={`Quantité ${line.label}`}
                          className="pg-input"
                          value={draftVal}
                          onChange={(e) => modifierQte(line.articleId, e.target.value)}
                          required
                          readOnly={busy}
                        />
                        <button
                          type="button"
                          disabled={busy || (line.qteValide && line.qte >= MAX_CART_QTE)}
                          className="pg-icon-button"
                          aria-label={`Augmenter ${line.label}`}
                          onClick={() => ajusterLigne(line.articleId, 1)}
                        >
                          <Icon name="plus" size={16} />
                        </button>
                      </div>
                      <strong className="pg-cart-line-total pg-num">
                        {line.totalTTC !== null ? dinars(line.totalTTC) : "—"}
                      </strong>
                    </div>
                  </li>
                );
              })}
            </ul>

            {stockAlerts.map((al) => (
              <p key={al.articleId} className="pg-quantity-warning" role="status">
                <Icon name="alert" size={16} />{" "}
                <span>
                  <strong>{al.label}</strong> :{" "}
                  {al.manquant > 0
                    ? `${quantite(al.disponible, al.unit)} utilisable(s) pour ${quantite(al.demande, al.unit)} demandé(s)`
                    : `${quantite(al.disponible, al.unit)} utilisable(s)`}
                  {al.perimeExclu > 0 && ` (${quantite(al.perimeExclu, al.unit)} exclu(s) : DLC dépassée)`}.
                </span>
              </p>
            ))}

            <fieldset className="pg-pay-modes" disabled={busy}>
              <legend className="pg-label">Règlement encaissé au comptoir</legend>
              <div className="pg-pay-grid">
                {PAYMENT_MODES_SAISIE.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="pg-pay-chip"
                    data-active={modePaiement === mode || undefined}
                    aria-pressed={modePaiement === mode}
                    onClick={() => setModePaiement(mode)}
                  >
                    {PAYMENT_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="pg-sale-totals">
              <div>
                <span>
                  Total TTC{" "}
                  <small>
                    {site?.label} · {cart.length} {cart.length > 1 ? "produits" : "produit"}
                  </small>
                </span>
                {totals.totalHT !== null && totals.totalTVA !== null && (
                  <small className="pg-num">
                    HT {dinars(totals.totalHT)} · TVA {dinars(totals.totalTVA)}
                  </small>
                )}
              </div>
              <strong className="pg-num">
                {totals.totalTTC !== null ? dinars(totals.totalTTC) : "—"}
              </strong>
            </div>

            {totals.prixIncomplet && (
              <p className="pg-sale-note" role="alert">
                Un produit du ticket n&apos;a pas de prix de vente positif : retirez-le ou corrigez sa fiche avant d&apos;encaisser.
              </p>
            )}

            <button className="pg-button pg-sale-submit" type="submit" disabled={!canSell}>
              {busy ? "Enregistrement…" : demo ? "Simuler la vente" : "Encaisser"}
              <Icon name="arrow" size={17} />
            </button>
            <p className="pg-sale-note">
              {demo
                ? "Démonstration locale — aucun paiement réel."
                : "Enregistre un règlement déjà encaissé (suivi tiroir, sans terminal en ligne). Lots bloqués et périmés exclus."}
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
