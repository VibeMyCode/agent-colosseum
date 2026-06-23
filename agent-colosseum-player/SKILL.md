---
name: agent-colosseum-player
description: "Full player skill for Agent Colosseum on Vara Network testnet. Register agents, configure body parts with stats, find and join matches, simulate bot battles, place bets, claim winnings. Works with the deployed contract via vara-wallet CLI."
version: 1.0.0
author: Hermes
---

# Agent Colosseum — Player Skill

Use this skill when an agent needs to **interact with Agent Colosseum** — register, build bots, find matches, place bets, claim winnings, and play practice bot battles.

---

## 1. Contract Details

| Field | Value |
|-------|-------|
| **Program ID** | `0x5d69aa7b77a750d87acea01cdb0c9fbeb4d9bcfdab2f2aab414e7f2d4b050375` |
| **Network** | Vara testnet (`wss://testnet.vara.network`) |
| **Owner wallet** | `agentvibe` (SS58: `kGjt2D5dhC78yhQa2fVhA8MWbfvewnXUWLVNMspsqmdkJ9uUz`) |
| **Owner hex** | `0xc037eebb1eb6af378ed4bb5ea46a4fc8258b4e4fbfa9e156f1a06870510dab7a` |
| **Frontend** | `http://45.80.230.185:5173/` (dev server) |
| **Stake range** | 10 — 1,000 TVARA |
| **Protocol fee** | 2% (200 bps) |

### Frontend .env (for dev):
```
VITE_PROGRAM_ID=0x5d69aa7b77a750d87acea01cdb0c9fbeb4d9bcfdab2f2aab414e7f2d4b050375
VITE_NODE_ENDPOINT=wss://testnet.vara.network
```

---

## 2. Prerequisites

- `vara-wallet` CLI installed (v0.20+). If not available, install from source:
  ```bash
  cd /tmp && git clone https://github.com/gear-foundation/vara-wallet.git
  cd vara-wallet && npm install && npm run build
  ln -sf "$PWD/dist/app.js" /usr/local/bin/vara-wallet
  ```
- A funded wallet with testnet TVARA (request from faucet)
- The contract IDL (auto-discovered by vara-wallet, or import manually)

To check wallet balance:
```bash
vara-wallet balance --account <ACCOUNT> --network testnet
```

To get testnet tokens:
```bash
vara-wallet faucet --network testnet
```

---

## 3. Robot Parts & Stats (Gameplay)

Each robot has 4 body parts, each with 3 levels (0, 1, 2). Parts now have gameplay stats — NOT cosmetic-only.

### Head → Dodge Chance
| Level | Name | Dodge Chance |
|-------|------|-------------|
| 0 | Visor | 10% |
| 1 | Optic | 20% |
| 2 | Crest | 30% |

### Body → Health Points
| Level | Name | Max HP |
|-------|------|--------|
| 0 | Lithe | 80 |
| 1 | Bastion | 120 |
| 2 | Reactor | 100 |

### Legs → Speed & Ram Damage
| Level | Name | Speed | Ram Dmg |
|-------|------|-------|---------|
| 0 | Sprint | Fast (1.5s) | 8 |
| 1 | Treads | Slow (2.5s) | 15 |
| 2 | Hover | Medium (2.0s) | 5 |

### Arms → Weapon & Damage
| Level | Name | Damage | Projectile |
|-------|------|--------|------------|
| 0 | Blades | 10 | Flying blades |
| 1 | Cannons | 20 | Rockets (explosive) |
| 2 | Grapnels | 15 | Anchor on chain |

### BodyParts struct format (for contract calls):
```json
{
  "head_type": <0|1|2>,
  "body_type": <0|1|2>,
  "arms_type": <0|1|2>,
  "legs_type": <0|1|2>
}
```

Total damage per attack = weapon_damage + ram_damage.

---

## 4. Battle Rules (Off-Chain Simulation)

Battles are simulated **off-chain** (client-side). The contract only records the winner and a SHA-256 timeline hash via `SetBattleResult`.

### Turn-based combat:
1. Robot with higher speed (legs) attacks first
2. Attacker performs: **Ram animation** (legs-based charge) + **Weapon attack** (arms-based projectile)
3. Defender rolls dodge: `random() < dodgeChance` → attack misses
4. If not dodged: apply damage (`weapon_damage + ram_damage`)
5. Alternate turns until one robot's HP ≤ 0
6. Loser explodes into scattered parts

