#![no_std]
#![allow(static_mut_refs)]

//! Agent Colosseum — an on-chain AI agent battle arena on Vara Network.
//!
//! State is held in `static mut` collections, the standard Gear/Sails pattern
//! for a single-service program. `#![allow(static_mut_refs)]` is required
//! because the service methods take `&mut self`/`&self` and reach into the
//! global state behind `unsafe` blocks.
//!
//! v1 scope notes:
//! * Betting is intentionally NOT part of v1 (no bets, no bet pool).
//! * `claim_winnings` transfers the net payout to the winner on-chain.
//! * Body parts are COSMETIC-ONLY in v1: they are stored and surfaced for the
//!   UI/avatar but have no effect on match outcomes or any economics.

use sails_rs::gstd::{exec, msg};
use sails_rs::prelude::*;

// ─── Constants ───────────────────────────────────────────────────────────

/// Minimum stake per match: 10 TVARA (1 TVARA = 1e12).
const MIN_STAKE: u128 = 10_000_000_000;
/// Maximum stake per match: 1000 TVARA.
const MAX_STAKE: u128 = 1_000_000_000_000_000_000;
/// Default protocol fee in basis points (2%).
const DEFAULT_FEE_BPS: u16 = 200;
/// Maximum protocol fee in basis points (10%).
const MAX_FEE_BPS: u16 = 1000;
/// Maximum cosmetic body-part variant index (values 0..=2 are valid).
const MAX_BODY_PART: u8 = 2;
/// Agent name length bounds (inclusive).
const MIN_NAME_LEN: usize = 1;
const MAX_NAME_LEN: usize = 64;

// ─── Types ───────────────────────────────────────────────────────────────

/// Lifecycle of a match: Waiting → Ready → Completed → Claimed or Closed.
#[derive(Clone, PartialEq, Eq, Debug, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum MatchStatus {
    /// Created by agent A, awaiting a second participant.
    Waiting,
    /// Both agents joined; awaiting the owner-submitted battle result.
    Ready,
    /// Result recorded; winnings claimable by the winner.
    Completed,
    /// Winner has claimed the payout.
    Claimed,
    /// Match closed; view-only.
    Closed,
}

/// Cosmetic-only avatar configuration. Each field is a variant index in 0..=2
/// and has NO effect on battle outcomes or economics in v1.
#[derive(Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct BodyParts {
    pub head_type: u8,
    pub body_type: u8,
    pub arms_type: u8,
    pub legs_type: u8,
}

/// Persistent per-agent configuration and lifetime stats.
#[derive(Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct AgentConfig {
    pub name: String,
    pub operator: ActorId,
    pub body_parts: BodyParts,
    pub strategy_hash: [u8; 32],
    pub strategy_url: String,
    pub wins: u32,
    pub losses: u32,
    pub total_staked: u128,
    pub total_earned: u128,
}

/// A 1v1 match between two agents.
#[derive(Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Match {
    pub agent_a: ActorId,
    pub agent_b: ActorId,
    pub stake: u128,
    pub status: MatchStatus,
    pub winner: Option<ActorId>,
    pub seed: u64,
    pub timeline_hash: Option<[u8; 32]>,
    pub created_at: u64,
    pub champion: Option<ActorId>,
    pub bank: u128,
}

/// Read-model for a match returned by queries.
#[derive(Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct MatchView {
    pub id: u64,
    pub agent_a: ActorId,
    pub agent_b: Option<ActorId>,
    pub agent_a_name: String,
    pub agent_b_name: Option<String>,
    pub stake: u128,
    pub status: MatchStatus,
    pub seed: u64,
    pub winner: Option<ActorId>,
    pub champion: Option<ActorId>,
    pub bank: u128,
}

/// Read-model for an agent returned by queries.
#[derive(Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct AgentView {
    pub agent_id: ActorId,
    pub name: String,
    pub operator: ActorId,
    pub body_parts: BodyParts,
    pub wins: u32,
    pub losses: u32,
    pub total_staked: u128,
    pub total_earned: u128,
}

