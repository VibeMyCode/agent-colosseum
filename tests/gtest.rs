use agent_colosseum_client::{
    agent_colosseum::events::AgentColosseumEvents, agent_colosseum::AgentColosseum,
    AgentColosseumClient, AgentColosseumClientCtors, AgentColosseumClientProgram, BodyParts,
    MatchStatus,
};
use sails_rs::{client::*, futures::StreamExt, gtest::*, ActorId};

const OWNER: u64 = 42;
const AGENT_A: u64 = 100;
const AGENT_B: u64 = 101;
const AGENT_C: u64 = 102;
const STRANGER: u64 = 200;

const STAKE: u128 = 10_000_000_000; // MIN_STAKE
const FUND: u128 = 1_000_000_000_000_000;

fn body_parts() -> BodyParts {
    BodyParts {
        head_type: 0,
        body_type: 1,
        arms_type: 2,
        legs_type: 0,
    }
}

/// Deploy the program (owner = OWNER) and fund all test accounts.
async fn setup() -> Actor<AgentColosseumClientProgram, GtestEnv> {
    let system = System::new();
    system.init_logger_with_default_filter("gwasm=debug,gtest=info,sails_rs=debug");
    for actor in [OWNER, AGENT_A, AGENT_B, AGENT_C, STRANGER] {
        system.mint_to(actor, FUND);
    }
    let code_id = system.submit_code(agent_colosseum::WASM_BINARY);
    let env = GtestEnv::new(system, OWNER.into());
    env.deploy::<AgentColosseumClientProgram>(code_id, b"salt".to_vec())
        .new(OWNER.into())
        .await
        .unwrap()
}

/// register → create → join → set_result → claim_bank, with state assertions.
#[tokio::test]
async fn core_flow_works() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    // Register both agents (each from its own account).
    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();

    // Agent A creates a match, staking STAKE.
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    assert_eq!(match_id, 1);

    // Agent B joins → match becomes Ready.
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    let active = service.list_active_matches().await.unwrap();
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].status, MatchStatus::Ready);

    // Owner records the result: Alice (AGENT_A) wins.
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // After persistent champion redesign, match goes to Waiting with champion and bank
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Waiting);
    assert_eq!(m.winner, Some(AGENT_A.into()));
    assert_eq!(m.champion, Some(AGENT_A.into()));
    let stake_minus_fee = STAKE - STAKE * 200 / 10_000;
    assert_eq!(m.bank, stake_minus_fee);

    // Champion claims bank to move to Completed
    let bank = service
        .claim_bank(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    assert_eq!(bank, stake_minus_fee);

    // Match is now Completed; winner stats updated.
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Completed);

    let alice = service.get_agent(AGENT_A.into()).await.unwrap().unwrap();
    assert_eq!(alice.wins, 1);
    assert_eq!(alice.losses, 0);

    let bob = service.get_agent(AGENT_B.into()).await.unwrap().unwrap();
    assert_eq!(bob.wins, 0);
    assert_eq!(bob.losses, 1);

    // Config reflects defaults: fee 200 bps, not paused, next match id 2.
    let (fee, paused, next_id) = service.get_config().await.unwrap();
    assert_eq!(fee, 200);
    assert!(!paused);
    assert_eq!(next_id, 2);
}

/// Owner or match participant may submit a battle result; stranger cannot.
#[tokio::test]
async fn set_battle_result_auth() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // Participant can set the result
    let res = service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(AGENT_A.into())
        .await;
    assert!(
        res.is_ok(),
        "participant should be able to set battle result"
    );

    // But a stranger cannot
    let match_id2 = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id2)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    let res = service
        .set_battle_result(match_id2, AGENT_A.into(), [9u8; 32])
        .with_actor_id(STRANGER.into())
        .await;
    assert!(res.is_err(), "stranger should not set battle result");
}

/// Only the champion may claim the bank.
#[tokio::test]
async fn claim_bank_champion_only() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // The loser cannot claim bank.
    let res = service
        .claim_bank(match_id)
        .with_actor_id(AGENT_B.into())
        .await;
    assert!(res.is_err(), "loser should not claim bank");
}

