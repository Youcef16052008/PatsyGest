// Vérification HTTP du blocage Preview sur un serveur Next local jetable.
// Aucune connexion au pilote ; l'URL configurée est volontairement inutilisable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PREVIEW_SMOKE_PORT ?? 3413);
const base = `http://127.0.0.1:${port}`;
let server, logs = '';
before(async () => {
  const mode = process.env.PREVIEW_SMOKE_BUILT === '1' ? 'start' : 'dev';
  server = spawn(path.join(root,'node_modules','.bin','next'), [mode,'-p',String(port),'-H','127.0.0.1'], {
    cwd: root, env: { ...process.env, VERCEL_ENV:'preview', NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:65531', NEXT_PUBLIC_SUPABASE_ANON_KEY:'test', PATISGEST_DEMO_MODE:'false' },
    stdio: ['ignore','pipe','pipe'],
  });
  const log = chunk => { logs = (logs + chunk).slice(-3000); };
  server.stdout.on('data',log); server.stderr.on('data',log);
  for (let i=0;i<120;i++) {
    if (server.exitCode !== null) throw new Error(`Serveur arrêté : ${logs}`);
    try { await fetch(`${base}/connexion`); return; } catch { await sleep(500); }
  }
  throw new Error(`Serveur indisponible : ${logs}`);
});
after(() => { if (server && server.exitCode === null) server.kill('SIGTERM'); });

test('aperçu sans base isolée : routes métier et actions bloquées, calculateur accessible', async () => {
 for (const [method, route, status] of [['GET','/connexion',503],['GET','/',503],['GET','/api/export',503],['POST','/api/sauvegarde',503],['POST','/estimation',503],['GET','/estimation',200]]) {
  const res = await fetch(base+route,{method,redirect:'manual'});
  assert.equal(res.status,status,`${method} ${route}`);
  if (status===503) {
   assert.match(await res.text(),/base de test n'est pas isolée/);
   assert.equal(res.headers.get('cache-control'),'no-store');
  }
 }
});

test('un en-tête externe de sous-requête ne contourne pas le garde-fou', async () => {
 const res = await fetch(base+'/connexion',{headers:{'x-middleware-subrequest':'middleware:middleware:middleware:middleware:middleware'},redirect:'manual'});
 assert.equal(res.status,503);
});
