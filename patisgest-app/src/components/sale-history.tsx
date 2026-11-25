import { libelleModePaiement } from "@/lib/pos-cart";
import { dateLisible, dinars, quantite, type SaleSummary } from "@/lib/workspace-data";
import { EmptyState, Notice } from "./workspace-ui";
import { Icon } from "./workspace-icons";

export default function SaleHistory({ sales, demo = false }: { sales: SaleSummary[] | null; demo?: boolean }) {
  return (
    <section
      id="ventes-recentes"
      className="pg-card pg-card-pad scroll-mt-4"
      aria-label={demo ? "Ventes de démonstration" : "Ventes récentes"}
    >
      <div className="pg-card-head">
        <div>
          <h2>{demo ? "Tickets de démonstration" : "Tickets récents"}</h2>
          <p>Produits du panier, mode de règlement enregistré et montant TTC.</p>
        </div>
      </div>
      {sales === null ? (
        <Notice kind="error">Impossible de charger les ventes. Rechargez la page.</Notice>
      ) : !sales.length ? (
        <EmptyState title="Aucune vente enregistrée" icon="receipt" />
      ) : (
        <ul className="pg-sale-history">
          {sales.map((s) => {
            const modeLabel =
              s.source === "z-import"
                ? "Import Z"
                : libelleModePaiement(s.modePaiement);
            return (
              <li key={s.id}>
                <span className="pg-emblem">
                  <Icon name="receipt" size={18} />
                </span>
                <div>
                  <strong>
                    {s.items[0]?.name ?? (s.source === "z-import" ? "Vente importée" : "Ticket")}
                    {s.items.length > 1 && ` + ${s.items.length - 1} produit${s.items.length > 2 ? "s" : ""}`}
                  </strong>
                  <p>
                    {s.items.length === 1 && (
                      <>Quantité : {quantite(s.items[0].quantity, s.items[0].unit)} · </>
                    )}
                    {dateLisible(s.date)}
                    {s.site ? ` · ${s.site}` : ""}
                    {modeLabel ? ` · ${modeLabel}` : ""}
                    {s.numero ? ` · ${s.numero}` : ""}
                  </p>
                  {s.items.length > 1 && (
                    <details>
                      <summary>Détail du panier ({s.items.length} produits)</summary>
                      <ul>
                        {s.items.map((item, index) => (
                          <li key={index}>
                            {item.name} · {quantite(item.quantity, item.unit)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <span className="pg-history-total">
                  {dinars(s.totalTTC)}
                  <small>TTC</small>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
