// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryPanels } from "@/app/today/summary/summary-panels";
import type { Totals } from "@/lib/food";
import type { ContribEntry } from "@/lib/contributions";

const todayTotals: Totals = {
  calories: 2000, protein_g: 100, carbs_g: 200, fat_g: 60, fiber_g: 20, iron_mg: 5,
};
const todayTargets: Totals = {
  calories: 2200, protein_g: 130, carbs_g: 220, fat_g: 70, fiber_g: 30,
};
const weekTotals: Totals = {
  calories: 1500, protein_g: 90, carbs_g: 150, fat_g: 50, fiber_g: 18, iron_mg: 4,
};
const weekTargets: Totals = {
  calories: 1800, protein_g: 125, carbs_g: 210, fat_g: 68, fiber_g: 29,
};
const contrib: ContribEntry[] = [
  { id: "a", label: "Greek yogurt", meal: "breakfast", values: { protein_g: 17, iron_mg: 1 } },
];

function renderPanels() {
  return render(
    <SummaryPanels
      macroKeys={["protein"]}
      microKeys={["iron"]}
      today={{ totals: todayTotals, targets: todayTargets, contribEntries: contrib }}
      week={{ totals: weekTotals, targets: weekTargets, contribEntries: contrib, daysLogged: 5 }}
      notes={{ phaseAdjustment: null, targetNote: null, recoveryNote: null, balanceNote: null }}
      weeklyExtras={<div>PLANTS</div>}
      weekInsight={<div>INSIGHT</div>}
      dayChildren={<div>DAYLOG</div>}
    />,
  );
}

describe("SummaryPanels — Today ⇄ 7-day toggle", () => {
  it("starts on Today: shows the day log, hides the weekly insight", () => {
    renderPanels();
    expect(screen.getByText("DAYLOG")).toBeInTheDocument();
    expect(screen.queryByText("INSIGHT")).toBeNull();
    expect(screen.getByText("PLANTS")).toBeInTheDocument(); // weekly extras always shown
    expect(screen.queryByText(/of 7 days logged/i)).toBeNull();
    // Today headline uses today's calorie target and the plain kcal label.
    expect(screen.getByText(/of\s+2200\s+kcal$/)).toBeInTheDocument();
    expect(screen.queryByText(/kcal\/day/)).toBeNull();
  });

  it("switching to 7-day average swaps the dataset, insight, and hides the day log", async () => {
    renderPanels();
    await userEvent.click(screen.getByRole("button", { name: "7-day average" }));

    expect(screen.getByText("INSIGHT")).toBeInTheDocument();
    expect(screen.queryByText("DAYLOG")).toBeNull();
    expect(screen.getByText(/5 of 7 days logged/i)).toBeInTheDocument();
    // Calorie headline switches to the week's avg target + per-day label.
    expect(screen.getByText(/of\s+1800\s+kcal\/day/)).toBeInTheDocument();
    // Plants (a weekly metric) stays visible across both modes.
    expect(screen.getByText("PLANTS")).toBeInTheDocument();
  });
});
