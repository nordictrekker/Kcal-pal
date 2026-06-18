"use client";

import { motion, useReducedMotion } from "framer-motion";

// Signature motif: a broccoli that grows with the day. It starts as a small
// head on a stalk and develops — the crown swells from a sprout to a full,
// broad head as you approach goal — all inside a progress orbit that fills to
// the calorie %. Echoes the app mark; calm and additive. Fine, clean lines.
// Reduced motion → final state, no animation.

// A single scalloped crown outline reads as broccoli far more cleanly than a
// pile of overlapping circles; it grows by scaling up from the stalk.
const HEAD =
  "M 58 100 C 44 100 36 88 44 78 C 34 68 42 52 56 56 C 58 42 76 38 86 48 C 94 38 112 40 118 52 C 134 48 148 60 142 74 C 156 80 154 98 138 100 Z";
const STALK =
  "M 90 104 C 89 118 89 134 92 142 C 95 149 105 149 108 142 C 111 134 111 118 110 104";
// Short stems branching up from the stalk into the crown.
const FORKS = [
  "M 100 108 C 97 100 92 92 90 84",
  "M 100 108 L 100 84",
  "M 100 108 C 103 100 108 92 110 84",
];

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
  const headScale = 0.34 + 0.66 * p;

  return (
    <svg viewBox="0 0 200 200" className={className} fill="none" aria-hidden>
      {/* Progress orbit — fills to the day's calorie % (starts at top). */}
      <motion.circle
        cx="100"
        cy="92"
        r="82"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="4"
        strokeLinecap="round"
        transform="rotate(-90 100 92)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: p }}
        transition={{ duration: dur, ease: "easeOut" }}
      />

      <g
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Stalk draws up first. */}
        <motion.path
          d={STALK}
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0 : 0.55, ease: "easeInOut" }}
        />

        {/* Crown grows up from the stalk and its stems draw in. */}
        <motion.g
          style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
          initial={{ scale: reduce ? headScale : 0.2, opacity: reduce ? 1 : 0 }}
          animate={{ scale: headScale, opacity: 1 }}
          transition={{ duration: dur, ease: "easeOut" }}
        >
          <motion.path
            d={HEAD}
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduce ? 0 : 0.9, ease: "easeInOut" }}
          />
          {FORKS.map((d, i) => (
            <motion.path
              key={i}
              d={d}
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: reduce ? 0 : 0.4,
                delay: reduce ? 0 : 0.6 + i * 0.08,
                ease: "easeOut",
              }}
            />
          ))}
        </motion.g>
      </g>
    </svg>
  );
}
