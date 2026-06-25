import { motion } from "framer-motion";
import { Coins, Crown, Question, LockKey } from "@phosphor-icons/react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ShareLink } from "@/components/ui/ShareLink";
import { useColosseum } from "@/providers/colosseum-provider";
import { useChainApi } from "@/providers/chain-provider";
import {
  formatVara,
  sameActor,
  type Agent,
  type BodyParts,
  type Match,
} from "@/lib/colosseum";
import { buildMatchLink, isPrivate } from "@/lib/share";

const FALLBACK: BodyParts = {
  head_type: 0,
  body_type: 0,
  arms_type: 0,
  legs_type: 0,
};

function partsFor(agents: Agent[], actorId: string | null): BodyParts | null {
  if (!actorId) return null;
  return (
    agents.find((a) => a.agentId.toLowerCase() === actorId.toLowerCase())
      ?.bodyParts ?? FALLBACK
  );
}

export function MatchCard({
  match,
  onOpen,
}: {
  match: Match;
  onOpen: (m: Match) => void;
}) {
  const { agents } = useColosseum();
  const { programId } = useChainApi();
  const aParts = partsFor(agents, match.agentA) ?? FALLBACK;
  const bParts = partsFor(agents, match.agentB);

  const aWon = sameActor(match.winner, match.agentA);
  const bWon = sameActor(match.winner, match.agentB);
  const priv = isPrivate(programId, match.id);

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      onClick={() => onOpen(match)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(match);
        }
      }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="glass glass-hover group w-full cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-500/40"
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={match.status} />
          {priv && (
            <span className="chip border border-plasma-500/30 bg-plasma-500/10 text-plasma-300">
              <LockKey size={11} weight="fill" /> Private
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-zinc-600">#{match.id}</span>
      </div>

      {/* Versus */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-3 py-4">
        <Fighter
          name={match.agentAName || "Agent A"}
          parts={aParts}
          won={aWon}
          align="right"
        />

        <div className="relative flex h-16 w-12 items-center justify-center">
          <div className="absolute h-12 w-12 rounded-full bg-ember-500/10 blur-md" />
          <span className="display relative text-lg font-bold italic text-zinc-500 group-hover:text-ember-300 transition-colors">
            VS
          </span>
        </div>

        {bParts ? (
          <Fighter
            name={match.agentBName || "Agent B"}
            parts={bParts}
            won={bWon}
            align="left"
            mirror
          />
        ) : (
          <EmptySlot />
        )}
      </div>

      {/* Footer */}
      <div className="border-t hairline px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <Coins size={13} weight="fill" className="text-ember-400/80" />
            Stake
          </span>
          <span className="font-display text-sm font-bold text-zinc-100">
            {formatVara(match.stake)}{" "}
            <span className="text-xs font-medium text-zinc-500">VARA</span>
          </span>
        </div>
        {match.champion && match.bank > 0n && (
          <div className="mt-2.5 flex items-center gap-2 border-t hairline pt-2.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600">
              <Crown size={11} weight="fill" /> Bank
            </span>
            <span className="ml-auto font-display text-xs font-bold text-ember-200">
              {formatVara(match.bank)} VARA
            </span>
          </div>
        )}
        {priv && (
          <div className="mt-2.5 flex items-center gap-2 border-t hairline pt-2.5">
            <span className="shrink-0 text-[11px] text-zinc-600">Invite</span>
            <ShareLink
              value={buildMatchLink(programId, match.id)}
              label={`…/${match.id}`}
              className="ml-auto"
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Fighter({
  name,
  parts,
  won,
  align,
  mirror,
}: {
  name: string;
  parts: BodyParts;
  won: boolean;
  align: "left" | "right";
  mirror?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-1.5 ${
        align === "right" ? "items-end sm:items-center" : "items-start sm:items-center"
      }`}
    >
      <div className="relative">
        {won && (
          <Crown
            size={16}
            weight="fill"
            className="absolute -top-2 left-1/2 -translate-x-1/2 text-ember-400 drop-shadow"
          />
        )}
        <div style={mirror ? { transform: "scaleX(-1)" } : undefined}>
          <AgentAvatar parts={parts} size={58} />
        </div>
      </div>
      <span
        className={`max-w-full truncate font-display text-xs font-semibold ${
          won ? "text-ember-200" : "text-zinc-300"
        }`}
        title={name}
      >
        {name}
      </span>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-[58px] w-[50px] items-center justify-center rounded-xl border border-dashed border-white/12">
        <Question size={22} weight="bold" className="text-zinc-700" />
      </div>
      <span className="font-display text-xs text-zinc-600">Open slot</span>
    </div>
  );
}
