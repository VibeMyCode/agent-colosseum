import { motion } from "framer-motion";
import { PART_DEFS, POINT_BUDGET, totalCost, type BodyParts, type PartKey } from "@/lib/colosseum";

type Props = {
  value: BodyParts;
  onChange: (next: BodyParts) => void;
};

export function BodyPartsPicker({ value, onChange }: Props) {
  const used = totalCost(value);

  function set(key: PartKey, variant: number) {
    onChange({ ...value, [key]: variant });
  }

  function partCost(key: PartKey, level: number): number {
    const def = PART_DEFS.find((d) => d.key === key)!;
    return def.variants[level].cost;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PART_DEFS.map((def) => (
          <div key={def.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                {def.label}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-700">
                {def.attribute}
              </span>
            </div>
            <div className="space-y-1.5">
              {def.variants.map((variant, i) => {
                const active = value[def.key] === i;
                const currentCost = partCost(def.key, value[def.key]);
                // Selecting this would push the loadout over the point budget
                // (and it costs more than what's currently equipped here).
                const overBudget =
                  !active &&
                  variant.cost > currentCost &&
                  used - currentCost + variant.cost > POINT_BUDGET;
                return (
                  <button
                    key={variant.name}
                    type="button"
                    disabled={overBudget}
                    onClick={() => {
                      if (overBudget) return;
                      set(def.key, i);
                    }}
                    title={
                      overBudget
                        ? `Cost: ${variant.cost} pts · budget exceeded`
                        : `Cost: ${variant.cost} pts`
                    }
                    className={`relative block w-full rounded-lg border px-2 py-1.5 text-center transition-all ${
                      active
                        ? "border-ember-500/50 bg-ember-500/10 text-ember-200"
                        : overBudget
                          ? "border-white/8 bg-white/[0.02] text-zinc-500 opacity-50 cursor-not-allowed"
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
                    <span className="relative block text-xs font-medium">
                      {variant.name}
                    </span>
                    <span
                      className={`relative flex items-center justify-center gap-1 text-[10px] font-mono ${
                        active ? "text-ember-300/80" : "text-zinc-600"
                      }`}
                    >
                      {variant.stat}
                      <span
                        className={`rounded px-1 ${
                          active
                            ? "bg-ember-500/20 text-ember-200"
                            : "bg-white/5 text-zinc-500"
                        }`}
                      >
                        •{variant.cost}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
