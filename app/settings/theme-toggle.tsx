"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme | null) ?? "system";
    setTheme(stored);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    localStorage.setItem("theme", next);
    apply(next);
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <span className="text-sm font-medium">Appearance</span>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-xs transition-colors",
                theme === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
