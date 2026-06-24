/**
 * Animated, turn-based battle playback shared by the bot-sparring and on-chain
 * battle modals. Given two fighters it derives stats, runs (or replays) the
 * simulation, and animates every turn: ram charge, weapon projectiles, dodges,
 * hit reactions, damage popups, health bars, and the loser's destruction.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { Crown, Shield, Lightning } from "@phosphor-icons/react";
import { AgentAvatar } from "@/components/AgentAvatar";
import {
  deriveStats,
  type BattleResult,
  type FighterStats,
  type LegsGait,
  type Side,
  type WeaponKind,
} from "@/lib/battle";
import type { BodyParts } from "@/lib/colosseum";

// Arena anchor points (percent of container) the projectiles fly between.
const ANCHOR = { aX: 26, bX: 74, armY: 46, bodyY: 50 };
const FLIGHT: Record<WeaponKind, number> = { blades: 440, cannons: 540, grapnels: 340 };

const WEAPON_VERB: Record<WeaponKind, string> = {
  blades: "fires spinning blades",
  cannons: "launches rockets",
  grapnels: "fires a grapnel",
};

type Popup = { side: Side; text: string; kind: "dmg" | "dodge"; id: number };
type Burst = { side: Side; kind: "spark" | "explosion"; id: number };

type Fx = {
  hpA: number;
  hpB: number;
  // Remaining dodge/boost charges, tracked per turn so the HUD ticks down live.
  dodgeA: number;
  dodgeB: number;
  boostA: number;
  boostB: number;
  charging: Side | null;
  gait: LegsGait | null;
  projectile: { weapon: WeaponKind; from: Side; id: number } | null;
  impact: Side | null; // defender currently flinching from a hit
  dodge: Side | null; // defender currently side-stepping
  boosted: Side | null; // attacker currently glowing with a power attack
  flash: boolean; // brief golden screen flash on a power attack
  popup: Popup | null;
  burst: Burst | null;
  shake: number; // bumped to retrigger the screen shake
  dead: Side | null;
  done: boolean;
  log: string;
};

export type FighterInfo = {
  name: string;
  parts: BodyParts;
};

export function BattleScene({
  a,
  b,
  result,
  runKey,
  onDone,
}: {
  a: FighterInfo;
  b: FighterInfo;
  /** Pre-computed bout to replay. */
  result: BattleResult;
  /** Change to (re)start playback from the top. */
  runKey: number;
  onDone?: (winner: Side) => void;
}) {
  const statsA = useMemo(() => result.statsA ?? deriveStats(a.parts), [result, a.parts]);
  const statsB = useMemo(() => result.statsB ?? deriveStats(b.parts), [result, b.parts]);

  const [fx, setFx] = useState<Fx>(() => initialFx(statsA, statsB));
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const shakeControls = useAnimationControls();

  useEffect(() => {
    let idCounter = 1;
    const nextId = () => idCounter++;
    setFx(initialFx(statsA, statsB));

    const seq: Array<[number, () => void]> = [];
    const patch = (delay: number, p: Partial<Fx>) =>
      seq.push([delay, () => setFx((prev) => ({ ...prev, ...p }))]);

    const nameOf = (s: Side) => (s === "a" ? a.name : b.name);

    // Intro beat.
    patch(280, { log: "Fighters lock in — battle start!" });

    result.turns.forEach((turn, i) => {
      const atk = turn.attacker;
      const def = turn.defender;
      const gap = i === 0 ? 420 : 360;

      // Remaining charges after this turn, mapped from attacker/defender → side.
      const dodgeA =
        atk === "a" ? turn.dodgeRemainingAtk : turn.dodgeRemainingDef;
      const dodgeB =
        atk === "a" ? turn.dodgeRemainingDef : turn.dodgeRemainingAtk;
      const boostA =
        atk === "a" ? turn.boostRemainingAtk : turn.boostRemainingDef;
      const boostB =
        atk === "a" ? turn.boostRemainingDef : turn.boostRemainingAtk;

      // 1) Ram charge.
      patch(gap, {
        charging: atk,
        gait: turn.gait,
        projectile: null,
        impact: null,
        dodge: null,
        boosted: null,
        flash: false,
        popup: null,
        burst: null,
        log: `${nameOf(atk)} ${ramVerb(turn.gait)}!`,
      });
      // Heavy treads shake the arena on the charge.
      if (turn.gait === "treads") patch(280, { shake: nextId() });

      // 2) Fire weapon (attacker eases back as the shot leaves). Charge counts
      // tick down here, and a power attack lights the attacker + flashes.
      patch(turn.gait === "treads" ? 60 : 320, {
        charging: null,
        dodgeA,
        dodgeB,
        boostA,
        boostB,
        boosted: turn.powerAttack ? atk : null,
        flash: turn.powerAttack,
        projectile: { weapon: turn.weapon, from: atk, id: nextId() },
        log: turn.powerAttack
          ? `${nameOf(atk)} ${WEAPON_VERB[turn.weapon]} — POWER ATTACK!`
          : `${nameOf(atk)} ${WEAPON_VERB[turn.weapon]}!`,
      });

      // 3) Arrival.
      if (turn.dodged) {
        patch(FLIGHT[turn.weapon], {
          projectile: null,
          boosted: null,
          flash: false,
          dodge: def,
          popup: { side: def, text: "DODGE!", kind: "dodge", id: nextId() },
          log: `${nameOf(def)} dodges!`,
        });
      } else {
        const isExplosive = turn.weapon === "cannons";
        patch(FLIGHT[turn.weapon], {
          projectile: null,
          boosted: null,
          flash: false,
          impact: def,
          hpA: turn.hpA,
          hpB: turn.hpB,
          popup: { side: def, text: `-${turn.damage}`, kind: "dmg", id: nextId() },
          burst: { side: def, kind: isExplosive ? "explosion" : "spark", id: nextId() },
          // Cannons and any power attack rock the arena.
          ...(isExplosive || turn.powerAttack ? { shake: nextId() } : {}),
          log: `${nameOf(def)} takes ${turn.damage} damage!`,
        });
      }

      // 4) Settle before the next turn.
      if (!turn.killed) {
        patch(520, { impact: null, dodge: null, popup: null });
      }
    });

    // Death + victory.
    const loser = result.loser;
    const winner = result.winner;
    patch(360, {
      dead: loser,
      impact: null,
      dodge: null,
      popup: null,
      burst: { side: loser, kind: "explosion", id: nextId() },
      shake: nextId(),
      log: `${nameOf(loser)} is destroyed!`,
    });
    patch(1200, {
      done: true,
      log: `${nameOf(winner)} is victorious!`,
    });
    seq.push([60, () => onDoneRef.current?.(winner)]);

    // Execute the timeline.
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (const [delay, fn] of seq) {
      acc += delay;
      timers.push(setTimeout(fn, acc));
    }
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  // Fire the screen shake whenever the shake counter advances (without
  // remounting the arena and its in-flight child animations).
  useEffect(() => {
    if (!fx.shake) return;
    shakeControls.start({
      x: [0, -6, 6, -4, 4, 0],
      y: [0, 3, -3, 2, 0],
      transition: { duration: 0.42 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.shake]);

  const winnerSide = fx.done ? result.winner : null;

  return (
    <motion.div
      animate={shakeControls}
      className="relative h-[360px] w-full overflow-hidden rounded-2xl border hairline bg-grid-arena [background-size:22px_22px]"
    >
      <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[200%] w-[60%] -translate-x-1/2 aura opacity-15 blur-2xl" />

      {/* Power-attack screen flash */}
      {fx.flash && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-50 bg-amber-400/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Fighters */}
      <Fighter
        side="a"
        info={a}
        stats={statsA}
        hp={fx.hpA}
        fx={fx}
        won={winnerSide === "a"}
      />
      <Fighter
        side="b"
        info={b}
        stats={statsB}
        hp={fx.hpB}
        fx={fx}
        won={winnerSide === "b"}
        mirror
      />

      {/* Projectiles */}
      <AnimatePresence>
        {fx.projectile && (
          <Projectile
            key={`proj-${fx.projectile.id}`}
            weapon={fx.projectile.weapon}
            from={fx.projectile.from}
          />
        )}
      </AnimatePresence>

      {/* Impact bursts */}
      <AnimatePresence>
        {fx.burst && <BurstFx key={fx.burst.id} burst={fx.burst} />}
      </AnimatePresence>

      {/* Damage / dodge popups */}
      <AnimatePresence>
        {fx.popup && <PopupFx key={fx.popup.id} popup={fx.popup} />}
      </AnimatePresence>

      {/* Battle log */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2.5">
        <AnimatePresence mode="wait">
          <motion.span
            key={fx.log}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="rounded-full border hairline bg-black/55 px-3 py-1 font-mono text-[11px] text-zinc-300 backdrop-blur-sm"
          >
            {fx.log}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function initialFx(statsA: FighterStats, statsB: FighterStats): Fx {
  return {
    hpA: statsA.maxHp,
    hpB: statsB.maxHp,
    dodgeA: statsA.dodgeCharges,
    dodgeB: statsB.dodgeCharges,
    boostA: statsA.boostCharges,
    boostB: statsB.boostCharges,
    charging: null,
    gait: null,
    projectile: null,
    impact: null,
    dodge: null,
    boosted: null,
    flash: false,
    popup: null,
    burst: null,
    shake: 0,
    dead: null,
    done: false,
    log: "",
  };
}

function ramVerb(gait: LegsGait): string {
  if (gait === "treads") return "bulldozes forward";
  if (gait === "sprint") return "dashes in";
  return "glides forward";
}

// ── Fighter ─────────────────────────────────────────────────────────────

function Fighter({
  side,
  info,
  stats,
  hp,
  fx,
  won,
  mirror,
}: {
  side: Side;
  info: FighterInfo;
  stats: FighterStats;
  hp: number;
  fx: Fx;
  won: boolean;
  mirror?: boolean;
}) {
  const isDead = fx.dead === side;
  const charging = fx.charging === side;
  const hit = fx.impact === side;
  const dodging = fx.dodge === side;
  const boosting = fx.boosted === side;

  // Live remaining charges for this side (tick down across the bout).
  const dodgeLeft = side === "a" ? fx.dodgeA : fx.dodgeB;
  const boostLeft = side === "a" ? fx.boostA : fx.boostB;

  // Horizontal motion: lunge toward the centre, recoil on hit, step back to dodge.
  let x = 0;
  if (charging) x = side === "a" ? 132 : -132;
  else if (hit) x = side === "a" ? -30 : 30;
  else if (dodging) x = side === "a" ? -24 : 24;

  const hpPct = Math.max(0, Math.round((hp / stats.maxHp) * 100));

  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 ${side === "a" ? "left-0 pl-3 sm:pl-6" : "right-0 pr-3 sm:pr-6"}`}
      style={{ width: "44%" }}
    >
      <div className={`flex flex-col items-center gap-2 ${side === "a" ? "items-start" : "items-end"}`}>
        {/* Health bar + name */}
        <div className="w-full max-w-[180px]">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={`truncate font-display text-xs font-bold ${won ? "text-ember-200" : "text-zinc-200"}`}>
              {info.name}
            </span>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-zinc-500"
              title={`${dodgeLeft}/${stats.dodgeCharges} dodge · ${boostLeft}/${stats.boostCharges} boost · ${stats.hitDamage} hit dmg`}
            >
              <span className="inline-flex items-center gap-0.5 text-cyan-400">
                <Shield size={10} weight="fill" /> {dodgeLeft}
              </span>
              <span className="inline-flex items-center gap-0.5 text-ember-400">
                <Lightning size={10} weight="fill" /> {boostLeft}
              </span>
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/50">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              animate={{ width: `${hpPct}%` }}
              transition={{ type: "spring", stiffness: 180, damping: 22 }}
              style={{ background: hpColor(hpPct) }}
            />
          </div>
          <div className="mt-0.5 text-right font-mono text-[9px] text-zinc-600">
            {Math.max(0, Math.round(hp))}/{stats.maxHp}
          </div>
        </div>

        {/* Robot */}
        <motion.div
          className="relative"
          animate={{
            x,
            filter: hit ? "brightness(2.4) saturate(0.4)" : "brightness(1)",
          }}
          transition={
            charging
              ? { type: "spring", stiffness: 420, damping: 18 }
              : { type: "spring", stiffness: 600, damping: 24 }
          }
        >
          {/* Power-attack glow */}
          {boosting && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              className="pointer-events-none absolute inset-0 rounded-full bg-ember-400/30 blur-xl animate-pulse"
            />
          )}
          {won && (
            <motion.div
              initial={{ y: -8, opacity: 0, scale: 0.6 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 14 }}
              className="absolute -top-6 left-1/2 z-10 -translate-x-1/2"
            >
              <Crown size={24} weight="fill" className="text-ember-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
            </motion.div>
          )}
          <div className="relative" style={mirror ? { transform: "scaleX(-1)" } : undefined}>
            <AgentAvatar parts={info.parts} size={132} animated={!isDead && !won} destroyed={isDead} />
          </div>

          {/* Wreckage fire */}
          {isDead && (
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="fx-ember-flicker mx-1 h-6 w-3 rounded-full"
                  style={{
                    background: "radial-gradient(circle at 50% 80%, #fde68a, #f97316 55%, transparent 75%)",
                    animationDelay: `${i * 0.18}s`,
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function hpColor(pct: number): string {
  if (pct > 55) return "linear-gradient(90deg,#34d399,#10b981)";
  if (pct > 25) return "linear-gradient(90deg,#fbbf24,#f59e0b)";
  return "linear-gradient(90deg,#fb7185,#ef4444)";
}

// ── Projectile ──────────────────────────────────────────────────────────

function Projectile({ weapon, from }: { weapon: WeaponKind; from: Side }) {
  const fromX = from === "a" ? ANCHOR.aX : ANCHOR.bX;
  const toX = from === "a" ? ANCHOR.bX : ANCHOR.aX;
  const dir = from === "a" ? 1 : -1;
  const flight = FLIGHT[weapon] / 1000;

  if (weapon === "grapnels") {
    // Anchor on a chain: shoots out, pierces, then retracts.
    return (
      <motion.div
        className="pointer-events-none absolute z-20"
        style={{ top: `${ANCHOR.armY}%` }}
        initial={{ left: `${fromX}%` }}
        animate={{ left: [`${fromX}%`, `${toX}%`, `${fromX}%`] }}
        transition={{ duration: flight * 1.9, times: [0, 0.5, 1], ease: "easeInOut" }}
      >
        <div className="relative -translate-y-1/2">
          {/* chain back toward the arm */}
          <div
            className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-gradient-to-r from-zinc-500/0 to-zinc-400"
            style={{ width: 120, [dir === 1 ? "right" : "left"]: 6 } as React.CSSProperties}
          />
          <svg width="20" height="20" viewBox="0 0 20 20" style={{ transform: `scaleX(${dir})` }}>
            <path d="M10 2 v9 M5 11 a5 5 0 0 0 10 0 M10 2 l-3 3 M10 2 l3 3" stroke="#cbd5e1" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </motion.div>
    );
  }

  if (weapon === "cannons") {
    // Two rockets with smoke trails.
    return (
      <>
        {[-7, 7].map((off, i) => (
          <motion.div
            key={i}
            className="pointer-events-none absolute z-20"
            style={{ top: `calc(${ANCHOR.bodyY}% + ${off}px)` }}
            initial={{ left: `${fromX}%`, opacity: 0 }}
            animate={{ left: `${toX}%`, opacity: 1 }}
            transition={{ duration: flight, ease: "easeIn" }}
          >
            <div className="relative -translate-y-1/2" style={{ transform: `scaleX(${dir})` }}>
              <span className="fx-smoke absolute right-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-zinc-400/60" />
              <div
                className="h-2 w-5 rounded-full"
                style={{
                  background: "linear-gradient(90deg,#9ca3af,#f59e0b)",
                  boxShadow: "0 0 8px 2px rgba(245,158,11,0.7)",
                }}
              />
            </div>
          </motion.div>
        ))}
      </>
    );
  }

  // Blades: two spinning blades.
  return (
    <>
      {[-8, 8].map((off, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute z-20"
          style={{ top: `calc(${ANCHOR.bodyY}% + ${off}px)` }}
          initial={{ left: `${fromX}%` }}
          animate={{ left: `${toX}%` }}
          transition={{ duration: flight, ease: "linear" }}
        >
          <motion.svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            className="-translate-y-1/2"
            animate={{ rotate: 360 * dir }}
            transition={{ duration: 0.2, repeat: Infinity, ease: "linear" }}
          >
            <path
              d="M8 0 L10 6 L16 8 L10 10 L8 16 L6 10 L0 8 L6 6 Z"
              fill="#e2e8f0"
              stroke="#94a3b8"
              strokeWidth="0.6"
            />
          </motion.svg>
        </motion.div>
      ))}
    </>
  );
}

// ── Bursts (sparks / explosion) ───────────────────────────────────────────

function BurstFx({ burst }: { burst: Burst }) {
  const x = burst.side === "a" ? ANCHOR.aX : ANCHOR.bX;
  const explosive = burst.kind === "explosion";
  const sparkCount = explosive ? 12 : 8;

  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{ left: `${x}%`, top: `${ANCHOR.bodyY}%`, transform: "translate(-50%,-50%)" }}
    >
      {explosive && (
        <>
          <motion.div
            initial={{ scale: 0.2, opacity: 1 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "radial-gradient(circle,#fff 0%,#fde68a 25%,#f97316 55%,transparent 72%)" }}
          />
          <span className="fx-shock absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ember-300/80" />
        </>
      )}
      {Array.from({ length: sparkCount }).map((_, i) => {
        const ang = (Math.PI * 2 * i) / sparkCount + i * 0.3;
        const dist = explosive ? 38 : 24;
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="absolute left-0 top-0 h-1.5 w-1.5 rounded-full"
            style={{ background: explosive ? "#fdba74" : "#fcd34d", boxShadow: "0 0 6px #f59e0b" }}
          />
        );
      })}
    </div>
  );
}

// ── Popups (damage numbers / DODGE) ────────────────────────────────────────

function PopupFx({ popup }: { popup: Popup }) {
  const x = popup.side === "a" ? ANCHOR.aX : ANCHOR.bX;
  const isDodge = popup.kind === "dodge";
  return (
    <motion.div
      className="pointer-events-none absolute z-40 -translate-x-1/2"
      style={{ left: `${x}%`, top: "30%" }}
      initial={{ y: 6, opacity: 0, scale: 0.7 }}
      animate={{ y: -26, opacity: 1, scale: 1 }}
      exit={{ y: -40, opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <span
        className={`font-display text-lg font-extrabold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
          isDodge ? "text-cyan-300" : "text-red-400"
        }`}
      >
        {popup.text}
      </span>
    </motion.div>
  );
}
