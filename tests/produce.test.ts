import { describe, it, expect } from "vitest";
import { pickProduceKind } from "@/lib/produce";

describe("pickProduceKind", () => {
  it("defaults to the bowl when nothing was logged", () => {
    expect(pickProduceKind([])).toBe("bowl");
  });

  it("defaults to the bowl when no logged plant has a motif", () => {
    expect(pickProduceKind(["spinach", "kale", "oat"])).toBe("bowl");
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
});
