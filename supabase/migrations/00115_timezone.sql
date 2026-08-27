-- Timezone awareness. The phone reports its IANA zone (e.g.
-- 'America/Los_Angeles'); we store it so day boundaries and the insight
-- engine use the user's local wall-clock instead of the server's UTC. A
-- change in zone means travel — we keep the previous zone and when it
-- changed so insights can note it for a day or two.
alter table profiles
  add column if not exists timezone text,
  add column if not exists previous_timezone text,
  add column if not exists timezone_updated_at timestamptz;
