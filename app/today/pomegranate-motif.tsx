"use client";

import { motion, useReducedMotion } from "framer-motion";

// Signature motif: a pomegranate (echoing the app mark) that grows and ripens
// as the day fills — its progress orbit fills to the calorie %, the fruit
// scales up, and its seeds reveal one by one. Calm, additive, on-brand; shares
// the logo's shape language. Reduced-motion: renders the final state, no motion.
const SEEDS: Array<[number, number]> = [
  [46, 72],
  [66, 67],
  [55, 85],
  [47, 92],
  [67, 88],
  [57, 62],
];

export function PomegranateMotif({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const reduce = useReducedMotion();
  const dur = reduce ? 0 : 1;
  const bodyScale = 0.84 + 0.16 * p;

  return (
    <svg viewBox="0 0 110 126" className={className} fill="none" aria-hidden>
      {/* Progress orbit — fills to the day's calorie % (starts at top). */}
      <motion.circle
        cx="55"
        cy="66"
        r="50"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2.4"
        strokeLinecap="round"
        transform="rotate(-90 55 66)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: p }}
        transition={{ duration: dur, ease: "easeOut" }}
      />

      {/* The fruit grows in. */}
      <motion.g
        style={{ transformOrigin: "55px 76px" }}
        initial={{ scale: reduce ? bodyScale : 0.8, opacity: 0 }}
        animate={{ scale: bodyScale, opacity: 1 }}
        transition={{ duration: dur, ease: "easeOut" }}
      >
        <g
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 55,48 C 38,48 27,60 27,75 C 27,92 39,104 55,104 C 71,104 83,92 83,75 C 83,60 72,48 55,48 Z" />
          <path d="M 55,48 L 55,36" />
          <path d="M 55,49 L 48,38" />
          <path d="M 55,49 L 62,38" />
          <path d="M 53,50 L 44,43" />
          <path d="M 57,50 L 66,43" />
        </g>
        {/* Seeds reveal as the day fills. */}
        <g fill="currentColor" stroke="none">
          {SEEDS.map(([cx, cy], i) => {
            const on = p >= (i + 1) / (SEEDS.length + 1);
            return (
              <motion.circle
                key={i}
                cx={cx}
                cy={cy}
                r="3"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: on ? 0.9 : 0, scale: on ? 1 : 0 }}
                transition={{
                  duration: reduce ? 0 : 0.4,
                  delay: reduce ? 0 : 0.35 + i * 0.08,
                  ease: "backOut",
                }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              />
            );
          })}
        </g>
      </motion.g>
    </svg>
  );
}
