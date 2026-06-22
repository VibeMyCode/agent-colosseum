import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Sword, Sparkle } from "@phosphor-icons/react";
import { MatchCard } from "@/components/MatchCard";
import { BattleModal } from "@/components/BattleModal";
import { CreateMatchModal } from "@/components/CreateMatchModal";
import { useColosseum } from "@/providers/colosseum-provider";
import type { Match, MatchStatus } from "@/lib/colosseum";

type Filter = "all" | "open" | "live" | "decided" | "mine";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "live", label: "Live" },
  { id: "decided", label: "Decided" },
  { id: "mine", label: "Mine" },
];

const DECIDED: MatchStatus[] = ["Completed", "Claimed"];

export function MatchArena() {
  const { matches, loading, ready, myActorId } = useColosseum();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const counts = useMemo(
    () => ({
      open: matches.filter((m) => m.status === "Waiting").length,
      live: matches.filter((m) => m.status === "Ready").length,
    }),
    [matches]
  );

  const shown = useMemo(() => {
    const mine = (m: Match) =>
      [m.agentA, m.agentB].some(
        (x) => x && myActorId && x.toLowerCase() === myActorId.toLowerCase()
      );
    return matches
      .filter((m) => {
        switch (filter) {
          case "open":
            return m.status === "Waiting";
          case "live":
            return m.status === "Ready";
          case "decided":
            return DECIDED.includes(m.status);
          case "mine":
            return mine(m);
          default:
            return true;
        }
      })
      .sort((a, b) => b.id - a.id);
  }, [matches, filter, myActorId]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Sword size={20} weight="fill" className="text-ember-400" />
          <h2 className="display text-lg font-bold text-zinc-100">The Arena</h2>
          {counts.live > 0 && (
            <span className="chip border border-plasma-500/30 bg-plasma-500/10 text-plasma-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-plasma-400" />
              {counts.live} live
            </span>
          )}
        </div>
        <button onClick={() => setCreating(true)} className="btn-ember !px-4 !py-2 text-sm">
          <Plus size={16} weight="bold" />
          Open Match
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="filter-pill"
                  className="absolute inset-0 rounded-lg border border-white/10 bg-white/[0.06]"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <span className="relative">
                {f.label}
                {f.id === "open" && counts.open > 0 && (
                  <span className="ml-1.5 text-xs text-ember-400">{counts.open}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {!ready ? (
        <NotReady />
      ) : loading && matches.length === 0 ? (
        <SkeletonGrid />
      ) : shown.length === 0 ? (
        <EmptyState filter={filter} onCreate={() => setCreating(true)} />
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {shown.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={(mm) => setSelected(mm.id)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <BattleModal
        matchId={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
      <CreateMatchModal open={creating} onClose={() => setCreating(false)} />
    </section>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass h-[188px] overflow-hidden">
          <div className="h-full w-full shimmer" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filter, onCreate }: { filter: Filter; onCreate: () => void }) {
  return (
    <div className="glass flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Sparkle size={30} weight="duotone" className="text-zinc-600" />
      <p className="font-display text-base font-semibold text-zinc-300">
        {filter === "mine" ? "You have no matches yet" : "No matches here yet"}
      </p>
      <p className="max-w-xs text-sm text-zinc-500">
        Open a match, stake your VARA, and wait for a challenger to step into the
        arena.
      </p>
      <button onClick={onCreate} className="btn-ember mt-1 !px-4 !py-2 text-sm">
        <Plus size={16} weight="bold" /> Open the first match
      </button>
    </div>
  );
}

function NotReady() {
  return (
    <div className="glass flex flex-col items-center gap-2 px-6 py-14 text-center">
      <Sword size={28} weight="duotone" className="text-zinc-600" />
      <p className="font-display text-base font-semibold text-zinc-300">
        Connect to a deployed Colosseum
      </p>
      <p className="max-w-sm text-sm text-zinc-500">
        Set the program ID from the network menu (top-left) to load the arena.
      </p>
    </div>
  );
}
