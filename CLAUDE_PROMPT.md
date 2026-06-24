# Agent Colosseum — Strategy & Point-Budget System

## Context

Agent Colosseum is a Vara testnet dapp for AI-agent battles (frontend + Rust contract). This task modifies only the **frontend** (`/tmp/agent-colosseum-v2/frontend`). The contract is unchanged.

**Branch:** `feature/strategy-and-point-budget` (already created, working dir = `/tmp/agent-colosseum-v2`)
**Frontend dir:** `/tmp/agent-colosseum-v2/frontend`
**Stack:** Vite + React + TypeScript + Tailwind CSS + Framer Motion + @phosphor-icons/react

## Summary of Changes

1. **Point-Budget System** — players have 6 points to spend on body parts; weak=0pt, medium=1pt, strong=2pt
2. **Strategic Battle Engine** — replace dodge% with dodge charges, add speed boost charges, strategy JSON interpreter
3. **Strategy System** — JSON-based tactics that decide when to dodge/boost during battle
4. **Post-Battle Feedback** — agent reports how strategy performed + suggestions
5. **Default Bot Strategy** — JSON file for bot AI to use as base
6. **Budget-Aware Bots** — bot randomization respects budget constraint
7. **Updated UI** — show budget, charges, strategy feedback

---

## Detailed Specifications

## 1. Point-Budget System

### Constants (add to `src/lib/colosseum.ts`)
```typescript
export const POINT_BUDGET = 6;
```

### Cost per level (add to `PART_DEFS` variants)
Each variant now has a `cost: number` field (0, 1, or 2):
- Index 0 (weak) → cost: 0
- Index 1 (medium) → cost: 1
- Index 2 (strong) → cost: 2

Update `PartVariant` type:
```typescript
export type PartVariant = {
  name: string;
  stat: string;
  cost: number; // NEW
};
```

Update `PART_DEFS` with stat strings reflecting the new charge system:
- **Head:** "1 Dodge" / "2 Dodge" / "3 Dodge"
- **Core (Body):** "80 HP" / "120 HP" / "100 HP"
- **Arms:** "10 Dmg" / "20 Dmg" / "15 Dmg"
- **Legs:** "1 Boost" / "2 Boost" / "3 Boost"

### Helper function (add to `src/lib/colosseum.ts`)
```typescript
export function totalCost(parts: BodyParts): number {
  return PART_DEFS.reduce((sum, def) => sum + def.variants[parts[def.key]].cost, 0);
}
export function budgetRemaining(parts: BodyParts): number {
  return POINT_BUDGET - totalCost(parts);
}
export function isBudgetValid(parts: BodyParts): boolean {
  return budgetRemaining(parts) >= 0;
}
```

### BodyPartsPicker.tsx — Budget display
- Above the grid, show a **budget bar**:
  - "Budget: 6/6" (green) or "Budget: -1/6" (red text) or "Budget: 3/6" (yellow/amber)
  - Don't show a literal bar graph — just text + color
- For each variant button: if selecting it would exceed budget AND the variant's cost is MORE than the current one's cost, show the button but dim it and add a tooltip "Cost: 2 pts · budget exceeded"
- **Randomize** button must distribute points randomly WITHIN budget constraint. Algorithm: pick random order of 4 parts, for each part assign a random valid level (0-2). If total exceeds budget, reduce levels of parts with highest cost first until within budget. If under budget, upgrade parts randomly until budget is met or cannot upgrade further.
- The cost for each variant appears as a small badge: `•0` / `•1` / `•2` next to the stat string
- When a variant is selected, show the cost visually

### AgentForge.tsx — Budget info
- Add a small budget indicator line between the parts picker and the submit button
- "Budget: X/6 points used" with color: green if ≥ 0 remaining, red if overspent

## 2. Strategic Battle Engine

### `src/lib/battle.ts` — Rewrite

#### Remove dodge probability
- Delete `HEAD_DODGE` array
- Delete `dodge` from `FighterStats`

#### Add charge system
```typescript
// Head → dodge charges per battle
export const HEAD_DODGE_CHARGES = [1, 2, 3] as const;
// Legs → speed boost charges per battle
export const LEGS_BOOST_CHARGES = [1, 2, 3] as const;
// Legs → speed boost damage multiplier
export const LEGS_BOOST_MULT = [1.2, 1.3, 1.5] as const;
```

