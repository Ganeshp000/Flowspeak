//! Auto Cleanup levels — how aggressively the LLM is allowed to edit.
//!
//! `None` bypasses the model entirely (raw ASR is pasted). The others append a
//! modifier to the shared system prompt. Light is FlowSpeak's default: research
//! found Wispr's more-aggressive default was the top "it changed what I said"
//! complaint, so we bias conservative.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CleanupLevel {
    /// Transcribe exactly what was said, including mistakes. No model call.
    None,
    /// Remove fillers and fix grammar only; preserve the speaker's words. (Default.)
    #[default]
    Light,
    /// Also tighten wording for clarity and concision without changing meaning.
    Medium,
    /// Rewrite phrasing for brevity and polish while preserving facts and intent.
    High,
}

impl CleanupLevel {
    /// True when no model should be invoked and the raw transcript is used verbatim.
    pub fn bypasses_llm(self) -> bool {
        matches!(self, CleanupLevel::None)
    }

    /// Text appended to the shared system prompt for this level (empty for `None`).
    pub fn modifier(self) -> &'static str {
        match self {
            CleanupLevel::None => "",
            CleanupLevel::Light => {
                "Be conservative: apply the allowed edits minimally. When unsure whether to \
                 edit, leave the text as spoken."
            }
            CleanupLevel::Medium => {
                "You may also tighten wording for clarity and conciseness, but never change the \
                 meaning."
            }
            CleanupLevel::High => {
                "You may rewrite phrasing for brevity and polish while strictly preserving every \
                 fact, name, number, and the speaker's intent."
            }
        }
    }

    /// Ceiling on the *novelty ratio* (fraction of output words that were not
    /// spoken) the deterministic gate tolerates. Filler deletion and punctuation
    /// don't count as novelty; number/spoken-punctuation normalization introduces a
    /// little, so Light leaves headroom for that while still catching full rewrites.
    pub fn max_novelty_ratio(self) -> f32 {
        match self {
            CleanupLevel::None => 0.0,
            CleanupLevel::Light => 0.34,
            CleanupLevel::Medium => 0.55,
            CleanupLevel::High => 0.85,
        }
    }
}
