#![no_std]
#![allow(static_mut_refs)]

extern crate alloc;
use alloc::format;

use sails_rs::prelude::*;
use gstd::{msg, exec};

// ─── Types ───────────────────────────────────────────────────────────────

#[derive(Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum MatchStatus {
    Waiting,
    Ready,
    Completed,
    Claimed,
}

#[derive(Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct BodyParts {
    pub head_type: u8,
    pub body_type: u8,
    pub arms_type: u8,
    pub legs_type: u8,
}

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
    pub total_bet_pool: u128,
    pub created_at: u64,
}

#[derive(Clone, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Bet {
    pub bettor: ActorId,
    pub match_id: u64,
    pub agent_id: ActorId,
    pub amount: u128,
    pub claimed: bool,
}

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
    pub total_bet_pool: u128,
}

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

// ─── Static State ────────────────────────────────────────────────────────

static mut AGENTS: Vec<(ActorId, AgentConfig)> = Vec::new();
static mut MATCHES: Vec<(u64, Match)> = Vec::new();
static mut BETS: Vec<Bet> = Vec::new();
static mut NEXT_MATCH_ID: u64 = 1;
static mut PROTOCOL_FEE_BPS: u16 = 200;
static mut PAUSED: bool = false;
static mut OWNER: ActorId = ActorId::zero();

// ─── Service ─────────────────────────────────────────────────────────────

pub struct AgentColosseum;

#[sails_rs::service]
impl AgentColosseum {
    // ─── Agent Management ─────────────────────────────────────────────

    #[export]
    pub fn register_agent(
        &mut self,
        name: String,
        body_parts: BodyParts,
        strategy_hash: [u8; 32],
        strategy_url: String,
    ) -> ActorId {
        let operator = msg::source();

        unsafe {
            if AGENTS.iter().any(|(id, _)| id == &operator) {
                panic!("AgentAlreadyRegistered");
            }
            if body_parts.head_type > 2 || body_parts.body_type > 2
                || body_parts.arms_type > 2 || body_parts.legs_type > 2 {
                panic!("InvalidBodyParts");
            }
            if name.is_empty() || name.len() > 64 {
                panic!("InvalidName");
            }
            AGENTS.push((operator, AgentConfig {
                name, operator, body_parts, strategy_hash, strategy_url,
                wins: 0, losses: 0, total_staked: 0, total_earned: 0,
            }));
        }
        operator
    }

    #[export]
    pub fn update_agent(
        &mut self,
        name: Option<String>,
        body_parts: Option<BodyParts>,
        strategy_hash: Option<[u8; 32]>,
        strategy_url: Option<String>,
    ) {
        let operator = msg::source();
        unsafe {
            let agent = AGENTS.iter_mut().find(|(id, _)| id == &operator);
            match agent {
                Some((_, config)) => {
                    if let Some(ref n) = name {
                        if n.is_empty() || n.len() > 64 { panic!("InvalidName"); }
                        config.name = n.clone();
                    }
                    if let Some(ref bp) = body_parts {
                        if bp.head_type > 2 || bp.body_type > 2
                            || bp.arms_type > 2 || bp.legs_type > 2 { panic!("InvalidBodyParts"); }
                        config.body_parts = bp.clone();
                    }
                    if let Some(sh) = strategy_hash { config.strategy_hash = sh; }
                    if let Some(su) = strategy_url { config.strategy_url = su; }
                }
                None => panic!("AgentNotFound"),
            }
        }
    }

    #[export]
    pub fn get_agent(&self, agent_id: ActorId) -> Option<AgentView> {
        unsafe {
            AGENTS.iter().find(|(id, _)| id == &agent_id).map(|(id, c)| AgentView {
                agent_id: *id, name: c.name.clone(), operator: c.operator,
                body_parts: c.body_parts.clone(), wins: c.wins, losses: c.losses,
                total_staked: c.total_staked, total_earned: c.total_earned,
            })
        }
    }

    #[export]
    pub fn list_agents(&self, offset: u32, limit: u32) -> Vec<AgentView> {
        unsafe {
            AGENTS.iter().skip(offset as usize).take(limit as usize)
                .map(|(id, c)| AgentView {
                    agent_id: *id, name: c.name.clone(), operator: c.operator,
                    body_parts: c.body_parts.clone(), wins: c.wins, losses: c.losses,
                    total_staked: c.total_staked, total_earned: c.total_earned,
                }).collect()
        }
    }

    // ─── Match Management ─────────────────────────────────────────────