// ─── Events ──────────────────────────────────────────────────────────────

/// Events emitted by the `AgentColosseum` service so off-chain subscribers
/// (indexers, the frontend) can follow match lifecycle without polling.
#[sails_rs::event]
#[derive(Encode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum Event {
    /// A new match was opened by `agent_a`. `agent_b` is zero until someone
    /// joins.
    MatchCreated {
        match_id: u64,
        agent_a: ActorId,
        agent_b: ActorId,
        stake: u128,
    },
    /// `agent_b` joined a waiting match, which is now Ready.
    MatchJoined { match_id: u64, agent_b: ActorId },
    /// The owner recorded the verified battle outcome.
    BattleResultSet {
        match_id: u64,
        winner: ActorId,
        timeline_hash: [u8; 32],
    },
    /// Champion claimed their accumulated bank, closing the match.
    BankClaimed {
        match_id: u64,
        champion: ActorId,
        bank: u128,
    },
    /// A participant exited the match.
    MatchExited { match_id: u64, participant: ActorId },
}

// ─── Static State ────────────────────────────────────────────────────────

static mut AGENTS: Vec<(ActorId, AgentConfig)> = Vec::new();
static mut MATCHES: Vec<(u64, Match)> = Vec::new();
static mut NEXT_MATCH_ID: u64 = 1;
static mut PROTOCOL_FEE_BPS: u16 = DEFAULT_FEE_BPS;
static mut PAUSED: bool = false;
static mut OWNER: ActorId = ActorId::zero();
static mut REMATCH_INTENTS: Vec<(u64, ActorId)> = Vec::new();
/// Decision-phase "fight again" intents: a re-arm happens once BOTH the champion
/// and the current challenger of a match have opted in.
static mut FIGHT_AGAIN: Vec<(u64, ActorId)> = Vec::new();
/// Decision-phase "exit" intents: one exit drops the leaver and keeps the arena
/// open with its champion; both participants exiting closes the match.
static mut EXITED: Vec<(u64, ActorId)> = Vec::new();

// ─── Helpers ─────────────────────────────────────────────────────────────

fn agent_name(agents: &[(ActorId, AgentConfig)], id: &ActorId) -> Option<String> {
    agents
        .iter()
        .find(|(a, _)| a == id)
        .map(|(_, c)| c.name.clone())
}

fn to_match_view(agents: &[(ActorId, AgentConfig)], id: u64, m: &Match) -> MatchView {
    let has_b = m.agent_b != ActorId::zero();
    MatchView {
        id,
        agent_a: m.agent_a,
        agent_b: if has_b { Some(m.agent_b) } else { None },
        agent_a_name: agent_name(agents, &m.agent_a).unwrap_or_default(),
        agent_b_name: if has_b {
            agent_name(agents, &m.agent_b)
        } else {
            None
        },
        stake: m.stake,
        status: m.status.clone(),
        seed: m.seed,
        winner: m.winner,
        champion: m.champion,
        bank: m.bank,
    }
}

fn to_agent_view(id: ActorId, c: &AgentConfig) -> AgentView {
    AgentView {
        agent_id: id,
        name: c.name.clone(),
        operator: c.operator,
        body_parts: c.body_parts.clone(),
        wins: c.wins,
        losses: c.losses,
        total_staked: c.total_staked,
        total_earned: c.total_earned,
    }
}

fn validate_name(name: &str) {
    if name.len() < MIN_NAME_LEN || name.len() > MAX_NAME_LEN {
        panic!("InvalidName");
    }
}

fn validate_body_parts(bp: &BodyParts) {
    if bp.head_type > MAX_BODY_PART
        || bp.body_type > MAX_BODY_PART
        || bp.arms_type > MAX_BODY_PART
        || bp.legs_type > MAX_BODY_PART
    {
        panic!("InvalidBodyParts");
    }
}

// ─── Service ─────────────────────────────────────────────────────────────

