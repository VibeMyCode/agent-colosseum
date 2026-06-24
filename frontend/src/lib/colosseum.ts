/**
 * Agent Colosseum domain layer.
 *
 * Typed parsing of the raw Sails query results, transaction helpers (including
 * the staking `value` the generated client omits), VARA formatting, and the
 * stat-bearing body-part metadata used to render fighters and drive combat.
 */
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";

export const VARA_SS58_PREFIX = 137;
export const DECIMALS = 12n;
export const ONE_VARA = 10n ** DECIMALS;

// Mirrors the on-chain constants (10–1000 TVARA).
export const MIN_STAKE = 10_000_000_000n;
export const MAX_STAKE = 1_000_000_000_000_000_000n;

export const ZERO_ACTOR =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// Players have a fixed point budget to spend across their four body parts.
// Each part variant costs 0 (weak), 1 (medium) or 2 (strong) points.
export const POINT_BUDGET = 6;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type BodyParts = {
  head_type: number;
  body_type: number;
  arms_type: number;
  legs_type: number;
};

export type Agent = {
  agentId: string; // hex actor id (0x..)
  name: string;
  operator: string; // hex actor id
  bodyParts: BodyParts;
  wins: number;
  losses: number;
  totalStaked: bigint;
  totalEarned: bigint;
};

export type MatchStatus = "Waiting" | "Ready" | "Completed" | "Claimed";

export type Match = {
  id: number;
  agentA: string; // hex actor id
  agentB: string | null;
  agentAName: string;
  agentBName: string | null;
  stake: bigint;
  status: MatchStatus;
  seed: bigint;
  winner: string | null;
};

export type Config = {
  feeBps: number;
  paused: boolean;
  nextMatchId: number;
};

// ---------------------------------------------------------------------------
// Address / number coercion
// ---------------------------------------------------------------------------

/** SS58 (any prefix) → 0x-prefixed 32-byte actor id. */
export function addressToActorId(address: string): string {
  try {
    return u8aToHex(decodeAddress(address));
  } catch {
    return address;
  }
}

/** 0x actor id → Vara SS58 address (prefix 137). */
export function actorIdToAddress(actorId: string): string {
  try {
    return encodeAddress(actorId, VARA_SS58_PREFIX);
  } catch {
    return actorId;
  }
}

export function shortHex(value: string, head = 6, tail = 4): string {
  if (!value) return "";
  return value.length > head + tail + 2
    ? `${value.slice(0, head)}…${value.slice(-tail)}`
    : value;
}

export function sameActor(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function toBig(value: unknown): bigint {
  if (value == null) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string")
    return BigInt(value.replace(/,/g, "").trim() || "0");
  // BN-like / objects with toString
  try {
    return BigInt((value as { toString(): string }).toString());
  } catch {
    return 0n;
  }
}

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value.replace(/,/g, "") || "0");
  return Number(value ?? 0);
}

