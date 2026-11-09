-- Fred – Datenbankschema für Supabase Free
-- Einmal im Supabase-Dashboard unter "SQL Editor" ausführen.
-- Preise immer in ganzen Cent, Mengen in g, ml oder Stück.


-- ---------------------------------------------------------------
-- Haushalt und Mitglieder
-- ---------------------------------------------------------------
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  primary key (household_id, user_id)
);

create or replace function is_member(hh uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from household_members
                 where household_id = hh and user_id = auth.uid());
$$;

create or replace function my_household() returns uuid
  language sql security definer stable set search_path = public as $$
  select household_id from household_members where user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------
-- Märkte (fest: Aldi Nord, Lidl, Kaufland, Netto, Edeka)
-- ---------------------------------------------------------------
create table stores (
  id text primary key,            -- 'aldi-nord', 'lidl', 'kaufland', 'netto', 'edeka'
  name text not null,
  sort int not null default 0
);
insert into stores (id, name, sort) values
  ('aldi-nord', 'Aldi Nord', 1),
  ('lidl', 'Lidl', 2),
  ('kaufland', 'Kaufland', 3),
  ('netto', 'Netto', 4),
  ('edeka', 'Edeka', 5);

-- ---------------------------------------------------------------
-- Produkte des Haushalts
-- ---------------------------------------------------------------
create type base_unit as enum ('kg', 'l', 'stk');

create table products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  slug text not null,                       -- z. B. 'magerquark'
  name text not null,
  unit base_unit not null,
  keywords_include text[] not null default '{}',  -- alle müssen vorkommen (Gruppen mit | = oder)
  keywords_exclude text[] not null default '{}',
  pack_hint text,                           -- z. B. '1 kg' für TK-Beeren
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, slug)
);

-- ---------------------------------------------------------------
-- Angebote aus dem Import-Job (öffentliche Prospektdaten)
-- ---------------------------------------------------------------
create table offers (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  source_key text not null,                 -- stabiler Schlüssel je Markt+Woche+Artikel
  title text not null,
  brand text,
  price_cents int not null check (price_cents > 0),
  card_price_cents int,                     -- z. B. Kaufland Card, Lidl Plus
  was_price_cents int,
  pack_text text,                           -- z. B. '500-g-Packung'
  amount numeric,                           -- in g, ml oder Stück
  unit base_unit,
  unit_price_cents int,                     -- je kg, l oder Stück
  valid_from date not null,
  valid_to date,
  source_url text,
  imported_at timestamptz not null default now(),
  unique (store_id, source_key)
);
create index offers_valid_idx on offers (valid_from, valid_to);

create table offer_matches (
  offer_id uuid not null references offers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  confirmed boolean,                        -- null = Vorschlag, true/false = von euch bestätigt
  score real not null default 1,
  primary key (offer_id, product_id)
);

-- ---------------------------------------------------------------
-- Normalpreise (Bons, Shopseiten, manuell)
-- ---------------------------------------------------------------
create type price_source as enum ('bon', 'shop', 'manuell', 'import');

create table price_observations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  store_id text not null references stores(id),
  label text not null,                      -- Artikelname wie im Laden
  price_cents int not null check (price_cents > 0),
  amount numeric not null,                  -- in g, ml oder Stück
  unit base_unit not null,
  unit_price_cents int not null,
  observed_on date not null,
  source price_source not null,
  receipt_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index price_obs_product_idx on price_observations (product_id, observed_on desc);

-- ---------------------------------------------------------------
-- Kassenbons (ohne Foto, nur erkannte Daten)
-- ---------------------------------------------------------------
create table receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  store_id text not null references stores(id),
  bought_on date not null,
  total_cents int,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  raw text not null,
  label text not null,
  qty numeric not null default 1,
  price_cents int not null,                 -- Stückpreis nach Rabatt
  total_cents int not null,
  weight_kg numeric,
  product_id uuid references products(id) on delete set null
);

alter table price_observations
  add constraint price_obs_receipt_fk foreign key (receipt_id) references receipts(id) on delete set null;

-- Gelernte Zuordnungen: Bon-Kürzel → Produkt
create table label_aliases (
  household_id uuid not null references households(id) on delete cascade,
  store_id text not null references stores(id),
  label text not null,                      -- normalisiert: klein, ohne Mehrfach-Leerzeichen
  product_id uuid not null references products(id) on delete cascade,
  primary key (household_id, store_id, label)
);

-- ---------------------------------------------------------------
-- Gemeinsame Einkaufsliste
-- ---------------------------------------------------------------
create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  week text not null,                       -- ISO-Woche, z. B. '2026-W46'
  unique (household_id, week)
);

create table list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  free_text text,                           -- für Einmaliges ohne Produkt
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  unique (list_id, product_id)
);

-- ---------------------------------------------------------------
-- Importprotokoll
-- ---------------------------------------------------------------
create table import_runs (
  id bigint generated always as identity primary key,
  store_id text not null references stores(id),
  started_at timestamptz not null default now(),
  ok boolean not null,
  offers_found int not null default 0,
  message text
);

-- Keep-alive: kleine Tabelle, die der tägliche Cron liest
create table heartbeat (id int primary key default 1, seen_at timestamptz not null default now());
insert into heartbeat default values;

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
alter table households enable row level security;
create policy households_read on households for select to authenticated using (is_member(id));

alter table household_members enable row level security;
create policy members_read on household_members for select to authenticated using (is_member(household_id));

alter table stores enable row level security;
create policy stores_read on stores for select to authenticated using (true);

alter table offers enable row level security;
create policy offers_read on offers for select to authenticated using (true);
-- keine Schreib-Policy: nur der Import-Job (Service-Rolle) schreibt

alter table import_runs enable row level security;
create policy import_runs_read on import_runs for select to authenticated using (true);

alter table heartbeat enable row level security;
create policy heartbeat_read on heartbeat for select to anon, authenticated using (true);

-- Haushaltstabellen: lesen und schreiben nur Mitglieder
do $$
declare t text;
begin
  foreach t in array array['products','offer_matches','price_observations','receipts',
                           'receipt_lines','label_aliases','shopping_lists','list_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (is_member(household_id)) with check (is_member(household_id))',
      t || '_member_rw', t);
  end loop;
end $$;

-- Echtzeit für das gemeinsame Abhaken
alter publication supabase_realtime add table list_items;
