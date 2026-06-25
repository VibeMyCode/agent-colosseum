import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Sword,
  Coins,
  ShieldCheck,
  Lightning,
  Robot,
  Play,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal";
import { AgentAvatar } from "@/components/AgentAvatar";
import { BattleScene } from "@/components/battle/BattleScene";
import { CopyAddress } from "@/components/CopyAddress";
import {
  seedFrom,
  simulate,
  simulateForcedWinner,
  type BattleResult,
} from "@/lib/battle";
import { useColosseum } from "@/providers/colosseum-provider";
import { useWallet } from "@/providers/chain-provider";
import { useTx } from "@/hooks/use-tx";
import {
  actorIdToAddress,
  claimBank,
  claimWinnings,
  closeMatch,
  declareRematch,
  deriveStrategyHash,
  formatVara,
  joinMatch,
  sameActor,
  setBattleResult,
  OWNER_ACTOR_ID,
  type Agent,
  type BodyParts,
  type Match,
  type MatchStatus,
} from "@/lib/colosseum";

const FALLBACK: BodyParts = { head_type: 0, body_type: 0, arms_type: 0, legs_type: 0 };
const STEPS: MatchStatus[] = ["Waiting", "Ready", "Completed", "Claimed", "Closed"];

function partsFor(agents: Agent[], id: string | null): BodyParts {
  if (!id) return FALLBACK;
  return (
    agents.find((a) => a.agentId.toLowerCase() === id.toLowerCase())?.bodyParts ??
    FALLBACK
  );
}

