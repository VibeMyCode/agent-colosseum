import { useEffect, useMemo, useState } from "react";
import { Sword, Crown, Coins, ArrowsClockwise, Robot } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal";
import { BattleScene } from "@/components/battle/BattleScene";
import { StatPreview } from "@/components/battle/StatPreview";
import { makeBot, type Bot } from "@/lib/bot";
import { simulate, type BattleResult, type Side } from "@/lib/battle";
import {
  DEFAULT_STRATEGY,
  validateStrategy,
  type Strategy,
} from "@/lib/strategy";
import { formatVara, varaToUnits, type BodyParts } from "@/lib/colosseum";

type Phase = "setup" | "fighting" | "result";

const PRESETS = ["0", "10", "25", "100"];

const STRATEGY_PRESETS: { name: string; strategy: Strategy }[] = [
  { name: "Balanced", strategy: { ...DEFAULT_STRATEGY } },
  {
    name: "Aggressive",
    strategy: {
      name: "aggressive",
      version: 1,
      rules: {
        dodge: [{ condition: { opponent_boosted: true }, priority: 1 }],
        powerAttack: [{ condition: { always: true }, priority: 1 }],
      },
    },
  },
  {
    name: "Tank",
    strategy: {
      name: "tank",
      version: 1,
      rules: {
        dodge: [
          { condition: { hp_below: 0.4 }, priority: 1 },
          { condition: { opponent_boosted: true }, priority: 2 },
        ],
        powerAttack: [{ condition: { always: false }, priority: 99 }],
      },
    },
  },
  {
    name: "Counter",
    strategy: {
      name: "counter",
      version: 1,
      rules: {
        dodge: [
          { condition: { opponent_boosted: true }, priority: 1 },
          { condition: { always: false }, priority: 99 },
        ],
        powerAttack: [
          { condition: { opponent_boosted: true }, priority: 1 },
          { condition: { hp_above: 0.5 }, priority: 2 },
        ],
      },
    },
  },
];

function randomBotStrategy(): Strategy {
  return STRATEGY_PRESETS[Math.floor(Math.random() * STRATEGY_PRESETS.length)]
    .strategy;
}

