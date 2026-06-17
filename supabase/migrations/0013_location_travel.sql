-- Location-based travel detection (replaces the timezone-change heuristic,
-- which couldn't tell Madrid from Paris and fired on a laptop clock change).
--
-- We detect physical location from the request's IP geolocation and only
-- treat it as jet-lag travel when the UTC-offset difference from "home" is
-- meaningful — and only after the user confirms. `timezone` (device clock,
-- set by the browser) is still used for local time-of-day display.
alter table profiles
  add column if not exists home_tz text,
  add column if not exists home_label text,
  add column if not exists current_tz text,
  add column if not exists current_label text,
  add column if not exists location_at timestamptz,
  add column if not exists travel_status text not null default 'home'
    check (travel_status in ('home', 'pending', 'traveling')),
  add column if not exists travel_started_at timestamptz;
