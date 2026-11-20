// Comparaison de deux bases CLI fictives sur le même serveur, jamais le pilote.
import assert from 'node:assert/strict';
import postgres from 'postgres';
const {DB_URL, PATSYGEST_DISPOSABLE}=process.env;
assert.equal(PATSYGEST_DISPOSABLE,'yes');
const url=new URL(DB_URL);
assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname));
assert.equal(url.port,'54322'); assert.equal(url.pathname,'/postgres');
const target=new URL(url); target.pathname='/patsy_restore_trial';
const source=postgres(url.href,{max:1,onnotice:()=>{}});
const restored=postgres(target.href,{max:1,onnotice:()=>{}});
try {
 const tableQuery=`select tablename from pg_tables where schemaname='public' order by tablename`;
 const tables=await source.unsafe(tableQuery), restoredTables=await restored.unsafe(tableQuery);
 assert.deepEqual([...restoredTables],[...tables],'Tables publiques différentes');
 assert.ok(tables.length>20,'Le schéma métier fictif doit être présent');
 for(const {tablename} of tables) {
  // Identifier échappé côté driver ; aucune valeur de ligne n'est affichée.
  const identifier=source(tablename);
  const [a]=await source`select count(*)::int n, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) empreinte from public.${identifier} t`;
  const [b]=await restored`select count(*)::int n, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) empreinte from public.${restored(tablename)} t`;
  assert.deepEqual({...b},{...a},`Contenu différent : ${tablename}`);
 }
 const queries=[
  `select tablename,policyname,permissive,roles::text,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname`,
  `select c.relname,c.relrowsecurity,c.relforcerowsecurity,coalesce(c.relacl::text,'') acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S') order by c.relname`,
  `select p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosecdef,coalesce(p.proacl::text,'') acl,md5(pg_get_functiondef(p.oid)) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prorettype<>'event_trigger'::regtype order by p.proname,args`,
  `select count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(u)::text),'' order by md5(to_jsonb(u)::text)),'')) empreinte from auth.users u`,
 ];
 for(const query of queries) assert.deepEqual([...(await restored.unsafe(query))],[...(await source.unsafe(query))],'Métadonnées, ACL, fonctions ou Auth différentes');
 console.log(`Restauration isolée : ${tables.length} tables publiques, données, politiques, ACL et auth.users comparés.`);
 console.log('Ce test local ne prouve ni les propriétaires, ni les configurations des services, ni les objets Storage externes.');
} finally {await source.end();await restored.end();}
