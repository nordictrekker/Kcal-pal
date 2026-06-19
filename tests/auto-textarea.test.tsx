// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoTextarea } from "@/components/ui/auto-textarea";

function Controlled() {
  const [v, setV] = useState("");
  return (
    <AutoTextarea
      aria-label="desc"
      value={v}
      onChange={(e) => setV(e.target.value)}
    />
  );
}

describe("AutoTextarea", () => {
  it("is controlled and reflects typed input", async () => {
    render(<Controlled />);
    const ta = screen.getByLabelText("desc") as HTMLTextAreaElement;
    await userEvent.type(ta, "chicken burrito, no rice");
    expect(ta.value).toBe("chicken burrito, no rice");
  });

  it("runs its auto-grow handler on input (sets an inline pixel height)", async () => {
    render(<Controlled />);
    const ta = screen.getByLabelText("desc") as HTMLTextAreaElement;
    await userEvent.type(ta, "a\nb\nc");
    expect(ta.style.height).toMatch(/px$/);
  });
});
