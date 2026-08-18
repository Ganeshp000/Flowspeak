//! Inputs to the dictation state machine.
//!
//! Keeping every side-effect-free input in one enum lets the machine be a pure
//! `step(input) -> Vec<Action>` function that unit-tests without a mic or a hook.

use flowspeak_ipc::BindingId;

use crate::types::SessionId;

/// A hotkey transition observed by the sidecar (or synthesized in tests).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerToken {
    /// A bound chord became fully held.
    Down { binding: BindingId, at_ms: u64 },
    /// A bound chord was released.
    Up { binding: BindingId, at_ms: u64 },
    /// The cancel key (Esc) was pressed — valid in any state, ignoring modifiers.
    Cancel { at_ms: u64 },
    /// A non-trigger key interrupted a partially-held chord; abort it.
    NormalKeyDuringArm,
}

/// The async pipeline (ASR → cleanup → paste) reporting back into the machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PipelineEvent {
    /// The session's text was successfully delivered at the caret.
    Committed { session: SessionId },
    /// The session failed (no speech, ASR error, paste declined, …).
    Failed { session: SessionId },
}

/// The single input type the machine steps on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Input {
    Trigger(TriggerToken),
    Pipeline(PipelineEvent),
    /// A periodic clock tick used for double-tap timeout, cooldown, and session cap.
    Tick { now_ms: u64 },
}
