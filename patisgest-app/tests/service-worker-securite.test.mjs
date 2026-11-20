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
  fetch:()=>{throw new Error('appel réseau inattendu');},
 };
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 let action;
 handlers.activate({waitUntil:p=>{action=p;}}); await action;
 assert.deepEqual(deleted,['patisgest-shell-v1','patisgest-assets-v1']);
 for (const request of [
  {method:'GET',mode:'navigate',url:'https://app.test/caisse'},
  {method:'GET',mode:'navigate',url:'https://app.test/parametres'},
  {method:'GET',mode:'cors',url:'https://app.test/caisse?_rsc=abc'},
  {method:'GET',mode:'cors',url:'https://app.test/api/sauvegarde'},
  {method:'POST',mode:'cors',url:'https://app.test/caisse'},
 ]) {
  let handled=false;
  handlers.fetch({request,respondWith:()=>{handled=true;}});
  assert.equal(handled,false,request.url);
 }
});
