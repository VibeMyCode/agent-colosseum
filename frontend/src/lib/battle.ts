/**
 * Stat- and strategy-driven, turn-based battle engine.
 *
 * Body parts map onto combat stats (dodge charges / HP / speed-boost charges /
 * weapon damage) and each fighter carries a {@link Strategy} that decides, turn
 * by turn, when to spend a dodge charge or unleash a boosted power attack.
 * `simulate()` plays a deterministic bout and returns the full timeline (which
 * the UI replays as an animated fight) plus a per-fighter strategy performance
 * report used to coach the player after the battle.
 */
import type { BodyParts } from "@/lib/colosseum";
import {
  DEFAULT_STRATEGY,
  decideAction,
  type DecisionContext,
  type Strategy,
} from "@/lib/strategy";

// ---------------------------------------------------------------------------
// Stat tables (indexed by the 0–2 variant of each part)
// ---------------------------------------------------------------------------

/** Head → number of dodge charges available per battle. */
export const HEAD_DODGE_CHARGES = [1, 2, 3] as const;

/** Body → max HP. */
export const BODY_HP = [80, 100, 120] as const;

/** Legs → turn interval (ms between this fighter's attacks). Lower = faster. */
export const LEGS_INTERVAL = [1500, 2500, 2000] as const;

/** Legs → number of speed-boost (power-attack) charges per battle. */
export const LEGS_BOOST_CHARGES = [1, 2, 3] as const;

/** Legs → speed-boost damage multiplier. */
export const LEGS_BOOST_MULT = [1.2, 1.3, 1.5] as const;

/** Arms → base weapon damage. */
export const ARMS_DAMAGE = [10, 15, 20] as const;

export type WeaponKind = "blades" | "cannons" | "grapnels";
export const ARMS_WEAPON: readonly WeaponKind[] = ["blades", "grapnels", "cannons"];

export type LegsGait = "sprint" | "treads" | "hover";
export const LEGS_GAIT: readonly LegsGait[] = ["sprint", "treads", "hover"];

export type SpeedTier = "Fast" | "Slow" | "Medium";
export const LEGS_SPEED_TIER: readonly SpeedTier[] = ["Fast", "Slow", "Medium"];

// ---------------------------------------------------------------------------
// Derived fighter stats
// ---------------------------------------------------------------------------

export type FighterStats = {
  maxHp: number;
  /** Dodge charges available for the whole battle. */
  dodgeCharges: number;
  /** Speed-boost (power-attack) charges available for the whole battle. */
  boostCharges: number;
  /** Damage multiplier applied to a boosted power attack. */
  boostMultiplier: number;
  /** ms between attacks. */
  intervalMs: number;
  weaponDamage: number;
  /** Damage of a single connecting hit (weapon damage). */
  hitDamage: number;
  weapon: WeaponKind;
  gait: LegsGait;
  speedTier: SpeedTier;
};

export function deriveStats(parts: BodyParts): FighterStats {
  const head = clampPart(parts.head_type);
  const body = clampPart(parts.body_type);
  const arms = clampPart(parts.arms_type);
  const legs = clampPart(parts.legs_type);

  const weaponDamage = ARMS_DAMAGE[arms];
  return {
    maxHp: BODY_HP[body],
    dodgeCharges: HEAD_DODGE_CHARGES[head],
    boostCharges: LEGS_BOOST_CHARGES[legs],
    boostMultiplier: LEGS_BOOST_MULT[legs],
    intervalMs: LEGS_INTERVAL[legs],
    weaponDamage,
    hitDamage: weaponDamage,
    weapon: ARMS_WEAPON[arms],
    gait: LEGS_GAIT[legs],
    speedTier: LEGS_SPEED_TIER[legs],
  };
}

function clampPart(v: number): 0 | 1 | 2 {
  if (v <= 0) return 0;
  if (v >= 2) return 2;
  return 1;
}

