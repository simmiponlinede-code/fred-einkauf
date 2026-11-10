-- Fred – Erweiterung: Bereiche für den Einkaufsmodus, Push-Abos, Live-Löschen auf der Liste.
-- Einmal im Supabase SQL Editor ausführen (nach 0001_schema.sql). Mehrfaches Ausführen schadet nicht.

-- Bereiche im Laden, Reihenfolge wie ein typischer Rundgang
alter table products add column if not exists category text not null default 'sonstiges'
  check (category in ('obst-gemuese', 'brot', 'kuehlregal', 'fleisch', 'tiefkuehl', 'vorrat', 'getraenke', 'drogerie', 'sonstiges'));

update products set category = 'obst-gemuese' where slug in ('bananen', 'aepfel', 'gurken', 'tomaten') and category = 'sonstiges';
update products set category = 'kuehlregal' where slug in ('magerquark', 'eier', 'milch', 'joghurt', 'high-protein-pudding') and category = 'sonstiges';
update products set category = 'fleisch' where slug = 'haehnchenbrust' and category = 'sonstiges';
update products set category = 'tiefkuehl' where slug in ('heidelbeeren-tk', 'erdbeeren-tk') and category = 'sonstiges';
update products set category = 'vorrat' where slug = 'passierte-tomaten' and category = 'sonstiges';
update products set category = 'getraenke' where slug in ('energy-zero', 'zero-getraenke') and category = 'sonstiges';

-- Freitext-Einträge (Einmaliges) brauchen einen Bereich und wer sie angelegt hat
alter table list_items add column if not exists category text;
alter table list_items add column if not exists created_by uuid default auth.uid();
alter table list_items add column if not exists created_at timestamptz not null default now();

-- Live-Abgleich: gelöschte Einträge sollen beim Partner sofort verschwinden
alter table list_items replica identity full;

-- Push-Abos (Web Push, eigene VAPID-Schlüssel, kein Drittanbieter)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists push_own on push_subscriptions;
create policy push_own on push_subscriptions for all to authenticated
  using (user_id = auth.uid() and is_member(household_id))
  with check (user_id = auth.uid() and is_member(household_id));