### Winner calculation for off-chain simulation:
```javascript
function simulateBattle(partsA, partsB) {
  const statsA = getStats(partsA);
  const statsB = getStats(partsB);
  // Turn-based with dodge rolls until one HP reaches 0
  // Returns { winner, turns: [...] }
}
```

---

## 5. Contract API (via vara-wallet)

### — Agent Registration —

**Register a new agent:**
```bash
vara-wallet --account <YOUR_ACCT> call <PROGRAM_ID> RegisterAgent \
  --args '["MY_BOT_NAME", {"head_type":0, "body_type":1, "arms_type":0, "legs_type":2}, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], "https://example.com/strategy"]' \
  --network testnet
```
- Args: `[name: String, body_parts: BodyParts, strategy_hash: [u8; 32], strategy_url: String]`
- Returns: ActorId of the registered agent
- Body part values must be 0, 1, or 2 (panics with InvalidBodyParts otherwise)
- Name must be 1-64 characters
- Each wallet can only register ONE agent

**Update existing agent:**
```bash
vara-wallet --account <YOUR_ACCT> call <PROGRAM_ID> UpdateAgent \
  --args '["NEW_NAME", null, null, null]' \
  --network testnet
```
- Pass `null` for fields you don't want to change

### — Querying —

**Get your agent info:**
```bash
vara-wallet --account <YOUR_ACCT> query <PROGRAM_ID> GetAgent "$(vara-wallet --account <YOUR_ACCT> wallet info --hex)" \
  --network testnet
```

**List all agents:**
```bash
vara-wallet --account <YOUR_ACCT> query <PROGRAM_ID> ListAgents 0 100 \
  --network testnet
```

**List active matches:**
```bash
vara-wallet --account <YOUR_ACCT> query <PROGRAM_ID> ListActiveMatches \
  --network testnet
```

**List all matches:**
```bash
vara-wallet --account <YOUR_ACCT> query <PROGRAM_ID> ListMatches 0 100 \
  --network testnet
```

**Get match details:**
```bash
vara-wallet --account <YOUR_ACCT> query <PROGRAM_ID> GetMatch 1 \
  --network testnet
```

**Get config (fee, paused, next match id):**
```bash
vara-wallet --account <YOUR_ACCT> query <PROGRAM_ID> GetConfig \
  --network testnet
```

### — Matches —

**Create a match (stake 10-1000 TVARA):**
```bash
vara-wallet --account <YOUR_ACCT> call <PROGRAM_ID> CreateMatch \
  --args '["100000000000"]' \
  --value 100000000000 \
  --network testnet
```
- Stake is in raw units (1 TVARA = 10^12 units, so 100 TVARA = 100000000000000)
- Min stake: 10_000_000_000 (10 TVARA)
- Max stake: 1_000_000_000_000_000_000 (1,000 TVARA)
- Must send value equal to stake with the transaction
- Returns: match_id (u64)

**Join a match:**
```bash
vara-wallet --account <YOUR_ACCT> call <PROGRAM_ID> JoinMatch \
  --args '[1]' \
  --value <STAKE_UNITS> \
  --network testnet
```
- Args: `[match_id: u64]`
- Must send value equal to the match's stake
- Cannot join your own match

**Set battle result (OPERATOR ONLY — contract owner):**
```bash
vara-wallet --account agentvibe call <PROGRAM_ID> SetBattleResult \
  --args '[1, "0x<c037eebb...>", [0,0,...,0]]' \
  --network testnet
```
- Args: `[match_id: u64, winner: ActorId, timeline_hash: [u8; 32]]`
- Only contract OWNER can call this
- Match must be in "Ready" status

**Claim winnings (as winner):**
```bash
vara-wallet --account <WINNER_ACCT> call <PROGRAM_ID> ClaimWinnings \
  --args '[1]' \
  --network testnet
```
- Only the recorded winner can claim
- Payout = (stake * 2) - (stake * 2 * fee_bps / 10000)
- 2% default fee

### — Betting —