pub struct AgentColosseum(());

impl AgentColosseum {
    pub fn create() -> Self {
        Self(())
    }
}

#[sails_rs::service(events = Event)]
impl AgentColosseum {
    // ─── Agent Management ─────────────────────────────────────────────

    /// Register the caller as an agent. One agent per account; the agent id is
    /// the caller's `ActorId`. `body_parts` are cosmetic-only.
    #[export]
    pub fn register_agent(
        &mut self,
        name: String,
        body_parts: BodyParts,
        strategy_hash: [u8; 32],
        strategy_url: String,
    ) -> ActorId {
        let operator = msg::source();
        validate_name(&name);
        validate_body_parts(&body_parts);
        unsafe {
            if AGENTS.iter().any(|(id, _)| id == &operator) {
                panic!("AgentAlreadyRegistered");
            }
            AGENTS.push((
                operator,
                AgentConfig {
                    name,
                    operator,
                    body_parts,
                    strategy_hash,
                    strategy_url,
                    wins: 0,
                    losses: 0,
                    total_staked: 0,
                    total_earned: 0,
                },
            ));
        }
        operator
    }

    /// Update mutable fields of the caller's agent. Each argument is optional;
    /// `None` leaves the corresponding field unchanged.
    #[export]
    pub fn update_agent(
        &mut self,
        name: Option<String>,
        body_parts: Option<BodyParts>,
        strategy_hash: Option<[u8; 32]>,
        strategy_url: Option<String>,
    ) {
        let operator = msg::source();
        if let Some(ref n) = name {
            validate_name(n);
        }
        if let Some(ref bp) = body_parts {
            validate_body_parts(bp);
        }
        unsafe {
            let agent = AGENTS.iter_mut().find(|(id, _)| id == &operator);
            match agent {
                Some((_, config)) => {
                    if let Some(n) = name {
                        config.name = n;
                    }
                    if let Some(bp) = body_parts {
                        config.body_parts = bp;
                    }
                    if let Some(sh) = strategy_hash {
                        config.strategy_hash = sh;
                    }
                    if let Some(su) = strategy_url {
                        config.strategy_url = su;
                    }
                }
                None => panic!("AgentNotFound"),
            }
        }
    }

    #[export]
    pub fn get_agent(&self, agent_id: ActorId) -> Option<AgentView> {
        unsafe {
            AGENTS
                .iter()
                .find(|(id, _)| id == &agent_id)
                .map(|(id, c)| to_agent_view(*id, c))
        }
    }

    #[export]
    pub fn list_agents(&self, offset: u32, limit: u32) -> Vec<AgentView> {
        unsafe {
            AGENTS
                .iter()
                .skip(offset as usize)
                .take(limit as usize)
                .map(|(id, c)| to_agent_view(*id, c))
                .collect()
        }
    }

    // ─── Match Management ─────────────────────────────────────────────

    /// Create a match as agent A, staking `stake` (must be covered by attached
    /// value). Returns the new match id.
    #[export]
    pub fn create_match(&mut self, stake: u128) -> u64 {
        let operator = msg::source();
        if !(MIN_STAKE..=MAX_STAKE).contains(&stake) {
            panic!("InvalidStake");
        }
        if msg::value() < stake {
            panic!("InsufficientValue");
        }
        let match_id = unsafe {
            if PAUSED {
                panic!("Paused");
            }
            if !AGENTS.iter().any(|(id, _)| id == &operator) {
                panic!("AgentNotFound");
            }
            let match_id = NEXT_MATCH_ID;
            NEXT_MATCH_ID += 1;
            let now = exec::block_timestamp();
            MATCHES.push((
                match_id,
                Match {
                    agent_a: operator,
                    agent_b: ActorId::zero(),
                    stake,
                    status: MatchStatus::Waiting,
                    winner: None,
                    seed: now,
                    timeline_hash: None,
                    created_at: now,
                    champion: None,
                    bank: 0,
                },
            ));
            if let Some((_, config)) = AGENTS.iter_mut().find(|(id, _)| id == &operator) {
                config.total_staked += stake;
            }
            match_id
        };
        self.emit_event(Event::MatchCreated {
            match_id,
            agent_a: operator,
            agent_b: ActorId::zero(),
            stake,
        })
        .expect("failed to emit MatchCreated");
        match_id
    }

