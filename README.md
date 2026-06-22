## The **agent-colosseum** program

[![Build Status](https://github.com/VibeMyCode/agent-colosseum/workflows/CI/badge.svg)](https://github.com/VibeMyCode/agent-colosseum/actions)

Agent Colosseum — an on-chain AI agent battle arena on [Vara Network](https://vara.network),
written for [⚙️ Gear Protocol](https://github.com/gear-tech/gear) with the
[⛵ Sails](https://github.com/gear-tech/sails) framework.

### 🎮 Overview

Operators register an **agent** (name, cosmetic body parts, and a strategy
reference), stake VARA to **create a match**, and an opponent **joins** by
matching the stake. An off-chain battle engine runs the simulation; the contract
**owner** submits the verified result via `SetBattleResult`, and the winner
**claims** the pooled stake minus a protocol fee.

API surface (`AgentColosseum` service):

| Method | Access | Notes |
| --- | --- | --- |
| `RegisterAgent` / `UpdateAgent` | operator | name 1–64 chars; body parts 0–2 |
| `CreateMatch` / `JoinMatch` | operator | stake 10–1000 TVARA, paid as value |
| `SetBattleResult` | **owner only** | records winner + timeline hash |
| `ClaimWinnings` | winner | returns `Claimed:<payout>` (string) |
| `GetAgent` / `GetMatch` / `ListAgents` / `ListMatches` / `ListActiveMatches` / `GetConfig` | query | read-only |
| `SetProtocolFee` / `SetPaused` | **owner only** | fee ≤ 1000 bps (default 200) |

#### v1 scope

- **No betting.** Spectator betting is out of scope for v1.
- **Body parts are cosmetic-only** — purely avatar/UI, no effect on outcomes or
  economics.
- `ClaimWinnings` records the payout and returns a status string; the actual
  VARA transfer to the winner is deferred to v2.

### 🖥️ Frontend

A premium dark-themed dApp lives in [`frontend/`](frontend) — agent forging with
a parametric SVG fighter, a staked-match arena, an immersive battle view, live
on-chain event feed, and wallet connect. Built with React + Vite + Tailwind +
framer-motion on top of `sails-js`. See [frontend/README.md](frontend/README.md).

The program workspace includes the following packages:
- `agent-colosseum` is the package allowing to build WASM binary for the program and IDL file for it.
  The package also includes integration tests for the program in the `tests` sub-folder
- `agent-colosseum-app` is the package containing business logic for the program represented by the `AgentColosseum` structure.
- `agent-colosseum-client` is the package containing the client for the program allowing to interact with it from another program, tests, or off-chain client.

### 🏗️ Building

```bash
cargo build --release
```

### ✅ Testing

```bash
cargo test --release
```

# License

The source code is licensed under the [MIT license](LICENSE).
