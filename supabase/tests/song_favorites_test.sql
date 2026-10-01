-- Personal favorites must stay isolated even from administrators.
begin;
create temp table favorite_case as select gen_random_uuid() admin_id,gen_random_uuid() member_user_id,gen_random_uuid() denied_id,gen_random_uuid() member_id,gen_random_uuid() song_id,gen_random_uuid() carol_id;
insert into auth.users(id,email,raw_user_meta_data)
 select admin_id,'fav-'||admin_id||'@example.invalid','{}'::jsonb from favorite_case
 union all select member_user_id,'fav-'||member_user_id||'@example.invalid','{}'::jsonb from favorite_case
 union all select denied_id,'fav-'||denied_id||'@example.invalid','{}'::jsonb from favorite_case;
insert into public.user_roles(user_id,role)
 select admin_id,'admin'::public.app_role from favorite_case
 union all select member_user_id,'member'::public.app_role from favorite_case;
insert into public.members(id,display_name,short_name,pairing_role,experience_level,age_group,age_groups,is_active)
 select member_id,'Favorites member','FM','photographer','advanced','old',array['old']::public.member_age_group[],true from favorite_case;
insert into public.member_accounts(member_id,email,desired_role,linked_user_id)
 select member_id,'fav-'||member_user_id||'@example.invalid','member',member_user_id from favorite_case;
update public.profiles set member_id=(select member_id from favorite_case) where user_id=(select member_user_id from favorite_case);
insert into public.songs(id,name,kind)
 select song_id,'Favorite song','song' from favorite_case union all select carol_id,'Favorite carol','carol' from favorite_case;
grant select on favorite_case to authenticated;
select set_config('request.jwt.claim.sub',(select member_user_id::text from favorite_case),true);
set local role authenticated;
do $$ begin
 if public.get_song_favorites_v8()<>'[]'::jsonb then raise exception 'New account should have no favorites'; end if;
 perform public.set_song_favorite_v8((select song_id from favorite_case),true);
 perform public.set_song_favorite_v8((select song_id from favorite_case),true);
 perform public.set_song_favorite_v8((select carol_id from favorite_case),true);
 if jsonb_array_length(public.get_song_favorites_v8())<>2 then raise exception 'Favorites not saved or duplicated'; end if;
 begin perform public.set_song_favorite_v8(gen_random_uuid(),true);raise exception 'Expected missing song rejection';exception when raise_exception then if sqlerrm='Expected missing song rejection' then raise;end if;end;
 begin perform public.set_song_favorite_v8((select song_id from favorite_case),null);raise exception 'Expected null rejection';exception when raise_exception then if sqlerrm='Expected null rejection' then raise;end if;end;
 begin perform 1 from public.song_favorites;raise exception 'Expected direct read denial';exception when insufficient_privilege then null;end;
 begin insert into public.song_favorites(user_id,song_id) select admin_id,song_id from favorite_case;raise exception 'Expected direct write denial';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select admin_id::text from favorite_case),true);
set local role authenticated;
do $$ begin
 if public.get_song_favorites_v8()<>'[]'::jsonb then raise exception 'Administrator saw member favorites';end if;
 perform public.set_song_favorite_v8((select song_id from favorite_case),false);
 if public.get_song_favorites_v8()<>'[]'::jsonb then raise exception 'Removal created favorite';end if;
 perform public.set_song_favorite_v8((select song_id from favorite_case),true);
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select member_user_id::text from favorite_case),true);
set local role authenticated;
do $$ begin
 if jsonb_array_length(public.get_song_favorites_v8())<>2 then raise exception 'Other account altered favorites';end if;
 perform public.set_song_favorite_v8((select song_id from favorite_case),false);
 perform public.set_song_favorite_v8((select song_id from favorite_case),false);
 if public.get_song_favorites_v8()<>jsonb_build_array((select carol_id from favorite_case)) then raise exception 'Favorite removal failed';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select denied_id::text from favorite_case),true);
set local role authenticated;
do $$ begin
 begin perform public.get_song_favorites_v8();raise exception 'Expected unauthorized read denial';exception when insufficient_privilege then null;end;
 begin perform public.set_song_favorite_v8((select song_id from favorite_case),true);raise exception 'Expected unauthorized write denial';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.members set is_active=false where id=(select member_id from favorite_case);
select set_config('request.jwt.claim.sub',(select member_user_id::text from favorite_case),true);
set local role authenticated;
do $$ begin
 begin perform public.get_song_favorites_v8();raise exception 'Expected inactive member denial';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from public.songs where id=(select song_id from favorite_case);
do $$ begin
 if exists(select 1 from public.song_favorites where song_id=(select song_id from favorite_case)) then raise exception 'Deleted song left favorites';end if;
 if has_function_privilege('anon','public.get_song_favorites_v8()','execute') or has_function_privilege('anon','public.set_song_favorite_v8(uuid,boolean)','execute') then raise exception 'Anonymous favorites permitted';end if;
end $$;
rollback;
