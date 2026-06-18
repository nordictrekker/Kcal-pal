"use client";

import { motion, useReducedMotion } from "framer-motion";

// Signature motif: a broccoli that genuinely grows with the day. It starts as a
// thin stalk with a single bud and develops, stage by stage, into a full head —
// leaves unfurl, then florets bloom one by one onto the crown as you approach
// goal — all inside a progress orbit that fills to the calorie %. Echoes the app
// mark; calm and additive. Reduced motion → final state, no animation.

// Florets forming a dome on the stalk. Array order is the bloom order
// (bud first, crown last); each appears once progress crosses its threshold.
const FLORETS: Array<[number, number, number]> = [
  [100, 96, 15],
  [82, 90, 14],
  [118, 90, 14],
  [92, 76, 15],
  [108, 76, 15],
  [100, 64, 15],
  [68, 80, 13],
  [132, 80, 13],
  [78, 64, 12],
  [122, 64, 12],
  [100, 50, 13],
];
const N = FLORETS.length;

const STALK =
  "M 92 110 C 90 138 90 166 93 184 C 96 192 104 192 107 184 C 110 166 110 138 108 110";
const LEAF_L = "M 92 150 C 78 146 68 150 64 160 C 76 164 88 160 92 152";
const LEAF_R = "M 108 150 C 122 146 132 150 136 160 C 124 164 116 160 108 152";

export function BroccoliMotif({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const reduce = useReducedMotion();
  const dur = reduce ? 0 : 1.2;
  const leavesOn = p >= 0.12;

  return (
    <svg viewBox="0 0 200 210" className={className} fill="none" aria-hidden>
      {/* Progress orbit — fills to the day's calorie % (starts at top). */}
      <motion.circle
        cx="100"
        cy="95"
        r="85"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="5"
        strokeLinecap="round"
        transform="rotate(-90 100 95)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: p }}
        transition={{ duration: dur, ease: "easeOut" }}
      />

      <g
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Stalk draws up first. */}
        <motion.path
          d={STALK}
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0 : 0.6, ease: "easeInOut" }}
        />
        {/* Leaves unfurl once the sprout takes. */}
        {[LEAF_L, LEAF_R].map((d, i) => (
          <motion.path
            key={`l${i}`}
            d={d}
            style={{ transformOrigin: "100px 152px" }}
            initial={{ opacity: 0, scale: reduce ? (leavesOn ? 1 : 0) : 0 }}
            animate={{ opacity: leavesOn ? 1 : 0, scale: leavesOn ? 1 : 0 }}
            transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.4 }}
          />
        ))}
        {/* Florets bloom onto the crown, building the head as the day fills. */}
        {FLORETS.map(([cx, cy, r], i) => {
          const on = p >= i / (N + 0.5);
          return (
            <motion.circle
              key={`f${i}`}
              cx={cx}
              cy={cy}
              r={r}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
              initial={{ opacity: 0, scale: reduce ? (on ? 1 : 0) : 0 }}
              animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0 }}
              transition={{
                duration: reduce ? 0 : 0.45,
                delay: reduce ? 0 : 0.5 + i * 0.07,
                ease: "backOut",
              }}
            />
          );
        })}
      </g>
    </svg>
  );
}
