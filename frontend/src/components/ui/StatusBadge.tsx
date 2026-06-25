import type { MatchStatus } from "@/lib/colosseum";

const STYLES: Record<
  MatchStatus,
  { label: string; cls: string; dot: string }
> = {
  Waiting: {
    label: "Awaiting Challenger",
    cls: "bg-ember-500/10 text-ember-300 border-ember-500/25",
    dot: "bg-ember-400",
  },
  Ready: {
    label: "In Arena",
    cls: "bg-plasma-500/10 text-plasma-300 border-plasma-500/30",
    dot: "bg-plasma-400 animate-pulse",
  },
  Completed: {
    label: "Decided",
    cls: "bg-cyber-500/10 text-cyber-300 border-cyber-500/25",
    dot: "bg-cyber-400",
  },
  Claimed: {
    label: "Settled",
    cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    dot: "bg-emerald-400",
  },
  Closed: {
    label: "Closed",
    cls: "bg-zinc-600/10 text-zinc-400 border-zinc-600/25",
    dot: "bg-zinc-500",
  },
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const s = STYLES[status];
  return (
    <span className={`chip border ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