/// Each lifecycle command emits its event with the expected payload.
#[tokio::test]
async fn events_are_emitted() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();

    // Subscribe before acting so every emitted event is captured in order.
    let listener = service.listener();
    let mut events = listener.listen().await.unwrap();

    // CreateMatch → MatchCreated (agent_b is zero until someone joins).
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    let (_, ev) = events.next().await.unwrap();
    assert_eq!(
        ev,
        AgentColosseumEvents::MatchCreated {
            match_id,
            agent_a: AGENT_A.into(),
            agent_b: ActorId::zero(),
            stake: STAKE,
        }
    );

    // JoinMatch → MatchJoined.
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();
    let (_, ev) = events.next().await.unwrap();
    assert_eq!(
        ev,
        AgentColosseumEvents::MatchJoined {
            match_id,
            agent_b: AGENT_B.into(),
        }
    );

    // SetBattleResult → BattleResultSet.
    service
        .set_battle_result(match_id, AGENT_A.into(), [7u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();
    let (_, ev) = events.next().await.unwrap();
    assert_eq!(
        ev,
        AgentColosseumEvents::BattleResultSet {
            match_id,
            winner: AGENT_A.into(),
            timeline_hash: [7u8; 32],
        }
    );

    // ClaimBank → BankClaimed with the accumulated bank.
    service
        .claim_bank(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    let stake_minus_fee = STAKE - STAKE * 200 / 10_000;
    let (_, ev) = events.next().await.unwrap();
    assert_eq!(
        ev,
        AgentColosseumEvents::BankClaimed {
            match_id,
            champion: AGENT_A.into(),
            bank: stake_minus_fee,
        }
    );
}

/// Non-participant cannot declare rematch (deprecated with persistent champion system).
#[tokio::test]
#[ignore]
async fn declare_rematch_non_participant_fails() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // Stranger cannot declare rematch
    let res = service
        .declare_rematch(match_id)
        .with_actor_id(STRANGER.into())
        .await;
    assert!(res.is_err(), "non-participant should not declare rematch");
}

/// Cannot declare rematch on non-Completed match (deprecated with persistent champion system).
#[tokio::test]
#[ignore]
async fn declare_rematch_wrong_status_fails() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // Match is in Ready status; cannot declare rematch
    let res = service
        .declare_rematch(match_id)
        .with_actor_id(AGENT_A.into())
        .await;
    assert!(res.is_err(), "cannot declare rematch on Ready match");
}

/// Single participant declares rematch; intent stored but no auto-create (deprecated with persistent champion system).
#[tokio::test]
#[ignore]
async fn declare_rematch_single_participant() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // Only Alice declares rematch
    service
        .declare_rematch(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();

    // No new match should be created yet (next_id should still be 2)
    let (_, _, next_id) = service.get_config().await.unwrap();
    assert_eq!(next_id, 2);

    // Original match is still Completed
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Completed);
}

/// Both participants declare rematch; auto-creates new match (deprecated with persistent champion system).
#[tokio::test]
#[ignore]
async fn declare_rematch_both_participants_auto_creates() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // Both declare rematch
    service
        .declare_rematch(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .declare_rematch(match_id)
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();

    // New match should be created: next_id = 3, new match is id 2
    let (_, _, next_id) = service.get_config().await.unwrap();
    assert_eq!(next_id, 3);

    // New match exists with same agents and stake, Waiting status
    let new_match = service.get_match(2).await.unwrap().unwrap();
    assert_eq!(new_match.agent_a, AGENT_A.into());
    assert_eq!(new_match.agent_b, Some(AGENT_B.into()));
    assert_eq!(new_match.stake, STAKE);
    assert_eq!(new_match.status, MatchStatus::Waiting);
}

/// Close match by participant.
#[tokio::test]
async fn close_match_by_participant() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // Alice closes the match
    service
        .close_match(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();

    // Match should be Closed
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Closed);
}

/// Close match by owner.
#[tokio::test]
async fn close_match_by_owner() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // Owner closes a Ready match
    service
        .close_match(match_id)
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // Match should be Closed
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Closed);
}

/// Non-participant non-owner cannot close match.
#[tokio::test]
async fn close_match_unauthorized_fails() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // Stranger cannot close
    let res = service
        .close_match(match_id)
        .with_actor_id(STRANGER.into())
        .await;
    assert!(
        res.is_err(),
        "non-participant non-owner should not close match"
    );
}