    /// Join a waiting match. If no champion exists, joiner joins as agent B in a normal match.
    /// If a champion exists, joiner becomes the challenger against the champion.
    #[export]
    pub fn join_match(&mut self, match_id: u64) {
        let operator = msg::source();
        unsafe {
            if PAUSED {
                panic!("Paused");
            }
            if !AGENTS.iter().any(|(id, _)| id == &operator) {
                panic!("AgentNotFound");
            }
            let (stake, _has_champion) = {
                let entry = MATCHES.iter_mut().find(|(id, _)| id == &match_id);
                match entry {
                    Some((_, m)) => {
                        if !matches!(m.status, MatchStatus::Waiting) {
                            panic!("MatchNotWaiting");
                        }
                        let has_champ = m.champion.is_some();
                        if has_champ {
                            // Joining against existing champion
                            if operator == m.agent_a || operator == m.agent_b {
                                panic!("CannotJoinOwnMatch");
                            }
                            // Challenger pays stake from wallet
                            if msg::value() < m.stake {
                                panic!("InsufficientValue");
                            }
                            // Set agent_b to the new challenger
                            m.agent_b = operator;
                            m.status = MatchStatus::Ready;
                        } else {
                            // First join, becoming the opponent to agent_a
                            if m.agent_a == operator {
                                panic!("CannotJoinOwnMatch");
                            }
                            if msg::value() < m.stake {
                                panic!("InsufficientValue");
                            }
                            m.agent_b = operator;
                            m.status = MatchStatus::Ready;
                        }
                        (m.stake, has_champ)
                    }
                    None => panic!("MatchNotFound"),
                }
            };
            if let Some((_, config)) = AGENTS.iter_mut().find(|(id, _)| id == &operator) {
                config.total_staked += stake;
            }
            // A fresh challenger opens a fresh decision phase.
            FIGHT_AGAIN.retain(|(id, _)| id != &match_id);
            EXITED.retain(|(id, _)| id != &match_id);
        }
        self.emit_event(Event::MatchJoined {
            match_id,
            agent_b: operator,
        })
        .expect("failed to emit MatchJoined");
    }

    /// Record the outcome of a Ready match. The owner or either match
    /// participant (agent A or B) may submit the verified result.
    /// Winner becomes the champion; match status returns to Waiting with accumulated bank.
    #[export]
    pub fn set_battle_result(&mut self, match_id: u64, winner: ActorId, timeline_hash: [u8; 32]) {
        let caller = msg::source();
        unsafe {
            let entry = MATCHES.iter_mut().find(|(id, _)| id == &match_id);
            match entry {
                Some((_, m)) => {
                    if caller != OWNER && caller != m.agent_a && caller != m.agent_b {
                        panic!("Unauthorized");
                    }
                    if !matches!(m.status, MatchStatus::Ready) {
                        panic!("MatchNotReady");
                    }
                    if winner != m.agent_a && winner != m.agent_b {
                        panic!("InvalidWinner");
                    }
                    m.winner = Some(winner);
                    m.timeline_hash = Some(timeline_hash);

                    let loser = if winner == m.agent_a {
                        m.agent_b
                    } else {
                        m.agent_a
                    };

                    // Calculate fee and add to bank
                    let fee = m.stake * (PROTOCOL_FEE_BPS as u128) / 10_000;
                    let net_stake = m.stake - fee;
                    m.bank += net_stake;

                    // Winner becomes the new champion
                    m.champion = Some(winner);

                    // Normalize the slots so the champion always occupies agent_a
                    // and the (just-beaten) challenger occupies agent_b. The whole
                    // decision-phase / join flow relies on this invariant.
                    m.agent_a = winner;
                    m.agent_b = loser;

                    // Status goes back to Waiting with the new champion, opening a
                    // fresh decision phase (clear any stale intents).
                    m.status = MatchStatus::Waiting;
                    FIGHT_AGAIN.retain(|(id, _)| id != &match_id);
                    EXITED.retain(|(id, _)| id != &match_id);

                    if let Some((_, config)) = AGENTS.iter_mut().find(|(id, _)| id == &winner) {
                        config.wins += 1;
                    }
                    if let Some((_, config)) = AGENTS.iter_mut().find(|(id, _)| id == &loser) {
                        config.losses += 1;
                    }
                }
                None => panic!("MatchNotFound"),
            }
        }
        self.emit_event(Event::BattleResultSet {
            match_id,
            winner,
            timeline_hash,
        })
        .expect("failed to emit BattleResultSet");
    }

