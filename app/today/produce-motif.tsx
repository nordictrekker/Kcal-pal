"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ProduceKind } from "@/lib/produce";

// Signature header motif. Shows "this week's produce" (chosen from the user's
// logged whole foods) growing and ripening with today's calorie %, inside a
// progress orbit. Falls back to a steaming bowl that fills. Reduced motion →
// final state, no animation. Monochrome (currentColor) so it inherits the
// theme's primary tone; the ripe fill is the same colour at low opacity.

const ORBIT = { cx: 100, cy: 104, r: 82 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));

// ── Growing produce (scales up from the base + ripens; some reveal seeds) ──
type GrowSpec = {
  body: string;
  anchor: [number, number];
  ripenFrom: number;
  crown?: string[];
  details?: string[];
  circles?: [number, number, number][];
  seeds?: [number, number][];
};

const GROW: Record<string, GrowSpec> = {
  apple: {
    body: "M 100 78 C 92 66 74 64 66 82 C 58 102 70 138 90 144 C 96 146 104 146 110 144 C 130 138 142 102 134 82 C 126 64 108 66 100 78 Z",
    anchor: [100, 144],
    ripenFrom: 0.2,
    crown: [
      "M 100 70 C 101 60 103 56 108 52",
      "M 104 60 C 116 54 126 58 126 68 C 116 72 107 68 104 60 Z",
    ],
  },
  avocado: {
    body: "M 100 52 C 85 52 79 70 81 88 C 69 102 65 126 80 142 C 92 154 108 154 120 142 C 135 126 131 102 119 88 C 121 70 115 52 100 52 Z",
    anchor: [100, 148],
    ripenFrom: 0.2,
    circles: [[100, 116, 17]],
  },
  carrot: {
    body: "M 82 86 L 118 86 L 103 156 C 100 162 100 162 97 156 Z",
    anchor: [100, 156],
    ripenFrom: 0.15,
    crown: [
      "M 100 86 C 98 70 92 58 84 50",
      "M 100 86 C 100 68 100 56 100 46",
      "M 100 86 C 102 70 108 58 116 50",
    ],
    details: ["M 88 104 L 96 104", "M 92 122 L 100 122", "M 96 140 L 102 140"],
  },
  strawberry: {
    body: "M 100 74 C 74 66 58 82 60 102 C 62 124 84 146 100 153 C 116 146 138 124 140 102 C 142 82 126 66 100 74 Z",
    anchor: [100, 153],
    ripenFrom: 0.1,
    crown: [
      "M 100 74 L 100 58",
      "M 100 66 C 88 58 78 60 74 68 C 84 74 95 72 100 68",
      "M 100 66 C 112 58 122 60 126 68 C 116 74 105 72 100 68",
    ],
    seeds: [
      [84, 98], [100, 94], [116, 98], [78, 116],
      [100, 112], [122, 116], [92, 132], [108, 132],
    ],
  },
  tomato: {
    body: "M 100 78 C 72 78 58 98 60 118 C 62 140 80 152 100 152 C 120 152 138 140 140 118 C 142 98 128 78 100 78 Z",
    anchor: [100, 152],
    ripenFrom: 0.2,
    crown: [
      "M 100 80 L 100 64", "M 100 80 L 84 70", "M 100 80 L 116 70",
      "M 100 80 L 78 84", "M 100 80 L 122 84",
    ],
  },
};

function Orbit({ p, dur }: { p: number; dur: number }) {
  return (
    <motion.circle
      cx={ORBIT.cx}
      cy={ORBIT.cy}
      r={ORBIT.r}
      stroke="currentColor"
      strokeOpacity="0.28"
      strokeWidth="4"
      strokeLinecap="round"
      fill="none"
      transform={`rotate(-90 ${ORBIT.cx} ${ORBIT.cy})`}
      initial={{ pathLength: 0 }}
      animate={{ pathLength: p }}
      transition={{ duration: dur, ease: "easeOut" }}
    />
  );
}

function GrowProduce({
  spec,
  p,
  reduce,
  dur,
}: {
  spec: GrowSpec;
  p: number;
  reduce: boolean;
  dur: number;
}) {
  const scale = 0.3 + 0.7 * p;
  const ripen = clamp((p - spec.ripenFrom) / (1 - spec.ripenFrom)) * 0.45;
  return (
    <motion.g
      style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
      initial={{ scale: reduce ? scale : 0.22, opacity: reduce ? 1 : 0 }}
      animate={{ scale, opacity: 1 }}
      transition={{ duration: dur, ease: "easeOut" }}
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <motion.path
        d={spec.body}
        fill="currentColor"
        initial={{ fillOpacity: reduce ? ripen : 0 }}
        animate={{ fillOpacity: ripen }}
        transition={{ duration: dur, ease: "easeOut" }}
      />
      {spec.details?.map((d, i) => <path key={`d${i}`} d={d} strokeWidth="3" />)}
      {spec.circles?.map(([cx, cy, r], i) => (
        <circle key={`c${i}`} cx={cx} cy={cy} r={r} />
      ))}
      {spec.crown?.map((d, i) => <path key={`k${i}`} d={d} />)}
      {spec.seeds?.map(([cx, cy], i) => {
        const on = p >= spec.ripenFrom + (i + 1) * 0.07;
        return (
          <motion.path
            key={`s${i}`}
            d={`M ${cx} ${cy - 3} L ${cx} ${cy + 3}`}
            strokeWidth="3"
            initial={{ opacity: reduce ? (on ? 1 : 0) : 0 }}
            animate={{ opacity: on ? 1 : 0 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.5 + i * 0.06 }}
          />
        );
      })}
    </motion.g>
  );
}

