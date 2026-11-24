import "server-only";
import Link from "next/link";
import { canWrite, type SessionContext } from "@/lib/auth";
import { articleAffiche, lireArticles, lireHistoriqueCaisse, lireLots, lireSites, produitCaisse, type ArticleRow, type WorkspaceDB } from "@/lib/workspace-read";
import { jourLocal, stockParSite, stockPerimeParSite, type StockLot, type WorkspaceSite } from "@/lib/workspace-data";
import type { Etablissement } from "@/lib/etablissement";
import SaleForm from "./sale-form";
import type { CatalogueHorsLigne } from "@/lib/catalogue-cache";
import SaleHistory from "./sale-history";
import ZImportForm from "./z-import-form";
import AvoirForm from "./avoir-form";
import { Icon } from "./workspace-icons";
import { Disclosure, Notice, PageIntro } from "./workspace-ui";

export async function lireIdentiteCaisse(db: WorkspaceDB, ctx: SessionContext): Promise<Etablissement> {
  const { data } = await db.from("clients").select("nom, adresse, telephone, nif, nis, rc").eq("id", ctx.clientId).maybeSingle();
  return { nom: data?.nom ?? ctx.clientNom, adresse: data?.adresse ?? null, telephone: data?.telephone ?? null,
    nif: data?.nif ?? null, nis: data?.nis ?? null, rc: data?.rc ?? null };
}

export function CashPanel({ articles, sites, lots, identite, queueIdentity, clientId }: {
  articles: ArticleRow[] | null; sites: WorkspaceSite[] | null; lots: StockLot[] | null; identite: Etablissement; queueIdentity: { clientId: string; authUserId: string }; clientId: string;
}) {
  if (articles === null || sites === null) return <Notice kind="error">Impossible de charger les produits ou les sites. Rechargez la page avant d’encaisser.</Notice>;
  const today = jourLocal();
  // NF-02/D5 : on réserve le catalogue pour l'ouverture hors-ligne, étiqueté
  // par compte. Sans cet appel, /hors-ligne n'aurait jamais rien à lire — c'est
  // exactement ce qui manquait avant (cache présent, jamais alimenté).
  const produits = articles.filter(a => a.niveau === "produit").map(produitCaisse);
  return <SaleForm key={`${queueIdentity.clientId}:${queueIdentity.authUserId}`} queueIdentity={queueIdentity} articles={produits} sites={sites}
    stock={lots ? stockParSite(lots, today) : null} expiredStock={lots ? stockPerimeParSite(lots, today) : null} etablissement={identite}
    catalogueHorsLigne={{ clientId, produits, sites, identite: identite as unknown as CatalogueHorsLigne["identite"] }}/>;
}

export default async function CashWorkspace({ ctx, db }: { ctx: SessionContext; db: WorkspaceDB }) {
  const { clientId } = ctx;
  const [articles, sites, lots, identite] = await Promise.all([
    lireArticles(db, clientId, true), lireSites(db, clientId), lireLots(db, clientId, ctx.role), lireIdentiteCaisse(db, ctx),
  ]);
  const sales = await lireHistoriqueCaisse(db, clientId, (articles ?? []).map(articleAffiche), sites ?? []);
  return <>
    <PageIntro title="Caisse" label="Boutique" description="Composez le panier client (un ou plusieurs produits), choisissez le mode de règlement et enregistrez le ticket."
      actions={<Link href="/stocks" className="pg-button pg-button-secondary"><Icon name="box" size={18}/> Voir les stocks</Link>}/>
    <div className="pg-stack">
      <CashPanel queueIdentity={{clientId:ctx.clientId,authUserId:ctx.authUserId}} articles={articles} sites={sites} lots={lots} identite={identite} clientId={ctx.clientId}/>
      <SaleHistory sales={sales}/>
      {canWrite(ctx.role) && <Disclosure title="Retour ou avoir" description="Reprendre un produit vendu : remise en stock ou destruction tracée." icon="receipt"><AvoirForm ventes={sales ?? []}/></Disclosure>}
      {canWrite(ctx.role) && <Disclosure title="Importer un Z de caisse" description="Ajouter les ventes d’une caisse externe." icon="list"><ZImportForm sites={sites ?? []}/></Disclosure>}
    </div>
  </>;
}
