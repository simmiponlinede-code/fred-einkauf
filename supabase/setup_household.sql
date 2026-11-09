-- Einmalig nach 0001_schema.sql ausführen, NACHDEM ihr beide Konten
-- unter Authentication → Users → "Add user" angelegt habt.
-- E-Mail-Adressen und Namen unten eintragen.

with hh as (
  insert into households (name) values ('Unser Haushalt') returning id
)
insert into household_members (household_id, user_id, display_name)
select hh.id, u.id, v.display_name
from hh
join (values
  ('SIMON@BEISPIEL.DE', 'Simon'),
  ('PARTNERIN@BEISPIEL.DE', 'Partnerin')
) as v(email, display_name) on true
join auth.users u on lower(u.email) = lower(v.email);

-- Prüfen: sollte 2 Zeilen zeigen
select m.display_name, u.email from household_members m join auth.users u on u.id = m.user_id;
