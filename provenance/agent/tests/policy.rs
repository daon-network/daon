//! Tests for coalescing and rate limits.
//!
//! Time is a parameter, so none of these sleep. That matters: the shortest
//! interesting interval in the spec is ninety seconds, and a suite that waited
//! for it would take minutes and nobody would run it.

use daon_provenance_agent::policy::*;
use daon_provenance_core::{Ingress, Observation};

fn obs(ingress: Ingress) -> Observation {
    Observation {
        tool_id: b"test/1.0".to_vec(),
        ingress,
        added: 10,
        removed: 0,
        duration_ms: 100,
        op_count: 5,
    }
}

fn session() -> Session {
    Session::new(Limits::default(), 0)
}

#[test]
fn idle_coalesces_until_the_quiet_period_elapses() {
    let mut s = session();
    s.observe(obs(Ingress::KeystrokeStream), 1_000);

    match s.decide(CommitReason::Idle, 30_000) {
        Decision::Coalesce { retry_after_ms } => {
            assert_eq!(retry_after_ms, 90_000 - 29_000, "reports when to ask again");
        }
        d => panic!("expected Coalesce, got {d:?}"),
    }

    assert_eq!(
        s.decide(CommitReason::Idle, 91_001),
        Decision::Commit,
        "ninety seconds after the last activity, accumulated work becomes a leaf"
    );
}

#[test]
fn explicit_is_never_coalesced_away() {
    let mut s = session();
    s.observe(obs(Ingress::KeystrokeStream), 1_000);

    // One second of idle. Idle would coalesce; explicit must not.
    assert!(matches!(
        s.decide(CommitReason::Idle, 2_000),
        Decision::Coalesce { .. }
    ));
    assert_eq!(
        s.decide(CommitReason::Explicit, 2_000),
        Decision::Commit,
        "a creator-named milestone is the most significant leaf in a chain"
    );
}

#[test]
fn save_and_close_also_bypass_coalescing() {
    for reason in [CommitReason::Save, CommitReason::Close] {
        let mut s = session();
        s.observe(obs(Ingress::Paste), 1_000);
        assert_eq!(s.decide(reason, 2_000), Decision::Commit, "{reason:?}");
    }
}

#[test]
fn explicit_bypasses_coalescing_but_not_the_rate_floor() {
    let mut s = session();
    s.observe(obs(Ingress::KeystrokeStream), 0);
    assert_eq!(s.decide(CommitReason::Explicit, 0), Decision::Commit);
    s.take_for_commit(0);

    match s.decide(CommitReason::Explicit, 500) {
        Decision::RateLimited { retry_after_ms } => assert_eq!(retry_after_ms, 1_500),
        d => panic!("explicit must still respect the floor, got {d:?}"),
    }

    assert_eq!(
        s.decide(CommitReason::Explicit, 2_000),
        Decision::Commit,
        "and is allowed once the floor lifts"
    );
}

#[test]
fn a_client_looping_on_explicit_is_refused_not_served() {
    let mut s = session();
    s.observe(obs(Ingress::Programmatic), 0);
    assert_eq!(s.decide(CommitReason::Explicit, 0), Decision::Commit);
    s.take_for_commit(0);

    // Ten requests in the same millisecond.
    for _ in 0..10 {
        assert!(
            matches!(
                s.decide(CommitReason::Explicit, 1),
                Decision::RateLimited { .. }
            ),
            "the floor is not a suggestion"
        );
    }
    assert_eq!(s.leaves_today(), 1, "only the first produced a leaf");
}

#[test]
fn the_daily_budget_is_enforced_and_reports_when_it_resets() {
    let limits = Limits {
        daily_leaf_budget: 3,
        min_commit_interval_ms: 0,
        ..Limits::default()
    };
    let mut s = Session::new(limits, 0);

    for i in 0..3 {
        let t = i * 10;
        assert_eq!(s.decide(CommitReason::Save, t), Decision::Commit);
        s.take_for_commit(t);
    }

    match s.decide(CommitReason::Save, 100) {
        Decision::BudgetExhausted { retry_after_ms } => {
            assert_eq!(retry_after_ms, 24 * 60 * 60 * 1_000 - 100);
        }
        d => panic!("expected BudgetExhausted, got {d:?}"),
    }
}