async function fetchStrategy(url: string): Promise<Strategy | null> {
  try {
    const res = await fetch(url);
    const json = await res.json();
    return validateStrategy(json) ? json : null;
  } catch {
    return null;
  }
}

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
  const [amount, setAmount] = useState("25");
  const [runKey, setRunKey] = useState(0);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);

  // Strategies — the player controls A; the bot gets a random preset.
  const [strategyA, setStrategyA] = useState<Strategy>(DEFAULT_STRATEGY);
  const [strategyB, setStrategyB] = useState<Strategy>(() => randomBotStrategy());
  const [strategyUrl, setStrategyUrl] = useState("");
  const [strategyError, setStrategyError] = useState<string | null>(null);

  // Reset the encounter whenever the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setPhase("setup");
    setBot(makeBot());
    setStrategyB(randomBotStrategy());
    setResult(null);
    setWinner(null);
    setAmount(initialStake > 0n ? formatVara(initialStake) : "25");
  }, [open, initialStake]);

  // Load a strategy from the URL when one is entered. An empty URL leaves the
  // currently-selected strategy (a preset, or the default) untouched so the
  // preset buttons stay authoritative.
  useEffect(() => {
    const url = strategyUrl.trim();
    if (!url) {
      setStrategyError(null);
      return;
    }
    let cancelled = false;
    fetchStrategy(url).then((s) => {
      if (cancelled) return;
      if (s) {
        setStrategyA(s);
        setStrategyError(null);
      } else {
        setStrategyA(DEFAULT_STRATEGY);
        setStrategyError("Could not load strategy from URL, using default");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [strategyUrl]);

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
    // Fresh seed each bout so rematches differ; the simulation — strategy and
    // stats, not a coin flip — decides the winner.
    const seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
    const res = simulate(playerParts, bot.bodyParts, strategyA, strategyB, seed);
    setResult(res);
    setWinner(null);
    setRunKey((k) => k + 1);
    setPhase("fighting");
  }

  function rematch() {
    setBot(makeBot());
    setStrategyB(randomBotStrategy());
    setResult(null);
    setWinner(null);
    setPhase("setup");
  }

  const youWon = winner === "a";
  const perf = result?.performance.a ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title="Practice · Play with Bot"
      subtitle="An offline sparring match — nothing is sent on-chain."
    >
      <div className="space-y-6">
        {/* Arena / battle */}
        {phase === "setup" ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border hairline bg-grid-arena [background-size:22px_22px] px-4 py-5">
            <Loadout name={playerName} parts={playerParts} tag="You" />
            <div className="display text-2xl font-bold italic text-gradient-ember">VS</div>
            <Loadout name={bot.name} parts={bot.bodyParts} tag="Bot" isBot />
          </div>
        ) : result ? (
          <BattleScene
            a={{ name: playerName, parts: playerParts }}
            b={{ name: bot.name, parts: bot.bodyParts }}
            result={result}
            runKey={runKey}
            onDone={(w) => {
              setWinner(w);
              setPhase("result");
            }}
          />
        ) : null}

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

            {/* Strategy */}
            <details className="rounded-xl border hairline bg-white/[0.02]">
              <summary className="cursor-pointer px-4 py-3 font-mono text-xs text-zinc-400 hover:text-zinc-200">
                Bot Strategy ⚙️
              </summary>
              <div className="border-t hairline p-4 space-y-3">
                <div>
                  <label className="mb-1 block font-mono text-[10px] text-zinc-500">
                    Strategy URL (optional)
                  </label>
                  <input
                    value={strategyUrl}
                    onChange={(e) => setStrategyUrl(e.target.value)}
                    placeholder="https://github.com/.../strategy.json"
                    className="field !text-xs !py-2"
                  />
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">
                    Default: balanced brawler (dodge power attacks, boost early)
                  </p>
                  {strategyError && (
                    <p className="mt-1 font-mono text-[10px] text-red-400">
                      {strategyError}
                    </p>
                  )}
                </div>

                {/* Strategy preview */}
                <div className="rounded-lg border hairline bg-black/20 p-3">
                  <div className="font-mono text-[10px] text-zinc-400">
                    {strategyA.name} v{strategyA.version}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px]">
                    <div>
                      <span className="text-cyan-400">Dodge:</span>
                      {strategyA.rules.dodge.filter(
                        (r) =>
                          !("always" in r.condition && r.condition.always === false)
                      ).length > 0
                        ? " active"
                        : " none"}
                    </div>
                    <div>
                      <span className="text-ember-400">Boost:</span>{" "}
                      {strategyA.rules.powerAttack.length} rule(s)
                    </div>
                  </div>
                </div>

                {/* Quick presets */}
                <div className="flex flex-wrap gap-1.5">
                  {STRATEGY_PRESETS.map((p) => {
                    const active = strategyA.name === p.strategy.name && !strategyUrl;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          setStrategyUrl("");
                          setStrategyError(null);
                          setStrategyA(p.strategy);
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                          active
                            ? "border-ember-500/50 bg-ember-500/10 text-ember-200"
                            : "border-white/8 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>

            <div className="rounded-xl border hairline bg-white/[0.02] p-4 text-sm">
              {forFun ? (
                <p className="text-center text-zinc-400">
                  No stake, no fee, no rewards — a friendly spar against{" "}
                  <span className="text-ember-200">{bot.name}</span>. Winner is
                  decided by your chassis stats and strategy.
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
          <p className="py-1 text-center font-display text-sm text-zinc-400">
            The fight is on — stats and strategy decide the victor.
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

            {/* Strategy report */}
            {perf && (
              <div className="rounded-xl border hairline bg-white/[0.03] p-4 space-y-3">
                <h3 className="font-display text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Strategy Report
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border hairline bg-black/20 p-2.5">
                    <div className="font-mono text-[10px] text-cyan-400">🛡️ Dodge</div>
                    <div className="font-display text-lg font-bold text-zinc-100">
                      {perf.dodgeChargesUsed}/
                      {perf.dodgeChargesUsed + perf.dodgeChargesRemaining}
                    </div>
                    <div className="font-mono text-[9px] text-zinc-500">
                      charges used
                    </div>
                  </div>
                  <div className="rounded-lg border hairline bg-black/20 p-2.5">
                    <div className="font-mono text-[10px] text-ember-400">
                      ⚡ Speed Boost
                    </div>
                    <div className="font-display text-lg font-bold text-zinc-100">
                      {perf.boostChargesUsed}/
                      {perf.boostChargesUsed + perf.boostChargesRemaining}
                    </div>
                    <div className="font-mono text-[9px] text-zinc-500">
                      charges used
                    </div>
                  </div>
                </div>

                {perf.suggestions.length > 0 && (
                  <div className="space-y-1">
                    {perf.suggestions.map((s, i) => (
                      <p
                        key={i}
                        className="font-mono text-[10px] text-zinc-400 flex items-start gap-1.5"
                      >
                        <span className="text-zinc-600 mt-0.5">💡</span>
                        {s}
                      </p>
                    ))}
                  </div>
                )}
              </div>
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

function Loadout({
  name,
  parts,
  tag,
  isBot,
}: {
  name: string;
  parts: BodyParts;
  tag: string;
  isBot?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-display text-sm font-bold text-zinc-100">{name}</span>
      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600">
        {isBot ? <Robot size={12} weight="fill" /> : null}
        {tag}
      </span>
      <StatPreview parts={parts} className="w-full max-w-[190px]" />
    </div>
  );
}
