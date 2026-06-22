import { motion } from "framer-motion";
import { Shuffle } from "@phosphor-icons/react";
import { PART_DEFS, type BodyParts, type PartKey } from "@/lib/colosseum";

type Props = {
  value: BodyParts;
  onChange: (next: BodyParts) => void;
};

export function BodyPartsPicker({ value, onChange }: Props) {
  function set(key: PartKey, variant: number) {
    onChange({ ...value, [key]: variant });
  }

  function randomize() {
    onChange({
      head_type: Math.floor(Math.random() * 3),
      body_type: Math.floor(Math.random() * 3),
      arms_type: Math.floor(Math.random() * 3),
      legs_type: Math.floor(Math.random() * 3),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Chassis · cosmetic
        </span>
        <button
          type="button"
          onClick={randomize}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-ember-300"
        >
          <Shuffle size={13} weight="bold" /> Randomize
        </button>
      </div>

      {PART_DEFS.map((def) => (
        <div key={def.key} className="flex items-center gap-3">
          <span className="w-12 shrink-0 font-mono text-xs text-zinc-500">
            {def.label}
          </span>
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            {def.variants.map((variant, i) => {
              const active = value[def.key] === i;
              return (
                <button
                  key={variant}
                  type="button"
                  onClick={() => set(def.key, i)}
                  className={`relative rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? "border-ember-500/50 bg-ember-500/10 text-ember-200"
                      : "border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={`bp-${def.key}`}
                      className="absolute inset-0 rounded-lg ring-1 ring-ember-400/40"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative">{variant}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
