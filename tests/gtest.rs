use agent_colosseum_client::{
    agent_colosseum::events::AgentColosseumEvents, agent_colosseum::AgentColosseum,
    AgentColosseumClient, AgentColosseumClientCtors, AgentColosseumClientProgram, BodyParts,
    MatchStatus,
};
use sails_rs::{client::*, futures::StreamExt, gtest::*, ActorId};

const OWNER: u64 = 42;
const AGENT_A: u64 = 100;
const AGENT_B: u64 = 101;
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
    for actor in [OWNER, AGENT_A, AGENT_B, STRANGER] {
        system.mint_to(actor, FUND);
    }
    let code_id = system.submit_code(agent_colosseum::WASM_BINARY);
    let env = GtestEnv::new(system, OWNER.into());
    env.deploy::<AgentColosseumClientProgram>(code_id, b"salt".to_vec())
        .new(OWNER.into())
        .await
        .unwrap()
}

/// register → create → join → set_result → claim, with state assertions.
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

    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Completed);
    assert_eq!(m.winner, Some(AGENT_A.into()));

    // Winner claims. payout = 2*STAKE - 2% fee.
    let result = service
        .claim_winnings(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    let total = STAKE * 2;
    let payout = total - total * 200 / 10_000;
    assert_eq!(result, format!("Claimed:{}", payout));

    // Match is now Claimed; winner stats updated.
    let m = service.get_match(match_id).await.unwrap().unwrap();
    assert_eq!(m.status, MatchStatus::Claimed);

    let alice = service.get_agent(AGENT_A.into()).await.unwrap().unwrap();
    assert_eq!(alice.wins, 1);
    assert_eq!(alice.losses, 0);
    assert_eq!(alice.total_earned, payout);

    let bob = service.get_agent(AGENT_B.into()).await.unwrap().unwrap();
    assert_eq!(bob.wins, 0);
    assert_eq!(bob.losses, 1);

    // Config reflects defaults: fee 200 bps, not paused, next match id 2.
    let (fee, paused, next_id) = service.get_config().await.unwrap();
    assert_eq!(fee, 200);
    assert!(!paused);
    assert_eq!(next_id, 2);
}

/// Only the OWNER may submit a battle result.
#[tokio::test]
async fn set_battle_result_owner_only() {
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

    // A participant attempting to set the result must be rejected.
    let res = service
        .set_battle_result(match_id, AGENT_A.into(), [9u8; 32])
        .with_actor_id(AGENT_A.into())
        .await;
    assert!(res.is_err(), "non-owner should not set battle result");
}

/// Only the recorded winner may claim winnings.
#[tokio::test]
async fn claim_winner_only() {
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

    // The loser cannot claim.
    let res = service
        .claim_winnings(match_id)
        .with_actor_id(AGENT_B.into())
        .await;
    assert!(res.is_err(), "loser should not claim winnings");
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

    // SetBattleResult → BattleResultSet (owner only).
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

    // ClaimWinnings → ClaimedWinnings with the net payout.
    service
        .claim_winnings(match_id)
        .with_actor_id(AGENT_A.into())
        .await
        .unwrap();
    let total = STAKE * 2;
    let payout = total - total * 200 / 10_000;
    let (_, ev) = events.next().await.unwrap();
    assert_eq!(
        ev,
        AgentColosseumEvents::ClaimedWinnings {
            match_id,
            winner: AGENT_A.into(),
            payout,
        }
    );
}

/// Non-participant cannot declare rematch.
#[tokio::test]
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

/// Cannot declare rematch on non-Completed match.
#[tokio::test]
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

/// Single participant declares rematch; intent stored but no auto-create.
#[tokio::test]
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

/// Both participants declare rematch; auto-creates new match.
#[tokio::test]
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
    assert!(res.is_err(), "non-participant non-owner should not close match");
}
