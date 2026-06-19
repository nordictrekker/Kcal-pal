// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Replace the server action so no server-only code loads in jsdom.
const regenerate = vi.fn();
vi.mock("@/app/today/summary/insight-actions", () => ({
  regenerateFoodInsight: () => regenerate(),
}));

import { FoodInsightCard } from "@/app/today/summary/insight-card";

beforeEach(() => regenerate.mockReset());

describe("FoodInsightCard (generate flow)", () => {
  it("empty state prompts to Generate, then renders the produced summary", async () => {
    regenerate.mockResolvedValue({
      status: "ready",
      summary: "Your standout food this week was Greek yogurt.",
      generatedAt: new Date().toISOString(),
    });

    render(<FoodInsightCard initial={{ status: "empty" }} />);
    expect(screen.getByText(/tap generate/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(
      await screen.findByText(/standout food this week was Greek yogurt/i),
    ).toBeInTheDocument();
    // Once there's content the control becomes "Refresh".
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error from the action", async () => {
    regenerate.mockResolvedValue({
      status: "error",
      error: "No food logged in the last 7 days yet.",
    });

    render(<FoodInsightCard initial={{ status: "empty" }} />);
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    expect(
      await screen.findByText(/no food logged in the last 7 days/i),
    ).toBeInTheDocument();
  });
});
