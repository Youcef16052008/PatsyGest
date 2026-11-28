// Inventaire statique des points d'entrée Next. Ce n'est pas une analyse de
// sécurité : lectures indirectes, paramètres dynamiques et autorisations DB
// doivent être examinés séparément dans AUDIT-PHASE-1.md.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function list(dir) {
 const entries=await readdir(path.join(root,dir),{withFileTypes:true});
 return (await Promise.all(entries.map(e=>e.isDirectory()?list(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat();
}
/**
 * Toute exportation exécutable d'un fichier `use server` est un point d'entrée,
 * pas seulement `export async function`. Les exports de TYPES sont ignorés :
 * ils disparaissent à la compilation et ne sont pas des actions.
 */
export function nomsActions(source) {
 const noms=new Set();
 for(const motif of [
  /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
  /export\s+(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/g,
 ]) {
  for(const m of source.matchAll(motif)) noms.add(m[1]);
 }
 return [...noms].sort();
}

export async function surface() {
 const files=(await list('src')).filter(f=>/\.(tsx?|jsx?)$/.test(f)).sort();
 const routes=files.filter(f=>/^src\/app\/(?:.*\/)?(?:page|route)\.(?:tsx?|jsx?)$/.test(f));
 const actions={};
 for(const file of files) {
  const source=await readFile(path.join(root,file),'utf8');
  if(!/^\s*['"]use server['"];?/m.test(source)) continue;
  actions[file]=nomsActions(source);
 }
 return {routes,actions};
}
if(process.argv.includes('--update')) {
 await writeFile(path.join(root,'tests/inventaire-surface.json'),JSON.stringify(await surface(),null,2)+'\n');
}
