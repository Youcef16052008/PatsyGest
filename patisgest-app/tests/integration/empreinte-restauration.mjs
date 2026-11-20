// Empreinte des données fictives de la pile CLI : pas de données en clair.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
const { DB_URL, PATSYGEST_DISPOSABLE, RUNNER_TEMP } = process.env;
assert.equal(PATSYGEST_DISPOSABLE, 'yes');
assert.ok(RUNNER_TEMP);
const url = new URL(DB_URL);
assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname));
assert.equal(url.port, '54322');
assert.equal(url.pathname, '/postgres');
const mode = process.argv[2];
assert.ok(['capture','compare'].includes(mode));
const path = `${RUNNER_TEMP}/patsygest-fingerprint.json`;
const db = postgres(url.href, { max: 1, onnotice: () => {} });
try {
 const tables = await db`select tablename from pg_tables where schemaname='public' order by tablename`;
 assert.ok(tables.length > 20, 'Schéma métier fictif absent');
 const rows = {};
 for (const { tablename } of tables) {
  const [value] = await db`select count(*)::int n, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) hash from public.${db(tablename)} t`;
  rows[tablename] = {...value};
 }
 const statements = {
  policies: `select tablename,policyname,permissive,roles::text,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname`,
  tables: `select c.relname,c.relrowsecurity,c.relforcerowsecurity,coalesce((select array_agg(a::text order by a::text)::text from unnest(c.relacl) a),'') acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S') order by c.relname`,
  functions: `select p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosecdef,coalesce((select array_agg(a::text order by a::text)::text from unnest(p.proacl) a),'') acl,md5(pg_get_functiondef(p.oid)) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prorettype<>'event_trigger'::regtype order by p.proname,args`,
  auth: `select count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(u)::text),'' order by md5(to_jsonb(u)::text)),'')) hash from auth.users u`,
 };
 const result = { rows };
 for (const [key,query] of Object.entries(statements)) result[key] = [...(await db.unsafe(query))].map(row => ({...row}));
 if (mode === 'capture') await writeFile(path, JSON.stringify(result), { mode: 0o600, flag: 'wx' });
 else {
  const previous = JSON.parse(await readFile(path,'utf8'));
  for(const key of Object.keys(result)) {
   try { assert.deepEqual(result[key],previous[key],`Différence : ${key}`); }
   catch (error) {
    if (key === 'tables') {
     const before = new Map(previous.tables.map(x => [x.relname,x]));
     for (const after of result.tables) {
      const original = before.get(after.relname);
      if (JSON.stringify(original) !== JSON.stringify(after)) {
       console.error(`DIFF_TABLE ${after.relname} avant=${JSON.stringify(original)} apres=${JSON.stringify(after)}`);
      }
     }
    }
    throw error;
   }
  }
  console.log(`Empreintes égales : ${tables.length} tables publiques, données, policies, ACL, fonctions et auth.users.`);
 }
} finally { await db.end(); }
