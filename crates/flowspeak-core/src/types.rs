//! Small shared value types used across the core.

use serde::{Deserialize, Serialize};
use flowspeak_ipc::RecordModeWire;

/// Monotonic identifier for one dictation session (a recording + its finalize/paste).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SessionId(pub u64);

/// How a session records. Mirrors [`RecordModeWire`] but lives in the core so the
/// state machine doesn't depend on wire details.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RecordMode {
    /// Hold-to-talk: release ends and pastes.
    PushToTalk,
    /// Hands-free: recording persists after key release; ended by re-press / ✓ / Esc.
    Locked,
}

impl From<RecordMode> for RecordModeWire {
    fn from(m: RecordMode) -> Self {
        match m {
            RecordMode::PushToTalk => RecordModeWire::PushToTalk,
            RecordMode::Locked => RecordModeWire::Locked,
        }
    }
}

impl From<RecordModeWire> for RecordMode {
    fn from(m: RecordModeWire) -> Self {
        match m {
            RecordModeWire::PushToTalk => RecordMode::PushToTalk,
            RecordModeWire::Locked => RecordMode::Locked,
        }
    }
}
