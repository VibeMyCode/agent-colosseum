import { useId } from "react";
import { motion } from "framer-motion";
import { paletteFor, type BodyParts } from "@/lib/colosseum";

type Props = {
  parts: BodyParts;
  size?: number;
  animated?: boolean;
  /** When true the chassis shatters: each part group flies outward and dims. */
  destroyed?: boolean;
  className?: string;
};

const STEEL_LIGHT = "#525a6b";
const STEEL_DARK = "#1c2029";

// Scatter vector (in viewBox units) + spin for each part when destroyed.
const SCATTER: Record<"head" | "body" | "arms" | "legs", { x: number; y: number; r: number }> = {
  head: { x: -16, y: -30, r: -40 },
  body: { x: 10, y: 22, r: 28 },
  arms: { x: -32, y: 14, r: -55 },
  legs: { x: 26, y: 30, r: 60 },
};

/**
 * A parametric mech-gladiator rendered entirely from the four body parts (each
 * 0–2). The parts double as the fighter's identity *and* its combat loadout
 * (see lib/battle): head→dodge, core→HP, arms→weapon, legs→speed & ram.
 */
export function AgentAvatar({
  parts,
  size = 120,
  animated = false,
  destroyed = false,
  className = "",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const pal = paletteFor(parts);
  const accent = pal.primary;

  // Each part group is wrapped so it can fly apart on death. When intact the
  // wrapper is the identity transform, so static avatars render unchanged.
  const Part = ({
    which,
    children,
  }: {
    which: keyof typeof SCATTER;
    children: React.ReactNode;
  }) => {
    const s = SCATTER[which];
    return (
      <motion.g
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={
          destroyed
            ? { x: s.x, y: s.y, rotate: s.r, opacity: 0.55 }
            : { x: 0, y: 0, rotate: 0, opacity: 1 }
        }
        transition={
          destroyed
            ? { type: "spring", stiffness: 140, damping: 11, mass: 0.7 }
            : { duration: 0.2 }
        }
      >
        {children}
      </motion.g>
    );
  };

  const svg = (
    <svg
      viewBox="0 0 120 140"
      width={size}
      height={(size * 140) / 120}
      className={className}
      style={{
        filter: destroyed
          ? `drop-shadow(0 6px 14px rgba(0,0,0,0.6))`
          : `drop-shadow(0 6px 14px ${pal.glow})`,
      }}
    >
      <defs>
        <linearGradient id={`steel-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={STEEL_LIGHT} />
          <stop offset="1" stopColor={STEEL_DARK} />
        </linearGradient>
        <linearGradient id={`accent-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={accent} />
          <stop offset="1" stopColor={STEEL_DARK} />
        </linearGradient>
        <radialGradient id={`core-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.4" stopColor={accent} />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <Part which="legs">{renderLegs(parts.legs_type, uid, accent)}</Part>
      <Part which="arms">{renderArms(parts.arms_type, uid, accent)}</Part>
      <Part which="body">{renderBody(parts.body_type, uid, accent)}</Part>
      <Part which="head">{renderHead(parts.head_type, uid, accent)}</Part>
    </svg>
  );

  if (!animated || destroyed) return svg;
  return (
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      className="inline-block"
    >
      {svg}
    </motion.div>
  );
}

function renderLegs(variant: number, uid: string, accent: string) {
  const steel = `url(#steel-${uid})`;
  if (variant === 1) {
    // Treads — tank tracks
    return (
      <g>
        <rect x="34" y="108" width="52" height="20" rx="8" fill={STEEL_DARK} />
        <rect x="38" y="111" width="44" height="14" rx="6" fill={steel} />
        {[42, 50, 58, 66, 74].map((x) => (
          <rect key={x} x={x} y="112" width="4" height="12" rx="1.5" fill={STEEL_DARK} />
        ))}
        <rect x="50" y="100" width="20" height="12" rx="3" fill={steel} />
      </g>
    );
  }
  if (variant === 2) {
    // Hover — anti-grav pad with glow
    return (
      <g>
        <ellipse cx="60" cy="124" rx="30" ry="7" fill={accent} opacity="0.22" />
        <rect x="44" y="104" width="32" height="14" rx="5" fill={steel} />
        <rect x="48" y="116" width="24" height="6" rx="3" fill={accent} opacity="0.85" />
        <ellipse cx="60" cy="128" rx="20" ry="3.5" fill={accent} opacity="0.5" />
      </g>
    );
  }
  // Sprint — digitigrade legs
  return (
    <g stroke={STEEL_DARK} strokeWidth="1">
      <path d="M52 100 L48 116 L42 130 L50 130 L55 118 L57 104 Z" fill={steel} />
      <path d="M68 100 L72 116 L78 130 L70 130 L65 118 L63 104 Z" fill={steel} />
      <circle cx="53" cy="103" r="4" fill={accent} opacity="0.7" />
      <circle cx="67" cy="103" r="4" fill={accent} opacity="0.7" />
    </g>
  );
}

function renderBody(variant: number, uid: string, accent: string) {
  const steel = `url(#steel-${uid})`;
  const acc = `url(#accent-${uid})`;
  if (variant === 1) {
    // Bastion — broad armored torso
    return (
      <g stroke={STEEL_DARK} strokeWidth="1.2">
        <path d="M38 56 L82 56 L86 96 L60 104 L34 96 Z" fill={steel} />
        <path d="M48 58 L72 58 L74 84 L60 90 L46 84 Z" fill={acc} opacity="0.5" />
        <rect x="55" y="64" width="10" height="20" rx="3" fill={STEEL_DARK} />
        <rect x="40" y="50" width="40" height="10" rx="4" fill={STEEL_LIGHT} />
      </g>
    );
  }
  if (variant === 2) {
    // Reactor — slim torso with a glowing core ring
    return (
      <g stroke={STEEL_DARK} strokeWidth="1.2">
        <path d="M44 54 L76 54 L80 98 L60 104 L40 98 Z" fill={steel} />
        <circle cx="60" cy="76" r="13" fill={STEEL_DARK} />
        <circle cx="60" cy="76" r="11" fill={`url(#core-${uid})`} />
        <circle
          cx="60"
          cy="76"
          r="13"
          fill="none"
          stroke={accent}
          strokeWidth="2"
          opacity="0.9"
        />
        <rect x="46" y="48" width="28" height="9" rx="4" fill={STEEL_LIGHT} />
      </g>
    );
  }
  // Lithe — slim plated torso
  return (
    <g stroke={STEEL_DARK} strokeWidth="1.2">
      <path d="M46 54 L74 54 L78 96 L60 102 L42 96 Z" fill={steel} />
      <path d="M54 58 L66 58 L68 88 L60 92 L52 88 Z" fill={acc} opacity="0.45" />
      <rect x="48" y="49" width="24" height="9" rx="4" fill={STEEL_LIGHT} />
      <circle cx="60" cy="70" r="3" fill={accent} opacity="0.85" />
    </g>
  );
}

function renderArms(variant: number, uid: string, accent: string) {
  const steel = `url(#steel-${uid})`;
  if (variant === 1) {
    // Cannons — barrel arms
    return (
      <g stroke={STEEL_DARK} strokeWidth="1">
        <rect x="22" y="58" width="16" height="34" rx="6" fill={steel} />
        <rect x="82" y="58" width="16" height="34" rx="6" fill={steel} />
        <circle cx="30" cy="92" r="7" fill={STEEL_DARK} />
        <circle cx="90" cy="92" r="7" fill={STEEL_DARK} />
        <circle cx="30" cy="92" r="3.5" fill={accent} opacity="0.85" />
        <circle cx="90" cy="92" r="3.5" fill={accent} opacity="0.85" />
      </g>
    );
  }
  if (variant === 2) {
    // Grapnels — claw arms
    return (
      <g stroke={STEEL_DARK} strokeWidth="1">
        <rect x="26" y="58" width="12" height="30" rx="5" fill={steel} />
        <rect x="82" y="58" width="12" height="30" rx="5" fill={steel} />
        <path d="M26 88 l-6 8 m6 -8 l0 10 m0 -10 l6 8" stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M94 88 l6 8 m-6 -8 l0 10 m0 -10 l-6 8" stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  // Blades — sword arms
  return (
    <g stroke={STEEL_DARK} strokeWidth="1">
      <rect x="28" y="58" width="11" height="26" rx="5" fill={steel} />
      <rect x="81" y="58" width="11" height="26" rx="5" fill={steel} />
      <path d="M33 84 L29 112 L37 100 Z" fill={accent} opacity="0.9" />
      <path d="M87 84 L91 112 L83 100 Z" fill={accent} opacity="0.9" />
    </g>
  );
}

function renderHead(variant: number, uid: string, accent: string) {
  const steel = `url(#steel-${uid})`;
  if (variant === 1) {
    // Optic — single cyclops eye
    return (
      <g stroke={STEEL_DARK} strokeWidth="1.2">
        <rect x="48" y="18" width="24" height="28" rx="10" fill={steel} />
        <circle cx="60" cy="32" r="7" fill={STEEL_DARK} />
        <circle cx="60" cy="32" r="4" fill={accent} />
        <circle cx="60" cy="32" r="1.6" fill="#fff" />
      </g>
    );
  }
  if (variant === 2) {
    // Crest — angular head with a top crest
    return (
      <g stroke={STEEL_DARK} strokeWidth="1.2">
        <path d="M48 24 L60 12 L72 24 L70 46 L50 46 Z" fill={steel} />
        <path d="M60 12 L60 4 L64 12 Z" fill={accent} />
        <rect x="52" y="30" width="6" height="5" rx="1.5" fill={accent} />
        <rect x="62" y="30" width="6" height="5" rx="1.5" fill={accent} />
      </g>
    );
  }
  // Visor — helmet with a horizontal slit
  return (
    <g stroke={STEEL_DARK} strokeWidth="1.2">
      <rect x="47" y="20" width="26" height="26" rx="9" fill={steel} />
      <rect x="50" y="42" width="20" height="6" rx="2" fill={STEEL_DARK} />
      <rect x="51" y="30" width="18" height="5" rx="2.5" fill={accent} />
      <rect x="51" y="30" width="18" height="5" rx="2.5" fill="#fff" opacity="0.25" />
    </g>
  );
}
