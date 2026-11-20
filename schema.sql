-- Idempotent setup / migration. Existing votes and accounts are retained.
begin;
create table if not exists public.participants (id text primary key, name text not null);
alter table public.participants add column if not exists active boolean not null default true;
alter table public.participants add column if not exists baking_date date;
create table if not exists public.members (
  user_id uuid primary key references auth.users(id),
  participant_id text unique references public.participants(id)
);
alter table public.members alter column participant_id drop not null;
alter table public.members add column if not exists display_name text not null default '';
alter table public.members add column if not exists login_id text unique;
alter table public.members add column if not exists registered_at timestamptz;
create table if not exists public.votes (
  voter_id uuid not null references auth.users(id),
  target_id text not null references public.participants(id),
  score numeric not null check (score between 1 and 10 and score = trunc(score)),
  created_at timestamptz not null default now(),
  primary key (voter_id, target_id)
);
create table if not exists public.profiles (
  user_id uuid primary key references public.members(user_id),
  avatar text not null default '🍰' check (avatar in ('🍰','🦊','🐸','🐼','🐱','🐻','🦋','🍓','👑','🦄','🐧','🌻')),
  color text not null default '#eaf3fc' check (color in ('#eaf3fc','#f9e9ee','#e8f2ef','#fff1d5','#eeeaf5','#fae9df'))
);
insert into public.participants(id,name,baking_date) values
 ('nico','Nico','2026-11-13'), ('livio','Livio','2026-11-20'), ('kimo','Kimo','2026-11-27'),
 ('kyle','Kyle','2026-12-04'), ('noemi','Noemi','2026-12-11'), ('maria','Maria','2026-12-18'),
 ('anina','Anina','2027-01-08'), ('joel-haeusler','Joel Häusler','2027-01-15'), ('tim','Tim','2027-01-22')
on conflict (id) do update set name=excluded.name,baking_date=excluded.baking_date;
-- Non-bakers from the initial draft stay as inactive rows if they already exist.
update public.participants set active=false where id in ('joel-stocker','raphael');

alter table public.participants enable row level security;
alter table public.members enable row level security;
alter table public.votes enable row level security;
alter table public.profiles enable row level security;
revoke all on public.participants, public.members, public.votes, public.profiles from anon, authenticated;
grant select on public.participants, public.members, public.votes, public.profiles to authenticated;
grant insert (voter_id,target_id,score) on public.votes to authenticated;
grant insert (user_id,avatar,color) on public.profiles to authenticated;
grant update (avatar,color) on public.profiles to authenticated;
grant all on public.participants, public.members, public.votes, public.profiles to service_role;

drop policy if exists own_membership on public.members;
create policy own_membership on public.members for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists class_roster on public.participants;
create policy class_roster on public.participants for select to authenticated
  using (active and exists (select 1 from public.members where user_id = (select auth.uid()) and registered_at is not null));
drop policy if exists own_votes on public.votes;
create policy own_votes on public.votes for select to authenticated
  using (voter_id = (select auth.uid()) and exists (select 1 from public.members where user_id = (select auth.uid()) and registered_at is not null));
drop policy if exists cast_one_vote on public.votes;
create policy cast_one_vote on public.votes for insert to authenticated
  with check (
    voter_id = (select auth.uid())
    and exists (select 1 from public.members where user_id = (select auth.uid()) and registered_at is not null and (participant_id is null or participant_id <> target_id))
    and exists (select 1 from public.participants where id=target_id and active and baking_date <= (now() at time zone 'Europe/Zurich')::date)
  );
drop policy if exists read_own_profile on public.profiles;
create policy read_own_profile on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists create_own_profile on public.profiles;
create policy create_own_profile on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.members where user_id = (select auth.uid()) and registered_at is not null));
drop policy if exists update_own_profile on public.profiles;
create policy update_own_profile on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Recreate only the aggregate function when its return type changes. No vote data is removed.
drop function if exists public.leaderboard();
create function public.leaderboard()
returns table (id text,name text,average numeric,vote_count bigint,baking_date date,avatar text,color text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.members m where m.user_id = auth.uid() and m.registered_at is not null) then
    raise exception 'Kein Klassenzugang' using errcode = '42501';
  end if;
  return query select p.id,p.name,avg(v.score),count(v.score),p.baking_date,coalesce(pr.avatar,'🍰'),coalesce(pr.color,'#eaf3fc')
    from public.participants p left join public.votes v on v.target_id=p.id
    left join public.members m on m.participant_id=p.id left join public.profiles pr on pr.user_id=m.user_id
    where p.active group by p.id,p.name,p.baking_date,pr.avatar,pr.color;
end;
$$;
revoke all on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;
commit;
