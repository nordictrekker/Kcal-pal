"use client";

import { MotionConfig } from "framer-motion";

// App-wide motion config: respect the OS "reduce motion" setting (disables
// transform/layout animations while keeping safe opacity/color transitions).
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
