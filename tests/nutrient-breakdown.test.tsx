// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NutrientBreakdown } from "@/app/today/nutrient-breakdown";
import type { ContribEntry } from "@/lib/contributions";

const entries: ContribEntry[] = [
  { id: "a", label: "Greek yogurt", meal: "breakfast", values: { iron_mg: 1 } },
  { id: "b", label: "Spinach", meal: "lunch", values: { iron_mg: 3 } },
];

function renderIron(weekly = false) {
  return render(
    <NutrientBreakdown
      label="Iron"
      value={4}
      target={18}
      unit="mg"
      kind="goal"
      colorVar="--primary"
      field="iron_mg"
      entries={entries}
      weekly={weekly}
    />,
  );
}

describe("NutrientBreakdown (interaction)", () => {
  it("expands to reveal contributors and toggles to the exact-amount table", async () => {
    renderIron();
    // Collapsed: no breakdown yet.
    expect(screen.queryByText(/what contributed to iron/i)).toBeNull();

    await userEvent.click(screen.getByRole("button", { expanded: false }));

    // Expanded: both contributing foods are listed.
    expect(screen.getByText(/what contributed to iron/i)).toBeInTheDocument();
    expect(screen.getByText("Spinach")).toBeInTheDocument();
    expect(screen.getByText("Greek yogurt")).toBeInTheDocument();

    // Default pie view shows percentages; switch to exact amounts.
    await userEvent.click(screen.getByLabelText("Exact amounts"));
    expect(screen.getByText("3mg")).toBeInTheDocument(); // spinach iron
    expect(screen.getByText("4mg")).toBeInTheDocument(); // total
  });

  it("weekly mode is table-only (no pie/table switch) with 'this week' copy", async () => {
    renderIron(true);
    await userEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText(/what contributed to iron this week/i)).toBeInTheDocument();
    // The pie/table view switch is hidden in weekly mode.
    expect(screen.queryByLabelText("Percentage pie")).toBeNull();
    expect(screen.queryByLabelText("Exact amounts")).toBeNull();
  });
});
