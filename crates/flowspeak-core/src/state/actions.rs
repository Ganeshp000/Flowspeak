//! Outputs of the dictation state machine.
//!
//! Actions are pure descriptions of side-effects; the shell/orchestrator executes
//! them (start the mic, show the pill, run the pipeline). This keeps the machine
//! itself free of I/O and fully testable.

use crate::types::{RecordMode, SessionId};

/// A visual state the Flow Bar (pill) should present.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BarState {
    Idle,
    Recording,
    Locked,
    Transcribing,
    Done,
    Cancelled,
    Error,
}

/// A side-effect for the shell to perform.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// Begin microphone capture for a session.
    StartCapture { session: SessionId, mode: RecordMode },
    /// Stop capture and hand the buffered audio to the pipeline.
    StopCaptureAndFinalize { session: SessionId },
    /// Throw away the current capture (too short, or cancelled) without pasting.
    DiscardCapture { session: SessionId },
    /// Play the record-start ping.
    PlayPing,
    /// Drive the async ASR → cleanup → paste pipeline for a finalized session.
    RunPipeline { session: SessionId },
    /// Update the pill to a visual state.
    ShowBar(BarState),
    /// Warn (once) that the session cap is approaching.
    WarnSessionCap,
}
