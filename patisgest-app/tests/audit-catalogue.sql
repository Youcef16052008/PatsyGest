-- Inventaire en lecture seule de la surface publique. À exécuter dans une
-- console SQL autorisée ; ne contient ni lignes métier ni identités. Comparer
-- le résultat au schéma reconstruit, en tenant compte des versions PostgreSQL
-- et du fait que les brouillons 24+ ne sont pas sur le pilote.
select c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions,
 has_table_privilege('anon',c.oid,'select') as anon_select,
 has_table_privilege('authenticated',c.oid,'select') as authenticated_select,
 has_table_privilege('authenticated',c.oid,'insert') as authenticated_insert,
 has_table_privilege('authenticated',c.oid,'update') as authenticated_update,
 has_table_privilege('authenticated',c.oid,'delete') as authenticated_delete,
 case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) end as vue
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m') order by c.relname;

select tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' order by tablename,policyname;

select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
 p.prosecdef, p.proconfig,
 has_function_privilege('anon',p.oid,'execute') as anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
 md5(pg_get_functiondef(p.oid)) as empreinte_definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f'
order by p.proname,arguments;
