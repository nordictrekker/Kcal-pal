"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { HomeBaseSearch } from "@/components/home-base-search";
import type { CityResult } from "@/lib/geocode";
import { completeOnboarding, type OnboardingPayload } from "./actions";

export type WizardPrefill = {
  first_name: string;
  date_of_birth: string;
  sex: "female" | "male" | "other";
  height_in: number | null;
  weight_lbs: number | null;
  activity_level: string;
  goal: "lose" | "maintain" | "gain" | "muscle";
  body_build: string | null;
  goal_weight_lbs: number | null;
  target_mode: "auto" | "manual";
  track_cycle: boolean;
  last_period_start: string | null;
  avg_cycle_length: number;
  avg_period_length: number;
};

const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "Sedentary", hint: "Mostly sitting" },
  { value: "light", label: "Light", hint: "Light activity 1–2×/wk" },
  { value: "moderate", label: "Moderate", hint: "Active 3–4×/wk" },
  { value: "active", label: "Active", hint: "Active 5–6×/wk" },
  { value: "very_active", label: "Very active", hint: "Daily training" },
];

const GOAL_OPTIONS = [
  { value: "lose", label: "Lose", hint: "Gentle deficit" },
  { value: "maintain", label: "Maintain", hint: "Hold steady" },
  { value: "gain", label: "Gain", hint: "Build slowly" },
  { value: "muscle", label: "Build muscle", hint: "Lean surplus" },
];

const BUILD_OPTIONS = [
  { value: "lean", label: "Lean", hint: "" },
  { value: "average", label: "Average", hint: "" },
  { value: "muscular", label: "Muscular", hint: "" },
  { value: "higher_fat", label: "Softer", hint: "" },
];

