-- One atomic request for an admin's participant selection and shared defaults.
create function public.add_attendance_batch_v4(
 target_event_id uuid, member_ids uuid[], defaults jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
 ids uuid[];
 actual public.attendance_status;
 response public.event_response_status;
 percent numeric;
 response_note text;
begin
 perform public.require_admin_v3();
 perform 1 from public.events where id=target_event_id for update;
 if not found then raise exception 'Událost neexistuje.'; end if;
 select array_agg(distinct id) into ids from unnest(member_ids) as requested(id);
 if coalesce(cardinality(ids),0)=0 then raise exception 'Vyberte členy.'; end if;
 if exists(select 1 from unnest(ids) as requested(id)
  where id is null or not exists(select 1 from public.members m where m.id=requested.id and m.is_active))
 then raise exception 'Přidat lze pouze aktivní členy.'; end if;

 if defaults->>'status' is null or defaults->>'status' not in ('present','partial','absent','excused','unknown')
 then raise exception 'Neplatná skutečná účast.'; end if;
 if defaults->>'interest' is null or defaults->>'interest' not in ('yes','no','maybe','unset')
 then raise exception 'Neplatná odpověď.'; end if;
 actual := case defaults->>'status'
  when 'present' then 'full'::public.attendance_status
  when 'partial' then 'partial'::public.attendance_status
  when 'absent' then 'absent'::public.attendance_status
  when 'excused' then 'excused'::public.attendance_status
  else 'unrecorded'::public.attendance_status end;
 response := case when defaults->>'interest'='unset' then 'unanswered'::public.event_response_status
  else (defaults->>'interest')::public.event_response_status end;
 response_note := nullif(btrim(defaults->>'note'),'');
 if coalesce(length(response_note),0)>500 then raise exception 'Poznámka může mít nejvýše 500 znaků.'; end if;
 if response='maybe' and response_note is null then raise exception 'Pro zatím nevím je povinná poznámka.'; end if;
 percent := case when actual='partial' then (defaults->>'attendancePercent')::numeric else null end;
 if actual='partial' and (percent is null or percent<=0 or percent>=100)
 then raise exception 'Částečná účast musí být větší než 0 a menší než 100 %%.'; end if;

 insert into public.attendance(event_id,member_id,status,attendance_percent,confirmed_by,confirmed_at)
 select target_event_id,id,actual,percent,auth.uid(),now() from unnest(ids) as requested(id)
 on conflict(event_id,member_id) do update set status=excluded.status,
  attendance_percent=excluded.attendance_percent,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at;

 insert into public.event_responses(event_id,member_id,response,note)
 select target_event_id,id,response,response_note from unnest(ids) as requested(id)
 on conflict(event_id,member_id) do update set response=excluded.response,note=excluded.note;

 insert into public.event_participants(event_id,member_id,status)
 select target_event_id,id,case when actual in ('absent','excused') then 'invited'::public.participant_status
  else 'selected'::public.participant_status end from unnest(ids) as requested(id)
 on conflict(event_id,member_id) do update set status=excluded.status;
end; $$;
revoke all on function public.add_attendance_batch_v4(uuid,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.add_attendance_batch_v4(uuid,uuid[],jsonb) to authenticated;
