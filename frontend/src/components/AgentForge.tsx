import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Trophy,
  Coins,
  Shuffle,
  Skull,
  Sparkle,
  CaretDown,
} from "@phosphor-icons/react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { BodyPartsPicker } from "@/components/BodyPartsPicker";
import { StatPreview } from "@/components/battle/StatPreview";
import { useColosseum } from "@/providers/colosseum-provider";
import { useWallet } from "@/providers/chain-provider";
import { useTx } from "@/hooks/use-tx";
import {
  deriveStrategyHash,
  formatVara,
  isBudgetValid,
  registerAgent,
  updateAgent,
  totalCost,
  POINT_BUDGET,
  PART_DEFS,
  type BodyParts,
  type PartKey,
} from "@/lib/colosseum";

const DEFAULT_PARTS: BodyParts = {
  head_type: 0,
  body_type: 1,
  arms_type: 0,
  legs_type: 2,
};

export function AgentForge() {
  const { myAgent, ready } = useColosseum();
  const { account } = useWallet();
  const { run, busy } = useTx();

  const isUpdate = Boolean(myAgent);

  const [open, setOpen] = useState(true);
  const [name, setName] = useState("");
  const strategyUrl = "";
  const [parts, setParts] = useState<BodyParts>(DEFAULT_PARTS);
  const [strategyHash, setStrategyHash] = useState<number[]>([]);

  const prevAgentId = useRef<string | null>(null);

  useEffect(() => {
    const id = myAgent?.agentId ?? null;
    if (id !== prevAgentId.current) {
      prevAgentId.current = id;
      if (myAgent) {
        setName(myAgent.name);
        setParts(myAgent.bodyParts);
      } else {
        setName("");
        setParts(DEFAULT_PARTS);
      }
    }
  }, [myAgent]);

  useEffect(() => {
    let cancelled = false;
    deriveStrategyHash(`${name}::${strategyUrl}`).then((h) => {
      if (!cancelled) setStrategyHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [name, strategyUrl]);

  const nameError = useMemo(() => {
    if (name.length === 0) return "Required";
    if (name.length > 64) return "Max 64 characters";
    return null;
  }, [name]);

  const canSubmit =
    ready && Boolean(account) && !nameError && !busy && isBudgetValid(parts);

  const used = totalCost(parts);

  const budgetColor =
    used > POINT_BUDGET
      ? "text-red-400"
      : used === POINT_BUDGET
        ? "text-emerald-400"
        : "text-ember-300";

  const PART_KEYS: PartKey[] = PART_DEFS.map((d) => d.key);

  function partCost(key: PartKey, level: number): number {
    const def = PART_DEFS.find((d) => d.key === key)!;
    return def.variants[level].cost;
  }

  function randomize() {
    const randomized: BodyParts = {
      head_type: Math.floor(Math.random() * 3),
      body_type: Math.floor(Math.random() * 3),
      arms_type: Math.floor(Math.random() * 3),
      legs_type: Math.floor(Math.random() * 3),
    };

    // Over budget → repeatedly downgrade the highest-cost part.
    while (totalCost(randomized) > POINT_BUDGET) {
      let best: PartKey | null = null;
      let bestCost = -1;
      for (const key of PART_KEYS) {
        if (randomized[key] <= 0) continue;
        const c = partCost(key, randomized[key]);
        if (c > bestCost) {
          bestCost = c;
          best = key;
        }
      }
      if (best === null) break;
      randomized[best] -= 1;
    }

    // Under budget → upgrade random sub-max parts until the budget is met.
    while (totalCost(randomized) < POINT_BUDGET) {
      const upgradable = PART_KEYS.filter((key) => randomized[key] < 2);
      if (upgradable.length === 0) break;
      const key = upgradable[Math.floor(Math.random() * upgradable.length)];
      randomized[key] += 1;
      if (totalCost(randomized) > POINT_BUDGET) {
        randomized[key] -= 1;
        break;
      }
    }

    setParts(randomized);
  }

  async function submit() {
    if (!canSubmit) return;
    if (isUpdate) {
      await run({
        pending: "Recalibrating agent…",
        success: "Agent updated",
        action: (sails, signArgs) =>
          updateAgent(sails, signArgs, {
            name,
            bodyParts: parts,
            strategyHash,
            strategyUrl: strategyUrl || "",
          }),
      });
    } else {
      await run({
        pending: "Forging agent…",
        success: "Agent forged",
        successMessage: () => `${name} has entered the colosseum.`,
        action: (sails, signArgs) =>
          registerAgent(sails, signArgs, {
            name,
            bodyParts: parts,
            strategyHash,
            strategyUrl: strategyUrl || "",
          }),
      });
    }
  }

  return (
    <section className="glass overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <Sparkle size={18} weight="fill" className="text-ember-400" />
        <h2 className="display text-base font-bold text-zinc-100">
          {isUpdate ? "Your Agent" : "Forge Your Agent"}
        </h2>
        {isUpdate && (
          <span className="chip border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            Registered
          </span>
        )}
        {isUpdate && myAgent && (
          <span className="ml-1 hidden items-center gap-3 text-xs text-zinc-500 sm:flex">
            <span className="inline-flex items-center gap-1">
              <Trophy size={12} weight="fill" className="text-ember-400/80" />
              {myAgent.wins} Wins
            </span>
            <span className="inline-flex items-center gap-1">
              <Skull size={12} weight="fill" className="text-zinc-500" />
              {myAgent.losses} Losses
            </span>
            <span className="inline-flex items-center gap-1">
              <Coins size={12} weight="fill" className="text-emerald-400/80" />
              {formatVara(myAgent.totalEarned)} Earned
            </span>
          </span>
        )}
        <CaretDown
          size={16}
          weight="bold"
          className={`ml-auto text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="grid gap-8 border-t hairline p-5 sm:p-6 lg:grid-cols-[280px_1fr]">
              {/* Live preview */}
              <div className="flex flex-col gap-3">
                <div className="relative flex h-56 items-center justify-center rounded-2xl border hairline bg-grid-arena [background-size:18px_18px]">
                  <div className="pointer-events-none absolute inset-0 rounded-2xl bg-ember-radial" />
                  <motion.div
                    key={`${parts.head_type}-${parts.body_type}-${parts.arms_type}-${parts.legs_type}`}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  >
                    <AgentAvatar parts={parts} size={150} animated />
                  </motion.div>
                </div>

                {/* Combat loadout these parts resolve to. */}
                <StatPreview parts={parts} />
              </div>

              {/* Form */}
              <div className="flex flex-col gap-5">
                {/* Two-column: Callsign + input | Chassis + Budget, Randomize top right */}
                <div className="grid gap-x-4 gap-y-0 sm:grid-cols-[1fr_1fr]">
                  {/* Row 1 col 1 */}
                  <div>
                    <label className="mb-1.5 block font-mono text-xs text-zinc-500">
                      Callsign
                    </label>
                  </div>
                  {/* Row 1 col 2 — Chassis label + Randomize inline */}
                  <div className="flex items-center justify-between">
                    <label className="mb-1.5 block font-mono text-xs text-zinc-500">
                      Chassis
                    </label>
                    <button
                      type="button"
                      onClick={randomize}
                      className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-ember-300"
                    >
                      <Shuffle size={13} weight="bold" /> Randomize
                    </button>
                  </div>

                  {/* Row 2 col 1 — input */}
                  <div>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. NEON_REAPER"
                      maxLength={80}
                      className="field"
                    />
                    <div className="mt-1 flex justify-between text-[11px]">
                      <span className="text-red-400">
                        {nameError && name.length > 0 ? nameError : ""}
                      </span>
                      <span />
                    </div>
                  </div>
                  {/* Row 2 col 2 — Budget bar full-width */}
                  <div className="w-full">
                    <div className="flex w-full items-center gap-1.5 rounded-lg border hairline bg-white/[0.02] px-3 py-2">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                        Budget
                      </span>
                      <span className={`font-display text-sm font-bold ${budgetColor}`}>
                        {used} of {POINT_BUDGET} points used
                        {used > POINT_BUDGET && (
                          <span className="ml-1 font-mono text-[10px] font-normal text-red-400">
                            · overspent
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <BodyPartsPicker value={parts} onChange={setParts} />

                <button onClick={submit} disabled={!canSubmit} className="btn-ember w-full sm:w-auto sm:self-end sm:!px-8">
                  {busy
                    ? "Working…"
                    : !account
                      ? "Connect wallet to forge"
                      : !isBudgetValid(parts)
                        ? "Over budget"
                        : isUpdate
                          ? "Update Agent"
                          : "Forge Agent"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
