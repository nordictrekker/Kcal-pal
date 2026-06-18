// Subtle phase-specific botanical motifs for the Today header.
// Single-color line art (uses currentColor → tinted by --primary).
// Kept geometric/abstract on purpose — clipart florals age fast.

import type { Phase } from "@/lib/cycle";

type FloralProps = {
  phase: Phase;
  className?: string;
  // 0..1 of the day's calorie target logged. The motif gently blooms — fading
  // in and growing — as the day fills, turning the ornament into a quiet,
  // on-brand progress signal. Defaults to fully bloomed.
  progress?: number;
};

// Menstrual / autumn — pomegranate-and-leaf branch.
function MenstrualSprig({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M 10 70 Q 40 60, 60 40 T 100 22" />
      {/* leaf 1 */}
      <path d="M 40 52 Q 32 48, 28 56 Q 36 60, 42 56" />
      {/* leaf 2 */}
      <path d="M 70 32 Q 76 22, 86 24 Q 80 32, 72 34" />
      {/* pomegranate */}
      <circle cx="100" cy="22" r="9" />
      <path d="M 96 14 L 97 11 M 100 13 L 100 10 M 104 14 L 103 11" />
      {/* tiny seeds suggestion */}
      <circle cx="98" cy="22" r="0.6" fill="currentColor" />
      <circle cx="102" cy="20" r="0.6" fill="currentColor" />
      <circle cx="100" cy="24" r="0.6" fill="currentColor" />
    </svg>
  );
}

// Follicular / spring — slender wheatgrass stalks.
function FollicularSprig({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {/* three stems fanning slightly */}
      <path d="M 30 78 Q 35 50, 40 10" />
      <path d="M 55 78 Q 58 50, 60 8" />
      <path d="M 80 78 Q 78 50, 76 12" />
      {/* seedheads — small ovals up the stems */}
      {[
        [40, 14],
        [38, 22],
        [42, 30],
        [60, 12],
        [58, 20],
        [62, 28],
        [76, 16],
        [78, 24],
        [74, 32],
      ].map(([cx, cy], i) => (
        <ellipse
          key={i}
          cx={cx}
          cy={cy}
          rx="2.2"
          ry="3.6"
          transform={`rotate(${i % 2 === 0 ? -18 : 18} ${cx} ${cy})`}
        />
      ))}
    </svg>
  );
}

// Ovulatory / summer — open dahlia bloom.
function OvulatorySprig({ className }: { className?: string }) {
  // Petals as eight rotated ellipses around a center.
  const petals = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 360) / 8;
    return (
      <ellipse
        key={i}
        cx="70"
        cy="40"
        rx="14"
        ry="5"
        transform={`rotate(${angle} 70 40)`}
      />
    );
  });
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {/* stem */}
      <path d="M 70 78 Q 68 60, 70 48" />
      {/* leaf */}
      <path d="M 70 64 Q 80 60, 88 66 Q 80 72, 70 68" />
      {petals}
      {/* center */}
      <circle cx="70" cy="40" r="3" />
      <circle cx="70" cy="40" r="0.8" fill="currentColor" />
    </svg>
  );
}

// Luteal / autumn-edge — single lavender sprig with bud cluster.
function LutealSprig({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {/* main arching stem */}
      <path d="M 60 78 Q 62 50, 72 22" />
      {/* tiny leaves */}
      <path d="M 62 64 Q 54 64, 50 68" />
      <path d="M 65 50 Q 73 48, 78 52" />
      {/* bud cluster — small offset dots forming the flower head */}
      {[
        [72, 22, 1.8],
        [70, 18, 1.6],
        [74, 19, 1.8],
        [73, 15, 1.6],
        [70, 14, 1.4],
        [76, 16, 1.5],
        [69, 24, 1.6],
        [75, 25, 1.5],
        [72, 11, 1.4],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="currentColor" opacity="0.6" />
      ))}
    </svg>
  );
}

function Sprig({ phase }: { phase: Phase }) {
  switch (phase) {
    case "menstrual":
      return <MenstrualSprig className="h-full w-full" />;
    case "follicular":
      return <FollicularSprig className="h-full w-full" />;
    case "ovulatory":
      return <OvulatorySprig className="h-full w-full" />;
    case "luteal":
      return <LutealSprig className="h-full w-full" />;
  }
}

export function PhaseFloral({ phase, className, progress = 1 }: FloralProps) {
  const p = Math.max(0, Math.min(1, progress));
  // Visible-but-soft at 0% → fuller, more present bloom near goal.
  const style: React.CSSProperties = {
    opacity: 0.28 + 0.17 * p,
    transform: `scale(${0.92 + 0.1 * p})`,
    transformOrigin: "bottom right",
    transition: "opacity 0.8s ease, transform 0.8s ease",
  };
  return (
    <span className={className} style={style} aria-hidden>
      <Sprig phase={phase} />
    </span>
  );
}
