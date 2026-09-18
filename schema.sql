-- INE Price Tracker — Supabase schema
-- Run in Supabase SQL Editor.

-- ---------------------------------------------------------------
-- Products the user has chosen to track.
-- store_product_id is the store's own stable id/sku, NOT the name.
-- ---------------------------------------------------------------
create table tracked_products (
  id                uuid primary key default gen_random_uuid(),
  store_product_id  text not null unique,
  name              text not null,
  product_url       text,
  image_url         text,
  -- bonus: configurable scrape frequency per product
  scrape_interval_minutes integer not null default 120,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Price/stock readings. ONE RULE: a row lands here only when a
-- scrape succeeded AND the values passed validation. Never write
-- a placeholder, a null price, or a "best guess" on failure.
-- ---------------------------------------------------------------
create table price_history (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references tracked_products(id) on delete cascade,
  price        numeric(12,2) not null check (price > 0),
  currency     text not null default 'INR',
  in_stock     boolean not null,
  stock_qty    integer,
  scraped_at   timestamptz not null default now()
);

create index price_history_product_time_idx
  on price_history (product_id, scraped_at desc);

-- ---------------------------------------------------------------
-- Every scrape ATTEMPT, honestly. Successes, retries, failures.
-- A failed run still produces rows here and nothing in price_history.
-- ---------------------------------------------------------------
create type scrape_status as enum ('success', 'retried', 'failed');

create table scrape_logs (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references tracked_products(id) on delete cascade,
  run_id         uuid not null,            -- groups attempts of one scheduled run
  attempt_number integer not null,         -- 1, 2, 3...
  status         scrape_status not null,
  method         text,                     -- 'http' | 'playwright'
  http_status    integer,
  duration_ms    integer,
  error_message  text,                     -- null on success
  -- bonus: change detection. Hash of the response shape / selector set.
  -- If this flips unexpectedly, the store's structure moved.
  structure_signature text,
  created_at     timestamptz not null default now()
);

create index scrape_logs_product_time_idx
  on scrape_logs (product_id, created_at desc);

create index scrape_logs_run_idx on scrape_logs (run_id);

-- ---------------------------------------------------------------
-- Convenience view: latest good reading per product, for the dashboard.
-- ---------------------------------------------------------------
create view latest_prices as
select distinct on (product_id)
  product_id, price, currency, in_stock, stock_qty, scraped_at
from price_history
order by product_id, scraped_at desc;