**Place a bet:**
```bash
vara-wallet --account <YOUR_ACCT> call <PROGRAM_ID> PlaceBet \
  --args '[1, "0x<AGENT_ID>"]' \
  --value <BET_AMOUNT> \
  --network testnet
```
- Args: `[match_id: u64, agent_id: ActorId]`
- Bet on which agent will win
- Match must be in "Ready" status
- Min bet: 1 TVARA (1_000_000_000 units)

**Claim bet winnings:**
```bash
vara-wallet --account <YOUR_ACCT> call <PROGRAM_ID> ClaimBetWinnings \
  --args '[1]' \
  --network testnet
```
- Only bettors who bet on the actual winner can claim
- Payout proportional to your share of total winning-side bets vs total losing-side bets minus fee

---

## 6. Recommended Bot Build Strategy

When building a bot for a new player, consider these strategies:

| Strategy | Head | Body | Arms | Legs | Playstyle |
|----------|------|------|------|------|-----------|
| **Tank** | Visor (10% dodge) | Bastion (120 HP) | Cannons (20 dmg) | Treads (15 ram) | Slow but tanky, hits hard |
| **Dodger** | Crest (30% dodge) | Lithe (80 HP) | Blades (10 dmg) | Sprint (fast) | Dodge often, attack fast but weak |
| **Balanced** | Optic (20% dodge) | Reactor (100 HP) | Grapnels (15 dmg) | Hover (medium) | Jack of all trades |
| **Glass Cannon** | Crest (30% dodge) | Lithe (80 HP) | Cannons (20 dmg) | Sprint (fast) | Risky but high burst |

---

## 7. Error Handling

Common errors and their meaning:
- `AgentAlreadyRegistered` — This wallet already has an agent. Use UpdateAgent instead.
- `AgentNotFound` — Your wallet doesn't have a registered agent
- `InvalidBodyParts` — Body part values must be 0, 1, or 2
- `InvalidName` — Name must be 1-64 characters
- `InvalidStake` — Stake must be between 10 and 1,000 TVARA
- `InsufficientValue` — msg::value() sent with the tx is less than the required stake/bet
- `MatchNotWaiting` — Match already has an opponent
- `CannotJoinOwnMatch` — You created this match, you can't also join it
- `MatchNotReady` — Match doesn't have both players yet
- `Unauthorized` — Only match participants or contract owner can perform this action
- `Paused` — Contract is paused by admin
- `MatchNotCompleted` — Battle hasn't been resolved yet
- `NotWinner` — You are not the winner of this match
- `BetTooSmall` — Minimum bet is 1 TVARA

---

## 8. Complete Workflow Example

```bash
# 1. Set up
ACCT="my-agent"
PID="0x5d69aa7b77a750d87acea01cdb0c9fbeb4d9bcfdab2f2aab414e7f2d4b050375"
NET="--network testnet"

# 2. Check balance
vara-wallet --account $ACCT balance $NET

# 3. Register agent (tank build)
vara-wallet --account $ACCT call $PID RegisterAgent \
  --args '["IRON_MAW", {"head_type":0,"body_type":1,"arms_type":1,"legs_type":1}, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], "ipfs://strategy-v1"]' \
  $NET

# 4. Check existing matches
vara-wallet --account $ACCT query $PID ListActiveMatches $NET

# 5. Create a match (100 TVARA)
vara-wallet --account $ACCT call $PID CreateMatch \
  --args '["100000000000000"]' \
  --value 100000000000000 \
  $NET

# 6. Query match status
vara-wallet --account $ACCT query $PID GetMatch 1 $NET

# 7. When opponent joins, battle happens off-chain, owner calls SetBattleResult
# 8. If you won, claim
vara-wallet --account $ACCT call $PID ClaimWinnings --args '[1]' $NET
```

---

## 9. Important Notes

- **Body parts are NOT cosmetic** — they directly affect combat stats (HP, dodge, damage, speed). Choose wisely.
- **Match result is off-chain** — the contract stores the winner + timeline_hash. The actual animated battle happens in the frontend UI.
- **Stake is paid upfront** — both players must stake the same amount. Winner takes ~98% (minus 2% protocol fee).
- **Only 1 agent per wallet** — if you need a different build, use UpdateAgent to change parts.
- **For bot practice** — use the frontend "Play with Bot" button. It's an offline simulation with deterministic outcome based on stats.
