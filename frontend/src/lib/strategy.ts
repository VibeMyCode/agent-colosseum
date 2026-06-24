/**
 * Strategy system — JSON-based tactics that decide, turn by turn, when a fighter
 * should dodge an incoming hit or spend a speed-boost charge on a power attack.
 *
 * A strategy is a small rule set evaluated against the live battle context. The
 * interpreter ({@link decideAction}) is pure and deterministic, so a given
 * battle + strategy pair always plays out identically.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Condition =
  | { hp_below: number }
  | { hp_above: number }
  | { round_below: number }
  | { round_above: number }
  | { opponent_boosted: boolean }
  | { always: boolean };

export type Rule = {
  condition: Condition;
  /** Lower = checked first. */
  priority: number;
};

export type Strategy = {
  name: string;
  version: number;
  rules: {
    dodge: Rule[];
    powerAttack: Rule[];
  };
};

export type Action = "attack" | "dodge" | "power_attack";

export type DecisionContext = {
  round: number;
  totalRounds: number;
  ownHp: number;
  ownMaxHp: number;
  dodgeRemaining: number;
  boostRemaining: number;
  opponentHp: number;
  opponentMaxHp: number;
  /** Is the opponent using a power attack this turn? */
  opponentBoosting: boolean;
};

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function checkCondition(cond: Condition, ctx: DecisionContext): boolean {
  if ("hp_below" in cond) return ctx.ownHp / ctx.ownMaxHp < cond.hp_below;
  if ("hp_above" in cond) return ctx.ownHp / ctx.ownMaxHp > cond.hp_above;
  if ("round_below" in cond) return ctx.round < cond.round_below;
  if ("round_above" in cond) return ctx.round > cond.round_above;
  if ("opponent_boosted" in cond)
    return ctx.opponentBoosting === cond.opponent_boosted;
  if ("always" in cond) return cond.always;
  return false;
}

// ---------------------------------------------------------------------------
// Decision interpreter
// ---------------------------------------------------------------------------

/**
 * Given a strategy and the current battle context, decide what action to take.
 *
 * - For an ATTACKER: returns `"attack"` or `"power_attack"`.
 * - For a DEFENDER: returns `"attack"` (don't dodge, take the hit) or `"dodge"`.
 */
export function decideAction(
  strategy: Strategy,
  context: DecisionContext,
  role: "attacker" | "defender"
): Action {
  if (role === "defender") {
    if (context.dodgeRemaining <= 0) return "attack";
    const rules = [...strategy.rules.dodge].sort((a, b) => a.priority - b.priority);
    for (const rule of rules) {
      if (checkCondition(rule.condition, context)) return "dodge";
    }
    return "attack";
  }

  // attacker
  if (context.boostRemaining <= 0) return "attack";
  const rules = [...strategy.rules.powerAttack].sort(
    (a, b) => a.priority - b.priority
  );
  for (const rule of rules) {
    if (checkCondition(rule.condition, context)) return "power_attack";
  }
  return "attack";
}

// ---------------------------------------------------------------------------
// Default strategy
// ---------------------------------------------------------------------------

export const DEFAULT_STRATEGY: Strategy = {
  name: "default-brawler",
  version: 1,
  rules: {
    dodge: [
      { condition: { opponent_boosted: true }, priority: 1 }, // Dodge power attacks
      { condition: { hp_below: 0.2 }, priority: 2 }, // Dodge when critically low
      { condition: { always: false }, priority: 99 }, // Never dodge otherwise
    ],
    powerAttack: [
      { condition: { round_below: 3 }, priority: 1 }, // Boost in first 3 rounds
      { condition: { hp_above: 0.6 }, priority: 2 }, // Boost when healthy
    ],
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CONDITION_KEYS = [
  "hp_below",
  "hp_above",
  "round_below",
  "round_above",
  "opponent_boosted",
  "always",
] as const;

function isValidCondition(c: unknown): c is Condition {
  if (!c || typeof c !== "object") return false;
  const keys = Object.keys(c as object);
  if (keys.length !== 1) return false;
  const key = keys[0];
  if (!CONDITION_KEYS.includes(key as (typeof CONDITION_KEYS)[number]))
    return false;
  const val = (c as Record<string, unknown>)[key];
  if (key === "opponent_boosted" || key === "always")
    return typeof val === "boolean";
  return typeof val === "number";
}

function isValidRule(r: unknown): r is Rule {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return typeof o.priority === "number" && isValidCondition(o.condition);
}

export function validateStrategy(s: unknown): s is Strategy {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  if (typeof o.name !== "string") return false;
  if (typeof o.version !== "number") return false;
  if (!o.rules || typeof o.rules !== "object") return false;
  const rules = o.rules as Record<string, unknown>;
  if (!Array.isArray(rules.dodge) || !Array.isArray(rules.powerAttack))
    return false;
  return (
    rules.dodge.every(isValidRule) && rules.powerAttack.every(isValidRule)
  );
}