#[test]
fn the_daily_budget_rolls_over() {
    let limits = Limits {
        daily_leaf_budget: 1,
        min_commit_interval_ms: 0,
        ..Limits::default()
    };
    let mut s = Session::new(limits, 0);
    s.decide(CommitReason::Save, 0);
    s.take_for_commit(0);
    assert!(matches!(
        s.decide(CommitReason::Save, 1_000),
        Decision::BudgetExhausted { .. }
    ));

    let next_day = 24 * 60 * 60 * 1_000 + 1;
    assert_eq!(s.decide(CommitReason::Save, next_day), Decision::Commit);
}

#[test]
fn observations_accumulate_as_a_sequence_and_are_never_merged() {
    let mut s = session();
    s.observe(obs(Ingress::KeystrokeStream), 0);
    s.observe(obs(Ingress::Paste), 100);
    s.observe(obs(Ingress::KeystrokeStream), 200);

    let pending = s.pending();
    assert_eq!(pending.len(), 3, "three observations, not one averaged");
    assert_eq!(pending[0].ingress, Ingress::KeystrokeStream);
    assert_eq!(
        pending[1].ingress,
        Ingress::Paste,
        "the paste is preserved distinctly — averaging would destroy the distinction the log exists for"
    );
    assert_eq!(pending[2].ingress, Ingress::KeystrokeStream);
}

#[test]
fn excess_observations_are_throttled_visibly_not_silently() {
    let limits = Limits {
        observations_per_minute: 3,
        ..Limits::default()
    };
    let mut s = Session::new(limits, 0);

    for _ in 0..3 {
        assert_eq!(
            s.observe(obs(Ingress::KeystrokeStream), 0),
            Observed::Accepted
        );
    }
    assert_eq!(
        s.observe(obs(Ingress::KeystrokeStream), 0),
        Observed::Throttled,
        "a client that cannot tell it is throttled will keep pushing"
    );
    assert_eq!(
        s.pending().len(),
        3,
        "throttled observations are not recorded"
    );

    // The window rolls.
    assert_eq!(
        s.observe(obs(Ingress::KeystrokeStream), 60_001),
        Observed::Accepted
    );
}

#[test]
fn committing_clears_pending_and_starts_the_floor() {
    let mut s = session();
    s.observe(obs(Ingress::Paste), 0);
    s.observe(obs(Ingress::KeystrokeStream), 10);
    assert_eq!(s.decide(CommitReason::Save, 20), Decision::Commit);

    let taken = s.take_for_commit(20);
    assert_eq!(taken.len(), 2, "the leaf gets both observations");
    assert!(s.pending().is_empty(), "and the session starts fresh");
    assert_eq!(s.leaves_today(), 1);

    assert!(
        matches!(
            s.decide(CommitReason::Save, 21),
            Decision::RateLimited { .. }
        ),
        "the floor runs from the commit, not from the request"
    );
}

#[test]
fn a_session_with_no_activity_coalesces_rather_than_committing_nothing() {
    let mut s = session();
    match s.decide(CommitReason::Idle, 1_000_000) {
        Decision::Coalesce { .. } => {}
        d => panic!("an idle request with no activity should not commit, got {d:?}"),
    }
}

#[test]
fn limits_are_readable_so_a_client_can_pace_itself() {
    let s = session();
    let l = s.limits();
    assert_eq!(l.min_commit_interval_ms, 2_000);
    assert_eq!(l.idle_coalesce_ms, 90_000);
    assert_eq!(l.daily_leaf_budget, 2_000);
    assert_eq!(l.observations_per_minute, 600);
}
