-- Allow a reasoned undecided response on rehearsals as well.
create or replace function public.validate_response_v3() returns trigger language plpgsql set search_path='' as $$
declare e public.events; begin
 select * into e from public.events where id=new.event_id for update;
 if new.response='substitute' then raise exception 'Náhradník není platná odpověď.'; end if;
 if new.response='maybe' and nullif(btrim(new.note),'') is null then raise exception 'Pro zatím nevím je povinná poznámka.'; end if;
 if auth.uid() is not null and not public.is_admin() and (e.status<>'open' or (e.type='performance' and clock_timestamp()>=e.response_deadline)) then raise exception 'Odpovědi jsou uzamčené.'; end if;
 return new; end; $$;
