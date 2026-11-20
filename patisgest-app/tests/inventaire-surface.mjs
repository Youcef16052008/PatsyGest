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
export async function surface() {
 const files=(await list('src')).filter(f=>/\.(tsx?|jsx?)$/.test(f)).sort();
 const routes=files.filter(f=>/^src\/app\/(?:.*\/)?(?:page|route)\.(?:tsx?|jsx?)$/.test(f));
 const actions={};
 for(const file of files) {
  const source=await readFile(path.join(root,file),'utf8');
  if(!/^\s*['"]use server['"];?/m.test(source)) continue;
  actions[file]=[...source.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map(m=>m[1]).sort();
 }
 return {routes,actions};
}
if(process.argv.includes('--update')) {
 await writeFile(path.join(root,'tests/inventaire-surface.json'),JSON.stringify(await surface(),null,2)+'\n');
}
