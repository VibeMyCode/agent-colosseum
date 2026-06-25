import { useEffect, useState } from "react";
import {
  Sword,
  Crown,
  ArrowsClockwise,
  Robot,
  CaretDown,
} from "@phosphor-icons/react";
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
import { type BodyParts } from "@/lib/colosseum";

type Phase = "setup" | "fighting" | "result";

/** Known strategy file names (without .json) served from /strategies/ */
const STRATEGY_FILES = [
  "default",
  "aggressive",
  "tank",
  "counter",
] as const;

type StrategyFile = (typeof STRATEGY_FILES)[number];

const STRATEGY_LABELS: Record<StrategyFile, string> = {
  default: "Default Brawler",
  aggressive: "Aggressive",
  tank: "Tank",
  counter: "Counter",
};

function randomBotStrategy(
  strategies: { name: string; strategy: Strategy }[]
): Strategy {
  if (strategies.length === 0) return DEFAULT_STRATEGY;
  return strategies[Math.floor(Math.random() * strategies.length)].strategy;
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
  const [runKey, setRunKey] = useState(0);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  const [showReport, setShowReport] = useState(false);
  void initialStake;
  void feeBps;
  // Loaded strategies from /strategies/*.json
  const [loadedStrategies, setLoadedStrategies] = useState<
    { name: string; strategy: Strategy }[]
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Player strategy — defaults to built-in DEFAULT_STRATEGY
  const [strategyA, setStrategyA] = useState<Strategy>(DEFAULT_STRATEGY);
  const [strategyB, setStrategyB] = useState<Strategy>(() => randomBotStrategy([]));
  const [strategyUrl, setStrategyUrl] = useState("");
  const [strategyError, setStrategyError] = useState<string | null>(null);
  // Dropdown selection: a preset name, "url", or "json".
  const [strategyMode, setStrategyMode] = useState("default");
  const [strategyJson, setStrategyJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  // Load all strategy JSON files on mount
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadAll() {
      const results: { name: string; strategy: Strategy }[] = [];
      let hasError = false;

      for (const file of STRATEGY_FILES) {
        const s = await fetchStrategy(`/strategies/${file}.json`);
        if (cancelled) return;
        if (s) {
          results.push({ name: STRATEGY_LABELS[file], strategy: s });
        } else {
          hasError = true;
        }
      }

      if (cancelled) return;

      // If nothing loaded, fall back to the built-in DEFAULT_STRATEGY
      if (results.length === 0) {
        results.push({ name: "Default Brawler", strategy: DEFAULT_STRATEGY });
        setLoadError("Could not load strategy files, using built-in defaults");
      } else if (hasError) {
        setLoadError("Some strategy files failed to load");
      } else {
        setLoadError(null);
      }

      setLoadedStrategies(results);

      // Set player strategy to "default" if available, otherwise first loaded
      const defaultEntry = results.find((r) => r.strategy.name === "default-brawler");
      if (defaultEntry) {
        setStrategyA(defaultEntry.strategy);
      } else if (results.length > 0) {
        setStrategyA(results[0].strategy);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset the encounter whenever the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setPhase("setup");
    setBot(makeBot());
    setStrategyB(randomBotStrategy(loadedStrategies));
    setResult(null);
    setWinner(null);
    setShowReport(false);
    setStrategyMode("default");
    setStrategyUrl("");
    setStrategyJson("");
    setStrategyError(null);
    setJsonError(null);
  }, [open]);

  // Load a strategy from the URL when one is entered.
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

  function fight() {
    const seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
    const res = simulate(playerParts, bot.bodyParts, strategyA, strategyB, seed);
    setResult(res);
    setWinner(null);
    setShowReport(false);
    setRunKey((k) => k + 1);
    setPhase("fighting");
  }

  function rematch() {
    setBot(makeBot());
    setStrategyB(randomBotStrategy(loadedStrategies));
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
      maxWidth="max-w-3xl"
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
              {/* Strategy — always visible */}
              <div className="rounded-xl border hairline bg-white/[0.02]">
                <div className="flex items-center gap-2 border-b hairline px-4 py-3">
                  <span className="font-mono text-xs font-semibold text-zinc-300">
                    Bot Strategy ⚙️
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  {/* Load error hint */}
                  {loadError && (
                    <p className="font-mono text-[10px] text-amber-400">{loadError}</p>
                  )}

                  {/* Preset dropdown */}
                  <div>
                    <label className="mb-1 block font-mono text-[10px] text-zinc-500">
                      Choose a preset, or load your own
                    </label>
                    <select
                      value={strategyMode}
                      onChange={(e) => {
                        const v = e.target.value;
                        setStrategyMode(v);
                        setStrategyError(null);
                        setJsonError(null);

                        if (v === "url") {
                          // Don't change strategyA; user will enter URL
                          return;
                        }
                        if (v === "json") {
                          // Don't change strategyA; user will paste JSON
                          return;
                        }

                        setStrategyUrl("");
                        setStrategyJson("");
                        // Find the preset by label
                        const preset = loadedStrategies.find((p) => p.name === v);
                        if (preset) {
                          setStrategyA(preset.strategy);
                        }
                      }}
                      className="field !text-xs !py-2"
                    >
                      {loadedStrategies.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                      <option value="url">Custom URL…</option>
                      <option value="json">Paste JSON…</option>
                    </select>
                  </div>

                  {/* Custom URL — only when selected */}
                  {strategyMode === "url" && (
                    <div>
                      <input
                        value={strategyUrl}
                        onChange={(e) => setStrategyUrl(e.target.value)}
                        placeholder="https://raw.githubusercontent.com/.../strategy.json"
                        className="field !text-xs !py-2"
                      />
                      {strategyError && (
                        <p className="mt-1 font-mono text-[10px] text-red-400">
                          {strategyError}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Paste JSON — only when selected */}
                  {strategyMode === "json" && (
                    <div>
                      <textarea
                        value={strategyJson}
                        onChange={(e) => {
                          const text = e.target.value;
                          setStrategyJson(text);
                          if (!text.trim()) {
                            setJsonError(null);
                            return;
                          }
                          try {
                            const parsed = JSON.parse(text);
                            if (validateStrategy(parsed)) {
                              setStrategyA(parsed);
                              setJsonError(null);
                            } else {
                              setJsonError("Invalid strategy JSON");
                            }
                          } catch {
                            setJsonError("Invalid strategy JSON");
                          }
                        }}
                        rows={4}
                        placeholder='{"name":"my-strat","version":1,"rules":{"dodge":[],"powerAttack":[]}}'
                        className="field !text-xs !py-2 font-mono"
                      />
                      {jsonError && (
                        <p className="mt-1 font-mono text-[10px] text-red-400">
                          {jsonError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

            <div className="rounded-xl border hairline bg-white/[0.02] p-4 text-sm">
              <p className="text-center text-zinc-400">
                No stake, no fee, no rewards — a friendly spar against{" "}
                <span className="text-ember-200">{bot.name}</span>. Winner is
                decided by your chassis stats and strategy.
              </p>
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

            {/* Strategy report (collapsed by default to keep the arena large) */}
            {perf && (
              <div className="rounded-xl border hairline bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setShowReport((v) => !v)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <h3 className="font-display text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    📊 Strategy Report
                  </h3>
                  <CaretDown
                    size={14}
                    weight="bold"
                    className={`ml-auto text-zinc-500 transition-transform ${
                      showReport ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {showReport && (
                  <div className="space-y-3 border-t hairline p-4">
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

// ---------------------------------------------------------------------------
// Inline loadout component
// ---------------------------------------------------------------------------
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
      <StatPreview parts={parts} className="w-full max-w-[240px]" />
    </div>
  );
}
