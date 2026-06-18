import { describe, it, expect } from "vitest";
import { pickProduceKind, isBirthdayMonth } from "@/lib/produce";

describe("pickProduceKind", () => {
  it("defaults to the bowl when nothing was logged", () => {
    expect(pickProduceKind([])).toBe("bowl");
  });

  it("defaults to the bowl when no logged plant has a motif", () => {
    expect(pickProduceKind(["spinach", "kale", "lettuce"])).toBe("bowl");
  });

  it("picks the most-logged produce", () => {
    expect(pickProduceKind(["apple", "carrot", "apple"])).toBe("apple");
  });

  it("maps synonyms to a shared motif (citrus)", () => {
    expect(pickProduceKind(["lemon"])).toBe("citrus");
    expect(pickProduceKind(["orange", "grapefruit", "orange"])).toBe("citrus");
  });

  it("de-pluralizes (apples → apple)", () => {
    expect(pickProduceKind(["apples"])).toBe("apple");
  });

  it("breaks ties toward the most recent (input is most-recent-first)", () => {
    // One each → tie; carrot appears first (most recent) so it wins.
    expect(pickProduceKind(["carrot", "apple"])).toBe("carrot");
    expect(pickProduceKind(["apple", "carrot"])).toBe("apple");
  });

  it("ignores unmapped plants when tallying", () => {
    expect(pickProduceKind(["kale", "tomato", "kale"])).toBe("tomato");
  });

  it("maps grains to their motifs", () => {
    expect(pickProduceKind(["rice"])).toBe("rice");
    expect(pickProduceKind(["maize"])).toBe("corn");
    expect(pickProduceKind(["oat"])).toBe("wheat");
  });
});

describe("isBirthdayMonth", () => {
  it("is true within the birth month", () => {
    expect(isBirthdayMonth("1990-06-15", "2026-06-18")).toBe(true);
    expect(isBirthdayMonth("1990-06-01", "2026-06-30")).toBe(true);
  });
  it("is false outside the birth month", () => {
    expect(isBirthdayMonth("1990-06-15", "2026-07-01")).toBe(false);
    expect(isBirthdayMonth("1990-12-25", "2026-01-01")).toBe(false);
  });
  it("is false for missing/short dates", () => {
    expect(isBirthdayMonth(null, "2026-06-18")).toBe(false);
    expect(isBirthdayMonth("1990", "2026-06-18")).toBe(false);
  });
});
