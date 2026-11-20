-- BROUILLON : aucun accès métier n'est accordé tant que l'isolation par site
-- des tables, vues et RPC n'est pas achevée. Aucun changement sur le pilote.
begin;
create table public.equipe_codes (
 client_id uuid primary key references public.clients(id) on delete cascade,
 code uuid not null unique default gen_random_uuid(), cree_le timestamptz not null default now()
);
create table public.equipe_demandes (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
 auth_user_id uuid not null, email text not null, nom text not null,
 role_demande text not null check(role_demande in ('labo','vendeur')),
 statut text not null default 'en_attente' check(statut in ('en_attente','refusee','acceptee')),
 cree_le timestamptz not null default now(), unique(client_id,auth_user_id)
);
create table public.equipe_invitations (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
 email text not null, nom text not null, role text not null check(role in ('labo','vendeur')), sites uuid[] not null,
 expire_le timestamptz not null default (now()+interval '7 days'), annulee boolean not null default false,
 utilisee boolean not null default false, cree_le timestamptz not null default now()
);
create unique index equipe_invitation_active on public.equipe_invitations(client_id,lower(email)) where not annulee and not utilisee;
create table public.equipe_sites (
 utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
 site_id uuid not null references public.sites(id) on delete cascade, primary key(utilisateur_id,site_id)
);
alter table public.equipe_codes enable row level security;
alter table public.equipe_demandes enable row level security;
alter table public.equipe_invitations enable row level security;
alter table public.equipe_sites enable row level security;
revoke all on public.equipe_codes,public.equipe_demandes,public.equipe_invitations,public.equipe_sites from public,anon,authenticated;

create function public.patisgest_equipe_proprietaire() returns uuid language plpgsql stable security definer set search_path='' as $$
declare c uuid;
begin
 select client_id into c from public.utilisateurs where auth_user_id=auth.uid() and role='proprietaire';
 if c is null then raise exception 'Reserve au proprietaire.' using errcode='42501'; end if;
 return c;
end $$;
revoke all on function public.patisgest_equipe_proprietaire() from public,anon,authenticated;

-- Identité vérifiée côté Auth, jamais prise des métadonnées ou des entrées utilisateur.
create function public.patisgest_equipe_email_verifie() returns text language plpgsql stable security definer set search_path='' as $$
declare e text;
begin
 select lower(trim(u.email)) into e from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null;
 if e is null or e='' then raise exception 'Adresse e-mail verifiee requise.' using errcode='42501'; end if;
 return e;
end $$;
revoke all on function public.patisgest_equipe_email_verifie() from public,anon,authenticated;

create function public.patisgest_equipe_verifier_sites(p_client uuid,p_sites uuid[],p_role text) returns void language plpgsql stable security definer set search_path='' as $$
declare n integer;
begin
 if p_role is null or p_role not in ('labo','vendeur') or p_sites is null or cardinality(p_sites)<1 or cardinality(p_sites)>100 or array_position(p_sites,null) is not null then raise exception 'Role ou sites invalides.'; end if;
 select count(*) into n from public.sites s where s.client_id=p_client and s.id=any(p_sites) and (p_role<>'vendeur' or s.type='boutique');
 if n<>cardinality(p_sites) then raise exception 'Sites invalides, repetes ou non autorises.'; end if;
end $$;
revoke all on function public.patisgest_equipe_verifier_sites(uuid,uuid[],text) from public,anon,authenticated;

create function public.equipe_code(p_renouveler boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire(); v uuid;
begin
 if p_renouveler is null then raise exception 'Parametre invalide.'; end if;
 insert into public.equipe_codes(client_id) values(c) on conflict(client_id) do nothing;
 if p_renouveler then update public.equipe_codes set code=gen_random_uuid(),cree_le=now() where client_id=c; end if;
 select code into v from public.equipe_codes where client_id=c; return v;
end $$;
revoke all on function public.equipe_code(boolean) from public,anon;
grant execute on function public.equipe_code(boolean) to authenticated;

create function public.equipe_demander(p_code uuid,p_nom text,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare e text := public.patisgest_equipe_email_verifie(); c uuid; v_nom text := trim(coalesce(p_nom,''));
begin
 if length(v_nom)<1 or length(v_nom)>100 or p_role is null or p_role not in ('labo','vendeur') then raise exception 'Demande invalide.'; end if;
 select client_id into c from public.equipe_codes where code=p_code;
 if c is null then raise exception 'Code invalide.'; end if;
 if exists(select 1 from public.utilisateurs where auth_user_id=auth.uid()) then raise exception 'Compte deja rattache.'; end if;
 insert into public.equipe_demandes(client_id,auth_user_id,email,nom,role_demande) values(c,auth.uid(),e,v_nom,p_role)
 on conflict(client_id,auth_user_id) do update set email=excluded.email,nom=excluded.nom,role_demande=excluded.role_demande,statut='en_attente',cree_le=now()
 where public.equipe_demandes.statut='refusee';
end $$;
revoke all on function public.equipe_demander(uuid,text,text) from public,anon;
grant execute on function public.equipe_demander(uuid,text,text) to authenticated;

create function public.equipe_lister_demandes() returns table(id uuid,email text,nom text,role_demande text,cree_le timestamptz) language plpgsql stable security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire();
begin
 return query select d.id,d.email,d.nom,d.role_demande,d.cree_le from public.equipe_demandes d where d.client_id=c and d.statut='en_attente' order by d.cree_le,d.id;
end $$;
revoke all on function public.equipe_lister_demandes() from public,anon;
grant execute on function public.equipe_lister_demandes() to authenticated;

create function public.equipe_refuser_demande(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire();
begin
 update public.equipe_demandes set statut='refusee' where id=p_id and client_id=c and statut='en_attente';
 if not found then raise exception 'Demande introuvable.'; end if;
end $$;
revoke all on function public.equipe_refuser_demande(uuid) from public,anon;
grant execute on function public.equipe_refuser_demande(uuid) to authenticated;

create function public.equipe_inviter(p_email text,p_nom text,p_role text,p_sites uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire(); v uuid; e text := lower(trim(coalesce(p_email,''))); n text := trim(coalesce(p_nom,''));
begin
 if length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(n)<1 or length(n)>100 then raise exception 'Invitation invalide.'; end if;
 perform public.patisgest_equipe_verifier_sites(c,p_sites,p_role);
 -- Ne pas révéler si cette adresse appartient déjà à un autre établissement.
 update public.equipe_invitations set annulee=true where client_id=c and lower(email)=e and not annulee and not utilisee;
 insert into public.equipe_invitations(client_id,email,nom,role,sites) values(c,e,n,p_role,p_sites) returning id into v;
 return v;
end $$;
revoke all on function public.equipe_inviter(text,text,text,uuid[]) from public,anon;
grant execute on function public.equipe_inviter(text,text,text,uuid[]) to authenticated;

create function public.equipe_mes_invitations() returns table(id uuid,etablissement text,role text,expire_le timestamptz) language plpgsql stable security definer set search_path='' as $$
declare e text := public.patisgest_equipe_email_verifie();
begin
 return query select i.id,c.nom,i.role,i.expire_le from public.equipe_invitations i join public.clients c on c.id=i.client_id
 where i.email=e and not i.annulee and not i.utilisee and i.expire_le>now() order by i.cree_le desc;
end $$;
revoke all on function public.equipe_mes_invitations() from public,anon;
grant execute on function public.equipe_mes_invitations() to authenticated;
-- Pas de fonction d'approbation/activation à ce stade : échouer fermé.
commit;
