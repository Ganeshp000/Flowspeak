# Track: v2:208c1e762bd05b5511773bdd95aee09597d1d6761944df97202a67a9e3eed148


# TRACK: Hotkey + Interaction Model (Wispr Flow behavior + macOS implementation)

Confidence tags: **[OBS]** = observed with source; **[INF]** = inferred/educated guess.

---

## PART A — WISPR FLOW EXACT BEHAVIOR

### A1. Default hotkeys (complete table) [OBS — docs.wisprflow.ai "Supported & Unsupported Keyboard Hotkey Shortcuts"]
| Action | macOS default | macOS (no Apple Fn) | Windows default |
|---|---|---|---|
| Push-to-talk (dictate) | **Fn** (Globe) | **Ctrl+Opt** | **Ctrl+Win** |
| Hands-free (toggle) | **Fn+Space** | — | **Ctrl+Win+Space** |
| Command Mode | **Fn+Ctrl** | **Cmd+Ctrl+Option** | **Ctrl+Win+Alt** |
| Cancel | **Esc** | Esc | Esc |
| Paste last transcript | **Cmd+Ctrl+V** | — | **Shift+Alt+Z** |
| Copy last transcript | **Cmd+Ctrl+C** | — | **Shift+Alt+X** |
| Polish Transform | **Opt+1** | — | **Win+Alt+1** |
| Prompt Engineer Transform | **Opt+2** | — | **Win+Alt+2** |
| View Diff | **Opt+O** | — | **Win+Alt+O** |
| Open Scratchpad | (no default) | — | (no default) |
| Repolish styles 2–5 | **Opt+2 / 3 / 4 / 5** | — | **Win+Alt+2/3/4/5** |
| Hub history back/fwd | **Cmd+[ / Cmd+]** | — | **Ctrl+[ / Ctrl+]** |

The default depends on hardware: "On Macs with the Apple fn key, the fn key is the default. On Macs without it (for example, non-Apple external keyboards), Flow uses Ctrl+Opt by default." [OBS — Setup Guide]

### A2. Hold-to-talk (push-to-talk) semantics [OBS — "Starting your first dictation", "Use Flow hands-free"]
- **Press and HOLD** the hotkey → recording starts. Confirmation cue: "**Wait for the ping**, or watch for the **white bars moving on the Flow Bar** — that confirms Flow is listening."
- Speak while holding (steady pace).
- **On RELEASE** → Flow stops listening, runs ASR+LLM cleanup, and **pastes the formatted text into the active text field** (paste/insert at cursor). Text insertion happens at key-up, after processing.
- Flow "listens while you hold the hotkey, and when you release it, Flow pastes your formatted text." [OBS]

### A3. Hands-free / tap-to-lock mode [OBS — "Use Flow hands-free"]
- **Enable method 1 (double-press-to-lock):** "While dictating with push-to-talk, **double-press** your push-to-talk key (Fn on Mac, Ctrl+Win on Windows) **quickly** to lock the session into hands-free." (i.e., start holding PTT, then quickly double-tap to convert the live session to locked hands-free so you can release the key and keep talking.)
- **Enable method 2 (dedicated binding):** press the hands-free shortcut (default **Fn+Space** / Ctrl+Win+Space) with cursor in a text field — no holding required.
- **Disable/finish:** "Press your hands-free shortcut again, **or click the checkmark (✓) icon in the Flow Bar**. Your transcript pastes into the active text field."
- **Discard:** click the **X (cancel) icon** in the Flow Bar (works even while transcription is still processing).
- "**Clicking the Flow Bar does not stop your recording** — use the stop or cancel buttons, or press your shortcut key."
- Session cap: **desktop 20 min max, warning at 19 min**; Android 5 min. [OBS]
- Double-press detection is generic: "Double-tap detection activates when pressing the same key twice rapidly." [OBS — supported-shortcuts article]. Exact ms window not published → **[INF] ~250–400 ms** typical double-tap window.

