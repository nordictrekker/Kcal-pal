// Labeled products (supplements, bars, powders) whose nutrition is a fixed
// label fact that varies by brand/region — exactly where a knowledge-based
// guess picks the wrong SKU (e.g. French Berocca has 10 µg vitamin D vs the
// ~5 µg variant elsewhere). Two uses: force a web-search parse so the numbers
// come from the real label, and keep those numbers away from USDA enrichment
// (FDC indexes foods, not supplement labels).
export const SUPPLEMENT_REF =
  /\b(tablet|capsule|caplet|kapsel|tablett|gélule|capsula|comprimé|gumm(?:y|ies)|effervescent|supplement|multivitamin|prenatal|nac|probiotic|omega-3|fish oil|protein (?:powder|shake|bar)|energy bar|granola bar|meal replacement|electrolyte|creatine|collagen)\b/i;

// Whether a single parsed component is a labeled product. Applied per item so a
// mixed meal ("granola bar, banana and greek yogurt") still gets USDA data for
// its ordinary foods — only the bar keeps its label values.
export function isLabeledProduct(name: string | null | undefined): boolean {
  return name != null && SUPPLEMENT_REF.test(name);
}
