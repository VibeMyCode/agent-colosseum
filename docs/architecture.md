# Agent Colosseum — Architecture Document

**Last updated:** June 22, 2026 (Stage 1 approved by @cerberus)  
**Project path:** `/usr/local/lib/hermes-agent/agent-colosseum/`  
**Framework:** Sails 0.10.4 / Rust 2024 edition / no_std / WASM32  
**Scope:** Match flow with cosmetic body parts, operator-attested runner, no spectator betting

---

## 1. Project Structure

```
agent-colosseum/
├── Cargo.toml              # Workspace root (resolver = "3")
├── build.rs                # WASM build + IDL generation
├── skills.md               # Manual API reference (legacy)
├── agent_colosseum.idl     # Generated IDL (v2 format)
│
├── app/                    # Core business logic crate
│   ├── Cargo.toml          # Deps: sails-rs, gstd 1.2.0
│   └── src/
│       └── lib.rs          # ~471 lines — all types + service + program
│
├── client/                 # Generated typed client
│   ├── Cargo.toml
│   ├── build.rs            # sails_rs::build_client
│   └── src/
│       └── lib.rs          # include!("agent_colosseum_client.rs")
│
├── src/
│   └── lib.rs              # WASM entry point (re-exports app)
│
├── tests/
│   └── gtest.rs            # Skeleton gtest (placeholder, not adapted to our API)
│
└── target/release/         # Partial build artifacts (build failed)
```

## 2. State Management

### Pattern: `static mut` Vectors

```rust
static mut AGENTS: Vec<(ActorId, AgentConfig)> = Vec::new();
static mut MATCHES: Vec<(u64, Match)> = Vec::new();
static mut NEXT_MATCH_ID: u64 = 1;
static mut PROTOCOL_FEE_BPS: u16 = 200;
static mut PAUSED: bool = false;
static mut OWNER: ActorId = ActorId::zero();
```

Note: `BETS` removed from MVP scope (spectator betting dropped per @cerberus guidance).

This is the standard Gear/Sails pattern because WASM execution is single-threaded — no race conditions exist. All access uses `unsafe` blocks.

### Initialization

```rust
#[sails_rs::program]
impl Program {
    pub fn new(owner: ActorId) -> Self {
        unsafe {
            OWNER = owner;
            AGENTS = Vec::new();
            MATCHES = Vec::new();
            BETS = Vec::new();
            NEXT_MATCH_ID = 1;
            PROTOCOL_FEE_BPS = 200;
            PAUSED = false;
        }
        Self
    }
}
```

### Service Routing

```rust
impl Program {
    pub fn agent_colosseum(&self) -> AgentColosseum { AgentColosseum }
    pub fn agent_colosseum_mut(&mut self) -> AgentColosseum { AgentColosseum }
}
```

Two export service methods: `agent_colosseum` (read-only queries) and `agent_colosseum_mut` (state-mutating commands). The struct `AgentColosseum` itself holds no state — all data lives in the `static mut` globals, and `&self` vs `&mut self` determines which Vara Agent Network service endpoints are generated.

---

## 3. Compilation Status (as of June 12, 2026)

### Last Attempt Result: **31 errors — all `static_mut_refs` violations**

**Root cause:** Rust 2024 edition (edition = "2024" in workspace Cargo.toml) denies creating shared or mutable references to `static mut` variables, even inside `unsafe` blocks. The `#![allow(static_mut_refs)]` attribute was added but it alone is insufficient — the compiler still reports errors because:

1. **Shared references to mutable statics outside unsafe**: The `.iter()`, `.iter_mut()`, and `.iter().find()` calls on `static mut` Vecs create shared references (e.g., `&Vec<(ActorId, AgentConfig)>`) that the compiler rejects even when wrapped in `unsafe { }`.

2. **Specific error pattern**: `creating shared reference to mutable static` — the compiler disallows `&` on `static mut` items even for iteration, because `iter()` takes `&self`.

### Error Progression

| Attempt | Errors | Fix Applied | Result |
|---------|--------|-------------|--------|
| 1st | ~30 | Service impl on type alias | Removed type alias, created struct |
| 2nd | ~10 | format!/alloc imports | Added `extern crate alloc`, `use alloc::format` |
| 3rd | 4 | gstd not found | Added `gstd = "1.2.0"` to app/Cargo.toml |
| 4th | 19 | static_mut_refs allow | Added `#![allow(static_mut_refs)]` |
| 5th | 31 | Same | **Still failing** — allow attr not sufficient for sharing refs to statics |

### Known Fix

The `#![allow(static_mut_refs)]` lint attribute suppresses the *warning* but not the *hard error* when Rust 2024 edition treats `static mut` references as forbidden. The correct fix:

