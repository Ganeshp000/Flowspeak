//! The dictation state machine and its inputs/outputs.

pub mod actions;
pub mod events;
pub mod machine;
pub mod timing;

pub use actions::{Action, BarState};
pub use events::{Input, PipelineEvent, TriggerToken};
pub use machine::{DictationState, StateMachine};
