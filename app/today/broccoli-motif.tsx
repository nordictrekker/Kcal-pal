"use client";

import { motion, useReducedMotion } from "framer-motion";

// Signature motif: a broccoli sprig (echoing the app mark) that grows as the
// day fills — a progress orbit fills to the calorie %, the sprig draws on and
// scales up, and its inner stems fill out one by one toward goal. Calm and
// additive; shares the logo's shape language. Reduced motion → final state.
const STEMS = [
  "M 256 300 C 246 280 232 256 224 240",
  "M 256 300 L 256 240",
  "M 256 300 C 266 280 280 256 288 240",
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
  const dur = reduce ? 0 : 1.1;
  const scale = 0.86 + 0.14 * p;

  return (
    <svg viewBox="0 0 512 500" className={className} fill="none" aria-hidden>
      {/* Progress orbit — fills to the day's calorie % (starts at top). */}
      <motion.circle
        cx="256"
        cy="238"
        r="210"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="11"
        strokeLinecap="round"
        transform="rotate(-90 256 238)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: p }}
        transition={{ duration: dur, ease: "easeOut" }}
      />

      <motion.g
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transformOrigin: "256px 320px" }}
        initial={{ scale: reduce ? scale : 0.8 }}
        animate={{ scale }}
        transition={{ duration: dur, ease: "easeOut" }}
      >
        {/* Head + stalk draw on. */}
        {[
          "M 150 238 C 110 232 108 186 142 174 C 128 148 152 118 184 130 C 192 104 228 100 246 124 C 260 102 298 104 310 130 C 342 116 374 140 360 170 C 396 182 390 232 350 238",
          "M 240 252 C 234 296 232 334 236 360 C 238 374 274 374 276 360 C 280 334 278 296 272 252",
        ].map((d, i) => (
          <motion.path
            key={i}
            d={d}
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: dur, ease: "easeInOut" }}
          />
        ))}
        {/* Inner stems fill out as the day progresses. */}
        {STEMS.map((d, i) => {
          const on = p >= (i + 1) / (STEMS.length + 1);
          return (
            <motion.path
              key={`s${i}`}
              d={d}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
              transition={{
                duration: reduce ? 0 : 0.5,
                delay: reduce ? 0 : 0.5 + i * 0.12,
                ease: "easeOut",
              }}
            />
          );
        })}
      </motion.g>
    </svg>
  );
}