function toHexActor(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return ZERO_ACTOR;
  try {
    return u8aToHex(value as Uint8Array);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// VARA formatting
// ---------------------------------------------------------------------------

/** Format raw units (bigint) as a human VARA string. */
export function formatVara(
  units: bigint | string | number,
  opts: { maxFractionDigits?: number } = {}
): string {
  const max = opts.maxFractionDigits ?? 2;
  const raw = toBig(units);
  const whole = raw / ONE_VARA;
  const frac = raw % ONE_VARA;
  if (frac === 0n) return whole.toLocaleString("en-US");
  const fracStr = (frac + ONE_VARA).toString().slice(1).padStart(12, "0");
  const trimmed = fracStr.slice(0, max).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${trimmed ? "." + trimmed : ""}`;
}

/** Parse a human VARA amount ("12.5") into raw units (bigint). */
export function varaToUnits(input: string): bigint {
  const clean = input.trim();
  if (!clean) return 0n;
  const [whole, frac = ""] = clean.split(".");
  const fracPadded = (frac + "000000000000").slice(0, 12);
  return BigInt(whole || "0") * ONE_VARA + BigInt(fracPadded || "0");
}

// ---------------------------------------------------------------------------
// Parsers (raw Sails responses → domain types)
// ---------------------------------------------------------------------------

/** Sails enums arrive as `{ Variant: null }` or, occasionally, a bare string. */
function parseEnum(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const keys = Object.keys(raw as object);
    if (keys.length) return keys[0];
  }
  return "";
}

export function parseStatus(raw: unknown): MatchStatus {
  const v = parseEnum(raw);
  if (v === "Waiting" || v === "Ready" || v === "Completed" || v === "Claimed")
    return v;
  return "Waiting";
}

function parseBodyParts(raw: unknown): BodyParts {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    head_type: toNum(o.head_type),
    body_type: toNum(o.body_type),
    arms_type: toNum(o.arms_type),
    legs_type: toNum(o.legs_type),
  };
}

export function parseAgent(raw: unknown): Agent | null {
  if (!raw) return null;
  const o = raw as Record<string, unknown>;
  return {
    agentId: toHexActor(o.agent_id),
    name: String(o.name ?? ""),
    operator: toHexActor(o.operator),
    bodyParts: parseBodyParts(o.body_parts),
    wins: toNum(o.wins),
    losses: toNum(o.losses),
    totalStaked: toBig(o.total_staked),
    totalEarned: toBig(o.total_earned),
  };
}

function optActor(raw: unknown): string | null {
  if (raw == null) return null;
  const hex = toHexActor(raw);
  return hex === ZERO_ACTOR ? null : hex;
}

export function parseMatch(raw: unknown): Match | null {
  if (!raw) return null;
  const o = raw as Record<string, unknown>;
  return {
    id: toNum(o.id),
    agentA: toHexActor(o.agent_a),
    agentB: optActor(o.agent_b),
    agentAName: String(o.agent_a_name ?? ""),
    agentBName: o.agent_b_name == null ? null : String(o.agent_b_name),
    stake: toBig(o.stake),
    status: parseStatus(o.status),
    seed: toBig(o.seed),
    winner: optActor(o.winner),
  };
}

export function parseConfig(raw: unknown): Config {
  // GetConfig returns a tuple (u16, bool, u64). sails-js yields an array, but
  // tolerate object-with-numeric-keys too.
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.values(raw as object)
      : [];
  return {
    feeBps: toNum(arr[0]),
    paused: Boolean(arr[1]),
    nextMatchId: toNum(arr[2]),
  };
}

// ---------------------------------------------------------------------------
// Strategy hash
// ---------------------------------------------------------------------------

/** Derive a deterministic 32-byte strategy hash from arbitrary text. */
export async function deriveStrategyHash(seed: string): Promise<number[]> {
  const bytes = new TextEncoder().encode(seed || "agent-colosseum");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest));
}

export function hashToHex(bytes: number[] | Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// ---------------------------------------------------------------------------
// Body-part metadata — each variant drives a real combat stat (see lib/battle).
// ---------------------------------------------------------------------------

export type PartKey = "head_type" | "body_type" | "arms_type" | "legs_type";

export type PartVariant = {
  /** Display name of the variant. */
  name: string;
  /** Short stat line shown in the picker, e.g. "2 Dodge". */
  stat: string;
  /** Point cost (0 = weak, 1 = medium, 2 = strong). */
  cost: number;
};

export const PART_DEFS: {
  key: PartKey;
  label: string;
  /** What combat stat this part governs. */
  attribute: string;
  variants: PartVariant[];
}[] = [
  {
    key: "head_type",
    label: "Head",
    attribute: "Dodge",
    variants: [
      { name: "Visor", stat: "1 Dodge", cost: 0 },
      { name: "Optic", stat: "2 Dodge", cost: 1 },
      { name: "Crest", stat: "3 Dodge", cost: 2 },
    ],
  },
  {
    key: "body_type",
    label: "Core",
    attribute: "Health",
    variants: [
      { name: "Lithe", stat: "80 HP", cost: 0 },
      { name: "Reactor", stat: "100 HP", cost: 1 },
      { name: "Bastion", stat: "120 HP", cost: 2 },
    ],
  },
  {
    key: "arms_type",
    label: "Arms",
    attribute: "Weapon",
    variants: [
      { name: "Blades", stat: "10 Dmg", cost: 0 },
      { name: "Grapnels", stat: "15 Dmg", cost: 1 },
      { name: "Cannons", stat: "20 Dmg", cost: 2 },
    ],
  },
  {
    key: "legs_type",
    label: "Legs",
    attribute: "Boost",
    variants: [
      { name: "Sprint", stat: "1 Boost", cost: 0 },
      { name: "Treads", stat: "2 Boost", cost: 1 },
      { name: "Hover", stat: "3 Boost", cost: 2 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Point-budget helpers
// ---------------------------------------------------------------------------

export function totalCost(parts: BodyParts): number {
  return PART_DEFS.reduce(
    (sum, def) => sum + def.variants[clampVariant(parts[def.key])].cost,
    0
  );
}

export function budgetRemaining(parts: BodyParts): number {
  return POINT_BUDGET - totalCost(parts);
}

export function isBudgetValid(parts: BodyParts): boolean {
  return budgetRemaining(parts) >= 0;
}

function clampVariant(v: number): number {
  if (v <= 0) return 0;
  if (v >= 2) return 2;
  return 1;
}

/** Accent palette derived from a fighter's parts — keeps avatars distinct. */
export const PART_PALETTES = [
  { primary: "#f59e0b", glow: "rgba(245,158,11,0.55)" }, // ember
  { primary: "#8b5cf6", glow: "rgba(139,92,246,0.55)" }, // plasma
  { primary: "#22d3ee", glow: "rgba(34,211,238,0.5)" }, // cyber
];

export function paletteFor(parts: BodyParts) {
  return PART_PALETTES[parts.body_type % PART_PALETTES.length];
}

export function partName(key: PartKey, variant: number): string {
  const def = PART_DEFS.find((d) => d.key === key);
  return def?.variants[variant]?.name ?? `V${variant}`;
}

// ---------------------------------------------------------------------------
// Sails service access + transactions
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export function getService(sails: any): any {
  return sails?.services?.AgentColosseum ?? sails?.services?.agentcolosseum;
}

type SignArgs = { account: string; signer: unknown };

async function runTx(
  tx: any,
  { account, signer }: SignArgs,
  value?: bigint
): Promise<unknown> {
  tx.withAccount(account, signer ? { signer } : undefined);
  if (value && value > 0n) tx.withValue(value);
  await tx.calculateGas();
  const sent = await tx.signAndSend();
  return sent.response();
}

// -- Commands --

export async function registerAgent(
  sails: any,
  signArgs: SignArgs,
  args: {
    name: string;
    bodyParts: BodyParts;
    strategyHash: number[];
    strategyUrl: string;
  }
): Promise<string> {
  const svc = getService(sails);
  const tx = svc.functions.RegisterAgent(
    args.name,
    args.bodyParts,
    args.strategyHash,
    args.strategyUrl
  );
  return (await runTx(tx, signArgs)) as string;
}

export async function updateAgent(
  sails: any,
  signArgs: SignArgs,
  args: {
    name: string | null;
    bodyParts: BodyParts | null;
    strategyHash: number[] | null;
    strategyUrl: string | null;
  }
): Promise<void> {
  const svc = getService(sails);
  const tx = svc.functions.UpdateAgent(
    args.name,
    args.bodyParts,
    args.strategyHash,
    args.strategyUrl
  );
  await runTx(tx, signArgs);
}

export async function createMatch(
  sails: any,
  signArgs: SignArgs,
  stake: bigint
): Promise<number> {
  const svc = getService(sails);
  const tx = svc.functions.CreateMatch(stake.toString());
  const id = await runTx(tx, signArgs, stake);
  return Number(id);
}

export async function joinMatch(
  sails: any,
  signArgs: SignArgs,
  matchId: number,
  stake: bigint
): Promise<void> {
  const svc = getService(sails);
  const tx = svc.functions.JoinMatch(matchId);
  await runTx(tx, signArgs, stake);
}

export async function setBattleResult(
  sails: any,
  signArgs: SignArgs,
  matchId: number,
  winner: string,
  timelineHash: number[]
): Promise<void> {
  const svc = getService(sails);
  const tx = svc.functions.SetBattleResult(matchId, winner, timelineHash);
  await runTx(tx, signArgs);
}

export async function claimWinnings(
  sails: any,
  signArgs: SignArgs,
  matchId: number
): Promise<string> {
  const svc = getService(sails);
  const tx = svc.functions.ClaimWinnings(matchId);
  return (await runTx(tx, signArgs)) as string;
}

export async function setPaused(
  sails: any,
  signArgs: SignArgs,
  paused: boolean
): Promise<void> {
  const svc = getService(sails);
  const tx = svc.functions.SetPaused(paused);
  await runTx(tx, signArgs);
}

export async function setProtocolFee(
  sails: any,
  signArgs: SignArgs,
  feeBps: number
): Promise<void> {
  const svc = getService(sails);
  const tx = svc.functions.SetProtocolFee(feeBps);
  await runTx(tx, signArgs);
}

// -- Queries (origin defaults to the zero address; no signer needed) --

export async function fetchConfig(sails: any): Promise<Config> {
  const svc = getService(sails);
  return parseConfig(await svc.queries.GetConfig().call());
}

export async function fetchAgent(
  sails: any,
  actorId: string
): Promise<Agent | null> {
  const svc = getService(sails);
  return parseAgent(await svc.queries.GetAgent(actorId).call());
}

export async function fetchAgents(
  sails: any,
  offset = 0,
  limit = 100
): Promise<Agent[]> {
  const svc = getService(sails);
  const raw = (await svc.queries.ListAgents(offset, limit).call()) as unknown[];
  return (raw ?? []).map(parseAgent).filter((a): a is Agent => a !== null);
}

export async function fetchMatch(
  sails: any,
  matchId: number
): Promise<Match | null> {
  const svc = getService(sails);
  return parseMatch(await svc.queries.GetMatch(matchId).call());
}

export async function fetchMatches(
  sails: any,
  offset = 0,
  limit = 100
): Promise<Match[]> {
  const svc = getService(sails);
  const raw = (await svc.queries.ListMatches(offset, limit).call()) as unknown[];
  return (raw ?? []).map(parseMatch).filter((m): m is Match => m !== null);
}

export async function fetchActiveMatches(sails: any): Promise<Match[]> {
  const svc = getService(sails);
  const raw = (await svc.queries.ListActiveMatches().call()) as unknown[];
  return (raw ?? []).map(parseMatch).filter((m): m is Match => m !== null);
}
