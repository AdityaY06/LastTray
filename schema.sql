-- LastTray MVP schema for Supabase
-- Run this file in Supabase Dashboard > SQL Editor.
-- Reservations are created via reserve_listing() so quantity is decremented atomically.

create extension if not exists pgcrypto;

create table if not exists public.seller_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shop_name text not null check (char_length(shop_name) between 2 and 90),
  contact_phone text not null check (char_length(contact_phone) between 8 and 16),
  area text not null check (char_length(area) between 2 and 90),
  pickup_address text not null check (char_length(pickup_address) between 5 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  item_name text not null check (char_length(item_name) between 2 and 90),
  category text not null,
  description text not null default '' check (char_length(description) <= 260),
  allergens text not null default '' check (char_length(allergens) <= 180),
  original_price numeric(10,2) not null check (original_price > 0),
  deal_price numeric(10,2) not null check (deal_price > 0 and deal_price <= original_price),
  quantity_available integer not null check (quantity_available >= 0 and quantity_available <= 500),
  prepared_at timestamptz not null,
  pickup_by timestamptz not null,
  shop_name text not null,
  area text not null,
  pickup_address text not null,
  status text not null default 'active' check (status in ('active', 'sold_out', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_after_prepared check (pickup_by > prepared_at)
);

create index if not exists listings_public_lookup_idx on public.listings (status, pickup_by, area);
create index if not exists listings_seller_idx on public.listings (seller_id, created_at desc);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  customer_name text not null check (char_length(customer_name) between 2 and 70),
  customer_phone text not null check (char_length(customer_phone) between 8 and 16),
  quantity integer not null check (quantity between 1 and 500),
  pickup_code text not null unique,
  status text not null default 'reserved' check (status in ('reserved', 'collected', 'cancelled')),
  created_at timestamptz not null default now(),
  collected_at timestamptz
);

create index if not exists reservations_seller_idx on public.reservations (seller_id, created_at desc);
create index if not exists reservations_listing_idx on public.reservations (listing_id);

alter table public.seller_profiles enable row level security;
alter table public.listings enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "Seller can read own profile" on public.seller_profiles;
create policy "Seller can read own profile" on public.seller_profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Seller can create own profile" on public.seller_profiles;
create policy "Seller can create own profile" on public.seller_profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Seller can update own profile" on public.seller_profiles;
create policy "Seller can update own profile" on public.seller_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Public can view active unexpired listings and sellers can view own" on public.listings;
create policy "Public can view active unexpired listings and sellers can view own" on public.listings
  for select to anon, authenticated
  using ((status = 'active' and pickup_by > now() and quantity_available > 0) or auth.uid() = seller_id);

drop policy if exists "Seller can create own listings" on public.listings;
create policy "Seller can create own listings" on public.listings
  for insert to authenticated with check (auth.uid() = seller_id and exists (
    select 1 from public.seller_profiles p where p.user_id = auth.uid()
  ));

drop policy if exists "Seller can update own listings" on public.listings;
create policy "Seller can update own listings" on public.listings
  for update to authenticated using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

drop policy if exists "Seller can delete own listings" on public.listings;
create policy "Seller can delete own listings" on public.listings
  for delete to authenticated using (auth.uid() = seller_id);

drop policy if exists "Seller can view reservations for own listings" on public.reservations;
create policy "Seller can view reservations for own listings" on public.reservations
  for select to authenticated using (auth.uid() = seller_id);

drop policy if exists "Seller can update reservations for own listings" on public.reservations;
create policy "Seller can update reservations for own listings" on public.reservations
  for update to authenticated using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

-- A buyer can reserve without creating an account. This function is SECURITY DEFINER
-- because the reservation itself and stock decrement must be atomic. It returns only
-- the confirmation details needed by that buyer. Buyer contact details remain private
-- from public listing queries and are visible to the relevant shop owner only.
create or replace function public.reserve_listing(
  p_listing_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_quantity integer
)
returns table (
  reservation_id uuid,
  pickup_code text,
  listing_title text,
  pickup_by timestamptz,
  shop_name text,
  pickup_address text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_row public.listings%rowtype;
  new_reservation_id uuid;
  new_pickup_code text;
begin
  if p_customer_name is null or char_length(trim(p_customer_name)) < 2 or char_length(trim(p_customer_name)) > 70 then
    raise exception 'Enter a valid name.';
  end if;
  if p_customer_phone is null or char_length(trim(p_customer_phone)) < 8 or char_length(trim(p_customer_phone)) > 16 then
    raise exception 'Enter a valid contact number.';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 500 then
    raise exception 'Enter a valid quantity.';
  end if;

  select * into listing_row
    from public.listings
    where id = p_listing_id
    for update;

  if not found or listing_row.status <> 'active' or listing_row.pickup_by <= now() then
    raise exception 'This offer is no longer available.';
  end if;
  if listing_row.quantity_available < p_quantity then
    raise exception 'There is not enough quantity left. Please refresh the tray.';
  end if;

  new_pickup_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into public.reservations (
    listing_id, seller_id, customer_name, customer_phone, quantity, pickup_code
  ) values (
    listing_row.id, listing_row.seller_id, trim(p_customer_name), trim(p_customer_phone), p_quantity, new_pickup_code
  ) returning id into new_reservation_id;

  update public.listings
    set quantity_available = quantity_available - p_quantity,
        status = case when quantity_available - p_quantity <= 0 then 'sold_out' else status end,
        updated_at = now()
    where id = listing_row.id;

  return query select new_reservation_id, new_pickup_code, listing_row.item_name,
    listing_row.pickup_by, listing_row.shop_name, listing_row.pickup_address;
end;
$$;

revoke all on function public.reserve_listing(uuid, text, text, integer) from public;
grant execute on function public.reserve_listing(uuid, text, text, integer) to anon, authenticated;

grant select on public.listings to anon, authenticated;
grant insert, update, delete on public.listings to authenticated;
grant select, insert, update on public.seller_profiles to authenticated;
grant select, update on public.reservations to authenticated;

-- Do not grant public SELECT on reservations or seller_profiles.
