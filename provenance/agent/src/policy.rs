//! Coalescing and rate limits.
//!
//! Implements `editor-integration-spec.md` §4 and §5. Pure decision logic: it
//! holds no clock, opens no files and appends nothing. Time arrives as a
//! parameter so the whole thing is testable without sleeping, which matters
//! when the shortest interesting interval is ninety seconds.
//!
//! # Why this is the agent's job and not the editor's
//!
//! Leaf granularity is an **evidential** property. Too fine and the log is
//! enormous while each leaf proves almost nothing; too coarse and the history
//! says little about how the work was made. That judgement has to be consistent
//! across every tool touching an entity, and it is baked into every historic
//! leaf, so it cannot be renegotiated later. The editor asks; the agent decides.

use daon_provenance_core::Observation;

/// Limits an agent enforces. Defaults are the spec's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    /// Floor between committed leaves. Applies to every reason, including
    /// `Explicit` — that bypasses *coalescing*, never rate limiting.
    pub min_commit_interval_ms: u64,
    /// Quiet period after which accumulated work becomes a leaf on its own.
    pub idle_coalesce_ms: u64,
    /// Leaves per entity per day. Exists to catch a runaway client before it
    /// fills a disk, not to ration anything scarce.
    pub daily_leaf_budget: u32,
    /// Observations accepted per minute. Excess is dropped and reported.
    pub observations_per_minute: u32,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            min_commit_interval_ms: 2_000,
            idle_coalesce_ms: 90_000,
            daily_leaf_budget: 2_000,
            observations_per_minute: 600,
        }
    }
}

/// Why the editor is asking for a commit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommitReason {
    /// The editor believes the creator has paused.
    Idle,
    /// A deliberate save.
    Save,
    /// The document is closing.
    Close,
    /// The creator named this moment — "Draft 2 complete", the version going to
    /// a committee. The most evidentially significant leaf in a chain, and the
    /// only one whose position was chosen rather than falling out of when
    /// someone stopped typing.
    Explicit,
}

/// What the agent decided.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Build a leaf from the accumulated observations.
    Commit,
    /// Not yet — keep accumulating. **Not an error.** An editor that treats
    /// this as one has misread the contract.
    Coalesce {
        /// When it is worth asking again.
        retry_after_ms: u64,
    },
    /// Too soon after the last leaf.
    RateLimited {
        /// When the floor lifts.
        retry_after_ms: u64,
    },
    /// This entity has used its leaves for the day.
    BudgetExhausted {
        /// When the budget resets.
        retry_after_ms: u64,
    },
}

/// Whether an observation was recorded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Observed {
    /// Recorded.
    Accepted,
    /// Dropped: this session is over its per-minute allowance. Reported rather
    /// than silent, because a client that cannot tell it is being throttled
    /// will keep pushing.
    Throttled,
}

const DAY_MS: i64 = 24 * 60 * 60 * 1_000;
const MINUTE_MS: i64 = 60 * 1_000;

/// One editing session against one entity.
pub struct Session {
    limits: Limits,
    pending: Vec<Observation>,
    last_commit_ms: Option<i64>,
    last_activity_ms: Option<i64>,
    leaves_today: u32,
    day_start_ms: i64,
    observations_this_minute: u32,
    minute_start_ms: i64,
}

impl Session {
    /// Open a session. `now_ms` anchors the budget windows.
    pub fn new(limits: Limits, now_ms: i64) -> Self {
        Session {
            limits,
            pending: Vec::new(),
            last_commit_ms: None,
            last_activity_ms: None,
            leaves_today: 0,
            day_start_ms: now_ms,
            observations_this_minute: 0,
            minute_start_ms: now_ms,
        }
    }

    /// The limits in force, so a client can pace itself rather than discover
    /// them by being refused.
    pub fn limits(&self) -> Limits {
        self.limits
    }

    /// Observations accumulated but not yet committed.
    pub fn pending(&self) -> &[Observation] {
        &self.pending
    }

    /// Leaves committed in the current day window.
    pub fn leaves_today(&self) -> u32 {
        self.leaves_today
    }

    fn roll_windows(&mut self, now_ms: i64) {
        if now_ms - self.day_start_ms >= DAY_MS {
            self.day_start_ms = now_ms;
            self.leaves_today = 0;
        }
        if now_ms - self.minute_start_ms >= MINUTE_MS {
            self.minute_start_ms = now_ms;
            self.observations_this_minute = 0;
        }
    }

    /// Record what the editor saw.
    ///
    /// Observations are kept as a sequence and never merged: a coalescing window
    /// routinely holds a paste and two typing bursts, and averaging them would
    /// destroy exactly the distinction worth recording. They become the leaf's
    /// `meta_commit` as a Merkle root over the sequence.
    pub fn observe(&mut self, observation: Observation, now_ms: i64) -> Observed {
        self.roll_windows(now_ms);
        self.last_activity_ms = Some(now_ms);

        if self.observations_this_minute >= self.limits.observations_per_minute {
            return Observed::Throttled;
        }
        self.observations_this_minute += 1;
        self.pending.push(observation);
        Observed::Accepted
    }

    /// Decide whether accumulated work should become a leaf.
    ///
    /// Order matters and is deliberate: the budget and the rate floor are
    /// checked before coalescing, so `Explicit` cannot be used to escape either.
    /// It bypasses coalescing only.
    pub fn decide(&mut self, reason: CommitReason, now_ms: i64) -> Decision {
        self.roll_windows(now_ms);

        if self.leaves_today >= self.limits.daily_leaf_budget {
            let elapsed = (now_ms - self.day_start_ms).max(0) as u64;
            return Decision::BudgetExhausted {
                retry_after_ms: (DAY_MS as u64).saturating_sub(elapsed),
            };
        }

        if let Some(last) = self.last_commit_ms {
            let since = (now_ms - last).max(0) as u64;
            if since < self.limits.min_commit_interval_ms {
                return Decision::RateLimited {
                    retry_after_ms: self.limits.min_commit_interval_ms - since,
                };
            }
        }

        // Explicit always produces a leaf. It is the one reason the agent may
        // not coalesce away: the creator chose this moment, and absorbing it
        // into surrounding idle work would discard the boundary worth recording.
        if matches!(
            reason,
            CommitReason::Explicit | CommitReason::Save | CommitReason::Close
        ) {
            return Decision::Commit;
        }

        match self.last_activity_ms {
            None => Decision::Coalesce {
                retry_after_ms: self.limits.idle_coalesce_ms,
            },
            Some(last) => {
                let idle = (now_ms - last).max(0) as u64;
                if idle >= self.limits.idle_coalesce_ms {
                    Decision::Commit
                } else {
                    Decision::Coalesce {
                        retry_after_ms: self.limits.idle_coalesce_ms - idle,
                    }
                }
            }
        }
    }

    /// Take the accumulated observations for a leaf that is being built.
    ///
    /// Call only after [`Session::decide`] returned [`Decision::Commit`]. Clears
    /// the pending set and starts the rate floor running.
    pub fn take_for_commit(&mut self, now_ms: i64) -> Vec<Observation> {
        self.last_commit_ms = Some(now_ms);
        self.leaves_today += 1;
        std::mem::take(&mut self.pending)
    }
}