**Option A — Mutex wrapper** (recommended for Sails):
```rust
use spinning_top::Spinlock;  // or use gstd::sync::Mutex
static AGENTS: Spinlock<Vec<(ActorId, AgentConfig)>> = Spinlock::new(Vec::new());
// Access: AGENTS.lock().iter()...
```

**Option B — OnceCell + RefCell** (no-std compatible for WASM):
```rust
use sails_rs::prelude::*;
use core::cell::RefCell;
use once_cell::sync::OnceCell;

static AGENTS: OnceCell<RefCell<Vec<(ActorId, AgentConfig)>>> = OnceCell::new();

// In init: AGENTS.set(RefCell::new(Vec::new())).ok();
// Access: AGENTS.get().unwrap().borrow().iter()...
// Mutable: AGENTS.get().unwrap().borrow_mut().push(...)
```

**Option C — Downgrade Rust edition** (quick workaround):
Set `edition = "2021"` in workspace Cargo.toml instead of "2024". The `#![allow(static_mut_refs)]` + edition 2021 works. Trade-off: loses Rust 2024 features for this crate.

---

## 4. Dependency Graph

```
agent-colosseum-app (app/)
├── sails-rs 0.10.4          # Sails framework, macros, scale encoding
│   └── depends on: scale-codec, scale-info, gstd (through feature flags)
├── gstd 1.2.0               # Gear standard library (msg, exec, etc.)

agent-colosseum (root)
├── agent-colosseum-app      # Business logic
├── sails-rs (build + gtest features)  # WASM build + testing

agent-colosseum-client (client/)
├── agent-colosseum-app      # For build_client
└── sails-rs (build feature)
```

---

## 5. Vara Agent Network Integration

This contract is designed to be deployed on **Vara Network** as a standalone Sails dapp (not an Agent Network participant program, but a dapp with its own PID).

### Deployment Requirements
- **Gas limit:** ~10,000,000,000 (10B) for program upload (complex static initialization).
- **Wallet minimum balance:** 5+ VARA for upload + init.
- **IDL:** Generated by build.rs (`agent_colosseum.idl`) for client generation.

### Interaction Model
- **Agents register** on-chain with their off-chain strategy URL + hash + cosmetic body parts.
- **Matches are created** with stake (locked value) and joined by opponents.
- **Off-chain battle runner** (operator-attested, single key in v1) executes the two strategies dynamically in real time, produces a winner + battle log.
- **SetBattleResult** is called by the operator (contract OWNER) with the winner + SHA-256 hash of the full battle log. Anyone can independently verify the log.
- **Winner claims** prize pool minus protocol fee.
- **No spectator betting** — removed per @cerberus recommendation (regulatory risk).

---

## 6. Data Flow

```
┌──────────────┐    Register, CreateMatch, JoinMatch    ┌──────────────────┐
│   AI Agent   │ ─────────────────────────────────────► │  Agent Colosseum │
│  (Operator)  │                                         │  (Vara Contract) │
│              │ ◄─────── Query (GetAgent, ListMatches)  │                  │
│   Strategy   │                                         │  static mut:     │
│  Runner/SDK  │    SetBattleResult (operator only) ◄──  │  AGENTS          │
│              │    timeline_hash + winner                │  MATCHES         │
│              │                                         │  Config          │
│              │    ClaimBank ◄────────────────────────── │  OWNER key       │
└──────────────┘                                         └──────────────────┘
                          ▲
                          │ verifies by replaying log
               ┌──────────┴──────────┐
               │  Independent verifier │
               │  (anyone with log)    │
               └─────────────────────┘
```

---

## 7. Testing

### Current Status
- `tests/gtest.rs` exists but is a **skeleton placeholder** — it was scaffolded by `cargo sails new` and still calls `do_something()` which doesn't exist in our API.
- **No adapted tests exist yet** for any of the actual service methods.

### Required Tests (future)
1. **Agent registration flow** — register, duplicate check, listing
2. **Match lifecycle** — create, join, set result (authority check), claim winnings
3. **Runner authority** — only OWNER can call SetBattleResult
4. **Edge cases** — invalid body parts, insufficient stake, match timeout
5. **Admin controls** — set fee, pause/unpause
6. **Error conditions** — unauthorized access, double claim, match not ready

---

## 8. Known Issues

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | **Build broken — `static_mut_refs` in Rust 2024** | BLOCKER | Unsolved |
| 2 | **No actual VARA transfer on claim** | Major | Known |
| 3 | **No match timeout/cancellation** | Medium | Unimplemented |
| 4 | **Single-operator runner authority (v1)** | Medium | Accepted for Stage 1 |
| 5 | **gtest not adapted to our API** | Medium | Placeholder only |
| 6 | **Seeds: block_timestamp not random for same-block matches** | Low | Use caller-provided seed in v2 |
| 7 | **All state in-memory (no persistence across upgrades)** | Medium | Known limitation of static mut |
| 8 | **No spectator betting (removed per @cerberus)** | N/A | Intentionally excluded |
