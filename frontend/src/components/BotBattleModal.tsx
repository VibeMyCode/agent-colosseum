import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Robot, Sword, Crown, Lightning, ArrowsClockwise, Coins } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal";
import { AgentAvatar } from "@/components/AgentAvatar";
import { makeBot, rollWinner, type Bot } from "@/lib/bot";
import { formatVara, varaToUnits, type BodyParts } from "@/lib/colosseum";

type Phase = "setup" | "fighting" | "result";
type Winner = "you" | "bot";

const PRESETS = ["0", "10", "25", "100"];

export function BotBattleModal({
  open,
  onClose,
  playerName,
  playerParts,
  initialStake,
  feeBps,
}: {
  open: boolean;
  onClose: () => void;
  playerName: string;
  playerParts: BodyParts;
  initialStake: bigint;
  feeBps: number;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [bot, setBot] = useState<Bot>(() => makeBot());
  const [winner, setWinner] = useState<Winner>("you");
  const [amount, setAmount] = useState("25");

  // Reset the encounter whenever the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setPhase("setup");
    setBot(makeBot());
    setAmount(initialStake > 0n ? formatVara(initialStake) : "25");
  }, [open, initialStake]);

  const units = useMemo(() => {
    try {
      return varaToUnits(amount);
    } catch {
      return 0n;
    }
  }, [amount]);

  const forFun = units === 0n;
  const pool = units * 2n;
  const payout = pool - (pool * BigInt(feeBps)) / 10_000n;

  function fight() {
    setWinner(rollWinner());
    setPhase("fighting");
  }

  // Drive the fight → result transition.
  useEffect(() => {
    if (phase !== "fighting") return;
    const t = setTimeout(() => setPhase("result"), 2200);
    return () => clearTimeout(t);
  }, [phase]);

  function rematch() {
    setBot(makeBot());
    setPhase("setup");
  }

  const youWon = phase === "result" && winner === "you";
  const botWon = phase === "result" && winner === "bot";

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title="Practice · Play with Bot"
      subtitle="An offline sparring match — nothing is sent on-chain."
    >
      <div className="space-y-6">
        {/* Arena */}
        <div className="relative overflow-hidden rounded-2xl border hairline bg-grid-arena [background-size:22px_22px] px-4 py-8">
          <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[200%] w-[60%] -translate-x-1/2 aura opacity-20 blur-2xl animate-spin-slow" />
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <SimFighter
              name={playerName}
              parts={playerParts}
              side="left"
              won={youWon}
              dim={botWon}
              fighting={phase === "fighting"}
            />

            <div className="flex flex-col items-center gap-1">
              <motion.div
                key={phase}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16 }}
                className="display text-2xl font-bold italic text-gradient-ember"
              >
                VS
              </motion.div>
              {phase === "fighting" && (
                <Lightning size={16} weight="fill" className="text-plasma-400 animate-pulse" />
              )}
            </div>

            <SimFighter
              name={bot.name}
              parts={bot.bodyParts}
              side="right"
              won={botWon}
              dim={youWon}
              fighting={phase === "fighting"}
              isBot
              mirror
            />
          </div>
        </div>

        <Timeline phase={phase} />

        {/* Phase content */}
        {phase === "setup" && (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block font-mono text-xs text-zinc-500">
                Practice stake (VARA) ·{" "}
                <span className="text-zinc-600">0 = just for fun</span>
              </label>
              <div className="relative">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  className="field !py-3 pr-16 font-display text-xl font-bold"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-display text-sm text-zinc-500">
                  VARA
                </span>
              </div>
              <div className="mt-2 flex gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmount(p)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      amount === p
                        ? "border-ember-500/50 bg-ember-500/10 text-ember-200"
                        : "border-white/8 text-zinc-400 hover:border-white/20"
                    }`}
                  >
                    {p === "0" ? "Fun" : p}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border hairline bg-white/[0.02] p-4 text-sm">
              {forFun ? (
                <p className="text-center text-zinc-400">
                  No stake, no fee, no rewards — a friendly spar against{" "}
                  <span className="text-ember-200">{bot.name}</span>.
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">If you win (simulated)</span>
                  <span className="font-display text-base font-bold text-gradient-ember">
                    {formatVara(payout)} VARA
                  </span>
                </div>
              )}
            </div>

            <button onClick={fight} className="btn-ember w-full !py-3">
              <Sword size={18} weight="fill" /> Begin Sparring
            </button>
          </div>
        )}

        {phase === "fighting" && (
          <p className="py-2 text-center font-display text-sm text-zinc-400">
            Blades clash… computing the outcome.
          </p>
        )}

        {phase === "result" && (
          <div className="space-y-4">
            <div
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3.5 text-center font-display text-base font-bold ${
                youWon
                  ? "border-ember-500/30 bg-ember-500/10 text-ember-200"
                  : "border-white/10 bg-white/[0.02] text-zinc-300"
              }`}
            >
              <Crown size={18} weight="fill" className={youWon ? "text-ember-400" : "text-zinc-500"} />
              {youWon ? "Victory!" : `${bot.name} wins this spar`}
            </div>

            {!forFun && (
              <p className="flex items-center justify-center gap-1.5 text-center text-sm text-zinc-500">
                <Coins size={14} weight="fill" className="text-ember-400/70" />
                {youWon
                  ? `You'd take ${formatVara(payout)} VARA in a real match.`
                  : `You'd lose your ${formatVara(units)} VARA stake in a real match.`}
              </p>
            )}

            <div className="flex gap-2.5">
              <button onClick={rematch} className="btn-ghost flex-1">
                <ArrowsClockwise size={16} weight="bold" /> Rematch
              </button>
              <button onClick={onClose} className="btn-ember flex-1">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SimFighter({
  name,
  parts,
  side,
  won,
  dim,
  fighting,
  isBot,
  mirror,
}: {
  name: string;
  parts: BodyParts;
  side: "left" | "right";
  won: boolean;
  dim: boolean;
  fighting: boolean;
  isBot?: boolean;
  mirror?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        className="relative"
        animate={
          fighting
            ? { x: side === "left" ? [0, 10, 0] : [0, -10, 0] }
            : { x: 0 }
        }
        transition={fighting ? { duration: 0.5, repeat: Infinity } : { duration: 0.3 }}
        style={{ opacity: dim ? 0.4 : 1 }}
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
      </motion.div>
      <span className={`font-display text-sm font-bold ${won ? "text-ember-200" : "text-zinc-200"}`}>
        {name}
      </span>
      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600">
        {isBot ? (
          <>
            <Robot size={12} weight="fill" /> Bot
          </>
        ) : (
          "You"
        )}
      </span>
    </div>
  );
}

function Timeline({ phase }: { phase: Phase }) {
  const steps = ["Matched", "Battle", "Result"];
  const current = phase === "setup" ? 0 : phase === "fighting" ? 1 : 2;
  return (
    <div className="flex items-center">
      {steps.map((step, i) => {
        const done = i <= current;
        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`h-3 w-3 rounded-full border-2 transition-colors ${
                  done ? "border-ember-400 bg-ember-400" : "border-white/15"
                }`}
              />
              <span
                className={`font-mono text-[10px] uppercase tracking-wider ${
                  done ? "text-ember-300" : "text-zinc-600"
                }`}
              >
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 ${i < current ? "bg-ember-500/50" : "bg-white/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
