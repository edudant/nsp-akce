-- Only for scripts/test-repertoire-isolated.sh in its fresh temporary cluster.
grant usage on schema public to authenticated,anon;
select set_config('test.access','admin',false);
do $$ declare id uuid; stamp timestamptz; begin
 select program_id,updated_at into id,stamp from public.program_texts limit 1;
 perform public.save_program_text(id,(public.get_program_text(id)->'blocks'),stamp);
 begin
  perform public.save_program_text(id,'[{"kind":"text","text":"overwritten"}]',stamp);
  raise exception 'stale write accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.import_program_texts(jsonb_build_array(jsonb_build_object('name','Bláhoviny','blocks','[{"kind":"text","text":"new"}]'::jsonb),jsonb_build_object('name','Kolečka','blocks','[{"kind":"text","text":"existing"}]'::jsonb)));
  raise exception 'duplicate import accepted';
 exception when raise_exception then if sqlerrm='duplicate import accepted' then raise; end if; end;
 if exists(select 1 from public.program_texts t join public.program_catalog p on p.id=t.program_id where p.name='Bláhoviny') then raise exception 'import not atomic'; end if;
 perform public.save_repertoire_song('{"name":"Fixture song","kind":"song","active":true}');
 if jsonb_array_length(public.get_app_database_v3()->'songs')<>66 then raise exception 'snapshot mismatch'; end if;
end $$;
-- Cross-repertoire selection must fail at the DB boundary.
insert into public.seasons(kind) values('carols'),('dance');
insert into public.events(season_id) select id from public.seasons;
do $$ declare carol uuid; song uuid; c_event uuid; d_event uuid; begin
 select id into carol from public.songs where kind='carol' limit 1;
 select id into song from public.songs where kind='song' limit 1;
 select e.id into c_event from public.events e join public.seasons s on s.id=e.season_id where s.kind='carols';
 select e.id into d_event from public.events e join public.seasons s on s.id=e.season_id where s.kind='dance';
 insert into public.song_series_items values(c_event,carol),(d_event,song);
 begin insert into public.song_series_items values(c_event,song); raise exception 'wrong repertoire accepted';
 exception when raise_exception then if sqlerrm='wrong repertoire accepted' then raise; end if; end;
 begin insert into public.song_series_items values(d_event,carol); raise exception 'wrong repertoire accepted';
 exception when raise_exception then if sqlerrm='wrong repertoire accepted' then raise; end if; end;
end $$;
select set_config('test.access','member',false);
set role authenticated;
do $$ begin
 if public.get_program_text((select gen_random_uuid())) is not null then null; end if;
 begin perform public.save_program_text(gen_random_uuid(),'[{"kind":"text","text":"hack"}]',null);raise exception 'member write accepted';exception when insufficient_privilege then null;end;
 begin perform public.import_carol_texts('[]');raise exception 'member import accepted';exception when insufficient_privilege then null;end;
 begin perform 1 from public.song_texts;raise exception 'direct table access accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('test.access','shared',false);
set role authenticated;
do $$ declare id uuid; begin
 select (s->>'id')::uuid into id from jsonb_array_elements(public.get_app_database_v3()->'songs') s where s->>'kind'='carol' limit 1;
 if public.get_song_text(id) is null then raise exception 'shared read missing'; end if;
 begin perform public.save_song_text(id,'[{"kind":"text","text":"hack"}]',null);raise exception 'shared write accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('test.access','',false);
set role authenticated;
do $$ begin
 begin perform public.get_program_text(gen_random_uuid());raise exception 'unauthorized read accepted';exception when insufficient_privilege then null;end;
 begin perform public.get_song_text(gen_random_uuid());raise exception 'unauthorized song read accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: imports, concurrent edits, access checks and repertoire enforcement';
