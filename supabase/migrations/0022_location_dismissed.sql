-- Lets the user reject a wrong IP-geolocation reading without it becoming their
-- home. We remember the rejected place label so the same bad reading doesn't
-- immediately re-prompt; a genuinely different location later clears it.
alter table profiles
  add column if not exists location_dismissed_label text;
