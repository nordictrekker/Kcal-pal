// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/settings/metrics-actions", () => ({
  updateVisibleMetrics: vi.fn(async () => ({ ok: true })),
}));

import { MetricsCard } from "@/app/settings/metrics-card";

describe("MetricsCard — LDL impact group", () => {
  it("one tap adds saturated fat, trans fat, and cholesterol together", async () => {
    render(<MetricsCard initial={[]} />);

    const addAll = screen.getByRole("button", { name: /add all/i });
    await userEvent.click(addAll);

    for (const label of ["Saturated fat", "Trans fat", "Cholesterol"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    // The group control flips to "Added".
    expect(screen.getByRole("button", { name: /added/i })).toBeInTheDocument();
  });
});