### A4. Quick accidental tap [INF, partial OBS]
- Not explicitly documented. Behavior deducible: a single very-short tap (below the time needed to capture audio) yields little/no audio → **empty transcript, nothing pasted** [INF]. A *rapid double* short tap on the PTT key triggers **hands-free lock** (per double-tap detection) [OBS mechanism]. So the risky accidental case is an accidental double-tap flipping the user into hands-free, not a single tap.

### A5. Esc-to-cancel [OBS]
- **Cancel = Esc**, and "Cancel action can dismiss dictation and notifications, and defaults to Escape and works even when other modifier keys are held." Esc is the one action allowed to bind with **no modifier**; all other bindings require a modifier. In Command Mode: "Press **ESC at any time to cancel.**"
- Accessibility: Escape also closes menus and "cancel a Flow Bar drag in progress." [OBS — accessibility article]

### A6. Command / editing mode [OBS — "How to use Command Mode"]
- **Distinct shortcut from PTT.** Default: Mac **Fn+Ctrl** (or **Cmd+Ctrl+Option** without Apple Fn), Windows **Ctrl+Win+Alt**.
- Operation: "**Press and hold the shortcut, speak your command, then release.**" Esc cancels.
- Semantics: transforms **highlighted text in place**, or **inserts generated content inline** if nothing selected. Distinct from dictation (which types spoken words verbatim). Examples: "Make this more assertive and concise", "Translate to Polish", "Turn this outline into an essay", "Add a rule to never use exclamation marks", "I don't like to use the word utilize."
- Gating: requires **paid subscription/active trial**, and must be enabled in **Settings → Experimental**.
- Customizable: up to **4 shortcuts, up to 3 keys each**.

### A7. Valid-shortcut rules (constraints the clone's keybind UI must enforce) [OBS — supported-shortcuts article]
- **Max 3 keys** total per binding.
- Must contain **≥1 modifier** (Ctrl, Cmd, Alt, Shift, **Fn**) **OR** a valid mouse button.
- **Cannot mix left/right variants** of the same modifier.
- **No duplicate bindings** across actions.
- Cannot use **reserved system shortcuts**. **Caps Lock excluded.**
- Exception: **Esc works standalone**; everything else needs a modifier.
- **Up to 4 shortcuts per action**; **up to 8 Transform slots**.
- **Mouse buttons:** "Middle click and **Mouse 4–10** can be used as standalone triggers or combined with keyboard modifiers (e.g., Ctrl+Mouse4)." **Left and right clicks intentionally excluded.**

### A8. Configuring shortcuts [OBS]
- Menu-bar icon (Mac) / system tray (Windows) → **Settings → General → Change** next to Shortcuts → click the binding → press the new keys. During onboarding: "Set your keyboard shortcut by pressing the keys you want to use."

### A9. Mute / mic indicators & audio feedback [OBS]
- **Audio cue:** a "**ping**" plays when Flow begins listening. Sound toggles live under **System** settings; iOS has an **Audio** section with **Interaction Sounds** and **Use Built-In Mic** toggles. (A "Disable Sound Effects" flow exists.)
- **Visual mic indicator:** the **Flow Bar** shows **moving white bars** (live audio/waveform) while listening; iOS Scratch Pad shows "a microphone button with a live waveform." No dedicated mute button — session is ended (✓) or cancelled (X). Flow "understands whispers as accurately as normal speech" (whisper-level dictation supported).
- Error notifications (not sounds): "No audio received", "Microphone is not working", "Taking longer than usual."

