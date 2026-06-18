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
  fill?: boolean;
  crown?: string[];
  details?: string[];
  circles?: [number, number, number][];
  seeds?: [number, number][];
};

// Wheat kernels (paired, up the stalk) + awns, built once.
const WHEAT_CROWN: string[] = (() => {
  const out: string[] = [];
  for (const y of [70, 86, 102, 118, 134]) {
    out.push(
      `M 100 ${y} C 88 ${y - 2} 82 ${y - 10} 82 ${y - 18} C 92 ${y - 16} 99 ${y - 9} 100 ${y - 2} Z`,
      `M 100 ${y} C 112 ${y - 2} 118 ${y - 10} 118 ${y - 18} C 108 ${y - 16} 101 ${y - 9} 100 ${y - 2} Z`,
    );
  }
  out.push("M 100 64 L 100 50", "M 100 60 L 90 48", "M 100 60 L 110 48");
  return out;
})();

const GROW: Record<string, GrowSpec> = {
  // Apple with a bite taken from the right side.
  apple: {
    body: "M 100 78 C 92 66 74 64 66 82 C 58 102 70 138 90 144 C 96 146 104 146 110 144 C 120 141 128 130 133 117 C 124 116 117 109 117 100 C 117 91 124 84 133 83 C 132 71 110 66 100 78 Z",
    anchor: [100, 144],
    ripenFrom: 0.2,
    crown: [
      "M 100 70 C 101 60 103 56 108 52",
      "M 104 60 C 116 54 126 58 126 68 C 116 72 107 68 104 60 Z",
    ],
  },
  corn: {
    body: "M 100 56 C 84 56 76 74 76 100 C 76 128 86 150 100 150 C 114 150 124 128 124 100 C 124 74 116 56 100 56 Z",
    anchor: [100, 150],
    ripenFrom: 0.15,
    details: [
      "M 82 74 L 118 74", "M 82 90 L 118 90", "M 82 106 L 118 106",
      "M 82 122 L 118 122", "M 82 138 L 118 138",
      "M 91 66 L 91 146", "M 100 60 L 100 150", "M 109 66 L 109 146",
    ],
    crown: [
      "M 88 140 C 70 142 60 152 58 166 C 74 166 86 158 90 148",
      "M 112 140 C 130 142 140 152 142 166 C 126 166 114 158 110 148",
    ],
  },
  wheat: {
    body: "M 100 156 C 99 130 99 96 100 64",
    anchor: [100, 156],
    ripenFrom: 1,
    fill: false,
    crown: WHEAT_CROWN,
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
  const ripen =
    spec.fill === false
      ? 0
      : clamp((p - spec.ripenFrom) / (1 - spec.ripenFrom)) * 0.3;
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
      {spec.details?.map((d, i) => <path key={`d${i}`} d={d} strokeWidth="2.5" />)}
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
            initial={{ scale: reduce ? (on ? 1 : 0) : 0, fillOpacity: 0.3 }}
            animate={{ scale: on ? 1 : 0, fillOpacity: on ? 0.3 : 0 }}
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
            initial={{ fillOpacity: reduce ? (on ? 0.3 : 0) : 0 }}
            animate={{ fillOpacity: on ? 0.3 : 0 }}
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
        fillOpacity="0.3"
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

// Bowl of rice: the bowl stays put while a heaping mound of rice grows in it.
function Rice({ p, reduce, dur }: { p: number; reduce: boolean; dur: number }) {
  const scale = 0.35 + 0.65 * p;
  return (
    <>
      <motion.g
        style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
        initial={{ scale: reduce ? scale : 0.3, opacity: reduce ? 1 : 0 }}
        animate={{ scale, opacity: 1 }}
        transition={{ duration: dur, ease: "easeOut" }}
      >
        <path d="M 48 104 A 52 30 0 0 1 152 104 Z" fill="currentColor" fillOpacity="0.28" stroke="none" />
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M 82 90 L 88 86" />
          <path d="M 98 84 L 104 80" />
          <path d="M 114 90 L 120 86" />
          <path d="M 92 98 L 98 94" />
          <path d="M 106 98 L 112 94" />
        </g>
      </motion.g>
      <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 46 104 C 50 134 72 154 100 154 C 128 154 150 134 154 104" />
        <ellipse cx="100" cy="104" rx="54" ry="11" />
      </g>
    </>
  );
}

// Birthday cake (shown during the user's birth month). Grows in; candles light
// as the day fills (all lit by goal).
function Cake({ p, reduce, dur }: { p: number; reduce: boolean; dur: number }) {
  const scale = 0.4 + 0.6 * p;
  const flames: [string, number][] = [
    ["M 86 88 C 82 84 86 80 86 76 C 90 80 90 84 86 88 Z", 0.55],
    ["M 100 84 C 96 80 100 76 100 72 C 104 76 104 80 100 84 Z", 0.72],
    ["M 114 88 C 110 84 114 80 114 76 C 118 80 118 84 114 88 Z", 0.88],
  ];
  return (
    <motion.g
      style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
      initial={{ scale: reduce ? scale : 0.3, opacity: reduce ? 1 : 0 }}
      animate={{ scale, opacity: 1 }}
      transition={{ duration: dur, ease: "easeOut" }}
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path
        d="M 62 150 L 62 116 C 62 110 70 106 100 106 C 130 106 138 110 138 116 L 138 150 Z"
        fill="currentColor"
        fillOpacity="0.28"
      />
      <path d="M 62 122 C 70 130 78 122 86 130 C 94 122 102 130 100 130 C 106 130 114 122 122 130 C 130 122 138 130 138 122" />
      <path d="M 54 150 L 146 150" />
      <path d="M 86 106 L 86 88" />
      <path d="M 100 106 L 100 84" />
      <path d="M 114 106 L 114 88" />
      {flames.map(([d, thresh], i) => (
        <motion.path
          key={i}
          d={d}
          strokeWidth="3"
          initial={{ opacity: reduce ? (p >= thresh ? 1 : 0) : 0 }}
          animate={{ opacity: p >= thresh ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.6 + i * 0.12 }}
        />
      ))}
    </motion.g>
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
      ) : kind === "rice" ? (
        <Rice p={p} reduce={reduce} dur={dur} />
      ) : kind === "cake" ? (
        <Cake p={p} reduce={reduce} dur={dur} />
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
