"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { searchHomeCities } from "@/app/today/location-actions";
import type { CityResult } from "@/lib/geocode";
import { Input } from "@/components/ui/input";

// Debounced city typeahead. Calls onSelect with the chosen city; the caller
// decides whether to store it immediately (Settings) or hold it (onboarding).
export function HomeBaseSearch({
  onSelect,
  disabled,
  placeholder = "Search for a city…",
}: {
  onSelect: (city: CityResult) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CityResult[]>([]);
  const [touched, setTouched] = useState(false);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      startSearch(async () => setResults(await searchHomeCities(q)));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          disabled={disabled}
          onChange={(e) => {
            setQ(e.target.value);
            setTouched(true);
          }}
          placeholder={placeholder}
          className="pl-8"
        />
      </div>
      {results.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-md border">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onSelect(c);
                  setQ("");
                  setResults([]);
                  setTouched(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      ) : touched && q.trim().length >= 2 && !searching ? (
        <p className="text-[11px] text-muted-foreground">No matches.</p>
      ) : null}
    </div>
  );
}
