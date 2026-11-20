import type { ImpactRecipeVersion, ImpactArticle } from './ingredient-impact.ts';

/** Empêche de présenter une couverture matières incomplète comme complète. */
export function recettesPlanValides(versions: readonly ImpactRecipeVersion[], articles: readonly ImpactArticle[]): boolean {
 const versionsById=new Map(versions.map(v=>[v.id,v]));
 const articleIds=new Set(articles.map(a=>a.id));
 const articleCodes=new Set(articles.map(a=>a.code));
 function visite(v:ImpactRecipeVersion,depth:number,ancetres:Set<string>):boolean {
  if(depth>3||ancetres.has(v.familleId)||!Number.isFinite(v.rendementQte)||v.rendementQte<=0||!v.ingredients.length) return false;
  const next=new Set(ancetres); next.add(v.familleId);
  for(const i of v.ingredients) {
   const q=Number(i.q),parage=Number(i.parage??0);
   if(!Number.isFinite(q)||q<=0||!Number.isFinite(parage)||parage<0||parage>100) return false;
   const hasArticle=Boolean(i.articleId||i.code),hasSub=Boolean(i.subVersionId);
   if(hasArticle===hasSub) return false;
   if(hasArticle && (i.articleId ? !articleIds.has(i.articleId) : !articleCodes.has(i.code!))) return false;
   if(hasSub) {const child=versionsById.get(i.subVersionId!);if(!child||!visite(child,depth+1,next))return false;}
  }
  return true;
 }
 return versions.filter(v=>v.active).every(v=>visite(v,0,new Set()));
}
