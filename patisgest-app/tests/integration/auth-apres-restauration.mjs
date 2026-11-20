// Vérification minimale Auth/PostgREST après restauration de données fictives.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { setTimeout as sleep } from 'node:timers/promises';
const { API_URL, ANON_KEY, PATSYGEST_DISPOSABLE } = process.env;
assert.equal(PATSYGEST_DISPOSABLE,'yes');
const url=new URL(API_URL);
assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname));
assert.equal(url.port,'54321');
assert.ok(ANON_KEY);
const client=()=>createClient(API_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const owner=client(), other=client(), anonymous=client();
for(const [user,email] of [[owner,'owner@example.test'],[other,'autre@example.test']]) {
 const login=await user.auth.signInWithPassword({email,password:'Test-only-password-12345!'});
 assert.ifError(login.error);
}
// PostgREST recharge son cache après le NOTIFY, mais pas instantanément.
let ownerRows;
for(let i=0;i<20;i++) {
 ownerRows=await owner.from('clients').select('id');
 if(!ownerRows.error) break;
 await sleep(500);
}
assert.ifError(ownerRows.error);
assert.deepEqual(ownerRows.data.map(x=>x.id).sort(),[A]);
const otherRows=await other.from('clients').select('id');
assert.ifError(otherRows.error);
assert.deepEqual(otherRows.data.map(x=>x.id).sort(),[B]);
const anonRows=await anonymous.from('clients').select('id');
assert.ok(anonRows.error,'La table clients ne doit pas être lisible par anon');
console.log('Après restauration : Auth et isolation PostgREST des deux clients fictifs vérifiées.');
