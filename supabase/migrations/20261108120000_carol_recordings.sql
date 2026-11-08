-- The recordings belong in a private bucket; links are signed only for app readers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('carol-recordings', 'carol-recordings', false, 10485760, array['audio/mpeg'])
on conflict (id) do nothing;

create policy carol_recordings_read on storage.objects for select to authenticated
using (bucket_id = 'carol-recordings' and public.can_read_app_v3());

create table public.carol_recordings (
  track_no integer primary key check (track_no between 1 and 99),
  title text not null,
  object_path text not null unique,
  song_id uuid references public.songs(id) on delete set null
);
alter table public.carol_recordings enable row level security;
revoke all on public.carol_recordings from public, anon, authenticated;

insert into public.carol_recordings(track_no, title, object_path, song_id)
select t.no, t.title, 'hdy-je-zima-mraz/' || lpad(t.no::text,2,'0') || '.mp3', s.id
from (values
(1,'Přišla k nám radostná hodina','Přišla k nám radostná hodina'),
(2,'Husni, husni, díťátko','Husni, husni'),
(3,'Vávro, nespi',null),
(4,'Probuď se, pastýři','Probujce, pastýři'),
(5,'Aj dnes v Betlémě','Aj, dnes v Betlémě'),
(6,'Čas radosti','Omnis mundus/Čas radosti'),
(7,'Co se stalo','Co se stalo nenadále'),
(8,'K jesličkám','K jesličkám pastýři'),
(9,'Koleda nám nastává','Koleda nám nastává'),
(10,'Na Vánoce','Na Vánoce'),
(11,'Na pěkným kopečku','Na pěkným kopečku'),
(12,'Kdy je zima, mráz','Pote chlapcí/ Hdy je zima'),
(13,'Ten náš slouha','Ten náš sluúha'),
(14,'Hančička nese','Hančička nese'),
(15,'Pochválen buď Ježíš Kristus','Pochválen buď Ježíš Kristus'),
(16,'Mistře můj','Mistře muj!'),
(17,'Před naším domem',null),
(18,'V Betlémě',null),
(19,'Na Vánoce, dlouhý noce','Na vánoce dluúhý noce'),
(20,'Veselá koleda',null),
(21,'Staňte milí pastuškové','Staňte milý pastuškové'),
(22,'Přicházím já k vám','Přicházím já k vám'),
(23,'Hajej, nynej, Ježíšku','Hajyj, nynyj Ježíšku'),
(24,'Chtíc, aby spal','Chtíc haby spal'),
(25,'Svatú dobu','Svatú dobu huž tu máme')
) as t(no,title,song_name)
left join public.songs s on s.kind='carol' and s.name=t.song_name;

create function public.get_carol_recordings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_read_app_v3() then
    raise exception 'Přihlaste se pro poslech nahrávek.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('trackNo',track_no,'title',title,'path',object_path,'songId',song_id) order by track_no) from public.carol_recordings), '[]'::jsonb);
end $$;
revoke all on function public.get_carol_recordings() from public, anon;
grant execute on function public.get_carol_recordings() to authenticated;
notify pgrst, 'reload schema';