/** Derive a 32-bit numeric seed from arbitrary text (e.g. a 0x match seed). */
export function seedFrom(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export type Side = "a" | "b";

export type Turn = {
  attacker: Side;
  defender: Side;
  weapon: WeaponKind;
  gait: LegsGait;
  weaponDamage: number;
  dodged: boolean;
  /** Was this a boosted (power) attack? */
  powerAttack: boolean;
  /** Damage actually applied (0 when dodged). */
  damage: number;
  hpA: number; // HP of A after this turn
  hpB: number; // HP of B after this turn
  killed: boolean;
  // Remaining charges after this turn resolves.
  dodgeRemainingAtk: number;
  dodgeRemainingDef: number;
  boostRemainingAtk: number;
  boostRemainingDef: number;
};

export type FighterPerformance = {
  dodgeChargesUsed: number;
  dodgeChargesRemaining: number;
  boostChargesUsed: number;
  boostChargesRemaining: number;
  /** Total bonus damage dealt by power attacks (over a normal hit). */
  boostDamageDealt: number;
  /** Total damage actually received (after dodge). */
  damageTaken: number;
  suggestions: string[];
};

export type StrategyPerformance = {
  a: FighterPerformance;
  b: FighterPerformance;
};

export type BattleResult = {
  winner: Side;
  loser: Side;
  turns: Turn[];
  statsA: FighterStats;
  statsB: FighterStats;
  performance: StrategyPerformance;
};

const SAFETY_TURNS = 200;

type SideState = {
  hp: number;
  dodgeRemaining: number;
  boostRemaining: number;
  dodgeUsed: number;
  boostUsed: number;
  boostBonus: number; // bonus damage dealt by this side's power attacks
  damageTaken: number;
  /** How many of this side's power attacks the opponent dodged. */
  powerAttacksDodged: number;
};

function newSideState(stats: FighterStats): SideState {
  return {
    hp: stats.maxHp,
    dodgeRemaining: stats.dodgeCharges,
    boostRemaining: stats.boostCharges,
    dodgeUsed: 0,
    boostUsed: 0,
    boostBonus: 0,
    damageTaken: 0,
    powerAttacksDodged: 0,
  };
}

/**
 * Play a full bout. Faster legs (lower interval) take more turns; each fighter's
 * strategy decides when to dodge incoming hits and when to spend a speed-boost
 * charge on a heavier power attack.
 */
export function simulate(
  partsA: BodyParts,
  partsB: BodyParts,
  strategyA?: Strategy | null,
  strategyB?: Strategy | null,
  _seed?: number
): BattleResult {
  const stratA = strategyA ?? DEFAULT_STRATEGY;
  const stratB = strategyB ?? DEFAULT_STRATEGY;

  const statsA = deriveStats(partsA);
  const statsB = deriveStats(partsB);

  const A = newSideState(statsA);
  const B = newSideState(statsB);

  // Time of each fighter's *next* attack (ms). First strike at one interval in.
  let nextA = statsA.intervalMs;
  let nextB = statsB.intervalMs;

  const turns: Turn[] = [];

  for (let i = 0; i < SAFETY_TURNS; i++) {
    if (A.hp <= 0 || B.hp <= 0) break;

    // Whoever is due first attacks; ties go to A.
    const attacker: Side = nextA <= nextB ? "a" : "b";
    if (attacker === "a") nextA += statsA.intervalMs;
    else nextB += statsB.intervalMs;

    const atkStats = attacker === "a" ? statsA : statsB;
    const atkStrat = attacker === "a" ? stratA : stratB;
    const defStrat = attacker === "a" ? stratB : stratA;
    const atk = attacker === "a" ? A : B;
    const def = attacker === "a" ? B : A;

    const round = i + 1;

    // 1) Attacker decides whether to spend a boost charge on a power attack.
    const atkCtx: DecisionContext = {
      round,
      totalRounds: SAFETY_TURNS,
      ownHp: atk.hp,
      ownMaxHp: atkStats.maxHp,
      dodgeRemaining: atk.dodgeRemaining,
      boostRemaining: atk.boostRemaining,
      opponentHp: def.hp,
      opponentMaxHp: (attacker === "a" ? statsB : statsA).maxHp,
      opponentBoosting: false,
    };
    const atkAction = decideAction(atkStrat, atkCtx, "attacker");
    // Real charges/perks ALWAYS override the strategy: a boost only fires if the
    // fighter actually has a speed-boost charge left. "boost every hit" can't
    // conjure charges out of thin air.
    const powerAttack = atkAction === "power_attack" && atk.boostRemaining > 0;
    if (powerAttack) {
      atk.boostRemaining -= 1;
      atk.boostUsed += 1;
    }

    // 2) Defender decides whether to dodge — knowing if the hit is boosted.
    const defStats = attacker === "a" ? statsB : statsA;
    const defCtx: DecisionContext = {
      round,
      totalRounds: SAFETY_TURNS,
      ownHp: def.hp,
      ownMaxHp: defStats.maxHp,
      dodgeRemaining: def.dodgeRemaining,
      boostRemaining: def.boostRemaining,
      opponentHp: atk.hp,
      opponentMaxHp: atkStats.maxHp,
      opponentBoosting: powerAttack,
    };
    const defAction = decideAction(defStrat, defCtx, "defender");
    // Real charges/perks ALWAYS override the strategy: a fighter can only dodge
    // while it has a dodge charge. If the strategy says "dodge" but dodge_charges
    // is 0, the hit lands for full damage.
    const dodged = defAction === "dodge" && def.dodgeRemaining > 0;
    if (dodged) {
      def.dodgeRemaining -= 1;
      def.dodgeUsed += 1;
      if (powerAttack) atk.powerAttacksDodged += 1;
    }

    // 3) Resolve damage.
    const baseDamage = atkStats.hitDamage;
    const fullDamage = powerAttack
      ? Math.round(baseDamage * atkStats.boostMultiplier)
      : baseDamage;
    const damage = dodged ? 0 : fullDamage;

    if (!dodged) {
      def.hp = Math.max(0, def.hp - damage);
      def.damageTaken += damage;
      if (powerAttack) atk.boostBonus += fullDamage - baseDamage;
    }

    const killed = A.hp <= 0 || B.hp <= 0;
    turns.push({
      attacker,
      defender: attacker === "a" ? "b" : "a",
      weapon: atkStats.weapon,
      gait: atkStats.gait,
      weaponDamage: atkStats.weaponDamage,
      dodged,
      powerAttack,
      damage,
      hpA: A.hp,
      hpB: B.hp,
      killed,
      dodgeRemainingAtk: atk.dodgeRemaining,
      dodgeRemainingDef: def.dodgeRemaining,
      boostRemainingAtk: atk.boostRemaining,
      boostRemainingDef: def.boostRemaining,
    });
  }

  // Winner: whoever still stands. On the (rare) safety cutoff, higher HP% wins.
  let winner: Side;
  if (A.hp <= 0 && B.hp > 0) winner = "b";
  else if (B.hp <= 0 && A.hp > 0) winner = "a";
  else winner = A.hp / statsA.maxHp >= B.hp / statsB.maxHp ? "a" : "b";

  const performance = buildPerformance(A, B, statsA, statsB, winner);

  return {
    winner,
    loser: winner === "a" ? "b" : "a",
    turns,
    statsA,
    statsB,
    performance,
  };
}

// ---------------------------------------------------------------------------
// Performance + suggestions
// ---------------------------------------------------------------------------

function buildPerformance(
  A: SideState,
  B: SideState,
  statsA: FighterStats,
  statsB: FighterStats,
  winner: Side
): StrategyPerformance {
  return {
    a: fighterPerformance(A, statsA, winner === "a"),
    b: fighterPerformance(B, statsB, winner === "b"),
  };
}

function fighterPerformance(
  s: SideState,
  stats: FighterStats,
  won: boolean
): FighterPerformance {
  const dodgeMax = stats.dodgeCharges;
  const boostMax = stats.boostCharges;
  const perf: FighterPerformance = {
    dodgeChargesUsed: s.dodgeUsed,
    dodgeChargesRemaining: s.dodgeRemaining,
    boostChargesUsed: s.boostUsed,
    boostChargesRemaining: s.boostRemaining,
    boostDamageDealt: s.boostBonus,
    damageTaken: s.damageTaken,
    suggestions: [],
  };
  perf.suggestions = buildSuggestions(perf, s, dodgeMax, boostMax, won);
  return perf;
}

function buildSuggestions(
  perf: FighterPerformance,
  s: SideState,
  dodgeMax: number,
  boostMax: number,
  won: boolean
): string[] {
  const out: string[] = [];

  // Dodge usage.
  if (dodgeMax > 0 && perf.dodgeChargesUsed === 0) {
    out.push(
      `You used 0 of ${dodgeMax} dodge charges — consider adding dodge rules in your strategy for when HP is low`
    );
  } else if (perf.dodgeChargesUsed > 0) {
    out.push(
      `You dodged successfully ${perf.dodgeChargesUsed}/${dodgeMax} times — great timing!`
    );
  }

  // Boost usage.
  if (boostMax > 0 && perf.boostChargesUsed === 0) {
    out.push(
      "You never used speed boost — set `round_below: <early_rounds>` to activate power attacks"
    );
  } else if (boostMax > 0 && perf.boostChargesUsed === boostMax) {
    out.push(`You used all ${boostMax} speed charges — aggressive play!`);
  }

  // Saved dodge charges.
  if (perf.dodgeChargesRemaining >= 3) {
    out.push(
      `You saved ${perf.dodgeChargesRemaining} dodge charges that went unused — could have dodged more aggressively`
    );
  }

  // Opponent countered our power attacks.
  if (s.powerAttacksDodged > 0) {
    out.push(
      `Your opponent dodged ${s.powerAttacksDodged} of your power attacks — they had a counter-strategy`
    );
  }

  // General: lost with charges in the tank.
  if (
    !won &&
    (perf.dodgeChargesRemaining > 0 || perf.boostChargesRemaining > 0)
  ) {
    out.push(
      "You finished with unused charges — could have used them for an advantage"
    );
  }

  // Keep only the most relevant 3–4.
  return out.slice(0, 4);
}

/**
 * Like {@link simulate} but guarantees the bout ends with `forced` winning —
 * used when an on-chain match already recorded the winner and we only want to
 * replay a plausible fight. The strategy-driven engine is deterministic, so if
 * the natural result already matches we return it; otherwise we fall back to a
 * biased roll so playback never contradicts the recorded result.
 */
export function simulateForcedWinner(
  partsA: BodyParts,
  partsB: BodyParts,
  seed: number,
  forced: Side,
  strategyA?: Strategy | null,
  strategyB?: Strategy | null
): BattleResult {
  const natural = simulate(partsA, partsB, strategyA, strategyB, seed);
  if (natural.winner === forced) return natural;
  return simulateBiased(partsA, partsB, forced, strategyA, strategyB);
}

/** Fallback: the favoured side never gets hit and always dodges. */
function simulateBiased(
  partsA: BodyParts,
  partsB: BodyParts,
  forced: Side,
  strategyA?: Strategy | null,
  strategyB?: Strategy | null
): BattleResult {
  const stratA = strategyA ?? DEFAULT_STRATEGY;
  const stratB = strategyB ?? DEFAULT_STRATEGY;

  const statsA = deriveStats(partsA);
  const statsB = deriveStats(partsB);

  const A = newSideState(statsA);
  const B = newSideState(statsB);

  let nextA = statsA.intervalMs;
  let nextB = statsB.intervalMs;
  const turns: Turn[] = [];

  for (let i = 0; i < SAFETY_TURNS; i++) {
    if (A.hp <= 0 || B.hp <= 0) break;
    const attacker: Side = nextA <= nextB ? "a" : "b";
    if (attacker === "a") nextA += statsA.intervalMs;
    else nextB += statsB.intervalMs;

    const atkStats = attacker === "a" ? statsA : statsB;
    const atkStrat = attacker === "a" ? stratA : stratB;
    const atk = attacker === "a" ? A : B;
    const def = attacker === "a" ? B : A;
    const defender: Side = attacker === "a" ? "b" : "a";
    const defStats = attacker === "a" ? statsB : statsA;
    const round = i + 1;

    // Attacker still consults its strategy for power attacks.
    const atkAction = decideAction(
      atkStrat,
      {
        round,
        totalRounds: SAFETY_TURNS,
        ownHp: atk.hp,
        ownMaxHp: atkStats.maxHp,
        dodgeRemaining: atk.dodgeRemaining,
        boostRemaining: atk.boostRemaining,
        opponentHp: def.hp,
        opponentMaxHp: defStats.maxHp,
        opponentBoosting: false,
      },
      "attacker"
    );
    // Real charges override the bias too: no charge → no boost.
    const powerAttack = atkAction === "power_attack" && atk.boostRemaining > 0;
    if (powerAttack) {
      atk.boostRemaining -= 1;
      atk.boostUsed += 1;
    }

    // Bias: the favoured fighter avoids incoming hits — but ONLY while it still
    // has dodge charges. Once they run out it takes damage like anyone else, so
    // the replay never shows a dodge the fighter couldn't actually afford.
    const dodged = defender === forced && def.dodgeRemaining > 0;
    if (dodged) {
      def.dodgeRemaining -= 1;
      def.dodgeUsed += 1;
      if (powerAttack) atk.powerAttacksDodged += 1;
    }

    const baseDamage = atkStats.hitDamage;
    const fullDamage = powerAttack
      ? Math.round(baseDamage * atkStats.boostMultiplier)
      : baseDamage;
    const damage = dodged ? 0 : fullDamage;
    if (!dodged) {
      def.hp = Math.max(0, def.hp - damage);
      def.damageTaken += damage;
      if (powerAttack) atk.boostBonus += fullDamage - baseDamage;
    }

    const killed = A.hp <= 0 || B.hp <= 0;
    turns.push({
      attacker,
      defender,
      weapon: atkStats.weapon,
      gait: atkStats.gait,
      weaponDamage: atkStats.weaponDamage,
      dodged,
      powerAttack,
      damage,
      hpA: A.hp,
      hpB: B.hp,
      killed,
      dodgeRemainingAtk: atk.dodgeRemaining,
      dodgeRemainingDef: def.dodgeRemaining,
      boostRemainingAtk: atk.boostRemaining,
      boostRemainingDef: def.boostRemaining,
    });
  }

  const performance = buildPerformance(A, B, statsA, statsB, forced);

  return {
    winner: forced,
    loser: forced === "a" ? "b" : "a",
    turns,
    statsA,
    statsB,
    performance,
  };
}