### A10. Password fields / secure input behavior [OBS — supported-shortcuts + Secure Keyboard Entry troubleshooting]
- **Dictation is unavailable in password fields and phone-number/PIN/numeric-only inputs**; the Flow Bar/Bubble **does not appear** there. Auto-disabled in banking/financial apps.
- **Secure Keyboard Entry conflict:** "When another app on your Mac has turned on Secure Keyboard Entry, it **blocks Flow's keyboard shortcuts system-wide**. Common culprits: **Slack, Terminal, or any app with a focused password field**." Flow shows a **persistent notification naming the blocking app**. Fix: quit that app / leave the password field / log out+in. Notable nuance: "**Hold-to-talk continues to work**" while shortcuts are blocked (see B7 — Fn is a modifier/flagsChanged event, which secure input does not suppress the same way as keyDown/keyUp).

### A11. External non-Apple keyboards [OBS]
- "The Apple Fn key is a **hardware-level signal unique to Apple-built keyboards**… most third-party external keyboards don't expose a true Apple Fn key, so the Fn shortcut **only fires from the built-in MacBook keyboard**." Workaround Flow recommends: rebind PTT to **Ctrl+Opt** or **Opt+Cmd** (present on both keyboards).

---

## PART B — MACOS IMPLEMENTATION

### B1. The Fn/Globe key: constants & identifiers [OBS mixed with standard refs]
- **Virtual keycode `kVK_Function` = 0x3F = 63** (the Fn/Globe key). [OBS — elaineyxu skill "keyCode 63 or equivalent Fn code"; standard HIToolbox]
- **NSEvent.ModifierFlags.function = 0x800000** (bit 1<<23). **CGEventFlags.maskSecondaryFn = 0x800000.** [standard, corroborated by VoiceInk using `.function`]
- VoiceInk's Carbon-modifier mapping stores the function modifier as **`1 << 17`** (`0x20000`) for its Carbon conversion path. [OBS — VoiceInk Shortcut.swift]
- Reference modifier keycodes seen in the wild (from Wispr forensic log + standard kVK): **Space=49 (0x31), Right Option=61 (0x3D)**; Left Shift 56 / Right Shift 60 / Left Ctrl 59 / Right Ctrl 62 / Left Opt 58 / Right Opt 61 / Left Cmd 55 / Right Cmd 54 / CapsLock 57 / Left Shift 56. [OBS Wispr for 49/61; rest standard]

### B2. Three viable global-detection APIs + which permission each needs
| Method | Event source | Can it detect Fn? | Can it suppress the event? | TCC permission required |
|---|---|---|---|---|
| **NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged)** | Cocoa global monitor | Yes — `event.modifierFlags.contains(.function)` / keyCode 63 | **No** (observe-only; cannot consume) — also does NOT fire for your own app's key events (need a paired local monitor) | **Accessibility** (kTCCServiceAccessibility) [OBS — Apple forums / Igor Kulman: "NSEvent global monitor requires Accessibility"] |
| **CGEvent.tapCreate (flagsChanged + keyDown + keyUp)** | Quartz event tap | Yes — check `CGEventFlags.maskSecondaryFn` and keyCode 63 in flagsChanged | **Yes** if `.defaultTap` (return NULL to swallow) | `.listenOnly` (kCGEventTapOptionListenOnly) → **Input Monitoring** (kTCCServiceListenEvent). `.defaultTap` (kCGEventTapOptionDefault) → **Accessibility** [OBS — HackTricks/Apple forums: "listenOnly triggers Input Monitoring; defaultTap triggers Accessibility"] |
| **IOHIDManager** | Raw HID | Yes — lowest level, reads raw usages (rdev/rustdesk path uses this class of API) | N/A (read) | **Input Monitoring** [OBS — HackTricks] |

**Net for the clone:** you will need **BOTH** Input Monitoring (to *observe* the Fn key globally) **AND** Accessibility (to *inject/paste* the transcript and read selected text for Command Mode). elaineyxu's skill states Fn hotkeys often need both: "one to observe the key globally" and "one to synthesize or complete the downstream action." Wispr itself requests **Microphone + Accessibility** and uses a **`.defaultTap`** (Accessibility-backed, and it actively *suppresses* keys — see B6).

