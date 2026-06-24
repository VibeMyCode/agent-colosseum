import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sword, Users, Fire, Coins, CaretDown } from "@phosphor-icons/react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useColosseum } from "@/providers/colosseum-provider";
import { formatVara, type BodyParts } from "@/lib/colosseum";

const SHOWCASE: BodyParts = { head_type: 2, body_type: 2, arms_type: 0, legs_type: 2 };

export function Hero() {
  const { matches, agents, config } = useColosseum();
  const [open, setOpen] = useState(true);

  const stats = useMemo(() => {
    const open = matches.filter((m) => m.status === "Waiting").length;
    const live = matches.filter((m) => m.status === "Ready").length;
    const staked = agents.reduce((acc, a) => acc + a.totalStaked, 0n);
    return { open, live, staked, gladiators: agents.length };
  }, [matches, agents]);

  return (
    <section className="relative overflow-hidden rounded-3xl border hairline">
      <div className="absolute inset-0 bg-grid-arena [background-size:32px_32px] opacity-50" />
      <div className="absolute inset-0 bg-ember-radial" />
      <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-plasma-500/10 blur-3xl" />

      {/* Collapsible header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex w-full items-center gap-2.5 px-6 py-4 text-left transition-colors hover:bg-white/[0.02] sm:px-10"
      >
        <Fire size={18} weight="fill" className="text-ember-400" />
        <h2 className="display text-base font-bold text-zinc-100">
          Agent Colosseum
        </h2>
        <span className="chip border border-ember-500/25 bg-ember-500/10 text-ember-300">
          <span className="h-1.5 w-1.5 rounded-full bg-ember-400 animate-pulse" />
          On-chain · Vara Network
        </span>
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
            className="relative overflow-hidden"
          >
      <div className="relative grid items-center gap-6 px-6 py-10 sm:px-10 sm:py-12 md:grid-cols-[1fr_auto]">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="display text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
          >
            <span className="text-gradient-ember">AGENT</span>{" "}
            <span className="text-zinc-100">COLOSSEUM</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 max-w-md text-balance text-base text-zinc-400"
          >
            Forge an AI agent, stake your VARA, and send it into the arena.
            Winner takes the pool — every battle settled on-chain.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-6 flex flex-wrap gap-3"
          >
            <a href="#forge" className="btn-ember">
              <Sword size={18} weight="fill" /> Forge Your Agent
            </a>
            <a href="#arena" className="btn-ghost">
              Enter the Arena
            </a>
          </motion.div>

          {/* Stats */}
          <div className="mt-8 grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-4">
            <StatChip icon={<Users size={16} weight="fill" />} value={stats.gladiators} label="Gladiators" />
            <StatChip icon={<Sword size={16} weight="fill" />} value={stats.open} label="Open" />
            <StatChip icon={<Fire size={16} weight="fill" />} value={stats.live} label="Live" accent />
            <StatChip
              icon={<Coins size={16} weight="fill" />}
              value={`${formatVara(stats.staked, { maxFractionDigits: 0 })}`}
              label="Staked"
            />
          </div>
        </div>

        {/* Showcase fighter */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 160, damping: 18 }}
          className="hidden justify-self-center md:block"
        >
          <div className="relative flex h-56 w-56 items-center justify-center">
            <div className="absolute inset-0 aura rounded-full opacity-25 blur-2xl animate-spin-slow" />
            <AgentAvatar parts={SHOWCASE} size={200} animated />
          </div>
        </motion.div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>

      {config?.paused && (
        <div className="relative border-t border-amber-500/20 bg-amber-500/10 px-6 py-2.5 text-center text-xs font-medium text-amber-300">
          ⚠ The arena is currently paused by the operator. New matches are disabled.
        </div>
      )}
    </section>
  );
}

function StatChip({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="glass !rounded-xl px-3 py-2.5">
      <div className={`flex items-center gap-1.5 ${accent ? "text-ember-400" : "text-zinc-500"}`}>
        {icon}
      </div>
      <div className="mt-1 font-display text-xl font-bold text-zinc-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
    </div>
  );
}
