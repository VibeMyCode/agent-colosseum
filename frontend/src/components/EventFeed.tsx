import { AnimatePresence, motion } from "framer-motion";
import {
  Sword,
  HandFist,
  Crown,
  Coins,
  Broadcast,
  type Icon,
} from "@phosphor-icons/react";
import { useEvents } from "@/providers/events-provider";
import { formatVara } from "@/lib/colosseum";

type Meta = { icon: Icon; color: string; text: (d: Record<string, unknown>) => string };

function id(d: Record<string, unknown>): string {
  const v = d.match_id;
  return v == null ? "?" : String(v);
}
function vara(d: Record<string, unknown>, key: string): string {
  try {
    return formatVara(String(d[key] ?? "0"));
  } catch {
    return "0";
  }
}

const META: Record<string, Meta> = {
  MatchCreated: {
    icon: Sword,
    color: "text-ember-400",
    text: (d) => `Match #${id(d)} opened · ${vara(d, "stake")} VARA staked`,
  },
  MatchJoined: {
    icon: HandFist,
    color: "text-plasma-400",
    text: (d) => `A challenger joined match #${id(d)}`,
  },
  BattleResultSet: {
    icon: Crown,
    color: "text-cyber-400",
    text: (d) => `Match #${id(d)} decided — winner declared`,
  },
  ClaimedWinnings: {
    icon: Coins,
    color: "text-emerald-400",
    text: (d) => `Match #${id(d)} settled · ${vara(d, "payout")} VARA claimed`,
  },
};

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export function EventFeed() {
  const { events, status } = useEvents();

  return (
    <section className="glass overflow-hidden">
      <div className="flex items-center gap-2.5 border-b hairline px-5 py-4">
        <Broadcast
          size={18}
          weight="fill"
          className={status === "listening" ? "text-emerald-400" : "text-zinc-500"}
        />
        <h2 className="display text-base font-bold text-zinc-100">Live Feed</h2>
        <span
          className={`ml-auto chip border ${
            status === "listening"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 text-zinc-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === "listening" ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
            }`}
          />
          {status === "listening" ? "on-chain" : status}
        </span>
      </div>

      <div className="max-h-[320px] overflow-y-auto p-2">
        {events.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-zinc-600">
            Battles will appear here as they unfold on-chain.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const meta = META[e.name];
              const Ico = meta?.icon ?? Broadcast;
              return (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.03]"
                >
                  <div className={`shrink-0 ${meta?.color ?? "text-zinc-400"}`}>
                    <Ico size={17} weight="fill" />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                    {meta ? meta.text(e.data) : e.name}
                  </p>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-600">
                    {ago(e.timestamp)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
