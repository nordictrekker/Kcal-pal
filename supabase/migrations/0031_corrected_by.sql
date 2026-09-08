-- `edited_by_user` conflates two different things: a correction the user made
-- in the app, and a repair an operator applied by hand after a bug report.
-- Both set the same flag, so the hand-edit rate — the metric that tells us
-- whether the nutrition estimates are getting better — cannot be read. Over
-- the accuracy work of Aug/Sep 2026 it went 33% → 42%, and there is no way to
-- tell how much of that rise was our own repair SQL.
--
-- `corrected_by` separates them:
--   'user'     — corrected in the app by the person who logged it
--   'operator' — repaired out-of-band (bug-report follow-up, data fix)
--   'unknown'  — predates this column; excluded from the metric rather than
--                silently counted as either
--   null       — never corrected
--
-- edited_by_user keeps its existing meaning ("do not overwrite this row",
-- which re-analyze relies on) and is still set by both paths.

alter table food_entries
  add column if not exists corrected_by text
    check (corrected_by is null or corrected_by in ('user', 'operator', 'unknown'));

-- Everything already flagged predates the distinction. Mark it 'unknown' so
-- the edit-rate metric starts from a clean, honest baseline instead of
-- attributing historic operator repairs to the user.
update food_entries
set corrected_by = 'unknown'
where edited_by_user = true and corrected_by is null;

comment on column food_entries.corrected_by is
  'Who corrected this entry: user (in-app edit), operator (out-of-band repair), unknown (pre-dates the column). Null = never corrected. Use this, not edited_by_user, to measure estimate quality.';
