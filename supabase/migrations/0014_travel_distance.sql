-- Distance-based travel: long flights with little/no timezone change (e.g.
-- Germany→South Africa) still cause travel fatigue — cabin dehydration,
-- immobility, disrupted sleep — so we store coordinates to measure distance,
-- not just the timezone offset. travel_manual marks a trip the user logged
-- themselves (Settings) vs one detected from IP.
alter table profiles
  add column if not exists home_lat numeric,
  add column if not exists home_lng numeric,
  add column if not exists current_lat numeric,
  add column if not exists current_lng numeric,
  add column if not exists travel_manual boolean not null default false;
