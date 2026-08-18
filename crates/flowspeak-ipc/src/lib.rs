//! `flowspeak-ipc` — the shared wire contract between the FlowSpeak Tauri shell and
//! the native sidecar process that owns the global hotkey hook, text injection,
//! secure-input detection, and the accessibility/UI-Automation context read.
//!
//! The hook lives out-of-process so that saturating on-device inference (ASR + LLM)
//! in the main process can never starve the low-level keyboard callback past the
//! OS timeout — on Windows that removal is silent and unrecoverable, so isolation
//! plus a heartbeat/respawn (see [`SidecarToShell::Heartbeat`]) is the whole point.
//!
//! Because both ends are Rust, these enums are the single source of truth for the
//! protocol — there is no code generation step.

pub mod codec;

pub use codec::{read_frame, write_frame, CodecError, MAX_FRAME_LEN};

use serde::{Deserialize, Serialize};

/// Bumped on any breaking change to the message set. Exchanged in the
/// [`ShellToSidecar::Hello`] / [`SidecarToShell::Ready`] handshake so a shell and a
/// sidecar from mismatched bundle versions refuse to talk instead of misbehaving.
pub const PROTOCOL_VERSION: u32 = 1;

/// Which operating system the sidecar is running on (some messages are OS-specific).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OsKind {
    MacOS,
    Windows,
}

/// Stable identifier for one bound action (push-to-talk, hands-free, command mode…).
/// The shell assigns these; the sidecar echoes them back on triggers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BindingId {
    PushToTalk,
    HandsFree,
    CommandMode,
}

/// A resolved key chord the sidecar should watch for. `keys` holds OS virtual-key /
/// keycode values; `is_modifier_only` is true for chords like Ctrl+Win that never
/// produce a printable key (they need low-level hook handling, not `RegisterHotKey`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Binding {
    pub id: BindingId,
    pub keys: Vec<u32>,
    pub is_modifier_only: bool,
}

/// The recording mode a dictation session runs in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordModeWire {
    /// Hold the key; release ends and pastes.
    PushToTalk,
    /// Hands-free: recording persists after the key is released.
    Locked,
}

/// Options controlling how injected text is delivered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PasteOptions {
    /// Mark the clipboard payload sensitive (ConcealedType / cloud-clipboard exclusion).
    pub concealed: bool,
    /// Snapshot and restore whatever was on the clipboard before we borrowed it.
    pub restore_clipboard: bool,
    /// Prefer the accessibility set-value fast path over clipboard paste where supported.
    pub prefer_ax: bool,
    /// Split long payloads into N-char chunks (terminal AI-CLI agents mishandle huge pastes).
    pub chunk_size: Option<u32>,
    /// Force a specific rung (e.g. Shift+Insert) instead of the default ladder.
    pub method_override: Option<PasteRung>,
}

impl Default for PasteOptions {
    fn default() -> Self {
        Self {
            concealed: true,
            restore_clipboard: true,
            prefer_ax: true,
            chunk_size: None,
            method_override: None,
        }
    }
}

/// Which rung of the injection ladder actually delivered the text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PasteRung {
    /// Accessibility set-selected-text (macOS AX) / UIA ValuePattern (Windows).
    Accessibility,
    /// Clipboard write + synthesized paste keystroke.
    Clipboard,
    /// Synthesized Unicode keystrokes.
    Unicode,
    /// Chunked clipboard paste for terminals.
    Chunked,
    /// Windows Shift+Insert variant.
    ShiftInsert,
    /// Refused to inject (secure field / elevated target); left on the clipboard.
    Declined,
}

/// A rectangle in global screen coordinates (used for the caret and pill bounds).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Capabilities the sidecar reports at handshake so the shell can adapt its UX.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Capabilities {
    /// Global key hook is installed and healthy.
    pub hook_ready: bool,
    /// Can read text around the caret for context-aware cleanup / auto-learn.
    pub context_read: bool,
    /// Can detect secure-input / elevated targets.
    pub secure_detect: bool,
}

