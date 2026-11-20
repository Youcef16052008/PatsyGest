// Reconstruit le socle local jusqu'à 23 et imprime des empreintes de surface.
// Les adaptations historiques sont nécessaires ; les empreintes signalent des
// différences à examiner, pas une équivalence ni une validation des données.
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
try {
 await db.exec(`create role authenticated; create role anon; create role service_role;
  create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
  alter default privileges in schema public grant all on tables to authenticated,service_role;
  alter default privileges in schema public grant execute on functions to authenticated,service_role;`);
 const files=(await readdir(new URL('../supabase/',import.meta.url))).filter(f=>/^\d\d-.*\.sql$/.test(f)&&!f.startsWith('02-')&&Number(f.slice(0,2))<=23).sort();
 for(const f of files) {
  if(f.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
  if(f.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
  await db.exec((await readFile(new URL(`../supabase/${f}`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
 }
 const q=await db.query(`select 'policies' as surface,count(*)::int as total,
  md5(string_agg(tablename||'|'||policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\\n' order by tablename,policyname)) as empreinte
  from pg_policies where schemaname='public'
  union all
  select 'fonctions',count(*)::int,md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||p.prosecdef::text,E'\\n' order by p.proname,pg_get_function_identity_arguments(p.oid)))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prorettype<>'event_trigger'::regtype`);
 console.log(JSON.stringify(q.rows,null,2));
 const bodies=await db.query(`select p.proname,md5(pg_get_functiondef(p.oid)) as empreinte from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prorettype<>'event_trigger'::regtype order by p.proname,pg_get_function_identity_arguments(p.oid)`);
 console.log(JSON.stringify(bodies.rows,null,2));
 const byTable=await db.query(`select tablename,count(*)::int as total,
  md5(string_agg(policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\\n' order by policyname)) as empreinte
  from pg_policies where schemaname='public' group by tablename order by tablename`);
 console.log(JSON.stringify(byTable.rows,null,2));
 const diff=await db.query(`select tablename,policyname,permissive,roles::text,cmd,qual,with_check from pg_policies
  where schemaname='public' and tablename in ('nettoyages','non_conformites','releve_temperatures','taches_planning') order by tablename,policyname`);
 console.log(JSON.stringify(diff.rows,null,2));
} finally {await db.close();}
