import { motion } from "framer-motion";
import { Shuffle } from "@phosphor-icons/react";
import {
  PART_DEFS,
  POINT_BUDGET,
  totalCost,
  type BodyParts,
  type PartKey,
} from "@/lib/colosseum";

type Props = {
  value: BodyParts;
  onChange: (next: BodyParts) => void;
};

const PART_KEYS: PartKey[] = PART_DEFS.map((d) => d.key);

function partCost(key: PartKey, level: number): number {
  const def = PART_DEFS.find((d) => d.key === key)!;
  return def.variants[level].cost;
}

export function BodyPartsPicker({ value, onChange }: Props) {
  const used = totalCost(value);

  function set(key: PartKey, variant: number) {
    onChange({ ...value, [key]: variant });
  }

  function randomize() {
    const parts: BodyParts = {
      head_type: Math.floor(Math.random() * 3),
      body_type: Math.floor(Math.random() * 3),
      arms_type: Math.floor(Math.random() * 3),
      legs_type: Math.floor(Math.random() * 3),
    };

    // Over budget → repeatedly downgrade the highest-cost part.
    while (totalCost(parts) > POINT_BUDGET) {
      let best: PartKey | null = null;
      let bestCost = -1;
      for (const key of PART_KEYS) {
        if (parts[key] <= 0) continue;
        const c = partCost(key, parts[key]);
        if (c > bestCost) {
          bestCost = c;
          best = key;
        }
      }
      if (best === null) break;
      parts[best] -= 1;
    }

    // Under budget → upgrade random sub-max parts until the budget is met.
    while (totalCost(parts) < POINT_BUDGET) {
      const upgradable = PART_KEYS.filter((key) => parts[key] < 2);
      if (upgradable.length === 0) break;
      const key = upgradable[Math.floor(Math.random() * upgradable.length)];
      parts[key] += 1;
      if (totalCost(parts) > POINT_BUDGET) {
        parts[key] -= 1;
        break;
      }
    }

    onChange(parts);
  }

  // Green at exactly budget, ember while under, red when overspent.
  const budgetColor =
    used > POINT_BUDGET
      ? "text-red-400"
      : used === POINT_BUDGET
        ? "text-emerald-400"
        : "text-ember-300";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={randomize}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-ember-300"
        >
          <Shuffle size={13} weight="bold" /> Randomize
        </button>
      </div>

      {/* Budget readout — leading number is points used. */}
      <div className="flex items-center justify-between rounded-lg border hairline bg-white/[0.02] px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
          Budget
        </span>
        <span className={`font-display text-sm font-bold ${budgetColor}`}>
          {used} of {POINT_BUDGET} points used
          {used > POINT_BUDGET && (
            <span className="ml-1.5 font-mono text-[10px] font-normal text-red-400">
              · overspent
            </span>
          )}
        </span>
      </div>

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
    </div>
  );
}
