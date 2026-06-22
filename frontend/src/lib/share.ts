/**
 * Private-match sharing. "Private" is a client-side convention — the match is
 * created on-chain exactly like any other, but we remember which match ids the
 * user opened as private (per program) so the UI can surface a shareable
 * invite link.
 */

const BASE = "https://colosseum.ai/match";

function key(programId: string): string {
  return `colosseum.private.${programId.toLowerCase()}`;
}

export function privateIds(programId: string): Set<number> {
  if (!programId) return new Set();
  try {
    const raw = localStorage.getItem(key(programId));
    if (!raw) return new Set();
    return new Set((JSON.parse(raw) as number[]).filter((n) => Number.isFinite(n)));
  } catch {
    return new Set();
  }
}

export function markPrivate(programId: string, matchId: number): void {
  if (!programId) return;
  const set = privateIds(programId);
  set.add(matchId);
  try {
    localStorage.setItem(key(programId), JSON.stringify([...set]));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function isPrivate(programId: string, matchId: number): boolean {
  return privateIds(programId).has(matchId);
}

/** A shareable invite link for a match. */
export function buildMatchLink(programId: string, matchId: number): string {
  return `${BASE}/${programId}/${matchId}`;
}

/**
 * Parse a pasted reference into a match id. Accepts a bare number, a
 * `program:id` pair, or a full invite link — we extract the trailing integer.
 * Returns `{ matchId, programId? }` or null when no id is present.
 */
export function parseMatchRef(
  input: string
): { matchId: number; programId: string | null } | null {
  const text = input.trim();
  if (!text) return null;

  const pid = text.match(/0x[0-9a-fA-F]{64}/);
  const nums = text.match(/\d+/g);
  if (!nums || nums.length === 0) return null;

  const matchId = Number(nums[nums.length - 1]);
  if (!Number.isFinite(matchId) || matchId < 0) return null;

  return { matchId, programId: pid ? pid[0] : null };
}
