-- Prayer Army International — Messages, Comments & Prayer Requests
-- Run this once in your Supabase project's SQL editor (Database → SQL Editor → New query),
-- or via `supabase db push` / the CLI if you use migrations locally.
--
-- This does NOT touch your existing site_settings / admin_config / media tables.

-- ---------------------------------------------------------------------------
-- 1. messages  — the archive of past live broadcasts + any message an admin
--    adds by hand. Deliberately has no "image" column: messages are shown as
--    text + an optional link + an optional uploaded audio/video file, never
--    a picture.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 4000),
  link        text check (link is null or char_length(link) <= 2000),
  media_url   text check (media_url is null or char_length(media_url) <= 2000),
  media_type  text check (media_type is null or media_type in ('audio', 'video')),
  source      text not null default 'manual' check (source in ('manual', 'live')),
  created_at  timestamptz not null default now()
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);

alter table public.messages enable row level security;

-- Everyone can read the message list — but only the manage-content Edge
-- Function (using the service-role key, after re-checking the passkey) may
-- insert, update or delete. No direct-write policies are defined on purpose.
drop policy if exists "messages_public_read" on public.messages;
create policy "messages_public_read" on public.messages
  for select using (true);

-- ---------------------------------------------------------------------------
-- 2. message_comments — open to visitors: anyone may read and post a comment
--    directly (no passkey needed), matching "comments without leaving the
--    site". Deleting a comment is still admin-only, via the Edge Function.
-- ---------------------------------------------------------------------------
create table if not exists public.message_comments (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  comment    text not null check (char_length(comment) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists message_comments_message_id_idx on public.message_comments (message_id, created_at);

alter table public.message_comments enable row level security;

drop policy if exists "comments_public_read" on public.message_comments;
create policy "comments_public_read" on public.message_comments
  for select using (true);

drop policy if exists "comments_public_insert" on public.message_comments;
create policy "comments_public_insert" on public.message_comments
  for insert with check (true);

-- ---------------------------------------------------------------------------
-- 3. prayer_requests — replaces the old "mailto:" fallback. Visitors can
--    submit directly (insert-only, anon key); nobody can read them back
--    except the manage-content Edge Function (service role + passkey),
--    so requests stay private between the sender and the ministry.
-- ---------------------------------------------------------------------------
create table if not exists public.prayer_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  contact    text check (contact is null or char_length(contact) <= 200),
  request    text not null check (char_length(request) between 1 and 4000),
  is_private boolean not null default false,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists prayer_requests_created_at_idx on public.prayer_requests (created_at desc);

alter table public.prayer_requests enable row level security;

drop policy if exists "prayer_requests_public_insert" on public.prayer_requests;
create policy "prayer_requests_public_insert" on public.prayer_requests
  for insert with check (true);

-- Deliberately no select/update/delete policies for anon — only the
-- manage-content Edge Function (service role key) can read or clear these.