#### Update FighterStats
```typescript
export type FighterStats = {
  maxHp: number;
  dodgeCharges: number;     // NEW
  boostCharges: number;     // NEW
  boostMultiplier: number;  // NEW
  intervalMs: number;
  ramDamage: number;
  weaponDamage: number;
  hitDamage: number;
  weapon: WeaponKind;
  gait: LegsGait;
  speedTier: SpeedTier;
};
```

#### Update `deriveStats`
Set `dodgeCharges`, `boostCharges`, `boostMultiplier` from the arrays above.

#### Update `Turn` type
```typescript
export type Turn = {
  attacker: Side;
  defender: Side;
  weapon: WeaponKind;
  gait: LegsGait;
  ramDamage: number;
  weaponDamage: number;
  dodged: boolean;
  powerAttack: boolean;     // NEW — was this a boosted attack?
  damage: number;
  hpA: number;
  hpB: number;
  killed: boolean;
};
```

#### Add charge tracking to fighter state
Inside `simulate()`, track remaining charges:
```typescript
let dodgeRemainingA = statsA.dodgeCharges;
let dodgeRemainingB = statsB.dodgeCharges;
let boostRemainingA = statsA.boostCharges;
let boostRemainingB = statsB.boostCharges;
```

#### Per-turn logic (replace the current turn logic)

For each turn:
1. Determine attacker/defender (same as before — interval-based)
2. **Attacker decides:** look up the attacker's strategy (passed as parameter). If strategy says `power_attack` AND boostRemaining > 0 → power attack. Consume 1 boost charge. Damage = hitDamage × boostMultiplier.
3. **Defender decides:** look up the defender's strategy. If strategy says `dodge` AND dodgeRemaining > 0 → dodge. Consume 1 dodge charge. Damage = 0.
4. Apply damage to the appropriate HP

#### `simulate()` signature change
```typescript
import type { Strategy } from "./strategy";

export function simulate(
  partsA: BodyParts,
  partsB: BodyParts,
  strategyA: Strategy,
  strategyB: Strategy,
  seed: number
): BattleResult
```

If strategies are provided, use them. If a strategy is `null` or undefined, use `DEFAULT_STRATEGY` from `strategy.ts`.

#### Add StrategyPerformance to BattleResult
```typescript
export type StrategyPerformance = {
  a: FighterPerformance;
  b: FighterPerformance;
};

export type FighterPerformance = {
  dodgeChargesUsed: number;
  dodgeChargesRemaining: number;
  boostChargesUsed: number;
  boostChargesRemaining: number;
  boostDamageDealt: number; // total bonus damage from power attacks
  damageTaken: number;      // total damage actually received (after dodge)
  suggestions: string[];
};
```

Add `performance: StrategyPerformance` to `BattleResult`.

#### Suggestions engine
After simulation, generate suggestions based on charge usage:
- `"You used 0 of N dodge charges — consider adding dodge rules in your strategy for when HP is low"`
- `"You dodged successfully X/Y times — great timing!"`
- `"You never used speed boost — set `round_below: <early_rounds>` to activate power attacks"`
- `"You used all N speed charges — aggressive play!"`
- `"You saved 3 dodge charges that went unused — could have dodged more aggressively"`
- `"Your opponent dodged X of your power attacks — they had a counter-strategy"`
- General rule: if charges remain unused at end of battle and bot lost → "could have used them for advantage"
- Only generate the most relevant 3-4 suggestions

### `src/lib/strategy.ts` — NEW FILE

```typescript
export type Condition =
  | { hp_below: number }
  | { hp_above: number }
  | { round_below: number }
  | { round_above: number }
  | { opponent_boosted: boolean }
  | { always: boolean };

export type Rule = {
  condition: Condition;
  priority: number; // lower = checked first
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
  opponentBoosting: boolean; // is the opponent using power attack this turn?
};

/**
 * Given a strategy and current battle context, decide what action to take.
 * For ATTACKER: returns "attack" or "power_attack"
 * For DEFENDER: returns "attack" or "dodge" (attack = don't dodge, take damage)
 */
export function decideAction(
  strategy: Strategy,
  context: DecisionContext,
  role: "attacker" | "defender"
): Action { ... }
```

#### `decideAction` logic
For **defender** (dodge rules):
1. Sort rules by priority (ascending)
2. For each rule, check condition against context
3. If condition matches AND dodgeRemaining > 0 → return "dodge"
4. If no rule matches → return "attack" (take the hit)

