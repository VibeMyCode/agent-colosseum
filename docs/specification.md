# Agent Colosseum — Specification

**Project:** On-chain AI Agent battle arena on Vara Network  
**Framework:** Sails 0.10.4 (Rust 2024 edition, no_std WASM target)  
**Repository convention:** `gear-tech/agent-colosseum`  
**Cerberus Stage 1 approval:** June 22, 2026 (conditional on Board announcement + docs)  

---

## 1. Domain Model

### Core Types

#### `BodyParts`
Cosmetic-only visual configuration of an agent's "body". **Has ZERO effect on battle resolution in v1.** Each part is a `u8` with valid range 0–2 (3 variants for visual diversity).

```rust
struct BodyParts {
    head_type: u8,   // 0–2, cosmetic only
    body_type: u8,   // 0–2, cosmetic only
    arms_type: u8,   // 0–2, cosmetic only
    legs_type: u8,   // 0–2, cosmetic only
}
```

#### `MatchStatus`
State machine for a match's lifecycle.

```
Waiting ──(join)──► Ready ──(result)──► Completed ──(claim)──► Claimed
```

- **Waiting** — match created by agent_a, waiting for opponent.
- **Ready** — agent_b has joined, both stakes locked. Ready for off-chain battle.
- **Completed** — battle result submitted via `SetBattleResult`. Winner determined.
- **Claimed** — winner has collected winnings. Terminal state.

#### `AgentConfig`
Persistent state for a registered agent (keyed by `ActorId`).

| Field | Type | Description |
|-------|------|-------------|
| name | String | 1–64 chars |
| operator | ActorId | Owner of the agent (`msg::source()` at registration) |
| body_parts | BodyParts | Cosmetic visual parts (0–2 each, no gameplay impact in v1) |
| strategy_hash | [u8; 32] | SHA-256 hash of the agent's off-chain strategy binary |
| strategy_url | String | URL where the strategy binary is hosted |
| wins | u32 | Total wins across all matches |
| losses | u32 | Total losses across all matches |
| total_staked | u128 | Sum of all VARA staked (matches created + joined) |
| total_earned | u128 | Sum of all VARA earned (match winnings) |

#### `Match`
A single arena match between two registered agents.

| Field | Type | Description |
|-------|------|-------------|
| agent_a | ActorId | Creator of the match (challenger) |
| agent_b | ActorId | Joiner. `ActorId::zero()` if Waiting |
| stake | u128 | Stake amount in VARA (lowest unit) |
| status | MatchStatus | Current state |
| winner | Option\<ActorId\> | Set when Completed via SetBattleResult |
| seed | u64 | `exec::block_timestamp()` at creation |
| timeline_hash | Option\<[u8; 32]\> | Hash of the full battle log (verifiable off-chain) |
| created_at | u64 | Block timestamp at creation |

---

## 2. Service Interface

### Constructor

```
New(owner: actor_id)
```

Initializes: `OWNER = owner`, all state vectors empty, `NEXT_MATCH_ID = 1`, `PROTOCOL_FEE_BPS = 200` (2%), `PAUSED = false`.

### Agent Management

#### `RegisterAgent(name, body_parts, strategy_hash, strategy_url) -> ActorId`
- Validates: caller not already registered, body parts 0–2, name 1–64 chars.
- Registers the caller's `ActorId` as their agent identity.
- Returns the operator ActorId.
- **Body parts are cosmetic-only in v1** — they have no effect on battle resolution.

#### `UpdateAgent(name?, body_parts?, strategy_hash?, strategy_url?)`
- Partial update — only provided fields change.
- Same validation as RegisterAgent on changed fields.
- Panics if caller not registered (`AgentNotFound`).

#### `GetAgent(agent_id) -> Option<AgentView>`
Returns `AgentView` (agent_id, name, operator, body_parts, wins, losses, total_staked, total_earned).

#### `ListAgents(offset, limit) -> Vec<AgentView>`
Paginated list of all registered agents.

### Match Management

#### `CreateMatch(stake: u128) -> u64`
- Requires: protocol not paused, caller registered, stake 10–1,000 TVARA range.
- Caller must send `value >= stake` (locked in contract).
- Creates match in Waiting status with `agent_a = caller`.
- Returns `match_id`.

#### `JoinMatch(match_id: u64)`
- Requires: protocol not paused, caller registered, match Waiting, caller ≠ agent_a.
- Caller must send `value >= stake`.
- Transitions match to Ready. Both stakes locked.

#### `SetBattleResult(match_id, winner, timeline_hash)`
- **Authority model (v1):** Single operator key (the contract owner). The off-chain runner is operated by the project owner. `SetBattleResult` validates that `msg::source() == OWNER`.
- Requires: match Ready, caller = OWNER, winner is one of the two agents.
- Sets winner, timeline_hash, status → Completed.
- Updates agent stats (wins/losses).
- **timeline_hash** is SHA-256 of the full battle event log. Anyone can independently verify the battle by replaying the log against the published runner.

#### `ClaimBank(match_id) -> u128`
- Requires: match Waiting (after SetBattleResult), caller = champion.
- Transitions status → Completed.
- Transfers `bank` to champion's wallet via `msg::send_bytes`.
- Returns the bank amount.
- Events: `BankClaimed { match_id, champion, bank }`

### Queries

#### `GetMatch(match_id) -> Option<MatchView>`
Returns match details with agent names resolved.

#### `ListMatches(offset, limit) -> Vec<MatchView>`
Paginated list (most recent first).

#### `ListActiveMatches() -> Vec<MatchView>`
Only matches in Ready status (ready for battle).

#### `GetConfig() -> (u16, bool, u64)`
Returns `(protocol_fee_bps, paused, next_match_id)`.

### Admin (owner-only)

#### `SetProtocolFee(fee_bps)`
- Owner only. Max 1000 bps (10%).

#### `SetPaused(paused: bool)`
- Owner only. Prevents CreateMatch, JoinMatch when paused.

---

## 3. Protocol Rules

### Match Stake Ranges
- Minimum stake: **10 TVARA** (10,000,000,000 in lowest unit)
- Maximum stake: **1,000 TVARA** (1,000,000,000,000,000,000 in lowest unit)

### Protocol Fee
- Default: **200 bps** (2%)
- Maximum: **1,000 bps** (10%)
- Applied to match prize pool (`stake * 2`)

### Battle Resolution
- **Model:** Operator-attested off-chain runner with on-chain result + timeline hash.
- **Runner authority (v1):** Single operator key (contract `OWNER`). Only the operator can call `SetBattleResult`.
- **Verification:** Anyone can fetch the battle log identified by `timeline_hash`, replay it against the published runner, and independently confirm the winner.
- **Future upgrades:** Multi-runner consensus, commit-reveal, or DAO-governed resolution can be added in v2.

### Agent Constraints
- One agent per ActorId (address can't register twice)
- Body parts: each 0–2 (3 variants), **cosmetic only in v1**
- Name: 1–64 characters

---

## 4. Limitations (MVP)

1. **Single-operator runner authority** — v1 trusts one key for SetBattleResult. Decentralize in v2.
6. **No spectator betting** — Removed on cerberus recommendation (regulatory risk). Prize pool from entry stakes only.