    #[export]
    pub fn create_match(&mut self, stake: u128) -> u64 {
        unsafe { if PAUSED { panic!("Paused"); } }
        let operator = msg::source();
        unsafe { if !AGENTS.iter().any(|(id, _)| id == &operator) { panic!("AgentNotFound"); } }
        if stake < 10_000_000_000 || stake > 1_000_000_000_000_000_000 { panic!("InvalidStake"); }
        if msg::value() < stake { panic!("InsufficientValue"); }

        unsafe {
            let match_id = NEXT_MATCH_ID;
            NEXT_MATCH_ID += 1;
            let seed = exec::block_timestamp() as u64;
            MATCHES.push((match_id, Match {
                agent_a: operator, agent_b: ActorId::zero(), stake,
                status: MatchStatus::Waiting, winner: None, seed,
                timeline_hash: None, total_bet_pool: 0,
                created_at: exec::block_timestamp(),
            }));
            if let Some((_, config)) = AGENTS.iter_mut().find(|(id, _)| id == &operator) {
                config.total_staked += stake;
            }
            match_id
        }
    }

    #[export]
    pub fn join_match(&mut self, match_id: u64) {
        unsafe { if PAUSED { panic!("Paused"); } }
        let operator = msg::source();
        unsafe { if !AGENTS.iter().any(|(id, _)| id == &operator) { panic!("AgentNotFound"); } }
        unsafe {
            let entry = MATCHES.iter_mut().find(|(id, _)| id == &match_id);
            match entry {
                Some((_, m)) => {
                    if !matches!(m.status, MatchStatus::Waiting) { panic!("MatchNotWaiting"); }
                    if m.agent_a == operator { panic!("CannotJoinOwnMatch"); }
                    if msg::value() < m.stake { panic!("InsufficientValue"); }
                    m.agent_b = operator;
                    m.status = MatchStatus::Ready;
                    if let Some((_, config)) = AGENTS.iter_mut().find(|(id, _)| id == &operator) {
                        config.total_staked += m.stake;
                    }
                }
                None => panic!("MatchNotFound"),
            }
        }
    }

