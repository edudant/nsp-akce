alter table public.songs add column kind text not null default 'song' check(kind in ('song','carol'));
drop index public.songs_name_ci_idx;
create unique index songs_kind_name_ci_idx on public.songs(kind,lower(btrim(name)));
create table public.song_texts(
 song_id uuid primary key references public.songs(id) on delete cascade,
 blocks jsonb not null check(public.valid_program_text_blocks(blocks)),
 source text,
 source_pages integer[] not null default '{}',
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.song_texts enable row level security;
revoke all on public.song_texts from public,anon,authenticated;

-- Preserve the existing filtered/preview snapshot and enrich only its songs.
alter function public.get_app_database_v3() rename to get_app_database_before_repertoire;
create function public.get_app_database_v3() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.get_app_database_before_repertoire();
 return jsonb_set(result,'{songs}',coalesce((select jsonb_agg(value||jsonb_build_object('kind',s.kind,'hasText',exists(select 1 from public.song_texts t where t.song_id=s.id)) order by ordinal) from jsonb_array_elements(result->'songs') with ordinality as item(value,ordinal) join public.songs s on s.id=(value->>'id')::uuid),'[]'));
end; $$;
revoke all on function public.get_app_database_before_repertoire() from public,anon,authenticated;
revoke all on function public.get_app_database_v3() from public,anon;
grant execute on function public.get_app_database_v3() to authenticated;

create function public.save_repertoire_song(song jsonb) returns void language plpgsql security definer set search_path='' as $$
declare target uuid; requested_kind text;
begin
 perform public.require_admin_v3();
 requested_kind:=coalesce(song->>'kind','song');
 if requested_kind not in ('song','carol') then raise exception 'Neplatný typ písně.'; end if;
 target:=nullif(song->>'id','')::uuid;
 if target is null then
  insert into public.songs(name,kind,category_id,is_active) values(btrim(song->>'name'),requested_kind,nullif(song->>'categoryId','')::uuid,coalesce((song->>'active')::boolean,true));
 else
  update public.songs set name=btrim(song->>'name'),category_id=nullif(song->>'categoryId','')::uuid,is_active=(song->>'active')::boolean where id=target and kind=requested_kind;
  if not found then raise exception 'Píseň nebyla nalezena v tomto repertoáru.'; end if;
 end if;
end; $$;
create function public.get_song_text(song_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_read_app_v3() then raise exception 'Přihlaste se pro zobrazení textů.' using errcode='42501'; end if;
 return (select jsonb_build_object('blocks',t.blocks,'source',t.source,'sourcePages',t.source_pages,'updatedAt',t.updated_at) from public.song_texts t where t.song_id=get_song_text.song_id);
end; $$;
create function public.save_song_text(song_id uuid,new_blocks jsonb,expected_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare stamp timestamptz;
begin
 perform public.require_admin_v3();
 if not public.valid_program_text_blocks(new_blocks) then raise exception 'Neplatný formát textů.'; end if;
 perform 1 from public.songs s where s.id=song_id for update;
 if not found then raise exception 'Píseň nebyla nalezena.'; end if;
 select updated_at into stamp from public.song_texts t where t.song_id=save_song_text.song_id;
 if stamp is distinct from expected_updated_at then raise exception 'Text mezitím změnil jiný správce. Načtěte jej znovu.' using errcode='40001'; end if;
 insert into public.song_texts(song_id,blocks) values(song_id,new_blocks) on conflict on constraint song_texts_pkey do update set blocks=excluded.blocks,updated_at=clock_timestamp();
end; $$;
create function public.import_carol_texts(documents jsonb) returns void language plpgsql security definer set search_path='' as $$
declare d jsonb; target uuid;
begin
 perform public.require_admin_v3();
 if jsonb_typeof(documents) is distinct from 'array' then raise exception 'Neplatný import.'; end if;
 if jsonb_array_length(documents) not between 1 and 200 then raise exception 'Neplatný počet koled.'; end if;
 for d in select value from jsonb_array_elements(documents) loop
  if d->>'kind' is distinct from 'carol' or jsonb_typeof(d->'name') is distinct from 'string' or length(btrim(d->>'name')) not between 1 and 250
   or not public.valid_program_text_blocks(d->'blocks') or jsonb_typeof(d->'source') is distinct from 'string' or length(d->>'source')>255
   or jsonb_typeof(d->'sourcePages') is distinct from 'array' then raise exception 'Neplatný dokument koledy.'; end if;
  if jsonb_array_length(d->'sourcePages') not between 1 and 2000 or exists(select 1 from jsonb_array_elements_text(d->'sourcePages') page where page !~ '^[1-9][0-9]{0,5}$') then raise exception 'Neplatné strany zdroje.'; end if;
  insert into public.songs(name,kind) values(btrim(d->>'name'),'carol') on conflict (kind,lower(btrim(name))) do update set name=public.songs.name returning id into target;
  if exists(select 1 from public.song_texts t where t.song_id=target) then raise exception 'Koleda % již obsahuje text. Import nebyl uložen.',d->>'name'; end if;
  insert into public.song_texts(song_id,blocks,source,source_pages) values(target,d->'blocks',d->>'source',array(select jsonb_array_elements_text(d->'sourcePages')::integer));
 end loop;
end; $$;

-- Enforce the same repertoire rule on the server, including direct RPC writes.
create function public.validate_series_repertoire() returns trigger language plpgsql security definer set search_path='' as $$
declare event_kind text; song_kind text;
begin
 select s.kind into event_kind from public.events e join public.seasons s on s.id=e.season_id where e.id=new.event_id;
 select kind into song_kind from public.songs where id=new.song_id;
 if song_kind is distinct from (case when event_kind='carols' then 'carol' else 'song' end) then raise exception 'Pro tuto událost vyberte píseň ze správného repertoáru.'; end if;
 return new;
end; $$;
create trigger song_series_repertoire before insert or update of song_id,event_id on public.song_series_items for each row execute function public.validate_series_repertoire();
revoke all on function public.save_repertoire_song(jsonb),public.get_song_text(uuid),public.save_song_text(uuid,jsonb,timestamptz),public.import_carol_texts(jsonb),public.validate_series_repertoire() from public,anon,authenticated;
grant execute on function public.save_repertoire_song(jsonb),public.get_song_text(uuid),public.save_song_text(uuid,jsonb,timestamptz),public.import_carol_texts(jsonb) to authenticated;
notify pgrst,'reload schema';