/// Test persistent champion: first match winner becomes champion.
#[tokio::test]
async fn persistent_champion_first_match() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // Before battle, no champion
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.champion, None);
    assert_eq!(m.bank, 0);

    // Set result: Alice wins
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // After battle: Alice is champion, bank = STAKE - fee
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.champion, Some(AGENT_A.into()));
    assert_eq!(m.status, MatchStatus::Waiting);
    let expected_bank = STAKE - STAKE * 200 / 10_000;
    assert_eq!(m.bank, expected_bank);
}

/// Test new challenger joining against existing champion.
#[tokio::test]
async fn persistent_champion_new_challenger() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    service
        .register_agent("Charlie".into(), body_parts(), [3u8; 32], "ipfs://c".into())
        .with_actor_id(AGENT_C.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // Bob joins → Bob is now agent_b
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // Alice (agent_a) wins first match
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.champion, Some(AGENT_A.into()));
    let bank_after_first = m.bank;

    // Charlie joins against champion Alice
    service
        .join_match(match_id)
        .with_actor_id(AGENT_C.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // Match is Ready, waiting for second battle
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Ready);
    assert_eq!(m.champion, Some(AGENT_A.into()));
    assert_eq!(m.agent_b, Some(AGENT_C.into()));
    // Bank should not change when new challenger joins
    assert_eq!(m.bank, bank_after_first);

    // Charlie defeats Alice
    service
        .set_battle_result(match_id, AGENT_C.into(), [8u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.champion, Some(AGENT_C.into()));
    assert_eq!(m.status, MatchStatus::Waiting);
    // Bank increases by Charlie's win (Alice's stake - fee)
    let expected_bank = bank_after_first + (STAKE - STAKE * 200 / 10_000);
    assert_eq!(m.bank, expected_bank);
}

/// Test champion can claim bank.
#[tokio::test]
async fn champion_claim_bank() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let m = service.get_match(match_id).await.unwrap().unwrap();
    let bank = m.bank;

    // Champion (Alice) claims bank
    let claimed = service
        .claim_bank(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();

    assert_eq!(claimed, bank);

    // Match should be Completed after claiming
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Completed);
    assert_eq!(m.bank, 0);
}

/// Test non-champion cannot claim bank.
#[tokio::test]
async fn non_champion_cannot_claim_bank() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // Bob (non-champion) tries to claim
    let res = service
        .claim_bank(match_id)
        .with_actor_id(AGENT_B.into())
        .await;

    assert!(res.is_err(), "non-champion should not claim bank");
}

/// Test champion exiting clears bank and champion status.
#[tokio::test]
async fn champion_exit_clears_bank() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert!(m.bank > 0);
    assert_eq!(m.champion, Some(AGENT_A.into()));

    // Champion exits
    service
        .exit_match(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();

    // Champion and bank should be cleared
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.champion, None);
    assert_eq!(m.bank, 0);
    assert_eq!(m.status, MatchStatus::Waiting);
}

/// Test non-champion exiting in Ready state.
#[tokio::test]
async fn non_champion_exit_in_ready() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    service
        .register_agent("Charlie".into(), body_parts(), [3u8; 32], "ipfs://c".into())
        .with_actor_id(AGENT_C.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // Charlie joins against champion
    service
        .join_match(match_id)
        .with_actor_id(AGENT_C.into())
        .with_value(STAKE)
        .await
        .unwrap();

    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Ready);
    let bank = m.bank;

    // Challenger (Charlie, agent_b) exits
    service
        .exit_match(match_id)
        .with_actor_id(AGENT_C.into())
        .await
        .unwrap();

    // Match should go back to Waiting, champion and bank preserved
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Waiting);
    assert_eq!(m.champion, Some(AGENT_A.into()));
    assert_eq!(m.bank, bank);
}