### B3. How Wispr Flow actually implements it (reverse-engineered) [OBS — wensenwu.com forensic investigation]
- **API: CGEventTap** used as an **active filter** (not passive). "Wispr Flow uses CGEventTap — macOS's most invasive keystroke interception mechanism."
- **Installation:** tap intercepts events at the **HID level, before any application receives them**; created via `CGEventTapCreate()` on a **CFRunLoop in a dedicated GCD queue** named `com.wispr-flow.keyboardService.runQueue`. Callback **suppresses events by returning NULL**.
- **State model:** maintains a `curKeysDown` set; the sampled dictation shortcut was **Option+Space, keycodes `[49, 61]`**.
- **Architecture (it's an Electron app):** every keystroke is serialized to **JSON over stdin/stdout IPC** to the Electron process and can be re-injected via a `SimulateKeyPress` message; queues include `com.wispr-flow.keyboardService.keyEventQueue`, `runQueue`, `sendQueue`; buffered in `_keyEventBuffer`.
- **`EditedTextManager v2`** reads full textbox contents via the **Accessibility API** (observed reading up to 36,191 chars) after each dictation — this is how it does context-aware cleanup / diff.
- **Known failure mode (design lesson for the clone):** a missed key-up left **keycode 61 (Right Option) stuck** in `curKeysDown`, causing **145 consecutive spacebar (49) presses to be suppressed** ("Suppressing event. Cur keys down: [61, 49], key code: 49"). Lesson: an event tap that *suppresses* the modifier must have a robust **stale-key / key-up recovery** path (watchdog to clear held keys, re-sync on focus change, timeout).

### B4. VoiceInk implementation (open-source, GPLv3, Swift) — github.com/Beingpax/VoiceInk [OBS — raw source]
- **Relevant files** under `VoiceInk/Shortcuts/`: `ShortcutMonitor.swift`, `Shortcut.swift`, `ShortcutAction.swift`, `RecordingShortcutManager.swift`, `ModeShortcutManager.swift`, `RecorderPanelShortcutManager.swift`, `ShortcutRecorder.swift`, `ShortcutStore.swift`, `ShortcutValidator.swift`, `ShortcutMigration.swift`.
- **`ShortcutMonitor.swift`** — the core global monitor:
  - `CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap, eventsOfInterest: eventMask, callback:..., userInfo:...)`.
  - `eventMask` = bitmask over **`.keyDown, .keyUp, .flagsChanged`** (`mask | (CGEventMask(1) << Int(type.rawValue))`).
  - **Tap re-enable handling:** on `tapDisabledByTimeout` / `tapDisabledByUserInput` → reset all pressed shortcuts, dispatch synthetic `keyUp`s, then `CGEvent.tapEnable(tap: eventTap, enable: true)`. (Critical: taps get auto-disabled if the callback is too slow.)
  - `shortcutInterruptionWindow: TimeInterval = 1.0` (window to interrupt a held shortcut when another key arrives).
  - Uses `.defaultTap` ⇒ needs **Accessibility** (also needs Accessibility to paste + read selected text via SelectedTextKit).
- **`Shortcut.swift`** — key representation: `case key` vs `case modifierOnly`; `keyCode: UInt16`; Fn represented via `NSEvent.ModifierFlags.function` and `UInt16(kVK_Function)` in a `modifierKeyCodes` set; `normalizedModifierFlags(_:forKeyCode:)` **strips `.function`** when the keycode is a real function key F1–F20 (avoids double-counting Fn); `shortcutRelevant = [.control, .option, .shift, .command, .function]`; distinguishes Left/Right modifiers.
- **`RecordingShortcutManager.swift`** — push-to-talk = press/release, no hold-threshold: keyDown → open recorder panel (start), keyUp → close panel (stop). Global anti-bounce: `shortcutPressCooldown: TimeInterval = 0.5` (blocks re-trigger within 500 ms).
- **Older VoiceInk versions (release notes) [OBS]:** offered **7 modifier options** (Left/Right Option, Left/Right Control, Fn, Right Command, Right Shift) and a **Fn-key debounce of 40 ms** to "filter spurious macOS Fn flag events" (macOS emits phantom Fn flagsChanged). Current code refactored into ShortcutMonitor.
- **Libraries:** **KeyboardShortcuts** (Sindre Sorhus SPM lib) for user-customizable recording UI; **SelectedTextKit** (read selected text); **MediaRemoteAdapter** (pause media during recording).

### B5. Handy implementation (open-source, MIT, Rust/Tauri) — github.com/cjpais/Handy [OBS — raw source]
- **Files** under `src-tauri/src/shortcut/`: `handler.rs`, `handy_keys.rs`, `mod.rs`, `tauri_impl.rs`.
- **Primary path = `tauri-plugin-global-shortcut` v2.3.1**: `app.global_shortcut().on_shortcut(shortcut, |app, scut, event| ...)`; push-to-talk via `let is_pressed = event.state == ShortcutState::Pressed;` (Pressed/Released → start/stop).
- **Fn is REJECTED in the Tauri path:** `if part == "fn" || part == "function" { return Err("The 'fn' key is not supported by Tauri global shortcuts") }`. Allowed modifier strings: `ctrl, control, shift, alt, option, meta, command, cmd, super, win, windows`.
- **Native Fn path:** macOS Fn support was **added in v0.7.0** ("adds support on MacOS for the fn key" — most-requested; PR **#580** "init attempt at new kb"). Implemented through the custom **`handy-keys` crate (v0.3.0, by cjpais)** which has its own `Modifiers` enum including **`Modifiers::FN`** → string `"fn"` (`modifiers_to_strings`). This bypasses tauri-plugin-global-shortcut's Fn limitation via a native listener.
- **Cargo deps:** **`rdev`** = fork `git = "https://github.com/rustdesk-org/rdev"` (raw keyboard listening; on macOS rdev is CGEventTap-backed); **`enigo` 0.6.1** (input injection / paste); **`handy-keys` 0.3.0**; **`tauri-plugin-global-shortcut` 2.3.1**.
- rdev Fn limitation on **Linux**: binding Fn combos errors with `Could not recognize "Unidentified" as a valid key for hotkey` — Fn is only meaningfully bindable on macOS.
- Modes: **push-to-talk (hold)** and **toggle (press start / press stop)**. CLI: `--toggle-transcription`, `--toggle-post-process`. Requires **Accessibility + Input Monitoring** (and Microphone).

### B6. Recommended implementation for FlowSpeak (macOS 15.7.3, M4 Pro) [INF, grounded in above]
- Use a **`CGEvent.tapCreate` with `tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap`** monitoring **`.flagsChanged` (for Fn/modifiers) + `.keyDown/.keyUp` (for combos)** — mirrors both VoiceInk and Wispr. `.defaultTap` lets you **suppress** the Fn keystroke so it doesn't also fire the system Globe action (see B7). This requires **Accessibility**; you also need Accessibility for paste-injection and Input Monitoring for the listen side — request both at onboarding.
- Detect Fn by testing `CGEventGetFlags(event) & maskSecondaryFn` on flagsChanged, and/or keyCode 63.
- Add a **~40 ms Fn debounce** (VoiceInk value) to drop phantom Fn flag transitions.
- Implement a **stale-key watchdog** (clear held-key state on app-focus change, on tap re-enable, and via a timeout) to avoid the Wispr "stuck Right-Option → swallowed spacebar" class of bug. Handle `tapDisabledByTimeout/UserInput` by re-enabling via `CGEvent.tapEnable`.
- **PTT semantics:** keyDown(Fn) → start capture + play ping + show bar; keyUp(Fn) → stop, run ASR+cleanup, inject text. **Hands-free lock:** detect double-Fn within ~300 ms → keep session open until re-press or ✓. **Command Mode:** separate combo (Fn+Ctrl) held → route to LLM-transform pipeline; Esc aborts (add a keyDown(53=Esc) handler that cancels regardless of held modifiers).
- Keep the keyboard-monitor logic in a **dedicated thread/runloop** (Wispr's `keyboardService.runQueue` pattern) so slow ASR never stalls the tap (which would trip `tapDisabledByTimeout`).

### B7. Gotchas / conflicts (each is a real risk for the clone)
1. **"Press 🌐 key to" system setting** [OBS — macmost / Apple]: **System Settings → Keyboard**, dropdown "Press 🌐 key to" with options **Change Input Source / Show Emoji & Symbols / Start Dictation / Do Nothing**. If the user's Fn is set to any of the first three, a bare Fn tap **also triggers that system action** (emoji picker pops, input source switches, or macOS dictation starts). Wispr's docs do **not** claim to change this setting; it coexists by using a **`.defaultTap` that suppresses the Fn event** so the system action doesn't fire. A pure observe-only monitor (NSEvent/listenOnly) **cannot** suppress it → the clone must use `.defaultTap` (Accessibility) or instruct the user to set "Do Nothing." Note: choosing a Dictation shortcut in Settings can silently flip this "Press 🌐 key to" value.
2. **macOS built-in Dictation double-press** [OBS — Apple / getvoibe / spokenly]: default trigger is **double-press Globe/Fn** (built-in keyboards) or **double-press Control** (external). If the clone maps hands-free to a quick double-Fn, a stray double-tap can **also launch Apple Dictation**. Mitigation: suppress via tap, or tell the user to set **System Settings → Keyboard → Dictation → Shortcut → Off** (or a non-Fn preset like "Press Right Option Twice").
3. **Secure input / `EnableSecureEventInput`** [OBS — HackTricks + Wispr Secure-Keyboard-Entry article]: when any app enables secure event input (password fields, Terminal "Secure Keyboard Entry", Slack, 1Password, banking apps), **keyDown/keyUp are withheld from event taps system-wide**. Combo shortcuts silently die; Wispr surfaces a **persistent notification naming the offending app**. Detect with Carbon **`IsSecureEventInputEnabled()`**; on true, notify user + name the holder. Nuance: **modifier/flagsChanged (Fn alone) may still reach the tap**, which is why Wispr says "hold-to-talk continues to work" while combos are blocked — design PTT on Fn-alone to degrade gracefully.
4. **Karabiner-Elements** [OBS]: it installs a **virtual HID driver** that remaps Fn/F5 at a level **below** CGEventTap, so it can **swallow Fn before your tap (or macOS dictation) ever sees it**. If Fn detection mysteriously fails, check Karabiner Simple/Complex Modifications touching Fn or F5; the fix is to quit Karabiner or remove the rule.
5. **External / non-Apple keyboards** [OBS]: no true Apple Fn signal → **keyCode 63 / maskSecondaryFn never emitted**. Fn shortcut only works on the **built-in MacBook keyboard**. Fallback default **Ctrl+Opt** (or Opt+Cmd). Also: `tauri-plugin-global-shortcut`, `global-hotkey`, and Carbon `RegisterEventHotKey` **cannot bind Fn at all** — only a raw event tap / rdev / IOHID path can.
6. **Tap auto-disable:** a slow callback trips **`kCGEventTapDisabledByTimeout`**; must re-enable (`CGEvent.tapEnable`). Keep callback fast; offload work.
7. **Globe-key crashes in some toolkits** [OBS]: `winit` issue #2872 — pressing Globe can assert in `charactersIgnoringModifiers`; ShortcutRecorder issue #129 — `SR_keyEventType` may misinterpret a CGEvent-based NSEvent. Guard Globe/Fn specially rather than treating it as a normal character key.
8. **NSEvent global monitor blind spot:** `addGlobalMonitorForEvents` never fires for events targeting **your own app's** windows — pair it with `addLocalMonitorForEvents` if the clone's own UI is focused. (Reason to prefer CGEventTap, which sees everything.)

### B8. Other OSS references for the clone [OBS]
- **vocamac** (github.com/jatinkrmalik/vocamac): hold-hotkey → WhisperKit, Swift.
- **FluidVoice** (altic-dev): notes VoiceOver/focus-steal issues with dictation overlays.
- **KeyboardShortcuts** (Sindre Sorhus): the standard Swift SPM lib for a "press keys to record a shortcut" settings UI (used by VoiceInk) — but it uses Carbon `RegisterEventHotKey` under the hood and **cannot capture Fn-alone**, so pair it with a custom flagsChanged tap for Fn.
- **enigo** / **CGEventPost** / paste-via-Cmd+V: standard text-injection approaches (all need Accessibility).

---

## KEY NUMERIC/CONSTANT CHEAT-SHEET (for downstream synthesis)
- Fn/Globe keyCode **63** (`kVK_Function`, 0x3F); Esc **53**; Space **49**; Right Option **61**.
- `NSEvent.ModifierFlags.function` / `CGEventFlags.maskSecondaryFn` = **0x800000**.
- Fn debounce **40 ms** (VoiceInk); shortcut cooldown **500 ms** (VoiceInk); interruption window **1.0 s** (VoiceInk).
- Wispr session cap **20 min** (warn 19); double-tap→hands-free window **[INF] ~300 ms**.
- Permission mapping: listenOnly tap / IOHID → **Input Monitoring**; defaultTap / NSEvent global monitor / text injection → **Accessibility**. Clone needs **both + Microphone**.


## Sources
- https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts
- https://docs.wisprflow.ai/articles/6391241694-use-flow-hands-free
- https://docs.wisprflow.ai/articles/4816967992-how-to-use-command-mode
- https://docs.wisprflow.ai/articles/6409258247-starting-your-first-dictation
- https://docs.wisprflow.ai/articles/3152211871-setup-guide
- https://docs.wisprflow.ai/articles/3941699399-keyboard-and-screen-reader-accessibility-in-wispr-flow
- https://docs.wisprflow.ai/articles/9192039587-using-wispr-flow-discreetly-microphone-guide
- https://docs.wisprflow.ai/collections/6359960513-troubleshooting
- https://www.wensenwu.com/thoughts/wispr-flow-investigation
- https://github.com/Beingpax/VoiceInk
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Shortcuts/ShortcutMonitor.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Shortcuts/Shortcut.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Shortcuts/RecordingShortcutManager.swift
- https://github.com/Beingpax/VoiceInk/tree/main/VoiceInk/Shortcuts
- https://github.com/cjpais/handy
- https://raw.githubusercontent.com/cjpais/handy/main/src-tauri/src/shortcut/tauri_impl.rs
- https://raw.githubusercontent.com/cjpais/handy/main/src-tauri/src/shortcut/handy_keys.rs
- https://raw.githubusercontent.com/cjpais/handy/main/src-tauri/src/shortcut/handler.rs
- https://raw.githubusercontent.com/cjpais/handy/main/src-tauri/Cargo.toml
- https://github.com/cjpais/Handy/issues/47
- https://github.com/cjpais/Handy/releases/tag/v0.7.0
- https://github.com/elaineyxu/macos-global-hotkey-troubleshooting/blob/main/SKILL.md
- https://raw.githubusercontent.com/elaineyxu/macos-global-hotkey-troubleshooting/main/references/permissions-and-system-behavior.md
- https://hacktricks.wiki/en/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-input-monitoring-screen-capture-accessibility.html
- https://macmost.com/how-to-use-the-fn-globe-key-on-your-mac-keyboard.html
- https://www.getvoibe.com/resources/mac-dictation-keyboard-shortcuts-guide/
- https://spokenly.app/blog/mac-dictation-shortcut
- https://developer.apple.com/forums/thread/707680
- https://blog.kulman.sk/implementing-auto-type-on-macos/
