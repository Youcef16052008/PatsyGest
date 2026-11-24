import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('service worker : purge les anciens HTML et ne cache aucune navigation, RSC ou API', async () => {
 const handlers = {};
 const deleted = [];
 const context = {
  URL,
  self: { location: {origin:'https://app.test'}, clients:{claim:async()=>{}}, skipWaiting:async()=>{}, addEventListener:(name,fn)=>{handlers[name]=fn;} },
  caches: { keys:async()=>['patisgest-shell-v1','patisgest-assets-v1','autre'], delete:async name=>deleted.push(name), open:async()=>{throw new Error('cache interdit');} },
  // Tout appel réseau hors coquille est une faute : on le fait échouer.
  fetch:(req)=>{ throw new Error('appel réseau inattendu : ' + (req && req.url)); },
  // `Response` n'existe pas dans un contexte vm nu : on fournit le minimum
  // dont le service worker a besoin pour sa page d'excuse.
  Response: class { constructor(body, init={}) { this.body = body; this.status = init.status ?? 200; this.headers = init.headers ?? {}; } },
 };
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 let action;
 handlers.activate({waitUntil:p=>{action=p;}}); await action;
 // `patisgest-shell-v1` contenait du HTML authentifié : il doit disparaître.
 // En revanche le cache de la coquille (sans données client) est conservé.
 assert.deepEqual(deleted,['patisgest-shell-v1','patisgest-assets-v1']);

 // NF-02/D5 — les navigations authentifiées sont désormais interceptées, mais
 // uniquement pour revenir au réseau : hors ligne, elles retombent sur la
 // coquille. Elles ne sont JAMAIS servies depuis un cache de la requête.
 for (const url of ['https://app.test/caisse','https://app.test/parametres']) {
  let reponse;
  handlers.fetch({request:{method:'GET',mode:'navigate',url},respondWith:p=>{reponse=p;}});
  assert.ok(reponse, `${url} doit être traité pour survivre hors-ligne`);
  // Le fetch échoue (réseau coupé) et le cache de la coquille est vide (open
  // lève) : on exige une réponse 503 explicite, jamais une exception.
  const r = await reponse;
  assert.equal(r.status, 503, `${url} : pas de donnée servie hors cache vide`);
 }

 // RSC, API et écritures ne sont toujours pas interceptés du tout.
 for (const request of [
  {method:'GET',mode:'cors',url:'https://app.test/caisse?_rsc=abc'},
  {method:'GET',mode:'cors',url:'https://app.test/api/sauvegarde'},
  {method:'POST',mode:'cors',url:'https://app.test/caisse'},
 ]) {
  let handled=false;
  handlers.fetch({request,respondWith:()=>{handled=true;}});
  assert.equal(handled,false,request.url);
 }
});

test('service worker : ne conserve que des assets conformes et invalide le cache v2', async () => {
 const handlers = {}, deleted = [], put = [];
 let response;
 const cache = { match:async()=>undefined, put:async(req,res)=>put.push([req.url,res]) };
 const context = {
  URL,
  self: { location:{origin:'https://shop.test'}, clients:{claim:async()=>{}}, skipWaiting:async()=>{}, addEventListener:(n,fn)=>{handlers[n]=fn;} },
  caches:{ keys:async()=>['patisgest-assets-v2-static-only','patisgest-assets-v3-validated-assets'], delete:async name=>deleted.push(name), open:async()=>cache },
  fetch:async()=>response,
 };
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 let promise;
 handlers.activate({waitUntil:p=>{promise=p;}}); await promise;
 // v2 et v3 contenaient l'ancienne stratégie (aucune coquille) : elles sont
 // purgées, seul le cache v4 survit.
 assert.deepEqual(deleted,['patisgest-assets-v2-static-only','patisgest-assets-v3-validated-assets']);
 const run=async (url,type,options={})=>{
  response={ok:options.ok??true,type:'basic',redirected:options.redirected??false,headers:{get:()=>type},clone(){return this;}};
  const before=put.length;
  handlers.fetch({request:{url,method:'GET',mode:'cors'},respondWith:p=>{promise=p;}});
  assert.equal(await promise,response);
  return put.length-before;
 };
 assert.equal(await run('https://shop.test/appearance/fraunces.woff2','text/html'),0);
 assert.equal(await run('https://shop.test/appearance/fraunces.woff2','font/woff2'),1);
 assert.equal(await run('https://shop.test/appearance/fraunces.woff2','font/woff2',{redirected:true}),0);
 assert.equal(await run('https://shop.test/appearance/fraunces.woff2','font/woff2',{ok:false}),0);
 assert.equal(await run('https://shop.test/_next/static/abc.js','application/javascript; charset=utf-8'),1);
 assert.equal(await run('https://shop.test/_next/static/abc.js','text/html; charset=utf-8'),0);
 assert.equal(await run('https://shop.test/icons/icon.png','image/png'),1);
 assert.equal(await run('https://shop.test/icons/icon.png',''),0);
});
