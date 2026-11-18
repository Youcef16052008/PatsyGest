import "server-only";
import { canReadCosts, canWrite, type SessionContext } from "@/lib/auth";
import { articleAffiche, lireArticles, lireLots, lireSites, type WorkspaceDB } from "@/lib/workspace-read";
import { jourUTC } from "@/lib/workspace-data";
import { allergenesDerives, verifierDeclaration } from "@/lib/allergenes";
import type { LabelIngredient, LabelLot } from "@/lib/label-model";
import StockWriteForms from "./stock-write-forms";
import StockList from "./stock-list";
import LabelMaker from "./label-maker";
import { Disclosure, Notice, PageIntro } from "./workspace-ui";

export default async function StockWorkspace({ ctx, db, filtre }: { ctx: SessionContext; db: WorkspaceDB; filtre?: string }) {
  const { clientId } = ctx;
  const peutEcrire = canWrite(ctx.role);
  const [articles, lots, sites, fournisseurs, recettes] = await Promise.all([
    lireArticles(db, clientId), lireLots(db, clientId), lireSites(db, clientId),
    peutEcrire ? db.from("fournisseurs").select("id, nom").eq("client_id", clientId).order("nom") : null,
    peutEcrire && canReadCosts(ctx.role)
      ? db.from("recette_familles").select("id, produit_id, recette_versions!inner(id, ingredients)").eq("client_id", clientId).eq("recette_versions.active", true)
      : null,
  ]);
  const produits = (articles ?? []).filter(a => a.niveau === "produit").map(a => ({ id: a.id, code: a.code, nom: a.nom, allergenes: a.allergenes ?? [], traces: a.traces ?? [] }));
  const versions = (recettes?.data ?? []).flatMap(row => {
    const v = Array.isArray(row.recette_versions) ? row.recette_versions[0] : row.recette_versions;
    return v?.id && row.produit_id ? [{ id: String(v.id), familleId: String(row.id), produitId: String(row.produit_id), ingredients: (v.ingredients ?? []) as LabelIngredient[] }] : [];
  });
  const ingredients = Object.fromEntries(versions.map(v => [v.produitId, v.ingredients]));
  const catalogueAllergenes = (articles ?? []).flatMap(a => [a.code, a.id].map(code => ({ code, nom: a.nom, allergenes: a.allergenes ?? [] })));
  const produitParId = new Map(produits.map(p => [p.id, p]));
  const allergenes = Object.fromEntries(versions.flatMap(v => {
    const produit = produitParId.get(v.produitId);
    if (!produit) return [];
    const { derives, articlesLus } = allergenesDerives(v.id, versions as unknown as Parameters<typeof allergenesDerives>[1], catalogueAllergenes);
    return [[produit.id, verifierDeclaration(produit.allergenes, derives, articlesLus)]];
  }));
  const lotsParProduit: Record<string, LabelLot[]> = {};
  for (const l of (lots ?? []).slice().sort((a,b) => (a.dlc ?? "9999").localeCompare(b.dlc ?? "9999"))) {
    if (produitParId.has(l.articleId)) (lotsParProduit[l.articleId] ??= []).push({ numero: l.numero, dlc: l.dlc });
  }

  return <>
    <PageIntro title="Articles & stocks" label="Inventaire" description="Retrouvez vos produits, vos ingrédients et les quantités par site."
      actions={peutEcrire && <a className="pg-button pg-button-secondary" href="#gerer-stocks">Gérer le stock</a>}/>
    <div className="pg-stack">
      <StockList key={filtre ?? "tous"} articles={articles?.map(articleAffiche) ?? null} lots={lots} sites={sites} today={jourUTC()} filtre={filtre}/>
      {peutEcrire && <div id="gerer-stocks" className="pg-stack">
        <StockWriteForms articles={(articles ?? []).map(a => ({ id: a.id, label: `${a.nom} · ${a.code}` }))}
          sites={sites ?? []} fournisseurs={(fournisseurs?.data ?? []).map(f => ({ id: f.id, label: f.nom }))}/>
        {produits.length > 0 && <Disclosure title="Étiquettes produit" description="Ingrédients, allergènes, lot et DLC." icon="print">
          {recettes?.error || !lots ? <Notice kind="warning">Les recettes ou les lots n’ont pas pu être chargés. Vérifiez la connexion avant de préparer des étiquettes.</Notice> :
            <LabelMaker produits={produits} recipes={ingredients} lots={lotsParProduit} allergenes={allergenes}/>}
        </Disclosure>}
      </div>}
    </div>
  </>;
}