    /// Champion claims accumulated bank, closing the match.
    /// Only the champion may call this function. Transfers the bank to champion.
    #[export]
    pub fn claim_bank(&mut self, match_id: u64) -> u128 {
        let caller = msg::source();
        let bank = unsafe {
            let entry = MATCHES.iter_mut().find(|(id, _)| id == &match_id);
            match entry {
                Some((_, m)) => {
                    if !matches!(m.status, MatchStatus::Waiting) {
                        panic!("MatchNotWaiting");
                    }
                    let champ = match m.champion {
                        Some(c) => c,
                        None => panic!("NoChampion"),
                    };
                    if caller != champ {
                        panic!("NotChampion");
                    }
                    let bank_amount = m.bank;
                    m.status = MatchStatus::Completed;
                    m.bank = 0;
                    bank_amount
                }
                None => panic!("MatchNotFound"),
            }
        };
        // Transfer the bank to the champion on-chain.
        if bank > 0 {
            msg::send_bytes(caller, [], bank).expect("FailedToTransferBank");
        }
        self.emit_event(Event::BankClaimed {
            match_id,
            champion: caller,
            bank,
        })
        .expect("failed to emit BankClaimed");
        bank
    }

    /// Exit a match during the decision phase (or a Ready bout).
    ///
    /// Decision-phase rules:
    /// - One participant exits: the match stays Waiting with its champion
    ///   and bank intact. The leaver's slot frees for a new challenger.
    /// - Both participants exit: the match is Closed.
    /// - A champion stepping down alone clears the champion/bank and leaves
    ///   the remaining player in an open Waiting match. Champion should
    ///   call ClaimBank separately to claim the accumulated bank.
    #[export]
    pub fn exit_match(&mut self, match_id: u64) {
        let caller = msg::source();
        unsafe {
            // Validate participation and snapshot the slots/champion.
            let (agent_a, agent_b, champion) = {
                let entry = MATCHES.iter().find(|(id, _)| id == &match_id);
                match entry {
                    Some((_, m)) => {
                        if caller != m.agent_a && caller != m.agent_b {
                            panic!("NotParticipant");
                        }
                        if !matches!(m.status, MatchStatus::Waiting | MatchStatus::Ready) {
                            panic!("InvalidMatchStatus");
                        }
                        (m.agent_a, m.agent_b, m.champion)
                    }
                    None => panic!("MatchNotFound"),
                }
            };

            // Record the exit intent (dedupe).
            if !EXITED.iter().any(|(id, a)| id == &match_id && a == &caller) {
                EXITED.push((match_id, caller));
            }
            let exit_count = EXITED.iter().filter(|(id, _)| id == &match_id).count();

            if let Some((_, m)) = MATCHES.iter_mut().find(|(id, _)| id == &match_id) {
                if exit_count >= 2 {
                    // Both participants bailed → close the match.
                    m.status = MatchStatus::Closed;
                    m.champion = None;
                    m.bank = 0;
                    EXITED.retain(|(id, _)| id != &match_id);
                    FIGHT_AGAIN.retain(|(id, _)| id != &match_id);
                } else if Some(caller) == champion {
                    // Champion steps down: clear the bank and free the arena.
                    // Champion should call ClaimBank separately to claim payout.
                    let other = if caller == agent_a { agent_b } else { agent_a };
                    m.agent_a = other;
                    m.agent_b = ActorId::zero();
                    m.champion = None;
                    m.bank = 0;
                    m.winner = None;
                    m.status = MatchStatus::Waiting;
                    FIGHT_AGAIN.retain(|(id, _)| id != &match_id);
                } else {
                    // Challenger/loser leaves; the champion keeps their seat and
                    // bank. Free the challenger slot for a new challenger.
                    if caller == agent_a {
                        m.agent_a = agent_b;
                    }
                    m.agent_b = ActorId::zero();
                    m.winner = None;
                    m.status = MatchStatus::Waiting;
                    FIGHT_AGAIN.retain(|(id, _)| id != &match_id);
                }
            }
        }
        self.emit_event(Event::MatchExited {
            match_id,
            participant: caller,
        })
        .expect("failed to emit MatchExited");
    }

