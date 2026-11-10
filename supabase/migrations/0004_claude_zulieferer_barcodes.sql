-- Fred – Erweiterung: Claude als Zulieferer für Lidl/Netto/Edeka und Barcode-Zuordnungen.
-- Einmal im Supabase SQL Editor ausführen (nach 0003). Mehrfaches Ausführen schadet nicht.

-- ---------------------------------------------------------------
-- Zugangscodes für Zulieferer (z. B. die wöchentliche Claude-Aufgabe)
-- Gespeichert wird nur der SHA-256-Hash. Ein Code darf ausschließlich
-- Angebote der erlaubten Märkte für genau einen Haushalt eintragen.
-- ---------------------------------------------------------------
create table if not exists import_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  token_hash text not null unique,
  label text not null,
  allowed_stores text[] not null default array['lidl', 'netto', 'edeka'],
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table import_tokens enable row level security;
-- keine Policies: nur die Funktionen unten kommen an die Tabelle

create or replace function token_household(token text) returns uuid
  language sql security definer stable set search_path = public as $$
  select household_id from import_tokens
  where token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
$$;
revoke all on function token_household(text) from public;

-- Produktliste für den Zulieferer (nur Namen und Einheiten, keine Preise oder Bons)
create or replace function import_products(token text)
  returns table (slug text, name text, unit base_unit, pack_hint text, allowed_stores text[])
  language plpgsql security definer stable set search_path = public as $$
declare hh uuid := token_household(token);
begin
  if hh is null then raise exception 'Ungültiger Zugangscode'; end if;
  return query
    select p.slug, p.name, p.unit, p.pack_hint, (select t.allowed_stores from import_tokens t where t.household_id = hh
           and t.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'))
    from products p where p.household_id = hh and p.active order by p.sort;
end $$;

-- Angebote einliefern. payload = JSON-Liste von Objekten:
-- {store, product (slug), title, brand?, price_cents, card_price_cents?, was_price_cents?,
--  pack_text, amount (g|ml|Stück), unit ('kg'|'l'|'stk'), valid_from, valid_to, url?}
create or replace function submit_offers(token text, payload jsonb) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  t import_tokens;
  o jsonb;
  pid uuid;
  oid uuid;
  amt numeric;
  price int;
  u base_unit;
  saved int := 0;
  skipped jsonb := '[]'::jsonb;
  per_store jsonb := '{}'::jsonb;
  s text;
begin
  select * into t from import_tokens where token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
  if t.id is null then raise exception 'Ungültiger Zugangscode'; end if;
  if jsonb_typeof(payload) <> 'array' then raise exception 'payload muss eine Liste sein'; end if;
  if jsonb_array_length(payload) > 150 then raise exception 'Höchstens 150 Angebote pro Lieferung'; end if;

  for o in select * from jsonb_array_elements(payload) loop
    begin
      s := lower(o->>'store');
      if not s = any(t.allowed_stores) then
        skipped := skipped || jsonb_build_object('product', o->>'product', 'grund', 'Markt nicht erlaubt: ' || coalesce(s, '?'));
        continue;
      end if;
      select id into pid from products where household_id = t.household_id and slug = o->>'product';
      if pid is null then
        skipped := skipped || jsonb_build_object('product', o->>'product', 'grund', 'Produkt unbekannt');
        continue;
      end if;
      price := (o->>'price_cents')::int;
      amt := (o->>'amount')::numeric;
      u := (o->>'unit')::base_unit;
      if price is null or price <= 0 or price > 100000 or amt is null or amt <= 0 then
        skipped := skipped || jsonb_build_object('product', o->>'product', 'grund', 'Preis oder Menge fehlt');
        continue;
      end if;

      insert into offers (household_id, store_id, source_key, title, brand, price_cents, card_price_cents, was_price_cents,
                          pack_text, amount, unit, unit_price_cents, valid_from, valid_to, source_url)
      values (
        t.household_id, s,
        'claude|' || t.household_id || '|' || (o->>'valid_from') || '|' || (o->>'product') || '|' || lower(left(coalesce(o->>'title', ''), 120)),
        left(coalesce(nullif(o->>'title', ''), o->>'product'), 200),
        left(nullif(o->>'brand', ''), 100),
        price,
        nullif((o->>'card_price_cents')::int, 0),
        nullif((o->>'was_price_cents')::int, 0),
        left(o->>'pack_text', 100),
        amt, u,
        case when u = 'stk' then round(price / amt) else round(price * 1000 / amt) end,
        (o->>'valid_from')::date,
        nullif(o->>'valid_to', '')::date,
        left(nullif(o->>'url', ''), 500)
      )
      on conflict (store_id, source_key) do update set
        price_cents = excluded.price_cents, card_price_cents = excluded.card_price_cents,
        was_price_cents = excluded.was_price_cents, unit_price_cents = excluded.unit_price_cents,
        valid_to = excluded.valid_to, imported_at = now()
      returning id into oid;

      insert into offer_matches (offer_id, product_id, household_id, confirmed)
      values (oid, pid, t.household_id, null)
      on conflict (offer_id, product_id) do nothing;

      saved := saved + 1;
      per_store := jsonb_set(per_store, array[s], to_jsonb(coalesce((per_store->>s)::int, 0) + 1));
    exception when others then
      skipped := skipped || jsonb_build_object('product', o->>'product', 'grund', sqlerrm);
    end;
  end loop;

  for s in select jsonb_object_keys(per_store) loop
    insert into import_runs (store_id, ok, offers_found, message) values (s, true, (per_store->>s)::int, 'über ' || t.label);
  end loop;
  update import_tokens set last_used_at = now() where id = t.id;
  return jsonb_build_object('gespeichert', saved, 'uebersprungen', skipped);
end $$;

grant execute on function import_products(text) to anon, authenticated;
grant execute on function submit_offers(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------
-- Barcodes: welcher EAN gehört zu welchem eurer Produkte
-- ---------------------------------------------------------------
create table if not exists product_barcodes (
  household_id uuid not null references households(id) on delete cascade,
  ean text not null check (ean ~ '^[0-9]{8,14}$'),
  product_id uuid not null references products(id) on delete cascade,
  label text,                      -- Name laut Open Food Facts oder eigene Notiz
  pack_text text,                  -- z. B. 500 g
  created_at timestamptz not null default now(),
  primary key (household_id, ean)
);
alter table product_barcodes enable row level security;
drop policy if exists product_barcodes_member_rw on product_barcodes;
create policy product_barcodes_member_rw on product_barcodes for all to authenticated
  using (is_member(household_id)) with check (is_member(household_id));