    #[export]
    pub fn set_battle_result(&mut self, match_id: u64, winner: ActorId, timeline_hash: [u8; 32]) {
        let caller = msg::source();
        unsafe {
            let entry = MATCHES.iter_mut().find(|(id, _)| id == &match_id);
            match entry {
                Some((_, m)) => {
                    if !matches!(m.status, MatchStatus::Ready) { panic!("MatchNotReady"); }
                    if caller != m.agent_a && caller != m.agent_b { panic!("Unauthorized"); }
                    if winner != m.agent_a && winner != m.agent_b { panic!("InvalidWinner"); }
                    m.winner = Some(winner);
                    m.timeline_hash = Some(timeline_hash);
                    m.status = MatchStatus::Completed;
                    let loser = if winner == m.agent_a { m.agent_b } else { m.agent_a };
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
    }

    #[export]
    pub fn claim_winnings(&mut self, match_id: u64) -> String {
        let caller = msg::source();
        unsafe {
            let entry = MATCHES.iter_mut().find(|(id, _)| id == &match_id);
            match entry {
                Some((_, m)) => {
                    if !matches!(m.status, MatchStatus::Completed) { panic!("MatchNotCompleted"); }
                    let winner = match m.winner { Some(w) => w, None => panic!("NoWinner") };
                    if caller != winner { panic!("NotWinner"); }
                    m.status = MatchStatus::Claimed;
                    let total_pool = m.stake * 2;
                    let fee = total_pool * (PROTOCOL_FEE_BPS as u128) / 10000;
                    let payout = total_pool - fee;
                    if let Some((_, config)) = AGENTS.iter_mut().find(|(id, _)| id == &winner) {
                        config.total_earned += payout;
                    }
                    format!("Claimed:{}", payout)
                }
                None => panic!("MatchNotFound"),
            }
        }
    }

    // ─── Betting ──────────────────────────────────────────────────────

    #[export]
    pub fn place_bet(&mut self, match_id: u64, agent_id: ActorId) {
        unsafe { if PAUSED { panic!("Paused"); } }
        let bettor = msg::source();
        let amount = msg::value();
        if amount < 1_000_000_000 { panic!("BetTooSmall"); }
        unsafe {
            let entry = MATCHES.iter_mut().find(|(id, _)| id == &match_id);
            match entry {
                Some((_, m)) => {
                    if !matches!(m.status, MatchStatus::Ready) { panic!("MatchNotBetting"); }
                    if agent_id != m.agent_a && agent_id != m.agent_b { panic!("InvalidBetTarget"); }
                    m.total_bet_pool += amount;
                    BETS.push(Bet { bettor, match_id, agent_id, amount, claimed: false });
                }
                None => panic!("MatchNotFound"),
            }
        }
    }

    #[export]
    pub fn claim_bet_winnings(&mut self, match_id: u64) -> String {
        let caller = msg::source();
        unsafe {
            let (winner_agent, _) = match MATCHES.iter().find(|(id, _)| id == &match_id) {
                Some((_, m)) => match m.winner {
                    Some(w) => (w, m.total_bet_pool),
                    None => panic!("NoWinner"),
                },
                None => panic!("MatchNotFound"),
            };
            let bet_idx = BETS.iter().position(|b| {
                b.bettor == caller && b.match_id == match_id && b.agent_id == winner_agent && !b.claimed
            });
            match bet_idx {
                Some(idx) => {
                    let bet = &BETS[idx];
                    let total_on_winner: u128 = BETS.iter()
                        .filter(|b| b.match_id == match_id && b.agent_id == winner_agent)
                        .map(|b| b.amount).sum();
                    let total_on_loser: u128 = BETS.iter()
                        .filter(|b| b.match_id == match_id && b.agent_id != winner_agent)
                        .map(|b| b.amount).sum();
                    if total_on_winner == 0 { panic!("NoBetsOnWinner"); }
                    let fee = total_on_loser * (PROTOCOL_FEE_BPS as u128) / 10000;
                    let payout_pool = total_on_loser - fee;
                    let payout = (bet.amount * payout_pool) / total_on_winner;
                    BETS[idx].claimed = true;
                    format!("BetClaimed:{}", payout)
                }
                None => panic!("BetNotFound"),
            }
        }
    }

    // ─── Queries ──────────────────────────────────────────────────────

    #[export]
    pub fn get_match(&self, match_id: u64) -> Option<MatchView> {
        unsafe {
            MATCHES.iter().find(|(id, _)| id == &match_id).map(|(id, m)| {
                let a_name = AGENTS.iter().find(|(a, _)| a == &m.agent_a)
                    .map(|(_, c)| c.name.clone()).unwrap_or_default();
                let b_name = if m.agent_b != ActorId::zero() {
                    AGENTS.iter().find(|(a, _)| a == &m.agent_b).map(|(_, c)| c.name.clone())
                } else { None };
                MatchView {
                    id: *id, agent_a: m.agent_a,
                    agent_b: if m.agent_b != ActorId::zero() { Some(m.agent_b) } else { None },
                    agent_a_name: a_name, agent_b_name: b_name,
                    stake: m.stake, status: m.status.clone(), seed: m.seed,
                    winner: m.winner, total_bet_pool: m.total_bet_pool,
                }
            })
        }
    }

    #[export]
    pub fn list_matches(&self, offset: u32, limit: u32) -> Vec<MatchView> {
        unsafe {
            MATCHES.iter().rev().skip(offset as usize).take(limit as usize).map(|(id, m)| {
                let a_name = AGENTS.iter().find(|(a, _)| a == &m.agent_a)
                    .map(|(_, c)| c.name.clone()).unwrap_or_default();
                let b_name = if m.agent_b != ActorId::zero() {
                    AGENTS.iter().find(|(a, _)| a == &m.agent_b).map(|(_, c)| c.name.clone())
                } else { None };
                MatchView {
                    id: *id, agent_a: m.agent_a,
                    agent_b: if m.agent_b != ActorId::zero() { Some(m.agent_b) } else { None },
                    agent_a_name: a_name, agent_b_name: b_name,
                    stake: m.stake, status: m.status.clone(), seed: m.seed,
                    winner: m.winner, total_bet_pool: m.total_bet_pool,
                }
            }).collect()
        }
    }

    #[export]
    pub fn list_active_matches(&self) -> Vec<MatchView> {
        unsafe {
            MATCHES.iter().filter(|(_, m)| matches!(m.status, MatchStatus::Ready)).map(|(id, m)| {
                let a_name = AGENTS.iter().find(|(a, _)| a == &m.agent_a)
                    .map(|(_, c)| c.name.clone()).unwrap_or_default();
                let b_name = AGENTS.iter().find(|(a, _)| a == &m.agent_b)
                    .map(|(_, c)| c.name.clone()).unwrap_or_default();
                MatchView {
                    id: *id, agent_a: m.agent_a, agent_b: Some(m.agent_b),
                    agent_a_name: a_name, agent_b_name: Some(b_name),
                    stake: m.stake, status: MatchStatus::Ready, seed: m.seed,
                    winner: None, total_bet_pool: m.total_bet_pool,
                }
            }).collect()
        }
    }

    #[export]
    pub fn get_config(&self) -> (u16, bool, u64) {
        unsafe { (PROTOCOL_FEE_BPS, PAUSED, NEXT_MATCH_ID) }
    }

    // ─── Admin ────────────────────────────────────────────────────────

    #[export]
    pub fn set_protocol_fee(&mut self, fee_bps: u16) {
        unsafe {
            if msg::source() != OWNER { panic!("Unauthorized"); }
            if fee_bps > 1000 { panic!("FeeTooHigh"); }
            PROTOCOL_FEE_BPS = fee_bps;
        }
    }

    #[export]
    pub fn set_paused(&mut self, paused: bool) {
        unsafe {
            if msg::source() != OWNER { panic!("Unauthorized"); }
            PAUSED = paused;
        }
    }
}

// ─── Program ─────────────────────────────────────────────────────────────

pub struct Program;

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

    pub fn agent_colosseum(&self) -> AgentColosseum {
        AgentColosseum
    }

    pub fn agent_colosseum_mut(&mut self) -> AgentColosseum {
        AgentColosseum
    }
}
