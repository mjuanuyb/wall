alter table public.profiles add column avatar_url text;

alter table public.posts add column image_url text;
alter table public.posts add column user_id uuid references public.profiles (id) on delete set null;

alter table public.posts drop constraint posts_message_length;
alter table public.posts add constraint posts_message_length check (char_length(message) <= 280);
alter table public.posts alter column message set default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('post-images', 'post-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can view avatars"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'avatars');

create policy "Members upload their avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Members replace their avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Members delete their avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Anyone can view post images"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'post-images');

create policy "Members upload post images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Members delete their post images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy "Members can share a post" on public.posts;

create policy "Members can share a post"
  on public.posts
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and char_length(message) <= 280
    and (
      char_length(btrim(message)) between 1 and 280
      or image_url is not null
    )
    and author_name = (
      select profiles.display_name
      from public.profiles
      where profiles.id = (select auth.uid())
    )
  );
