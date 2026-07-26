-- Prenatal-critical nutrients (part 1 of the TTC/pregnancy update, useful to
-- everyone): folate (µg DFE), choline (mg), iodine (µg). These are the three
-- most consequential and most-overlooked nutrients for conception/pregnancy;
-- tracked like the other micros (AI-estimated, FDC-enriched, user-editable).
alter table food_entries
  add column if not exists folate_mcg numeric,
  add column if not exists choline_mg numeric,
  add column if not exists iodine_mcg numeric;