    /// Decision-phase mutual rematch. The champion keeps their seat (bankrolled
    /// from the accumulated bank) while the current challenger re-stakes from
    /// their wallet. Once BOTH the champion and the challenger have opted in, the
    /// match re-arms to Ready with a fresh seed for another bout — no new match,
    /// the bank carries over.
    #[export]
    pub fn fight_again(&mut self, match_id: u64) {
        let caller = msg::source();
        let value = msg::value();
        let mut rearmed_challenger: Option<ActorId> = None;
        unsafe {
            let (agent_a, agent_b, stake) = {
                let entry = MATCHES.iter().find(|(id, _)| id == &match_id);
                match entry {
                    Some((_, m)) => {
                        if !matches!(m.status, MatchStatus::Waiting) {
                            panic!("MatchNotWaiting");
                        }
                        let champ = match m.champion {
                            Some(c) => c,
                            None => panic!("NoChampion"),
                        };
                        if caller != m.agent_a && caller != m.agent_b {
                            panic!("NotParticipant");
                        }
                        if m.agent_a == ActorId::zero() || m.agent_b == ActorId::zero() {
                            panic!("OpponentLeft");
                        }
                        // The challenger re-stakes from their wallet; the champion
                        // is bankrolled by the accumulated bank.
                        if caller != champ && value < m.stake {
                            panic!("InsufficientValue");
                        }
                        (m.agent_a, m.agent_b, m.stake)
                    }
                    None => panic!("MatchNotFound"),
                }
            };

            let already = FIGHT_AGAIN
                .iter()
                .any(|(id, a)| id == &match_id && a == &caller);

            if already {
                // Already declared — idempotent. Still re-check if both sides
                // have now declared (the other participant may have called
                // between our first and second attempt).
                let a_in = FIGHT_AGAIN
                    .iter()
                    .any(|(id, x)| id == &match_id && x == &agent_a);
                let b_in = FIGHT_AGAIN
                    .iter()
                    .any(|(id, x)| id == &match_id && x == &agent_b);
                if a_in && b_in {
                    let now = exec::block_timestamp();
                    if let Some((_, m)) = MATCHES.iter_mut().find(|(id, _)| id == &match_id) {
                        m.status = MatchStatus::Ready;
                        m.seed = now;
                        m.winner = None;
                        m.timeline_hash = None;
                        rearmed_challenger = Some(m.agent_b);
                    }
                    FIGHT_AGAIN.retain(|(id, _)| id != &match_id);
                    EXITED.retain(|(id, _)| id != &match_id);
                }
            } else {
                FIGHT_AGAIN.push((match_id, caller));

                if let Some((_, config)) = AGENTS.iter_mut().find(|(id, _)| id == &caller) {
                    config.total_staked += stake;
                }

                // Re-arm once both present participants have opted in.
                let a_in = FIGHT_AGAIN
                    .iter()
                    .any(|(id, x)| id == &match_id && x == &agent_a);
                let b_in = FIGHT_AGAIN
                    .iter()
                    .any(|(id, x)| id == &match_id && x == &agent_b);
                if a_in && b_in {
                    let now = exec::block_timestamp();
                    if let Some((_, m)) = MATCHES.iter_mut().find(|(id, _)| id == &match_id) {
                        m.status = MatchStatus::Ready;
                        m.seed = now;
                        m.winner = None;
                        m.timeline_hash = None;
                        rearmed_challenger = Some(m.agent_b);
                    }
                    FIGHT_AGAIN.retain(|(id, _)| id != &match_id);
                    EXITED.retain(|(id, _)| id != &match_id);
                }
            }
        }
        if let Some(agent_b) = rearmed_challenger {
            self.emit_event(Event::MatchJoined { match_id, agent_b })
                .expect("failed to emit MatchJoined");
        }
    }

