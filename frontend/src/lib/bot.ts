/**
 * Offline bot opponents. Bots are a pure UI simulation — they are never
 * registered on-chain and bot battles never touch the contract.
 */
import {
  PART_DEFS,
  POINT_BUDGET,
  totalCost,
  type BodyParts,
  type PartKey,
} from "@/lib/colosseum";

export const BOT_NAMES = [
  "IRON_MAW",
  "VOID_STALKER",
  "NULL_SABRE",
  "RUST_PROPHET",
  "HEX_WARDEN",
  "GLITCH_KING",
  "OBSIDIAN_FANG",
  "QUANTUM_HUSK",
  "ASH_REVENANT",
  "CHROME_VIPER",
  "SCRAP_TITAN",
  "NEON_WRAITH",
];

function rand(n: number): number {
  return Math.floor(Math.random() * n);
}

export type Bot = {
  name: string;
  bodyParts: BodyParts;
  strategyHash: string;
};

export function makeBot(): Bot {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const strategyHash =
    "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return {
    name: BOT_NAMES[rand(BOT_NAMES.length)],
    bodyParts: randomBudgetParts(),
    strategyHash,
  };
}

const PART_KEYS: PartKey[] = PART_DEFS.map((d) => d.key);

/** Cost of a part at a given level (0/1/2), mirroring PART_DEFS. */
function partCost(key: PartKey, level: number): number {
  const def = PART_DEFS.find((d) => d.key === key)!;
  return def.variants[level].cost;
}

/**
 * Randomly assign 0/1/2 to each part, then nudge the loadout to spend exactly
 * the point budget: downgrade the priciest parts while overspent, upgrade
 * random sub-max parts while there's budget left.
 */
function randomBudgetParts(): BodyParts {
  const parts: BodyParts = {
    head_type: rand(3),
    body_type: rand(3),
    arms_type: rand(3),
    legs_type: rand(3),
  };

  let cost = totalCost(parts);

  // Over budget → downgrade the highest-cost part by one, repeatedly.
  while (cost > POINT_BUDGET) {
    let best: PartKey | null = null;
    let bestCost = -1;
    for (const key of PART_KEYS) {
      const level = parts[key];
      if (level <= 0) continue;
      const c = partCost(key, level);
      if (c > bestCost) {
        bestCost = c;
        best = key;
      }
    }
    if (best === null) break;
    parts[best] -= 1;
    cost = totalCost(parts);
  }

  // Under budget → upgrade a random part that isn't already maxed.
  while (cost < POINT_BUDGET) {
    const upgradable = PART_KEYS.filter((key) => parts[key] < 2);
    if (upgradable.length === 0) break;
    const key = upgradable[rand(upgradable.length)];
    parts[key] += 1;
    if (totalCost(parts) > POINT_BUDGET) {
      // Upgrade overshot the budget — revert and stop.
      parts[key] -= 1;
      break;
    }
    cost = totalCost(parts);
  }

  return parts;
}
