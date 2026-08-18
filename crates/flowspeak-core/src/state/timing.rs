//! Timing constants for the dictation state machine.
//!
//! Several of these are product-tunable and flagged in the plan as needing
//! real-device calibration; the values here are the researched starting points.

/// A key-up sooner than this after key-down is treated as a *tap*, not a
/// hold-to-talk release (so a stray brush of the key doesn't dictate silence).
pub const HOLD_MIN_MS: u64 = 200;

/// Window after a tap in which a second press flips into hands-free (locked) mode.
/// Kept tight so an accidental double-tap rarely locks; needs on-device tuning.
pub const DOUBLE_TAP_MS: u64 = 350;

/// After a session ends (finalize or cancel), ignore new starts for this long to
/// debounce key bounce and prevent an immediate re-trigger.
pub const COOLDOWN_MS: u64 = 500;

/// Hard cap on a single dictation session.
pub const SESSION_CAP_MS: u64 = 20 * 60 * 1000;

/// When to warn that the session cap is approaching.
pub const WARN_AT_MS: u64 = 19 * 60 * 1000;