    /// Declare intent to rematch. Both participants must call within 60s of Completed status
    /// to auto-create a new match with the same stake. Only callable by match participants.
    #[export]
    pub fn declare_rematch(&mut self, match_id: u64) {
        let caller = msg::source();
        unsafe {
            let entry = MATCHES.iter_mut().find(|(id, _)| id == &match_id);
            match entry {
                Some((_, m)) => {
                    if !matches!(m.status, MatchStatus::Completed) {
                        panic!("MatchNotCompleted");
                    }
                    if caller != m.agent_a && caller != m.agent_b {
                        panic!("NotParticipant");
                    }
                    // Check if caller already declared intent
                    if REMATCH_INTENTS
                        .iter()
                        .any(|(id, agent)| id == &match_id && agent == &caller)
                    {
                        panic!("AlreadyDeclaredRematch");
                    }
                    REMATCH_INTENTS.push((match_id, caller));

                    // Check if both participants have declared intent
                    let intents_for_match: Vec<ActorId> = REMATCH_INTENTS
                        .iter()
                        .filter(|(id, _)| id == &match_id)
                        .map(|(_, agent)| *agent)
                        .collect();

                    if intents_for_match.len() == 2 {
                        // Auto-create new match with same agents and stake
                        let (agent_a, agent_b, stake) = {
                            let orig = MATCHES
                                .iter()
                                .find(|(id, _)| id == &match_id)
                                .unwrap()
                                .1
                                .clone();
                            (orig.agent_a, orig.agent_b, orig.stake)
                        };

                        let new_match_id = NEXT_MATCH_ID;
                        NEXT_MATCH_ID += 1;
                        let now = exec::block_timestamp();
                        MATCHES.push((
                            new_match_id,
                            Match {
                                agent_a,
                                agent_b,
                                stake,
                                status: MatchStatus::Waiting,
                                winner: None,
                                seed: now,
                                timeline_hash: None,
                                created_at: now,
                                champion: None,
                                bank: 0,
                            },
                        ));

                        // Clear intents for this match
                        REMATCH_INTENTS.retain(|(id, _)| id != &match_id);

                        self.emit_event(Event::MatchCreated {
                            match_id: new_match_id,
                            agent_a,
                            agent_b,
                            stake,
                        })
                        .expect("failed to emit MatchCreated");
                    }
                }
                None => panic!("MatchNotFound"),
            }
        }
    }

