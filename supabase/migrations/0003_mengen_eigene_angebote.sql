-- Fred – Erweiterung: Mengen auf der Liste und selbst eingetragene Angebote (Lidl, Netto, Edeka …).
-- Einmal im Supabase SQL Editor ausführen (nach 0002). Mehrfaches Ausführen schadet nicht.

-- Anzahl je Eintrag auf der Wochenliste
alter table list_items add column if not exists qty int not null default 1;
alter table list_items drop constraint if exists list_items_qty_check;
alter table list_items add constraint list_items_qty_check check (qty between 1 and 99);

-- Eigene Angebote: gehören zu einem Haushalt, die importierten (household_id null) allen
alter table offers add column if not exists household_id uuid references households(id) on delete cascade;
alter table offers add column if not exists created_by uuid default auth.uid();

drop policy if exists offers_read on offers;
create policy offers_read on offers for select to authenticated
  using (household_id is null or is_member(household_id));

drop policy if exists offers_own_write on offers;
create policy offers_own_write on offers for insert to authenticated
  with check (household_id is not null and is_member(household_id) and source_key like 'manuell|%');

drop policy if exists offers_own_delete on offers;
create policy offers_own_delete on offers for delete to authenticated
  using (household_id is not null and is_member(household_id));
