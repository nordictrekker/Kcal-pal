// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const syncLocation = vi.fn();
const rejectLocation = vi.fn();
vi.mock("@/app/today/location-actions", () => ({
  syncLocation: () => syncLocation(),
  confirmTravel: vi.fn(),
  dismissTravel: vi.fn(),
  rejectLocation: () => rejectLocation(),
}));

import { LocationSync } from "@/app/today/location-sync";

beforeEach(() => {
  syncLocation.mockReset();
  rejectLocation.mockReset();
});

describe("LocationSync travel prompt", () => {
  it("offers three options; 'That's wrong' rejects the reading and dismisses", async () => {
    syncLocation.mockResolvedValue({
      ok: true,
      prompt: { label: "Inglewood", kind: "jetlag", hours: 9, direction: "west", distanceKm: 9000 },
    });
    rejectLocation.mockResolvedValue({ ok: true });

    render(<LocationSync />);

    expect(await screen.findByText(/seem to be in Inglewood/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes, i'm traveling/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no, this is home/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /that's wrong/i }));

    expect(rejectLocation).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/seem to be in Inglewood/i)).toBeNull();
  });
});