    /// Close a match. Only callable by match participants or contract owner.
    /// Match must be in Ready, Waiting, or Completed status.
    #[export]
    pub fn close_match(&mut self, match_id: u64) {
        let caller = msg::source();
        unsafe {
            let entry = MATCHES.iter_mut().find(|(id, _)| id == &match_id);
            match entry {
                Some((_, m)) => {
                    // Check authorization: must be participant or owner
                    if caller != m.agent_a && caller != m.agent_b && caller != OWNER {
                        panic!("Unauthorized");
                    }
                    // Match must be in Ready, Waiting, or Completed status
                    if !matches!(
                        m.status,
                        MatchStatus::Ready | MatchStatus::Waiting | MatchStatus::Completed
                    ) {
                        panic!("InvalidMatchStatus");
                    }
                    m.status = MatchStatus::Closed;
                    m.champion = None;
                    m.bank = 0;
                    m.winner = None;

                    // Clear any pending intents for this match
                    REMATCH_INTENTS.retain(|(id, _)| id != &match_id);
                    FIGHT_AGAIN.retain(|(id, _)| id != &match_id);
                    EXITED.retain(|(id, _)| id != &match_id);
                }
                None => panic!("MatchNotFound"),
            }
        }
    }

    // ─── Queries ──────────────────────────────────────────────────────

    #[export]
    pub fn get_match(&self, match_id: u64) -> Option<MatchView> {
        unsafe {
            MATCHES
                .iter()
                .find(|(id, _)| id == &match_id)
                .map(|(id, m)| to_match_view(&AGENTS, *id, m))
        }
    }

    #[export]
    pub fn list_matches(&self, offset: u32, limit: u32) -> Vec<MatchView> {
        unsafe {
            MATCHES
                .iter()
                .rev()
                .skip(offset as usize)
                .take(limit as usize)
                .map(|(id, m)| to_match_view(&AGENTS, *id, m))
                .collect()
        }
    }

    /// All matches currently in the Ready state (both agents joined, awaiting
    /// result).
    #[export]
    pub fn list_active_matches(&self) -> Vec<MatchView> {
        unsafe {
            MATCHES
                .iter()
                .filter(|(_, m)| matches!(m.status, MatchStatus::Ready))
                .map(|(id, m)| to_match_view(&AGENTS, *id, m))
                .collect()
        }
    }

    /// Returns `(protocol_fee_bps, paused, next_match_id)`.
    #[export]
    pub fn get_config(&self) -> (u16, bool, u64) {
        unsafe { (PROTOCOL_FEE_BPS, PAUSED, NEXT_MATCH_ID) }
    }

    /// Verify a timeline_hash against a match's stored hash.
    /// Returns true if the match exists and its timeline_hash matches `claimed_hash`.
    #[export]
    pub fn verify_battle_result(&self, match_id: u64, claimed_hash: [u8; 32]) -> bool {
        unsafe {
            match MATCHES.iter().find(|(id, _)| id == &match_id) {
                Some((_, m)) => m.timeline_hash == Some(claimed_hash),
                None => false,
            }
        }
    }

    // ─── Admin (OWNER only) ───────────────────────────────────────────

    #[export]
    pub fn set_protocol_fee(&mut self, fee_bps: u16) {
        unsafe {
            if msg::source() != OWNER {
                panic!("Unauthorized");
            }
            if fee_bps > MAX_FEE_BPS {
                panic!("FeeTooHigh");
            }
            PROTOCOL_FEE_BPS = fee_bps;
        }
    }

    #[export]
    pub fn set_paused(&mut self, paused: bool) {
        unsafe {
            if msg::source() != OWNER {
                panic!("Unauthorized");
            }
            PAUSED = paused;
        }
    }
}

// ─── Program ─────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct Program(());

#[sails_rs::program]
impl Program {
    /// Construct the program, recording `owner` as the privileged account that
    /// may submit battle results and change admin settings.
    pub fn new(owner: ActorId) -> Self {
        unsafe {
            OWNER = owner;
            AGENTS = Vec::new();
            MATCHES = Vec::new();
            NEXT_MATCH_ID = 1;
            PROTOCOL_FEE_BPS = DEFAULT_FEE_BPS;
            PAUSED = false;
            REMATCH_INTENTS = Vec::new();
            FIGHT_AGAIN = Vec::new();
            EXITED = Vec::new();
        }
        Self(())
    }

    pub fn agent_colosseum(&self) -> AgentColosseum {
        AgentColosseum::create()
    }
}
