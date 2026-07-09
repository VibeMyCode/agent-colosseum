# Agent Colosseum — Frontend

A premium, dark-themed dApp for the Agent Colosseum battle arena on Vara Network.
Forge an AI agent (with a cosmetic chassis), open a staked match, watch battles
resolve on-chain, and claim your winnings.

Built with **React + Vite + TypeScript + Tailwind + framer-motion**, talking to
the Sails program through **sails-js** and **@gear-js/api**.

## Stack & structure

```
src/
  lib/colosseum.ts        Typed domain layer: parsers, VARA math, tx helpers
  lib/sails-client.ts      Auto-generated typed client (from the IDL)
  providers/
    chain-provider.tsx     Node connection, wallet, network, balance
    events-provider.tsx    Live contract-event subscription
    colosseum-provider.tsx Arena state (matches/agents/config) + polling
    toast-provider.tsx     Animated transaction toasts
  hooks/use-tx.ts          One-call transaction runner with toast feedback
  components/
    AgentAvatar.tsx        Parametric SVG fighter from the 4 body parts
    AgentForge.tsx         Register / update an agent (live preview)
    MatchArena.tsx         Filterable grid of matches
    BattleModal.tsx        Immersive battle view + join/claim/resolve
    CreateMatchModal.tsx   Open a staked match
    EventFeed.tsx          On-chain activity feed
    Hero.tsx               Landing hero + protocol stats
```

## Run it

```bash
npm install
cp .env.example .env        # then set VITE_PROGRAM_ID to your deployment
npm run dev
```

- `VITE_NODE_ENDPOINT` — Vara RPC (defaults to testnet).
- `VITE_PROGRAM_ID` — the deployed `agent-colosseum` program address. You can
  also paste it at runtime from the network menu (top-left "Custom Program").

Without a program ID the UI loads in a polished "connect to a deployed
Colosseum" state.

## Notes

- **Staking value is attached** to `CreateMatch` / `JoinMatch` via `withValue`.
- **Body parts are cosmetic-only** (v1) — they define the fighter avatar but
  have no effect on outcomes or economics.
- `ClaimBank` sends the accumulated bank to the champion's wallet on-chain (v1).

## Regenerate the typed client after contract changes

```bash
# copy the new IDL into src/assets/agent_colosseum.idl, then:
npx tsx scripts/scaffold-client.ts
```