/// The token kind for a hotkey transition the sidecar observed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TriggerWire {
    /// The bound chord became fully held.
    Down,
    /// The bound chord was released.
    Up,
    /// Esc (or the configured cancel key) was pressed.
    Cancel,
    /// A non-trigger key was pressed while a partial chord was held — abort the chord.
    NormalKeyDuringArm,
}

/// Why a key-event tap/hook fired a lifecycle notification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TapEventKind {
    DisabledByTimeout,
    DisabledByUserInput,
    Reinstalled,
    SilentLossSuspected,
}

/// Messages the shell sends to the sidecar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ShellToSidecar {
    /// First message; negotiates protocol version.
    Hello { protocol_version: u32, shell_pid: u32 },
    /// Replace the set of chords the sidecar watches for.
    UpdateShortcuts { bindings: Vec<Binding> },
    /// Toggle OS-quirk suppression (bare-Fn Globe action on macOS; Win key-up on Windows).
    SetSuppression {
        suppress_bare_fn: bool,
        swallow_win_keyup: bool,
    },
    /// Begin capture for a session (the shell owns the state machine).
    DictationStart { mode: RecordModeWire },
    /// End capture for the current session.
    DictationStop,
    /// Deliver cleaned text at the current caret.
    PasteText { text: String, opts: PasteOptions },
    /// Ask the sidecar to report and clear any keys it still believes are held.
    CheckStaleKeys,
    /// Query whether secure input is currently active.
    QuerySecureInput,
    /// Read text around the caret for context / auto-learn.
    ReadContext { chars_before: u32, chars_after: u32 },
    /// Liveness probe.
    Ping { seq: u64 },
    /// Ask the sidecar to exit cleanly.
    Shutdown,
}

/// Messages the sidecar sends to the shell.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SidecarToShell {
    /// Handshake reply; must match the shell's protocol version.
    Ready {
        protocol_version: u32,
        os: OsKind,
        caps: Capabilities,
    },
    /// A hotkey transition the shell should feed into its state machine.
    Trigger {
        token: TriggerWire,
        binding: Option<BindingId>,
        at_ms: u64,
    },
    /// A key-tap/hook lifecycle event (health monitoring).
    TapEvent { kind: TapEventKind },
    /// Response to [`ShellToSidecar::CheckStaleKeys`].
    StaleKeysResponse { held: Vec<u32>, cleared: bool },
    /// Result of a paste attempt.
    PasteResult {
        ok: bool,
        rung: PasteRung,
        reason: Option<String>,
    },
    /// Result of a context read.
    ContextResult {
        app_bundle_id: Option<String>,
        role: Option<String>,
        before: String,
        selected: String,
        after: String,
        caret_rect: Option<Rect>,
        is_password: bool,
        integrity_high: bool,
    },
    /// Secure-input status (macOS naming of the blocking app when known).
    SecureInput {
        active: bool,
        blocker: Option<String>,
    },
    /// Liveness reply.
    Pong { seq: u64 },
    /// Unsolicited heartbeat; `hook_alive=false` tells the shell to respawn the sidecar.
    Heartbeat { seq: u64, hook_alive: bool },
    /// Structured log line surfaced from the sidecar.
    Log { level: u8, msg: String },
    /// A recoverable error the sidecar wants the shell to know about.
    Error { code: u32, msg: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_tag_on_type_field() {
        let json = serde_json::to_value(ShellToSidecar::DictationStart {
            mode: RecordModeWire::Locked,
        })
        .unwrap();
        assert_eq!(json["type"], "dictation_start");
        assert_eq!(json["mode"], "locked");
    }

    #[test]
    fn paste_options_default_is_privacy_preserving() {
        let d = PasteOptions::default();
        assert!(d.concealed, "dictated text must stay out of clipboard history by default");
        assert!(d.restore_clipboard);
    }
}
