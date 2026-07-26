-- User-declared supplement list (Settings → Supplements). Shown as a pinned
-- section at the top of the /log pantry for one-tap logging.
alter table profiles
  add column if not exists supplements text[] not null default '{}';
