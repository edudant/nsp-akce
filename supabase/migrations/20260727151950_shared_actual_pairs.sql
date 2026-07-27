-- Closed shared events show confirmed actual pairs, not an obsolete proposal.

create or replace function public.get_shared_event_pairs(target_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_event_status public.event_status;
begin
  if not public.has_active_shared_session() then
    raise exception 'Sdílená relace není platná nebo vypršela.';
  end if;

  select e.status into v_event_status
  from public.events e
  where e.id = target_event_id
    and e.visibility in ('public', 'shared')
    and e.status <> 'draft';

  if not found then
    raise exception 'Páry této události nejsou ve sdíleném náhledu dostupné.';
  end if;

  update public.shared_access_sessions
  set last_seen_at = now()
  where user_id = auth.uid();

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'roundNumber', ep.round_number,
      'memberAId', ep.member_a_id,
      'memberAName', ma.display_name,
      'memberBId', ep.member_b_id,
      'memberBName', mb.display_name,
      'explanation', ep.explanation
    )
    order by ep.round_number, ma.display_name, mb.display_name
  ), '[]'::jsonb)
  into v_result
  from public.event_pairs ep
  join public.pairing_runs pr on pr.id = ep.pairing_run_id
  join public.members ma on ma.id = ep.member_a_id
  join public.members mb on mb.id = ep.member_b_id
  where pr.event_id = target_event_id
    and (
      (v_event_status = 'closed' and ep.is_confirmed_actual)
      or (v_event_status <> 'closed' and pr.status = 'published')
    );

  return v_result;
end;
$$;

revoke all on function public.get_shared_event_pairs(uuid) from public;
grant execute on function public.get_shared_event_pairs(uuid) to authenticated;