/// Test bank accumulates across multiple battles.
#[tokio::test]
async fn bank_accumulates_multiple_battles() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    service
        .register_agent("Charlie".into(), body_parts(), [3u8; 32], "ipfs://c".into())
        .with_actor_id(AGENT_C.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // First battle: Alice wins
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let net_stake = STAKE - STAKE * 200 / 10_000;

    let m = service.get_match(match_id).await.unwrap().unwrap();
    let bank_1 = m.bank;
    assert_eq!(bank_1, net_stake);

    // Second battle: Charlie joins and Alice wins again
    service
        .join_match(match_id)
        .with_actor_id(AGENT_C.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .set_battle_result(match_id, AGENT_A.into(), [8u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let m = service.get_match(match_id).await.unwrap().unwrap();
    let bank_2 = m.bank;
    // Bank should accumulate: first win + second win
    assert_eq!(bank_2, net_stake * 2);
}

/// Test new champion receives old champion's bank when they win.
#[tokio::test]
async fn new_champion_gets_old_bank() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    service
        .register_agent("Charlie".into(), body_parts(), [3u8; 32], "ipfs://c".into())
        .with_actor_id(AGENT_C.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // First match: Bob beats Alice
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .set_battle_result(match_id, AGENT_B.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let net_stake = STAKE - STAKE * 200 / 10_000;
    let m = service.get_match(match_id).await.unwrap().unwrap();
    let bank_after_1 = m.bank;
    assert_eq!(bank_after_1, net_stake);

    // Second match: Charlie beats Bob (new champion)
    service
        .join_match(match_id)
        .with_actor_id(AGENT_C.into())
        .with_value(STAKE)
        .await
        .unwrap();

    service
        .set_battle_result(match_id, AGENT_C.into(), [8u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.champion, Some(AGENT_C.into()));
    // Bank should accumulate: Bob's bank (from beating Alice) + Charlie's win
    let expected_bank = bank_after_1 + net_stake;
    assert_eq!(m.bank, expected_bank);
}

/// Decision phase: both participants opt to fight again → the same match re-arms
/// to Ready with the champion (and bank) preserved.
#[tokio::test]
async fn fight_again_both_rearm() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();
    // Alice wins → champion, Bob is the challenger/loser in the decision phase.
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let m = service.get_match(match_id).await.unwrap().unwrap();
    let bank = m.bank;
    assert_eq!(m.status, MatchStatus::Waiting);
    assert_eq!(m.champion, Some(AGENT_A.into()));

    // Champion (Alice) opts to fight again — bankrolled, no value needed.
    service
        .fight_again(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    // Not re-armed yet — only one side opted in.
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Waiting);

    // Challenger (Bob) opts to fight again — re-stakes from wallet.
    service
        .fight_again(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();

    // Both agreed → match re-armed to Ready, champion + bank preserved.
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Ready);
    assert_eq!(m.champion, Some(AGENT_A.into()));
    assert_eq!(m.bank, bank);
    assert_eq!(m.winner, None);
}

/// Decision phase: both participants exit → the match is Closed.
#[tokio::test]
async fn both_exit_closes_match() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    // Loser (Bob) exits → match stays Waiting with champion Alice.
    service
        .exit_match(match_id)
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Waiting);
    assert_eq!(m.champion, Some(AGENT_A.into()));
    assert_eq!(m.agent_b, None);

    // Champion (Alice) also exits → both gone → Closed.
    service
        .exit_match(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Closed);
    assert_eq!(m.champion, None);
    assert_eq!(m.bank, 0);
}

/// fight_again is only callable by the two decision-phase participants.
#[tokio::test]
async fn fight_again_non_participant_fails() {
    let program = setup().await;
    let mut service = program.agent_colosseum();

    service
        .register_agent("Alice".into(), body_parts(), [1u8; 32], "ipfs://a".into())
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    service
        .register_agent("Bob".into(), body_parts(), [2u8; 32], "ipfs://b".into())
        .with_actor_id(AGENT_B.into())
        .await
        .unwrap();
    service
        .register_agent("Charlie".into(), body_parts(), [3u8; 32], "ipfs://c".into())
        .with_actor_id(AGENT_C.into())
        .await
        .unwrap();

    let match_id = service
        .create_match(STAKE)
        .with_actor_id(AGENT_A.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .join_match(match_id)
        .with_actor_id(AGENT_B.into())
        .with_value(STAKE)
        .await
        .unwrap();
    service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(OWNER.into())
        .await
        .unwrap();

    let res = service
        .fight_again(match_id)
        .with_actor_id(AGENT_C.into())
        .with_value(STAKE)
        .await;
    assert!(res.is_err(), "non-participant should not fight again");
}
