-- ============================================================
-- Hospitality Ad Studio — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── CLIENTS ─────────────────────────────────────────────────────────────────
create table if not exists clients (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  property_type       text not null default 'Hotel',
  location            text not null default '',
  google_maps_url     text,
  google_place_id     text,
  lat                 double precision,
  lng                 double precision,
  event_radius        integer not null default 5,
  tone                text not null default 'warm and inviting',
  target_guests       text not null default '',
  amenities           text[] not null default '{}',
  usp                 text not null default '',
  custom_requirements text,
  instagram_handle    text,
  instagram_page_id   text,
  instagram_token     text,   -- stored server-side, never exposed to client
  review_summary      jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- RLS
alter table clients enable row level security;
create policy "clients: owner access" on clients
  for all using (auth.uid() = user_id);

create index clients_user_id_idx on clients(user_id);

-- ─── FOLDERS ─────────────────────────────────────────────────────────────────
create table if not exists folders (
  id         uuid primary key default uuid_generate_v4(),
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null default 'General',
  created_at timestamptz not null default now()
);

alter table folders enable row level security;
create policy "folders: client owner access" on folders
  for all using (
    exists (
      select 1 from clients c where c.id = folders.client_id and c.user_id = auth.uid()
    )
  );

create index folders_client_id_idx on folders(client_id);

-- ─── PHOTOS ──────────────────────────────────────────────────────────────────
create table if not exists photos (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid not null references clients(id) on delete cascade,
  folder_id   uuid references folders(id) on delete set null,
  filename    text not null,
  public_url  text not null,
  size_bytes  integer,
  created_at  timestamptz not null default now()
);

alter table photos enable row level security;
create policy "photos: client owner access" on photos
  for all using (
    exists (
      select 1 from clients c where c.id = photos.client_id and c.user_id = auth.uid()
    )
  );

create index photos_client_id_idx on photos(client_id);
create index photos_folder_id_idx on photos(folder_id);

-- ─── EVENTS ──────────────────────────────────────────────────────────────────
create table if not exists events (
  id                uuid primary key default uuid_generate_v4(),
  title             text not null,
  category          text not null default 'other',
  date              date,
  time              text,
  location          text not null default '',
  location_resolved text,
  lat               double precision,
  lng               double precision,
  description       text not null default '',
  guest_relevance   text[] not null default '{}',
  coords_calibrated boolean not null default false,
  geocode_source    text,
  created_at        timestamptz not null default now()
);

-- Events are shared / global (not per-user) — no RLS needed, but restrict writes
alter table events enable row level security;
create policy "events: all authenticated users can read" on events
  for select using (auth.role() = 'authenticated');
create policy "events: all authenticated users can insert" on events
  for insert with check (auth.role() = 'authenticated');
create policy "events: all authenticated users can update" on events
  for update using (auth.role() = 'authenticated');
create policy "events: all authenticated users can delete" on events
  for delete using (auth.role() = 'authenticated');

create index events_date_idx on events(date);
create index events_category_idx on events(category);

-- ─── POSTS ───────────────────────────────────────────────────────────────────
create table if not exists posts (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  client_id            uuid not null references clients(id) on delete cascade,
  base_photo_url       text not null,
  generated_image_url  text,
  caption              text,
  hashtags             text,
  status               text not null default 'draft' check (status in ('draft', 'approved', 'published')),
  api_cost_usd         numeric(10, 6) not null default 0,
  flux_prompt          text,
  labels               jsonb,
  instagram_post_id    text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table posts enable row level security;
create policy "posts: owner access" on posts
  for all using (auth.uid() = user_id);

create index posts_user_id_idx on posts(user_id);
create index posts_client_id_idx on posts(client_id);
create index posts_status_idx on posts(status);

-- ─── API COSTS ───────────────────────────────────────────────────────────────
create table if not exists api_costs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  client_id   uuid references clients(id) on delete set null,
  post_id     uuid references posts(id) on delete set null,
  service     text not null,
  model       text,
  cost_usd    numeric(10, 6) not null default 0,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table api_costs enable row level security;
create policy "api_costs: owner access" on api_costs
  for all using (auth.uid() = user_id);

create index api_costs_user_id_idx on api_costs(user_id);
create index api_costs_client_id_idx on api_costs(client_id);
create index api_costs_created_at_idx on api_costs(created_at desc);

-- ─── STORAGE BUCKETS ─────────────────────────────────────────────────────────
-- Run these in the Supabase Dashboard → Storage, OR via SQL:
insert into storage.buckets (id, name, public)
values
  ('property-photos', 'property-photos', true),
  ('generated-images', 'generated-images', true)
on conflict (id) do nothing;

-- Storage policies
create policy "property-photos: authenticated users can upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'property-photos');

create policy "property-photos: authenticated users can read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'property-photos');

create policy "property-photos: owners can delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'property-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "generated-images: authenticated users can upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'generated-images');

create policy "generated-images: all can read"
  on storage.objects for select
  using (bucket_id = 'generated-images');

-- ─── HELPER FUNCTION: update updated_at ──────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clients_updated_at before update on clients
  for each row execute function update_updated_at();
create trigger posts_updated_at before update on posts
  for each row execute function update_updated_at();
