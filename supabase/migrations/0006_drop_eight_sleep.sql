-- Remove the eight_sleep_daily table.
-- Eight Sleep was dropped from the app — its auth is account email/password
-- only (no tokens), which we don't want to store. Run once via the SQL
-- Editor on existing projects.

drop table if exists eight_sleep_daily cascade;
