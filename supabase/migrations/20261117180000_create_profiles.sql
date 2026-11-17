create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 40)
);

alter table public.profiles enable row level security;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

create policy "Profiles are visible"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "Members can create their profile"
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "Members can update their profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create or replace function public.confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

create trigger confirm_new_user
  before insert on auth.users
  for each row
  execute function public.confirm_new_user();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_name text;
begin
  chosen_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40);
  if char_length(chosen_name) = 0 then
    chosen_name := 'Member';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, chosen_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger create_profile_for_new_user
  after insert on auth.users
  for each row
  execute function public.create_profile_for_new_user();

drop policy "Anyone can share a post" on public.posts;

revoke insert on public.posts from anon;

create policy "Members can share a post"
  on public.posts
  for insert
  to authenticated
  with check (
    char_length(btrim(message)) between 1 and 280
    and author_name = (
      select profiles.display_name
      from public.profiles
      where profiles.id = (select auth.uid())
    )
  );
