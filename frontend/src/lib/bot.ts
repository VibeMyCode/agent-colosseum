/**
 * Offline bot opponents. Bots are a pure UI simulation — they are never
 * registered on-chain and bot battles never touch the contract.
 */
import type { BodyParts } from "@/lib/colosseum";

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
    bodyParts: {
      head_type: rand(3),
      body_type: rand(3),
      arms_type: rand(3),
      legs_type: rand(3),
    },
    strategyHash,
  };
}

/** 50/50 coin flip for who wins the simulated bout. */
export function rollWinner(): "you" | "bot" {
  return Math.random() < 0.5 ? "you" : "bot";
}
