"use client";

import Image from "next/image";
import { useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
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
import { defaultPastryVisual, PRODUCT_PHOTOS_KEY_PREFIX, sanitizeProductPhotosSnapshot } from "@/lib/pastry-visuals";
import { sanitizePhotoSource } from "@/lib/recipe-photo";
import { correspond, dinars, quantite, siteCaisse, type CatalogProduct, type SiteStock, type WorkspaceSite } from "@/lib/workspace-data";
import { EmptyState } from "./workspace-ui";
import { Icon } from "./workspace-icons";
import { useLocale } from "./locale-provider";
import NetworkStatusPill from "./network-status-pill";
import SaleCreditFields from "./sale-credit-fields";

const PAGE_SIZE = 24;

/**
 * Caisse de comptoir, version courte :
 *  1. on touche les produits ;
 *  2. le ticket se remplit à droite ;
 *  3. on encaisse, le ticket s'imprime.
 * Aucun texte technique à l'écran : ni TVA, ni lot, ni site de production.
 */
export default function SaleComposer({
  articles,
  sites,
  stock,
  expiredStock = null,
  onSubmit,
  busy = false,
  demo = false,
  scopeKey = "demo",
  status,
}: {
  articles: CatalogProduct[];
  sites: WorkspaceSite[];
  stock: SiteStock | null;
  expiredStock?: SiteStock | null;
  busy?: boolean;
  demo?: boolean;
  scopeKey?: string;
  status?: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const id = useId();
  const { locale, t } = useLocale();
  const photosSnapshot = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("patisgest-product-photos", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("patisgest-product-photos", cb);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(`${PRODUCT_PHOTOS_KEY_PREFIX}${scopeKey}`) ?? "{}";
      } catch {
        return "{}";
      }
    },
    () => "{}",
  );
  const customPhotoMap = sanitizeProductPhotosSnapshot(photosSnapshot);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [modePaiement, setModePaiement] = useState<PaymentMode>("especes");
  const [isCredit, setIsCredit] = useState(false);
  const [creditNom, setCreditNom] = useState("");
  const [creditTelephone, setCreditTelephone] = useState("");
  const [creditType, setCreditType] = useState<"particulier" | "cafe_entreprise">("particulier");
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
  const canSell = Boolean(site && totals.valide) && !busy && (!isCredit || creditNom.trim().length > 0);

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
    const unitPrice = prixUnitaire(product);
    if (unitPrice === null || unitPrice <= 0) {
      setCartError(`« ${product.label} » : prix à valider par le patron.`);
      return;
    }
    try {
      setCartError(null);
      setCart((prev) => {
        const next = addToCart(prev, product, 1);
        const updated = next.find((x) => x.articleId === product.id);
        if (updated) setQtyDrafts((d) => ({ ...d, [product.id]: String(updated.qte) }));
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
    setIsCredit(false);
    setCreditNom("");
    setCreditTelephone("");
  }

  return (
    <div className="pg-pos">
      {/* 1 — les produits */}
      <section className="pg-card pg-card-pad pg-catalog" aria-labelledby={`${id}-catalog`}>
        <div className="pg-card-head">
          <h2 id={`${id}-catalog`}>{t.posProducts}</h2>
          {status}
        </div>
        <div className="pg-pos-toolbar">
          <div className="pg-search">
            <Icon name="search" size={18} />
            <input
              type="search"
              className="pg-input"
              placeholder={locale === "ar" ? t.posSearch : "Chercher un produit…"}
              aria-label={locale === "ar" ? t.posSearch : "Chercher un produit"}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(PAGE_SIZE);
              }}
            />
          </div>
          {sites.length > 1 && (
            <label className="pg-field pg-pos-site">
              <span>{t.posSite}</span>
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
          )}
        </div>

        {cartError && (
          <p role="alert" className="pg-quantity-warning">
            <Icon name="alert" size={16} /> {cartError}
          </p>
        )}

        {rows.length ? (
          <div className="pg-product-grid" role="group" aria-label={t.posProducts}>
            {rows.slice(0, limit).map((a, index) => {
              const dispo = currentStock(a);
              const perime = currentExpired(a);
              const price = prixUnitaire(a);
              const unpriced = price === null || price <= 0;
              const inCart = qtyInCart.get(a.id) ?? 0;
              const rupture = dispo !== null && dispo <= 0;
              return (
                <button
                  type="button"
                  key={a.id}
                  className="pg-product"
                  aria-pressed={inCart > 0}
                  disabled={busy || unpriced}
                  onClick={() => ajouterProduit(a)}
                >
                  <Image
                    className="pg-product-photo"
                    src={customPhotoMap[a.id] ?? sanitizePhotoSource(a.photo) ?? defaultPastryVisual(a.label)}
                    alt=""
                    width={480}
                    height={336}
                    loading={index < 4 ? "eager" : "lazy"}
                    unoptimized
                  />
                  <span className="pg-product-body">
                    <span className="pg-product-copy">
                      <strong>{a.label}</strong>
                      <small className="pg-product-price">
                        {unpriced ? t.posNoPrice : dinars(price)}
                      </small>
                      {rupture && <small className="pg-product-out">{t.posOutOfStock}</small>}
                      {perime > 0 && <small className="pg-product-out">{t.posExpired}</small>}
                      {(noms.get(a.label) ?? 0) > 1 && a.code && <small>{a.code}</small>}
                    </span>
                    <span className="pg-product-select" data-count={inCart > 0 || undefined}>
                      {inCart > 0 ? <strong className="pg-product-qty">{quantite(inCart)}</strong> : <Icon name="plus" size={18} />}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="cake"
            title={articles.length ? "Aucun produit trouvé" : "Aucun produit à vendre"}
            text={articles.length ? "Essayez un autre nom." : "Créez un produit fini dans Mes stocks."}
          />
        )}
        {rows.length > limit && (
          <button type="button" className="pg-button pg-button-secondary mt-3" onClick={() => setLimit(limit + PAGE_SIZE)}>
            Afficher plus de produits
          </button>
        )}
      </section>

      {/* 2 — le ticket en cours */}
      <section ref={ticket} tabIndex={-1} className="pg-card pg-card-pad pg-sale-draft" aria-labelledby={`${id}-draft`}>
        <div className="pg-sale-draft-head">
          <span className="pg-emblem">
            <Icon name="receipt" size={22} />
          </span>
          <div style={{ flex: 1 }}>
            <h2 id={`${id}-draft`}>{t.posCartTitle}</h2>
          </div>
          <NetworkStatusPill inline />
        </div>

        {!sites.length ? (
          <p className="pg-muted">Aucun site de vente configuré.</p>
        ) : cart.length === 0 ? (
          <EmptyState title={t.posEmpty} text="Touchez un produit pour commencer." icon="receipt" />
        ) : (
          <form onSubmit={onSubmit} onReset={viderPanier} className="pg-sale-draft-form">
            <input type="hidden" name="siteId" value={site?.id ?? ""} />
            <input type="hidden" name="lignesJson" value={serializedLines} />
            <input type="hidden" name="modePaiement" value={isCredit ? "cheque_virement" : modePaiement} />
            <input type="hidden" name="articleId" value={cart[0].articleId} />

            <ul className="pg-cart-list" aria-label="Produits du ticket">
              {totals.lignes.map((line) => {
                const draftVal = qtyDrafts[line.articleId] ?? (Number.isFinite(line.qte) ? String(line.qte) : "");
                return (
                  <li key={line.articleId} className="pg-cart-item">
                    <div className="pg-cart-item-top">
                      <div>
                        <strong>{line.label}</strong>
                        <small className="pg-cart-unit">
                          {line.unitTTC !== null ? dinars(line.unitTTC) : t.posNoPrice}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="pg-icon-button pg-cart-remove"
                        disabled={busy}
                        aria-label={`Retirer ${line.label}`}
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
                <Icon name="alert" size={16} /> {al.label} · {quantite(al.disponible, al.unit)}
              </p>
            ))}

            <fieldset className="pg-pay-modes" disabled={busy}>
              <legend className="pg-label">{t.posPayment}</legend>
              <div className="pg-pay-grid">
                {PAYMENT_MODES_SAISIE.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="pg-pay-chip"
                    data-active={(!isCredit && modePaiement === mode) || undefined}
                    aria-pressed={!isCredit && modePaiement === mode}
                    onClick={() => {
                      setIsCredit(false);
                      setModePaiement(mode);
                    }}
                  >
                    {PAYMENT_MODE_LABELS[mode]}
                  </button>
                ))}
                <button
                  type="button"
                  className="pg-pay-chip"
                  data-active={isCredit || undefined}
                  aria-pressed={isCredit}
                  onClick={() => setIsCredit((v) => !v)}
                >
                  {t.posCreditToggle}
                </button>
              </div>
              {isCredit && (
                <SaleCreditFields
                  creditNom={creditNom}
                  creditTelephone={creditTelephone}
                  creditType={creditType}
                  onChangeNom={setCreditNom}
                  onChangeTelephone={setCreditTelephone}
                  onChangeType={setCreditType}
                />
              )}
            </fieldset>

            <div className="pg-sale-totals">
              <span>{t.posTotal}</span>
              <strong className="pg-num">{totals.totalTTC !== null ? dinars(totals.totalTTC) : "—"}</strong>
            </div>

            {totals.prixIncomplet && (
              <p className="pg-sale-note" role="alert">
                Un produit n’a pas de prix : retirez-le du ticket.
              </p>
            )}

            <button className="pg-button pg-sale-submit" type="submit" disabled={!canSell}>
              {busy ? "…" : demo ? t.posSimPay : "Encaisser"}
              <Icon name="arrow" size={18} />
            </button>
            <button type="button" className="pg-text-link pg-sale-clear" onClick={viderPanier} disabled={busy}>
              {t.posClear}
            </button>
            <p className="pg-sale-note">
              {demo ? "Démonstration : aucun paiement réel." : "Le ticket s’imprime dès l’encaissement."}
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