For **attacker** (power attack rules):
1. Sort rules by priority (ascending)
2. For each rule, check condition against context
3. If condition matches AND boostRemaining > 0 → return "power_attack"
4. If no rule matches → return "attack" (normal attack)

#### Condition checking
```typescript
function checkCondition(cond: Condition, ctx: DecisionContext): boolean {
  if ("hp_below" in cond) return (ctx.ownHp / ctx.ownMaxHp) < cond.hp_below;
  if ("hp_above" in cond) return (ctx.ownHp / ctx.ownMaxHp) > cond.hp_above;
  if ("round_below" in cond) return ctx.round < cond.round_below;
  if ("round_above" in cond) return ctx.round > cond.round_above;
  if ("opponent_boosted" in cond) return ctx.opponentBoosting === cond.opponent_boosted;
  if ("always" in cond) return cond.always;
  return false;
}
```

#### Default strategy
```typescript
export const DEFAULT_STRATEGY: Strategy = {
  name: "default-brawler",
  version: 1,
  rules: {
    dodge: [
      { condition: { opponent_boosted: true }, priority: 1 },   // Dodge power attacks
      { condition: { hp_below: 0.2 }, priority: 2 },           // Dodge when critically low
      { condition: { always: false }, priority: 99 },          // Never dodge otherwise
    ],
    powerAttack: [
      { condition: { round_below: 3 }, priority: 1 },          // Boost in first 3 rounds
      { condition: { hp_above: 0.6 }, priority: 2 },           // Boost when healthy
    ],
  },
};
```

#### Validation function
```typescript
export function validateStrategy(s: unknown): s is Strategy { ... }
// Check: name is string, version is number, rules has dodge and powerAttack arrays,
// each rule has condition and priority, condition has exactly one key from allowed set
```

## 3. BotBattleModal — Strategy + Feedback

### NEW: Strategy input in setup phase
After the stake input, add a collapsible "Strategy" section (initially collapsed):
```tsx
<details className="rounded-xl border hairline bg-white/[0.02]">
  <summary className="cursor-pointer px-4 py-3 font-mono text-xs text-zinc-400 hover:text-zinc-200">
    Bot Strategy ⚙️
  </summary>
  <div className="border-t hairline p-4 space-y-3">
    {/* Strategy URL input */}
    <div>
      <label className="mb-1 block font-mono text-[10px] text-zinc-500">Strategy URL (optional)</label>
      <input
        value={strategyUrl}
        onChange={...}
        placeholder="https://github.com/.../strategy.json"
        className="field !text-xs !py-2"
      />
      <p className="mt-1 font-mono text-[10px] text-zinc-600">
        Default: balanced brawler (dodge power attacks, boost early)
      </p>
    </div>
    
    {/* Strategy preview */}
    {currentStrategy && (
      <div className="rounded-lg border hairline bg-black/20 p-3">
        <div className="font-mono text-[10px] text-zinc-400">{currentStrategy.name} v{currentStrategy.version}</div>
        {/* Show summary of rules */}
        <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px]">
          <div>
            <span className="text-cyan-400">Dodge:</span>
            {currentStrategy.rules.dodge.filter(r => r.condition.always !== false).length > 0 ? 
              " active" : " none"}
          </div>
          <div>
            <span className="text-ember-400">Boost:</span>
            {currentStrategy.rules.powerAttack.length} rule(s)
          </div>
        </div>
      </div>
    )}
    
    {/* Quick presets */}
    <div className="flex flex-wrap gap-1.5">
      {STRATEGY_PRESETS.map(p => (
        <button ... className="text-[10px] ...">{p.name}</button>
      ))}
    </div>
  </div>
</details>
```

### STRATEGY_PRESETS (in same file)
```typescript
const STRATEGY_PRESETS: { name: string; strategy: Strategy }[] = [
  { name: "Balanced", strategy: { ... DEFAULT_STRATEGY } },
  { name: "Aggressive", strategy: { name: "aggressive", version: 1, rules: { dodge: [{ condition: { opponent_boosted: true }, priority: 1 }], powerAttack: [{ condition: { always: true }, priority: 1 }] } } },
  { name: "Tank", strategy: { name: "tank", version: 1, rules: { dodge: [{ condition: { hp_below: 0.4 }, priority: 1 }, { condition: { opponent_boosted: true }, priority: 2 }], powerAttack: [{ condition: { always: false }, priority: 99 }] } } },
  { name: "Counter", strategy: { name: "counter", version: 1, rules: { dodge: [{ condition: { opponent_boosted: true }, priority: 1 }, { condition: { always: false }, priority: 99 }], powerAttack: [{ condition: { opponent_boosted: true }, priority: 1 }, { condition: { hp_above: 0.5 }, priority: 2 }] } } },
];
```

