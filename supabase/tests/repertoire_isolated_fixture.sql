-- Only for scripts/test-repertoire-isolated.sh in its fresh temporary cluster.
create role anon; create role authenticated;
create table public.program_catalog(id uuid primary key default gen_random_uuid(),name text not null,is_active boolean default true,sort_order integer default 0);
create unique index program_catalog_name_ci_idx on public.program_catalog(lower(btrim(name)));
create function public.can_read_app_v3() returns boolean language sql as $$ select coalesce(current_setting('test.access',true),'') in ('admin','member','shared') $$;
create function public.require_admin_v3() returns void language plpgsql as $$ begin if current_setting('test.access',true) is distinct from 'admin' then raise exception 'admin only' using errcode='42501'; end if; end $$;
create table public.songs(id uuid primary key default gen_random_uuid(),name text not null,category_id uuid,is_active boolean default true);
create unique index songs_name_ci_idx on public.songs(lower(btrim(name)));
create table public.seasons(id uuid primary key default gen_random_uuid(),kind text);
create table public.events(id uuid primary key default gen_random_uuid(),season_id uuid references public.seasons(id));
create table public.song_series_items(event_id uuid references public.events(id),song_id uuid references public.songs(id));
create function public.get_app_database_v3() returns jsonb language sql as $$ select jsonb_build_object('songs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',is_active)) from public.songs),'[]')) $$;
