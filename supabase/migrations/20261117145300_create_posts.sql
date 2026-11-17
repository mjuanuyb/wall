create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint posts_author_name_length check (char_length(btrim(author_name)) between 1 and 40),
  constraint posts_message_length check (char_length(btrim(message)) between 1 and 280)
);

create index posts_created_at_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

grant select, insert on public.posts to anon, authenticated;

create policy "Anyone can read posts"
  on public.posts
  for select
  to anon, authenticated
  using (true);

create policy "Anyone can share a post"
  on public.posts
  for insert
  to anon, authenticated
  with check (
    char_length(btrim(author_name)) between 1 and 40
    and char_length(btrim(message)) between 1 and 280
  );

alter publication supabase_realtime add table public.posts;