### NEW: Post-battle strategy feedback section
In the "result" phase, AFTER the victory/defeat banner and stake info, add:

```tsx
{result && (
  <div className="rounded-xl border hairline bg-white/[0.03] p-4 space-y-3">
    <h3 className="font-display text-xs font-bold text-zinc-400 uppercase tracking-wider">
      Strategy Report
    </h3>
    <div className="grid grid-cols-2 gap-3">
      {/* Dodge charges */}
      <div className="rounded-lg border hairline bg-black/20 p-2.5">
        <div className="font-mono text-[10px] text-cyan-400">🛡️ Dodge</div>
        <div className="font-display text-lg font-bold text-zinc-100">
          {perf.dodgeChargesUsed}/{perf.dodgeChargesUsed + perf.dodgeChargesRemaining}
        </div>
        <div className="font-mono text-[9px] text-zinc-500">charges used</div>
      </div>
      {/* Speed Boost */}
      <div className="rounded-lg border hairline bg-black/20 p-2.5">
        <div className="font-mono text-[10px] text-ember-400">⚡ Speed Boost</div>
        <div className="font-display text-lg font-bold text-zinc-100">
          {perf.boostChargesUsed}/{perf.boostChargesUsed + perf.boostChargesRemaining}
        </div>
        <div className="font-mono text-[9px] text-zinc-500">charges used</div>
      </div>
    </div>
    
    {/* Suggestions */}
    {perf.suggestions.length > 0 && (
      <div className="space-y-1">
        {perf.suggestions.map((s, i) => (
          <p key={i} className="font-mono text-[10px] text-zinc-400 flex items-start gap-1.5">
            <span className="text-zinc-600 mt-0.5">💡</span>
            {s}
          </p>
        ))}
      </div>
    )}
  </div>
)}
```

### Strategy URL fetching
When user enters a URL, fetch the JSON:
```typescript
async function fetchStrategy(url: string): Promise<Strategy | null> {
  try {
    const res = await fetch(url);
    const json = await res.json();
    return validateStrategy(json) ? json : null;
  } catch { return null; }
}
```

If URL is empty → use DEFAULT_STRATEGY.
If URL is set but can't fetch → show error "Could not load strategy from URL, using default".

### How BotBattleModal passes strategies to simulate()
```typescript
const [strategyA, setStrategyA] = useState<Strategy>(DEFAULT_STRATEGY);
const [strategyB, setStrategyB] = useState<Strategy>(DEFAULT_STRATEGY);

// Player can only change strategyA (their bot's strategy)
// Bot always uses a random preset or the loaded one

function fight() {
  const seed = ...;
  const res = simulate(playerParts, bot.bodyParts, strategyA, strategyB, seed);
  ...
}
```

## 4. Bot.ts — Budget-Aware Bots

Update `makeBot()` to respect the budget constraint:

```typescript
export function makeBot(): Bot {
  const parts = randomBudgetParts();
  return {
    name: BOT_NAMES[rand(BOT_NAMES.length)],
    bodyParts: parts,
    strategyHash: "", // keep as-is
  };
}

function randomBudgetParts(): BodyParts {
  // Randomly assign 0/1/2 to each part
  // If total > 6, reduce highest-cost parts until within budget
  // If total < 6 and no part is already at 2, upgrade random parts until budget reached
  const parts: BodyParts = {
    head_type: rand(3),
    body_type: rand(3),
    arms_type: rand(3),
    legs_type: rand(3),
  };
  let cost = totalCost(parts);
  while (cost > POINT_BUDGET) {
    // Find part with highest cost, downgrade it by 1
    ... 
    cost = totalCost(parts);
  }
  while (cost < POINT_BUDGET) {
    // Find a part at level < 2, upgrade it by 1
    ...
    cost = totalCost(parts);
  }
  return parts;
}
```

## 5. StatPreview.tsx — Updated Display

Replace dodge% with dodge charges:
```tsx
<Chip
  icon={<Shield size={12} weight="fill" className="text-cyan-300" />}
  label="Dodge"
  value={`${s.dodgeCharges}x`}
/>
```