const GRAPES: [number, number][] = [
  [64, 84], [86, 84], [108, 84], [130, 84], [75, 102],
  [97, 102], [119, 102], [86, 120], [108, 120], [97, 138],
];

function Grapes({ p, reduce }: { p: number; reduce: boolean }) {
  return (
    <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 97 84 C 96 74 98 68 102 62" />
      <path d="M 100 70 C 112 62 124 66 126 76 C 114 82 104 78 100 70 Z" />
      {GRAPES.map(([cx, cy], i) => {
        const on = p >= i / (GRAPES.length + 0.5);
        return (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r="11"
            strokeWidth="4.5"
            fill="currentColor"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ scale: reduce ? (on ? 1 : 0) : 0, fillOpacity: 0.4 }}
            animate={{ scale: on ? 1 : 0, fillOpacity: on ? 0.4 : 0 }}
            transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.4 + i * 0.07, ease: "backOut" }}
          />
        );
      })}
    </g>
  );
}

function Citrus({ p, reduce }: { p: number; reduce: boolean }) {
  const { cx, cy } = ORBIT;
  const r = 46;
  const N = 8;
  const pt = (i: number) => {
    const a = ((-90 + i * (360 / N)) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  return (
    <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      {Array.from({ length: N }, (_, i) => {
        const [x0, y0] = pt(i);
        const [x1, y1] = pt(i + 1);
        const on = p > i / N;
        return (
          <motion.path
            key={`w${i}`}
            d={`M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`}
            fill="currentColor"
            stroke="none"
            initial={{ fillOpacity: reduce ? (on ? 0.45 : 0) : 0 }}
            animate={{ fillOpacity: on ? 0.45 : 0 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : i * 0.09 }}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r} />
      {Array.from({ length: N }, (_, i) => {
        const [x, y] = pt(i);
        return <path key={`g${i}`} d={`M ${cx} ${cy} L ${x.toFixed(1)} ${y.toFixed(1)}`} />;
      })}
    </g>
  );
}

function Bowl({ p, reduce, dur }: { p: number; reduce: boolean; dur: number }) {
  const top = 86;
  const bottom = 146;
  const level = bottom - (bottom - top) * p;
  return (
    <>
      <defs>
        <clipPath id="bowl-clip">
          <path d="M 42 86 C 46 120 72 146 100 146 C 128 146 154 120 158 86 A 58 12 0 0 1 42 86 Z" />
        </clipPath>
      </defs>
      <motion.rect
        x="40"
        width="120"
        fill="currentColor"
        fillOpacity="0.4"
        clipPath="url(#bowl-clip)"
        initial={{ y: reduce ? level : bottom, height: reduce ? bottom - level : 0 }}
        animate={{ y: level, height: bottom - level }}
        transition={{ duration: dur, ease: "easeOut" }}
      />
      {p >= 0.999 ? (
        <g fill="none" stroke="currentColor" strokeWidth="3.5" strokeOpacity="0.6" strokeLinecap="round">
          <path d="M 84 66 C 80 59 89 55 85 48" />
          <path d="M 100 64 C 96 57 105 53 101 46" />
          <path d="M 116 66 C 112 59 121 55 117 48" />
        </g>
      ) : null}
      <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="100" cy="86" rx="58" ry="12" />
        <path d="M 42 86 C 46 120 72 146 100 146 C 128 146 154 120 158 86" />
      </g>
    </>
  );
}

export function ProduceMotif({
  kind,
  progress,
  className,
}: {
  kind: ProduceKind;
  progress: number;
  className?: string;
}) {
  const p = clamp(progress);
  const reduce = useReducedMotion() ?? false;
  const dur = reduce ? 0 : 1.2;

  return (
    <svg viewBox="0 0 200 200" className={className} fill="none" aria-hidden>
      <Orbit p={p} dur={dur} />
      {kind === "bowl" ? (
        <Bowl p={p} reduce={reduce} dur={dur} />
      ) : kind === "grapes" ? (
        <Grapes p={p} reduce={reduce} />
      ) : kind === "citrus" ? (
        <Citrus p={p} reduce={reduce} />
      ) : (
        <GrowProduce spec={GROW[kind]} p={p} reduce={reduce} dur={dur} />
      )}
    </svg>
  );
}
