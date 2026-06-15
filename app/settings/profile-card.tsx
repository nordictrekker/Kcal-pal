"use client";

import { useState, useTransition } from "react";
import { UserCog } from "lucide-react";
import { updateProfileSettings, type ProfileResult } from "./profile-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProfileSettings = {
  first_name: string;
  date_of_birth: string;
  sex: string;
  height_in: number | null;
  activity_level: string;
  goal: string;
  goal_weight_lbs: number | null;
  target_mode: string;
  track_cycle: boolean;
  last_period_start: string;
  avg_cycle_length: number;
  avg_period_length: number;
};

const ACTIVITY: Array<[string, string]> = [
  ["sedentary", "Sedentary"],
  ["light", "Light"],
  ["moderate", "Moderate"],
  ["active", "Active"],
  ["very_active", "Very active"],
];

function Select({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: Array<[string, string]>;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function ProfileCard({ initial }: { initial: ProfileSettings }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [trackCycle, setTrackCycle] = useState(initial.track_cycle);
  const [mode, setMode] = useState(initial.target_mode);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("track_cycle", trackCycle ? "true" : "false");
    setResult(null);
    start(async () => setResult(await updateProfileSettings(fd)));
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-2">
          <UserCog className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Body &amp; goals</span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="first_name" className="text-xs text-muted-foreground">
                Name
              </Label>
              <Input
                id="first_name"
                name="first_name"
                defaultValue={initial.first_name}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="date_of_birth" className="text-xs text-muted-foreground">
                Birth date
              </Label>
              <Input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                defaultValue={initial.date_of_birth}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sex</Label>
              <Select
                name="sex"
                defaultValue={initial.sex}
                options={[
                  ["female", "Female"],
                  ["male", "Male"],
                  ["other", "Prefer not to say"],
                ]}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="height_in" className="text-xs text-muted-foreground">
                Height (in)
              </Label>
              <Input
                id="height_in"
                name="height_in"
                type="number"
                inputMode="numeric"
                defaultValue={initial.height_in ?? ""}
                className="h-9 tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Activity</Label>
              <Select
                name="activity_level"
                defaultValue={initial.activity_level}
                options={ACTIVITY}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Goal</Label>
              <Select
                name="goal"
                defaultValue={initial.goal}
                options={[
                  ["lose", "Lose"],
                  ["maintain", "Maintain"],
                  ["gain", "Gain"],
                ]}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="goal_weight_lbs" className="text-xs text-muted-foreground">
                Goal weight (lb)
              </Label>
              <Input
                id="goal_weight_lbs"
                name="goal_weight_lbs"
                type="number"
                inputMode="decimal"
                step="0.5"
                defaultValue={initial.goal_weight_lbs ?? ""}
                className="h-9 tabular-nums"
                placeholder="optional"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="target_mode" className="text-xs text-muted-foreground">
              Target mode
            </Label>
            <select
              id="target_mode"
              name="target_mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              <option value="auto">Automatic (stats + Oura)</option>
              <option value="manual">Manual (set numbers below)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {mode === "auto"
                ? "Daily targets are computed from your stats and recent Oura burn."
                : "Daily targets come from the numbers in the card below."}
            </p>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-center justify-between text-sm">
              <span className="font-medium">Track my cycle</span>
              <input
                type="checkbox"
                checked={trackCycle}
                onChange={(e) => setTrackCycle(e.target.checked)}
                className="size-4"
              />
            </label>
            {trackCycle ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label
                    htmlFor="last_period_start"
                    className="text-xs text-muted-foreground"
                  >
                    Last period start
                  </Label>
                  <Input
                    id="last_period_start"
                    name="last_period_start"
                    type="date"
                    defaultValue={initial.last_period_start}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="avg_cycle_length"
                    className="text-xs text-muted-foreground"
                  >
                    Cycle (days)
                  </Label>
                  <Input
                    id="avg_cycle_length"
                    name="avg_cycle_length"
                    type="number"
                    inputMode="numeric"
                    defaultValue={initial.avg_cycle_length}
                    className="h-9 tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="avg_period_length"
                    className="text-xs text-muted-foreground"
                  >
                    Period (days)
                  </Label>
                  <Input
                    id="avg_period_length"
                    name="avg_period_length"
                    type="number"
                    inputMode="numeric"
                    defaultValue={initial.avg_period_length}
                    className="h-9 tabular-nums"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            {result?.ok ? (
              <span className="text-xs text-muted-foreground">Saved.</span>
            ) : null}
            {result?.error ? (
              <span className="text-xs text-destructive">{result.error}</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
