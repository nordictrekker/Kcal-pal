-- Self-described body build (lean / average / muscular / higher_fat), used to
-- adjust the auto protein target for body composition — a muscular and a
-- higher-body-fat person at the same scale weight need different protein.
alter table profiles
  add column if not exists body_build text;