function OptionGrid({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string; hint?: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors",
            o.value === value
              ? "border-primary bg-primary/10"
              : "hover:bg-accent",
          )}
        >
          <span className="text-sm font-medium">{o.label}</span>
          {o.hint ? (
            <span className="text-xs text-muted-foreground">{o.hint}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function OnboardingWizard({ prefill }: { prefill: WizardPrefill }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [firstName, setFirstName] = useState(prefill.first_name);
  const [dob, setDob] = useState(prefill.date_of_birth);
  const [sex, setSex] = useState<WizardPrefill["sex"]>(prefill.sex);
  const [feet, setFeet] = useState(
    prefill.height_in ? String(Math.floor(prefill.height_in / 12)) : "",
  );
  const [inches, setInches] = useState(
    prefill.height_in ? String(prefill.height_in % 12) : "",
  );
  const [weight, setWeight] = useState(
    prefill.weight_lbs ? String(prefill.weight_lbs) : "",
  );
  const [activity, setActivity] = useState(prefill.activity_level);
  const [goal, setGoal] = useState<WizardPrefill["goal"]>(prefill.goal);
  const [bodyBuild, setBodyBuild] = useState<string>(prefill.body_build ?? "average");
  const [goalWeight, setGoalWeight] = useState(
    prefill.goal_weight_lbs ? String(prefill.goal_weight_lbs) : "",
  );
  const [targetMode, setTargetMode] = useState<WizardPrefill["target_mode"]>(
    prefill.target_mode,
  );
  const [trackCycle, setTrackCycle] = useState(prefill.track_cycle);
  const [periodStart, setPeriodStart] = useState(
    prefill.last_period_start ?? "",
  );
  const [cycleLen, setCycleLen] = useState(String(prefill.avg_cycle_length));
  const [periodLen, setPeriodLen] = useState(String(prefill.avg_period_length));
  const [home, setHome] = useState<CityResult | null>(null);

  const heightIn =
    (Number(feet) || 0) * 12 + (Number(inches) || 0);

  // Steps array: cycle step is dropped if the user isn't tracking.
  const steps: Array<{ title: string; subtitle: string; valid: boolean; body: React.ReactNode }> = [
    {
      title: "Welcome",
      subtitle: "Let's personalize kcal pal. First — what should we call you?",
      valid: firstName.trim().length > 0,
      body: (
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Your first name"
            autoFocus
          />
        </div>
      ),
    },
    {
      title: "About you",
      subtitle: "Used to estimate your metabolism accurately.",
      valid: Boolean(dob) && Boolean(sex),
      body: (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Sex (for metabolic math)</Label>
            <OptionGrid
              options={[
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
                { value: "other", label: "Prefer not to say" },
              ]}
              value={sex}
              onChange={(v) => setSex(v as WizardPrefill["sex"])}
            />
          </div>
        </div>
      ),
    },
    {
      title: "Body",
      subtitle: "Height and current weight.",
      valid: heightIn >= 36 && Number(weight) >= 50,
      body: (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Height</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                value={feet}
                onChange={(e) => setFeet(e.target.value)}
                placeholder="5"
                className="tabular-nums"
              />
              <span className="text-sm text-muted-foreground">ft</span>
              <Input
                type="number"
                inputMode="numeric"
                value={inches}
                onChange={(e) => setInches(e.target.value)}
                placeholder="6"
                className="tabular-nums"
              />
              <span className="text-sm text-muted-foreground">in</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight">Current weight</Label>
            <div className="flex items-center gap-2">
              <Input
                id="weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="150"
                className="max-w-[140px] tabular-nums"
              />
              <span className="text-sm text-muted-foreground">lb</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Movement",
      subtitle:
        "A starting point — if you wear an Oura ring, we'll refine this automatically from your real daily burn.",
      valid: Boolean(activity),
      body: (
        <OptionGrid
          options={ACTIVITY_OPTIONS}
          value={activity}
          onChange={setActivity}
        />
      ),
    },
    {
      title: "Goal",
      subtitle: "Targets adjust to match.",
      valid: Boolean(goal),
      body: (
        <div className="space-y-4">
          <OptionGrid
            options={GOAL_OPTIONS}
            value={goal}
            onChange={(v) => setGoal(v as WizardPrefill["goal"])}
          />
          <div className="space-y-2">
            <Label>How would you describe your build?</Label>
            <OptionGrid
              options={BUILD_OPTIONS}
              value={bodyBuild}
              onChange={setBodyBuild}
            />
            <p className="text-xs text-muted-foreground">
              Protein need tracks lean mass, not just weight — this tunes your
              protein target.
            </p>
          </div>
          {goal !== "maintain" ? (
            <div className="space-y-2 rounded-lg border p-3">
              <Label htmlFor="goalWeight">Goal weight (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="goalWeight"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={goalWeight}
                  onChange={(e) => setGoalWeight(e.target.value)}
                  placeholder="lb"
                  className="max-w-[140px] tabular-nums"
                />
                <span className="text-sm text-muted-foreground">lb</span>
              </div>
              <p className="text-xs text-muted-foreground">
                We&apos;ll project an ETA from your weight trend as data builds up.
              </p>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: "Targets",
      subtitle: "How should we set your daily numbers?",
      valid: Boolean(targetMode),
      body: (
        <OptionGrid
          options={[
            {
              value: "auto",
              label: "Automatic (recommended)",
              hint: "From your stats + Oura",
            },
            { value: "manual", label: "I'll set them myself", hint: "Fixed" },
          ]}
          value={targetMode}
          onChange={(v) => setTargetMode(v as WizardPrefill["target_mode"])}
        />
      ),
    },
    {
      title: "Home base",
      subtitle:
        "Where are you normally based? Used only to spot travel and jet lag — set it even if you're abroad right now.",
      valid: true,
      body: (
        <div className="space-y-3">
          <HomeBaseSearch onSelect={setHome} />
          {home ? (
            <p className="rounded-lg border bg-primary/10 px-3 py-2 text-sm">
              Home base: <span className="font-medium">{home.label}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Optional — you can skip this and we&apos;ll set it from your
              location, or change it later in Settings.
            </p>
          )}
        </div>
      ),
    },
    {
      title: "Cycle",
      subtitle:
        "kcal pal can shift your targets and insights across your cycle, and auto-track it from Apple Health.",
      valid: true,
      body: (
        <div className="space-y-4">
          <OptionGrid
            options={[
              { value: "yes", label: "Track my cycle", hint: "Phase-aware" },
              { value: "no", label: "Not now", hint: "" },
            ]}
            value={trackCycle ? "yes" : "no"}
            onChange={(v) => setTrackCycle(v === "yes")}
          />
          {trackCycle ? (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label htmlFor="periodStart">
                  First day of your last period
                </Label>
                <Input
                  id="periodStart"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  We&apos;ll keep this current automatically once you log flow
                  in Apple Health.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cycleLen">Cycle length</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="cycleLen"
                      type="number"
                      inputMode="numeric"
                      value={cycleLen}
                      onChange={(e) => setCycleLen(e.target.value)}
                      className="tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodLen">Period length</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="periodLen"
                      type="number"
                      inputMode="numeric"
                      value={periodLen}
                      onChange={(e) => setPeriodLen(e.target.value)}
                      className="tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ),
    },
  ];

  // Male profiles skip the cycle step entirely — period tracking and
  // phase-aware nutrition don't apply.
  const visibleSteps =
    sex === "male" ? steps.filter((st) => st.title !== "Cycle") : steps;
  const current = visibleSteps[Math.min(step, visibleSteps.length - 1)];
  const isLast = step >= visibleSteps.length - 1;

  function next() {
    setError(null);
    if (!current.valid) return;
    if (isLast) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function finish() {
    const goalWeightNum = Number(goalWeight);
    const payload: OnboardingPayload = {
      first_name: firstName.trim(),
      date_of_birth: dob,
      sex,
      height_in: heightIn,
      weight_lbs: Number(weight),
      activity_level: activity,
      goal,
      goal_weight_lbs:
        goal !== "maintain" && goalWeight && Number.isFinite(goalWeightNum)
          ? goalWeightNum
          : null,
      target_mode: targetMode,
      body_build: bodyBuild,
      track_cycle: sex === "male" ? false : trackCycle,
      last_period_start:
        sex !== "male" && trackCycle && periodStart ? periodStart : null,
      avg_cycle_length: Number(cycleLen) || 28,
      avg_period_length: Number(periodLen) || 5,
      home: home
        ? { label: home.label, tz: home.tz, lat: home.lat, lng: home.lng }
        : null,
    };
    start(async () => {
      const r = await completeOnboarding(payload);
      if (!r.ok) {
        setError(r.error ?? "Something went wrong.");
        return;
      }
      router.push("/today");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Progress dots */}
      <div className="flex justify-center gap-1.5">
        {steps.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === step ? "w-6 bg-primary" : "w-1.5 bg-muted",
            )}
          />
        ))}
      </div>

      <div className="space-y-1">
        <h1 className="font-serif text-3xl font-medium leading-tight">
          {current.title}
        </h1>
        <p className="text-sm text-muted-foreground">{current.subtitle}</p>
      </div>

      <div className="min-h-[180px]">{current.body}</div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={back}
          disabled={step === 0 || pending}
        >
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={next}
          disabled={!current.valid || pending}
          className="min-w-[120px]"
        >
          {pending ? (
            "Saving…"
          ) : isLast ? (
            <>
              <Check className="size-4" />
              Finish
            </>
          ) : (
            <>
              Next
              <ChevronRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
