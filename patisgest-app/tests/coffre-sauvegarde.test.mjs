import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const script=fileURLToPath(new URL('../scripts/coffre-sauvegarde.mjs',import.meta.url));
const password='mot-de-passe-fictif-avec-plus-de-32-octets';
function run(mode,source,destination,pass=password) {
 return spawnSync(process.execPath,[script,mode,source,destination],{env:{...process.env,PATSYGEST_BACKUP_PASSPHRASE:pass},encoding:'utf8'});
}
test('coffre authentifié : roundtrip, mot de passe, altération, pas de sortie partielle ni écrasement',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'patsygest-coffre-test-'));
 try {
  const data=randomBytes(200_000), src=join(dir,'src'), enc=join(dir,'enc'), out=join(dir,'out');
  await writeFile(src,data); assert.equal(run('chiffrer',src,enc).status,0);
  assert.equal((await stat(enc)).mode & 0o777,0o600);
  assert.equal(run('dechiffrer',enc,out).status,0); assert.deepEqual(await readFile(out),data);
  assert.notEqual(run('chiffrer',src,enc).status,0); assert.notEqual(run('dechiffrer',enc,out).status,0);
  assert.deepEqual(await readFile(out),data);
  const wrong=join(dir,'wrong'); assert.notEqual(run('dechiffrer',enc,wrong,'autre-phrase-secrete-fictive-plus-de-32-octets').status,0);
  const bytes=await readFile(enc); bytes[bytes.length-20]^=1; const corrupt=join(dir,'corrupt'); await writeFile(corrupt,bytes);
  assert.notEqual(run('dechiffrer',corrupt,wrong).status,0);
  assert.notEqual(run('chiffrer',src,join(dir,'short'),'court').status,0);
  assert.deepEqual((await readdir(dir)).sort(),['corrupt','enc','out','src']);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('coffre authentifié : fichier vide et format tronqué',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'patsygest-coffre-test-'));
 try {
  const src=join(dir,'src'),enc=join(dir,'enc'),out=join(dir,'out'); await writeFile(src,'');
  assert.equal(run('chiffrer',src,enc).status,0); assert.equal(run('dechiffrer',enc,out).status,0);
  assert.equal((await readFile(out)).length,0); await writeFile(enc,Buffer.from('PATSYGEST-GCM01\n'));
  assert.notEqual(run('dechiffrer',enc,join(dir,'bad')).status,0);
  assert.deepEqual((await readdir(dir)).sort(),['enc','out','src']);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
