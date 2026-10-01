create function public.delete_program(program_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_admin_v3();
 perform 1 from public.program_catalog p where p.id=program_id for update;
 if not found then raise exception 'Pásmo nebylo nalezeno.'; end if;
 if exists(select 1 from public.event_program_items i where i.catalog_program_id=program_id) then
  raise exception 'Pásmo je použité v programu akce. Místo smazání ho skryjte pro nové akce.';
 end if;
 delete from public.program_catalog p where p.id=program_id;
end; $$;
revoke all on function public.delete_program(uuid) from public,anon;
grant execute on function public.delete_program(uuid) to authenticated;
notify pgrst,'reload schema';