Replace speed tier with boost info:
```tsx
<Chip
  icon={<Gauge size={12} weight="fill" className="text-plasma-300" />}
  label="Boost"
  value={`${s.boostCharges}x ×${s.boostMultiplier.toFixed(1)}`}
/>
```

## 6. BattleScene.tsx Updates

### Show dodge/boost charges in the fighter HUD
Next to the health bar name area, add small charge indicators:
```tsx
<div className="flex gap-1.5 mt-1">
  <span className="inline-flex items-center gap-0.5 font-mono text-[9px] text-cyan-400">
    🛡️{dodgeRemaining}
  </span>
  <span className="inline-flex items-center gap-0.5 font-mono text-[9px] text-ember-400">
    ⚡{boostRemaining}
  </span>
</div>
```

But the BattleScene currently works from the `result` data (pre-computed turns). The charge state per turn needs to be tracked. Add to `Turn`:
```typescript
export type Turn = {
  ...
  dodgeRemainingAtk: number;
  dodgeRemainingDef: number;
  boostRemainingAtk: number;
  boostRemainingDef: number;
};
```

And update the BattleScene Fighter component to read from the current turn's remaining charges rather than keeping a separate state.

Actually, to keep it simple: just show the INITIAL max charges before the battle starts, and after the battle show the final performance from `result.performance`. The mid-battle charge animation is a nice-to-have.

In the result phase, show the performance stats.

## 7. Create `public/strategies/default.json`

```json
{
  "name": "default-brawler",
  "version": 1,
  "rules": {
    "dodge": [
      { "condition": { "opponent_boosted": true }, "priority": 1 },
      { "condition": { "hp_below": 0.2 }, "priority": 2 },
      { "condition": { "always": false }, "priority": 99 }
    ],
    "powerAttack": [
      { "condition": { "round_below": 3 }, "priority": 1 },
      { "condition": { "hp_above": 0.6 }, "priority": 2 }
    ]
  }
}
```

## Implementation Notes

- Keep existing tailwind classes and styling patterns
- The `import type` pattern is used throughout (TypeScript `type` imports)
- `BodyParts` type has fields: `head_type`, `body_type`, `arms_type`, `legs_type` (all `number`)
- The `deriveStats()` function is imported by multiple components — update callers
- `BotBattleModal` imports `simulate` from `@/lib/battle` — update the call site
- All paths use `@/` alias (e.g. `@/lib/battle`, `@/components/...`)
- `PART_DEFS` from colosseum.ts is used in `BodyPartsPicker` — update its type first

## Files to modify
1. `src/lib/colosseum.ts` — add POINT_BUDGET, cost to PartVariant, helpers, update PART_DEFS stats
2. `src/lib/battle.ts` — replace probability with charges, add strategy param to simulate(), add performance tracking
3. `src/lib/strategy.ts` — **NEW** file with types, interpreter, default strategy, validator
4. `src/components/BodyPartsPicker.tsx` — budget display + budget-aware randomize
5. `src/components/battle/StatPreview.tsx` — charge-based display
6. `src/components/battle/BattleScene.tsx` — show charge HUD (initial + remaining per turn in health bar area)
7. `src/components/BotBattleModal.tsx` — strategy section in setup + strategy feedback in results
8. `src/lib/bot.ts` — budget-aware makeBot()
9. `src/components/AgentForge.tsx` — show budget indicator
10. `public/strategies/default.json` — **NEW** default strategy JSON file

## Order of Implementation
1. Create `strategy.ts` — types, default strategy, interpreter, validator
2. Update `colosseum.ts` — budget constants, cost field, helpers, PART_DEFS stats
3. Rewrite `battle.ts` — charges engine + strategy integration + performance tracking
4. Update `bot.ts` — budget-aware bots
5. Create `public/strategies/default.json`
6. Update `StatPreview.tsx` — charge display
7. Update `BodyPartsPicker.tsx` — budget UI
8. Update `AgentForge.tsx` — budget indicator
9. Update `BotBattleModal.tsx` — strategy input + strategy feedback
10. Update `BattleScene.tsx` — charge indicators in HUD

## Verify
After all changes:
- `npm run build` succeeds with no errors
- The dev server starts and the UI works (no infinite re-renders, no TS errors)
- Budget display works: clicking strong for all 4 parts shows "Budget -2/6" (overspent)
- BodiesPartsPicker shows cost badges
- Random button never creates a bot exceeding 6 points
- BotBattleModal shows strategy section with presets
- Simulated battle shows charge usage in strategy report