export function BattleModal({
  matchId,
  open,
  onClose,
  onPlayBot,
}: {
  matchId: number | null;
  open: boolean;
  onClose: () => void;
  onPlayBot?: (m: Match) => void;
}) {
  const { matches, agents, myActorId, config, refresh } = useColosseum();
  const { account } = useWallet();
  const { run, busy } = useTx();
  const [watching, setWatching] = useState(false);
  const [battleDone, setBattleDone] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [rematchCountdown, setRematchCountdown] = useState(0);

  const match = useMemo(
    () => matches.find((m) => m.id === matchId) ?? null,
    [matches, matchId]
  );

  // Pre-compute the animated bout. When the on-chain result is in, force the
  // recorded winner so the replay can never contradict the chain; otherwise
  // play a stat-driven preview seeded by the match seed.
  const battle = useMemo<BattleResult | null>(() => {
    if (!match || !match.agentB) return null;
    const aP = partsFor(agents, match.agentA);
    const bP = partsFor(agents, match.agentB);
    const seed = seedFrom(`${match.id}:${match.seed}`);
    if (match.winner) {
      const forced = sameActor(match.winner, match.agentA) ? "a" : "b";
      return simulateForcedWinner(aP, bP, seed, forced);
    }
    return simulate(aP, bP, undefined, undefined, seed);
  }, [match, agents]);

  // Collapse the replay whenever a different match is opened.
  useEffect(() => {
    setWatching(false);
  }, [matchId]);

  // 10-second countdown after match becomes Ready before owner can resolve
  // (guarded: skip when match is null — hooks must still be called)
  useEffect(() => {
    if (match?.status === "Ready" && countdown === 0) {
      setCountdown(10);
    } else if (match?.status !== "Ready") {
      setCountdown(0);
    }
  }, [match?.id, match?.status]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // 60-second countdown after match becomes Completed for rematch intent (legacy flow)
  useEffect(() => {
    if (match?.status === "Completed" && !match?.champion && rematchCountdown === 0) {
      setRematchCountdown(60);
    } else if (match?.status !== "Completed") {
      setRematchCountdown(0);
    }
  }, [match?.id, match?.status, match?.champion]);

  useEffect(() => {
    if (rematchCountdown <= 0) return;
    const t = setInterval(() => setRematchCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [rematchCountdown]);

  // Auto-close match when rematch countdown expires
  useEffect(() => {
    if (rematchCountdown === 1 && match?.status === "Completed") {
      // Auto-close by calling closeMatch
      run({
        pending: "Closing match…",
        success: "Match closed",
        action: (sails, signArgs) => closeMatch(sails, signArgs, match!.id),
      }).catch(() => {
        // Ignore auto-close errors
      });
    }
  }, [rematchCountdown, match?.status]);

  // Auto-play battle animation when countdown expires
  useEffect(() => {
    if (countdown === 0 && match?.status === "Ready" && battle && !battleDone && !watching) {
      setBattleDone(false);
      setWatching(true);
      setRunKey((k) => k + 1);
    }
  }, [countdown, match?.status, battle]);

  if (!match) {
    return <Modal open={open} onClose={onClose} title="Battle" children={null} />;
  }

  const aParts = partsFor(agents, match.agentA);
  const bParts = partsFor(agents, match.agentB);
  const aWon = sameActor(match.winner, match.agentA);
  const bWon = sameActor(match.winner, match.agentB);
  const isChampion = match.champion ? sameActor(myActorId, match.champion) : false;
  const decided = match.status === "Completed" || match.status === "Claimed" || (match.status === "Waiting" && Boolean(match.champion));

  const isCreator = sameActor(myActorId, match.agentA);
  const isWinner = sameActor(myActorId, match.winner);
  const isParticipant = isCreator || sameActor(myActorId, match.agentB);
  const registered = Boolean(agents.find((a) => sameActor(a.agentId, myActorId)));
  const isOwner = sameActor(myActorId, OWNER_ACTOR_ID);

  const feeBps = BigInt(config?.feeBps ?? 200);
  const pool = match.stake * 2n;
  const payout = pool - (pool * feeBps) / 10_000n;

  async function join() {
    await run({
      pending: "Accepting challenge…",
      success: "Challenge accepted",
      successMessage: () => "The battle is set.",
      action: (sails, signArgs) => joinMatch(sails, signArgs, match!.id, match!.stake),
    });
  }

  async function claim() {
    const res = await run({
      pending: "Claiming winnings…",
      success: "Winnings claimed",
      successMessage: (r) => String(r),
      action: (sails, signArgs) => claimWinnings(sails, signArgs, match!.id),
    });
    if (res !== null) onClose();
  }

  async function resolve() {
    if (!battle || !match) return;
    const winnerSide = battle.winner;
    const winner = winnerSide === "a" ? match.agentA : match.agentB;
    if (!winner) return;
    const hash = await deriveStrategyHash(`${match!.id}:${winner}:${match!.seed}`);
    await run({
      pending: "Recording battle result…",
      success: "Result recorded",
      successMessage: () =>
        `${winnerSide === "a" ? match!.agentAName : match!.agentBName} is victorious.`,
      action: (sails, signArgs) =>
        setBattleResult(sails, signArgs, match!.id, winner, hash),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={`Battle #${match.id}`}
      subtitle={`Pool of ${formatVara(pool)} VARA · winner takes ${formatVara(payout)}`}
    >
      <div className="space-y-6">
        {/* Arena — static line-up, or the animated replay when watching */}
        {watching && battle ? (
          <div className="space-y-2">
            <BattleScene
              a={{ name: match.agentAName || "Agent A", parts: aParts }}
              b={{ name: match.agentBName || "Agent B", parts: bParts }}
              result={battle}
              runKey={runKey}
              onDone={() => setBattleDone(true)}
            />
            <div className="flex justify-center gap-2">
              <button
                onClick={() => { setRunKey((k) => k + 1); setBattleDone(false); }}
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                <ArrowsClockwise size={14} weight="bold" /> Replay
              </button>
              <button
                onClick={() => setWatching(false)}
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
        <div className="relative overflow-hidden rounded-2xl border hairline bg-grid-arena [background-size:22px_22px] px-4 py-8">
          <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[200%] w-[60%] -translate-x-1/2 aura opacity-20 blur-2xl animate-spin-slow" />
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <ArenaFighter
              name={match.agentAName || "Agent A"}
              actorId={match.agentA}
              parts={aParts}
              won={aWon}
              dim={decided && !aWon}
              side="left"
            />

            <div className="flex flex-col items-center gap-1">
              <motion.div
                key={match.status}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16 }}
                className="display text-2xl font-bold italic text-gradient-ember"
              >
                VS
              </motion.div>
              {match.status === "Ready" && (
                <Lightning size={16} weight="fill" className="text-plasma-400 animate-pulse" />
              )}
            </div>

            {match.agentB ? (
              <ArenaFighter
                name={match.agentBName || "Agent B"}
                actorId={match.agentB}
                parts={bParts}
                won={bWon}
                dim={decided && !bWon}
                side="right"
                mirror
              />
            ) : (
              <div className="flex flex-col items-center gap-2 opacity-60">
                <div className="flex h-[88px] w-[72px] items-center justify-center rounded-2xl border border-dashed border-white/15">
                  <Sword size={26} className="text-zinc-700" />
                </div>
                <span className="font-display text-sm text-zinc-500">Awaiting…</span>
              </div>
            )}
          </div>

          {battle && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => {
                  setRunKey((k) => k + 1);
                  setWatching(true);
                }}
                className="btn-ghost !px-4 !py-1.5 text-xs"
              >
                <Play size={14} weight="fill" className="text-ember-300" />
                {decided ? "Watch battle replay" : "Preview the fight"}
              </button>
            </div>
          )}
        </div>
        )}

        {/* Timeline */}
        <Timeline status={match.status} />

        {/* Economics */}
        <div className="grid grid-cols-3 gap-2">
          <Metric icon={<Coins size={15} weight="fill" />} label="Each stake" value={`${formatVara(match.stake)}`} />
          <Metric icon={<ShieldCheck size={15} weight="fill" />} label="Fee" value={`${((config?.feeBps ?? 200) / 100).toFixed(1)}%`} />
          <Metric icon={<Crown size={15} weight="fill" />} label="Winner takes" value={`${formatVara(payout)}`} accent />
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {match.status === "Waiting" && !match.champion && (
            <>
              {isCreator ? (
                <Hint>You opened this match — waiting for a challenger to stake {formatVara(match.stake)} VARA.</Hint>
              ) : !account ? (
                <Hint>Connect a wallet to accept this challenge.</Hint>
              ) : !registered ? (
                <Hint>Forge an agent before stepping into the arena.</Hint>
              ) : (
                <button onClick={join} disabled={busy} className="btn-ember w-full !py-3">
                  <Sword size={18} weight="fill" />
                  {busy ? "Accepting…" : `Accept Challenge · ${formatVara(match.stake)} VARA`}
                </button>
              )}

              {onPlayBot && (
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/8" />
                  <span className="text-[11px] uppercase tracking-wider text-zinc-600">or</span>
                  <div className="h-px flex-1 bg-white/8" />
                </div>
              )}
              {onPlayBot && (
                <button onClick={() => onPlayBot(match)} className="btn-ghost w-full">
                  <Robot size={18} weight="fill" className="text-plasma-300" />
                  Play with Bot
                  <span className="ml-1 text-xs font-normal text-zinc-500">· practice, offline</span>
                </button>
              )}
            </>
          )}

          {match.status === "Waiting" && match.champion && (
            <>
              {isChampion ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-ember-500/25 bg-ember-500/[0.06] px-4 py-3">
                    <Crown size={18} weight="fill" className="text-ember-400" />
                    <span className="font-display font-bold text-ember-200">🏆 You are champion!</span>
                  </div>
                  <div className="text-sm text-zinc-400">
                    Bank: <span className="text-ember-200 font-bold">{formatVara(match.bank)}</span>
                  </div>
                  <button
                    onClick={async () => {
                      const claimed = await run({
                        pending: "Claiming bank…",
                        success: "Bank claimed",
                        successMessage: () => `Claimed ${formatVara(match.bank)} VARA`,
                        action: (sails, signArgs) => claimBank(sails, signArgs, match!.id),
                      });
                      if (claimed !== null) onClose();
                    }}
                    disabled={busy}
                    className="btn-ember w-full !py-3"
                  >
                    <Coins size={18} weight="fill" />
                    {busy ? "Claiming…" : `Claim Bank · ${formatVara(match.bank)} VARA`}
                  </button>
                </div>
              ) : !account ? (
                <Hint>Connect a wallet to challenge the champion.</Hint>
              ) : !registered ? (
                <Hint>Forge an agent before stepping into the arena.</Hint>
              ) : (
                <div className="space-y-3">
                  <button onClick={join} disabled={busy} className="btn-plasma w-full !py-3">
                    <Sword size={18} weight="fill" />
                    {busy ? "Joining…" : `Challenge Champion · ${formatVara(match.stake)} VARA`}
                  </button>
                </div>
              )}
            </>
          )}

          {match.status === "Ready" && (
            <>
              {countdown > 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-plasma-500/25 bg-plasma-500/[0.06] px-4 py-4">
                  <span className="font-display text-lg font-bold text-plasma-300">{countdown}</span>
                  <span className="text-sm text-zinc-400">seconds to battle</span>
                  <Lightning size={16} weight="fill" className="text-plasma-400 animate-pulse" />
                </div>
              ) : !battleDone ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-ember-500/25 bg-ember-500/[0.06] px-4 py-3">
                  <Sword size={18} weight="fill" className="text-ember-400 animate-pulse" />
                  <span className="text-sm text-zinc-300">Battle in progress…</span>
                </div>
              ) : battle ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3">
                    <Crown size={20} weight="fill" className="text-ember-400" />
                    <span className="font-display text-base font-bold text-ember-200">
                      {battle.winner === "a" ? match.agentAName : match.agentBName} is victorious!
                    </span>
                  </div>
                  {isOwner || isParticipant ? (
                    <button onClick={resolve} disabled={busy} className="btn-plasma w-full !py-3">
                      {busy ? "Submitting…" : "Submit Result to Chain"}
                    </button>
                  ) : (
                    <Hint>
                      Waiting for the arena operator to record the outcome on-chain.
                    </Hint>
                  )}
                </div>
              ) : null}
            </>
          )}

          {match.status === "Completed" && (
            <>
              {isWinner ? (
                <button onClick={claim} disabled={busy} className="btn-ember w-full !py-3">
                  <Coins size={18} weight="fill" />
                  {busy ? "Claiming…" : `Claim ${formatVara(payout)} VARA`}
                </button>
              ) : (
                <Hint>
                  Match decided — <span className="text-ember-200">{aWon ? match.agentAName : match.agentBName}</span> won. Winnings await their claim.
                </Hint>
              )}

              {rematchCountdown > 0 && (isCreator || sameActor(myActorId, match.agentB)) && (
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-plasma-500/25 bg-plasma-500/[0.06] px-4 py-3">
                    <span className="font-display text-lg font-bold text-plasma-300">{rematchCountdown}s</span>
                    <span className="text-sm text-zinc-400">to signal rematch intent</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={async () => {
                        await run({
                          pending: "Signaling rematch intent…",
                          success: "Rematch intent recorded",
                          successMessage: () => "Waiting for opponent to confirm…",
                          action: (sails, signArgs) => declareRematch(sails, signArgs, match!.id),
                        });
                        refresh();
                      }}
                      disabled={busy}
                      className="btn-plasma !py-2.5"
                    >
                      <ArrowsClockwise size={14} weight="fill" />
                      {busy ? "Signaling…" : "Fight Again"}
                    </button>
                    <button
                      onClick={async () => {
                        await run({
                          pending: "Closing match…",
                          success: "Match closed",
                          action: (sails, signArgs) => closeMatch(sails, signArgs, match!.id),
                        });
                      }}
                      disabled={busy}
                      className="btn-ghost !py-2.5"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {match.status === "Claimed" && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              <Crown size={16} weight="fill" />
              {aWon ? match.agentAName : match.agentBName} claimed {formatVara(payout)} VARA.
            </div>
          )}

          {match.status === "Closed" && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-600/25 bg-zinc-600/10 px-4 py-3 text-sm text-zinc-400">
              <span>Match closed · view only</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ArenaFighter({
  name,
  actorId,
  parts,
  won,
  dim,
  side,
  mirror,
}: {
  name: string;
  actorId: string;
  parts: BodyParts;
  won: boolean;
  dim: boolean;
  side: "left" | "right";
  mirror?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative ${side === "left" ? "animate-clash-left" : "animate-clash-right"}`}
        style={{ opacity: dim ? 0.4 : 1, transition: "opacity 0.4s" }}
      >
        {won && (
          <motion.div
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute -top-5 left-1/2 -translate-x-1/2"
          >
            <Crown size={22} weight="fill" className="text-ember-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.7)]" />
          </motion.div>
        )}
        <div style={mirror ? { transform: "scaleX(-1)" } : undefined}>
          <AgentAvatar parts={parts} size={90} animated={!dim} />
        </div>
      </div>
      <span className={`font-display text-sm font-bold ${won ? "text-ember-200" : "text-zinc-200"}`}>
        {name}
      </span>
      <CopyAddress address={actorIdToAddress(actorId)} className="text-[11px]" />
    </div>
  );
}

function Timeline({ status }: { status: MatchStatus }) {
  const current = STEPS.indexOf(status);
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`h-3 w-3 rounded-full border-2 transition-colors ${
                  done
                    ? "border-ember-400 bg-ember-400"
                    : "border-white/15 bg-transparent"
                }`}
              />
              <span className={`font-mono text-[10px] uppercase tracking-wider ${done ? "text-ember-300" : "text-zinc-600"}`}>
                {step}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 ${i < current ? "bg-ember-500/50" : "bg-white/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border hairline bg-white/[0.02] px-3 py-3 text-center">
      <div className={`flex items-center justify-center gap-1 ${accent ? "text-ember-400" : "text-zinc-500"}`}>
        {icon}
      </div>
      <div className={`mt-1 font-display text-base font-bold ${accent ? "text-gradient-ember" : "text-zinc-100"}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border hairline bg-white/[0.02] px-4 py-3 text-center text-sm text-zinc-400">
      {children}
    </div>
  );
}
