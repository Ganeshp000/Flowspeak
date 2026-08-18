# v2-4fb621cb21b643646e1fe95bf39ada8b6f67d

## FlowSpeak native-hook architecture: in-process Rust FFI vs. sidecar helper

Confidence: **[OBS]** = observed in a cited primary source; **[INF]** = inferred engineering judgment. Versions/paths exact where given.

---
### 0. HEADLINE ANSWERS
- **Handy does NOT do the hook "read-only in Rust."** Its shortcut module delegates to the **`handy-keys` crate**, which on Windows uses **`SetWindowsHookExW(WH_KEYBOARD_LL, …)`** and on macOS uses a **direct `CGEventTap` via `objc2_core_graphics` (NOT rdev)**, both **event-consuming**, both on a **dedicated OS thread with its own message loop / CFRunLoop**, and both with **partial recovery logic**. Handy registers hotkeys via **`HotkeyManager::new_with_blocking()`** so its keys **are suppressed**. **[OBS]**
- **The recovery is asymmetric and incomplete vs. FlowSpeak's spec.** macOS: re-enables the tap on `TapDisabledByTimeout`/`ByUserInput` **and** on a ~100 ms health poll — but only calls `tap_enable`, never a full tap re-create. Windows: reinstalls hooks **only on power/session events** (`WM_POWERBROADCAST`, `WM_WTSSESSION_CHANGE`), **NOT** on the silent LowLevelHooksTimeout removal — which Microsoft states is **undetectable by design**. No dedicated periodic stale-held-key watchdog on either. **[OBS]**
- **Deciding factor for FlowSpeak:** the in-process **ONNX ASR + llama.cpp LLM that can saturate CPU/GPU** creates two risks a dedicated in-process thread does **not** remove: (1) **scheduler starvation** of the hook thread under full-core inference → callback misses the OS timeout window, and (2) an **inference crash/OOM kills the hook with the whole process**. On Windows the resulting hook loss is **silent + unrecoverable**; on macOS it is recoverable but still drops the push-to-talk press. **→ Recommendation: sidecar on Windows (hard), sidecar strongly advised on macOS; a single shared-Rust sidecar reusing `handy-keys` satisfies the "one codebase" goal AND the isolation.** **[INF, grounded in OBS below]**

---
### 1. WHAT HANDY ACTUALLY DOES (per platform)

**Handy stack facts [OBS]** (`src-tauri/Cargo.toml`): `tauri = 2.11.5`, `tauri-plugin-global-shortcut = 2.3.1`, **`handy-keys = "0.3.0"`**, `rdev = { git = "https://github.com/rustdesk-org/rdev" }` (the RustDesk fork, not `Narsil/rdev`), `enigo = "0.6.1"`, `windows = 0.61.3`. `objc2`/`core-graphics` are not direct deps of Handy (they come transitively via `handy-keys`, which uses `objc2_core_graphics`).

**Handy's `src-tauri/src/shortcut/` = 4 files: `handler.rs`, `handy_keys.rs`, `mod.rs`, `tauri_impl.rs` [OBS].** The real hook is **inside the `handy-keys` crate** (`github.com/handy-computer/handy-keys`), not in Handy's tree. Handy's `handy_keys.rs`:
- **`HotkeyManager::new_with_blocking()` (line 114)** → the manager is created **with blocking enabled**, so **all** registered hotkeys are **consumed/suppressed** from other apps. **[OBS]** (This corrects the earlier impression that Handy is "read-only.")
- Registers parsed hotkeys via `manager.register(hotkey)` (lines ~189-193); polls events with `manager.try_recv()` on a `recv_timeout(10ms)` loop. **[OBS]**
- **`Modifiers::FN` → `"fn"` token is a first-class modifier** (`modifiers_to_strings`, line ~382); Fn-containing combos inherit blocking. **No dedicated bare-Fn special-case / OS-Fn-action-suppression code** in Handy's own layer beyond consuming the event. **[OBS]**
- `handler.rs` / `tauri_impl.rs`: **NO** stale-key detection, watchdog, timeout, health-check, or re-enable logic at the app layer — those live (partially) inside `handy-keys`. `tauri_impl.rs` also wires `tauri-plugin-global-shortcut` (Carbon `RegisterEventHotKey`, app-level) for some shortcuts; Linux disables the dynamic cancel shortcut "due to instability." **[OBS]**

**`handy-keys` crate internals [OBS]** (`github.com/handy-computer/handy-keys`, layout: `src/{lib,manager,listener,error}.rs`, `src/platform/{mod,state}.rs` + `windows/`, `macos/`, `linux/`; API exposes `HotkeyManager`, `Hotkey`, `HotkeyEvent`, `KeyboardListener`, `Modifiers`, `BlockingHotkeys`). README: "Windows — Uses low-level keyboard hooks. No special permissions required." / "macOS — Requires accessibility permissions." / blocking: "Registered hotkeys are blocked from reaching other applications"; Linux does it via exclusive evdev grab + uinput re-injection.

**Windows — `src/platform/windows/listener.rs` [OBS]:**
- **`SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook_proc), None, 0)`** — in-process (hMod = None, threadId = 0 → global desktop hook; low-level hooks are the one global-scope hook type that needs **no DLL injection** because the callback marshals back to the installing thread). **[OBS]**
- **Suppression:** callback returns **`LRESULT(1)`** when `should_block_hotkey()` matches a registered blocking hotkey; otherwise `CallNextHookEx(None, code, wparam, lparam)`. **[OBS]** — a true consuming hook, correct per MS docs.
- **Dedicated thread + message loop:** `thread::spawn` runs a loop calling `drain_thread_messages(&mut msg)` + `wait_for_message_or_timeout(HOOK_LOOP_TIMEOUT_MS)`. **[OBS]** (Satisfies MS requirement that the installing thread pump messages.)
- **Callback stays fast (offloads work):** the proc only does `ctx.event_sender.send(KeyEvent{…})` over an `mpsc::Sender`; modifier reconciliation/state tracking happens off the hot path. **[OBS]** — matches MS guidance to "pass the work off to a worker thread and immediately return."
- **Recovery — partial:** `reinstall_hooks()` ("Install the replacements before the old hooks are removed, so a failure never leaves us hook-less"); a **watcher window** monitors **`WM_POWERBROADCAST`** and **`WM_WTSSESSION_CHANGE`**; comment: "Windows can silently drop LL hooks across a suspend"; reinstall fires when `outcome.reinstall_hooks || take_reinstall_request()`. **[OBS]**
- **GAP vs. spec:** reinstall triggers are **power/suspend/session-change only**. There is **no detection or recovery of the LowLevelHooksTimeout silent removal** — because per Microsoft it is **undetectable** ("There is no way for the application to know whether the hook is removed"). So a >1000 ms callback stall → hook gone → **NOT recovered** until the next suspend/resume or session switch. No periodic health re-hook. No dedicated stale-held-key watchdog. **[OBS/INF]**

**macOS — `src/platform/macos/listener.rs` [OBS]:**
- **`CGEvent::tap_create(CGEventTapLocation::SessionEventTap, CGEventTapPlacement::HeadInsertEventTap, CGEventTapOptions::Default, …)`** via **`objc2_core_graphics`** — **direct CGEventTap, not rdev**. `Default` = **consuming** (not listen-only). **[OBS]**
- **Suppression:** callback returns **`std::ptr::null_mut()`** when `should_block`; else `event.as_ptr()`. **[OBS]**
- **Bare Fn/Globe:** explicit `else if keycode == 0x3F { /* FN key itself — tracked via flags, not keycode state */ }` inside `FlagsChanged` handling. **[OBS]** So it can consume Fn `flagsChanged` — the mechanism needed to suppress the OS emoji/dictation action. (Whether a session-level Default tap *fully* kills the system Fn/emoji action is a known gray area; same approach as OpenSuperWhisper/speak2/parrote. **[INF]**)
- **Recovery:** in the callback, `CGEventType::TapDisabledByTimeout | TapDisabledByUserInput => { reconcile_modifiers(…); … }`; and a **health poll** in the run loop: `if !CGEvent::tap_is_enabled(&tap) { CGEvent::tap_enable(&tap, true); }`. **[OBS]**
- **Dedicated CFRunLoop thread:** `run_event_tap()` on its own thread calling `CFRunLoop::run_in_mode(kCFRunLoopDefaultMode, 0.1 /*100 ms*/, true)` in a loop while `running` — so the tap health is re-checked every ~100 ms. **[OBS]**
- **GAP vs. spec:** re-enable **only calls `tap_enable`; never a full remove-from-runloop → recreate → re-add reinstall** (the spec's "if that fails, fully reinstall the tap"). `reconcile_modifiers` gives *partial* stale-modifier cleanup but there is **no dedicated periodic stale-held-key watchdog** (Wispr's `CheckStaleKeys`). **[OBS/INF]**

**`rdev::grab()` on macOS (the "historically shaky" path) [OBS/INF]:**
- rdev `grab()` uses a CGEventTap; "returning None ignores [consumes] the event, returning the event lets it pass." Requires Accessibility; "the process running the blocking listen…needs to be the parent process (no fork before)"; if Accessibility not granted, `grab` fails with **`EventTapError`** (macOS 10.15+). **[OBS, `Narsil/rdev` + `rustdesk-org/rdev` READMEs]**
- **No tap-health / `kCGEventTapDisabledByTimeout` re-enable / watchdog is documented or exposed by rdev `grab`.** **[OBS — absence in README/API]**
- **Strong signal:** `handy-keys` (used by Handy for the actual PTT hook) **bypasses `rdev` entirely on macOS**, hand-rolling a `CGEventTap` via `objc2_core_graphics` with its own re-enable/health loop. That the Tauri/Rust reference had to abandon `rdev::grab` for a hand-written tap is itself evidence `rdev::grab` was **insufficient for reliable Fn suppression + timeout recovery**. Handy still lists `rdev` (rustdesk fork) as a dep, but the shortcut path is `handy-keys`. **[OBS + INF]**
- **Version caveat:** the recovery code above was read on `handy-keys` **`main`**; Handy pins **`0.3.0`**. Equivalence of 0.3.0's recovery logic is **[INF]** (crate is new; likely similar, not verified).

---
### 2. FEASIBILITY OF IN-PROCESS CONSUMING HOOK + WATCHDOG ALONGSIDE WEBVIEW + ASR + LLM

**A dedicated OS thread + runloop in-process is NECESSARY but NOT SUFFICIENT when co-located with saturating ASR/LLM.** **[INF, grounded in the OBS primary constraints below]**

**The hard OS constraints [OBS]:**
- **Windows `LowLevelKeyboardProc`:** "The hook procedure should process a message in less time than…**LowLevelHooksTimeout** in `HKEY_CURRENT_USER\Control Panel\Desktop` (milliseconds). If the hook procedure times out, the system passes the message to the next hook. However, **on Windows 7 and later, the hook is silently removed without being called. There is no way for the application to know whether the hook is removed.**" **Windows 10 1709+: max = 1000 ms**, and values >1000 are clamped to 1000. MS explicitly advises: "run the hooks on a dedicated thread that passes the work off to a worker thread and then immediately returns… monitor raw input instead." **[OBS, Microsoft Learn]**
- The LL hook callback **runs on the installing thread** (marshaled by a message to that thread), so **that thread must keep pumping messages** and must be scheduled promptly. **[OBS, LowLevelKeyboardProc + SetWindowsHookExW remarks]**
- **macOS `CGEventTap`:** `kCGEventTapDisabledByTimeout = 0xFFFFFFFE`, `kCGEventTapDisabledByUserInput = 0xFFFFFFFF` are "**out of band event types…delivered to the event tap callback to notify it of unusual conditions that disable the event tap**." The remedy is `CGEventTapEnable(tap, true)` from the callback + a health timer. **[OBS, CoreGraphics `CGEventTypes.h`]** Unlike Windows, **macOS timeout disable is RECOVERABLE and self-announcing.**

**Why a dedicated in-process thread does NOT fully de-risk it here:**
1. **Callback speed is not the only failure mode — thread SCHEDULING is.** handy-keys already makes the callback minimal (channel send). But the LowLevelHooksTimeout / tap timeout measures wall-clock from event-post to callback-return. If **ONNX + llama.cpp peg all P-cores** (Qwen3-class LLM decode + ASR), the OS scheduler can **starve the hook thread** so the callback doesn't even *start* within 1000 ms. Result: Windows silent removal; macOS timeout-disable. An unbounded `mpsc` send never blocks, but a **not-yet-scheduled thread still "times out."** Mitigations if kept in-process: raise hook-thread priority above inference threads, cap llama.cpp/ONNX thread pools to leave ≥1 core, pin the hook thread. **[INF]**
2. **No crash isolation.** A llama.cpp OOM, a bad Metal/CUDA kernel, an ONNX runtime abort, or a WebView/Tauri panic **takes down the hook with the process.** The push-to-talk trigger is the app's most safety-critical primitive; co-locating it with the least-stable, highest-resource subsystem is the wrong coupling. **[INF]**
3. **Windows failure is terminal.** Because the timeout removal is **undetectable**, an in-process design cannot even *know* to re-hook. handy-keys only re-hooks on suspend/session events — a mere inference stall won't trigger that. The app would just **stop responding to the hotkey** with no signal, exactly the failure the spec fears. **[OBS premise + INF]**
4. macOS is materially safer in-process because the timeout is **recoverable** and handy-keys' 100 ms `tap_is_enabled`→`tap_enable` poll already heals it. But a heal still means the **specific Fn press during the stall is lost** — unacceptable for an exact-behavior PTT clone if it happens during every heavy transcription. **[OBS + INF]**

**Bottom line for Q2:** In-process consuming hook + watchdog is **demonstrably feasible in a Tauri/Rust app** (handy-keys proves the primitives, incl. dedicated thread + runloop + re-enable). But **co-locating it with saturating ASR+LLM materially raises the Windows silent-removal and macOS tap-timeout risk**, and a dedicated thread mitigates callback-duration but **not scheduler starvation or crash propagation.** A dedicated thread is sufficient for the *hook mechanics*; it is **not sufficient to guarantee liveness under the planned compute load.** **[INF]**

---
### 3. SEPARATE NATIVE SIDECAR HELPER — CONCRETE TRADE-OFFS

**Wispr Flow ships exactly this split [OBS, teardown of v1.6.7]:** macOS = Swift `LSUIElement` helper `com.electron.wispr-flow.accessibility-mac-app` (universal Mach-O), doing the CGEvent tap (`eventTap`, `eventTapRunLoop`, `flagsChanged`, `KeyDownInfo`, `lastFlagsChangedAt`, `lastKeyDownAt`, `hasAppleFnKey()`, `modifierKeysDown`, `updateShortcuts`), secure-input detection ("Secure input is blocking keyboard shortcuts"), IOHIDManager, and clipboard-paste (`paste_execute`, `NSPasteboard`, `org.nspasteboard.ConcealedType`, `restoreClipboard`, failed-paste timer). Windows = C#/.NET `windows-helper-app`. IPC = **length-prefixed JSON over stdin/stdout**, schema in `src/api/helper/schema.json`, code-genned into TS+Swift+C# via **quicktype** — one shared contract, two native helpers. The spec's `TapState`/`TapWatchdog`/`TapRecoveryEvent`, `CheckStaleKeys`/`StaleKeysResponse`, `PasteText`, `SecureInputStatus`, `WindowsKeyUpSimulation` messages map directly to this design. **[OBS]**

**PROS of the sidecar:**
- **Crash isolation** — hook survives an ASR/LLM/WebView crash; app survives a hook crash; each restartable independently. **[INF]** (Wispr helper links its own `Sentry.framework` for independent crash reporting. **[OBS]**)
- **Hook thread NEVER starved by inference** — the helper is a separate process with its own scheduling; no P-core contention with llama.cpp/ONNX. Directly removes the #1 Windows-silent-removal / macOS-timeout trigger. **[INF]**
- **Dedicated runloop/message loop, clean lifecycle** — trivially runs its own CFRunLoop / `GetMessage` loop with elevated priority; easy **full tap re-create** on macOS and full re-hook on Windows without disturbing UI/inference. **[INF]**
- **Minimal, auditable native surface** — the helper does only hook + inject + secure-input + AX; smaller attack/permission surface; on macOS the helper (not the big app) is the process needing Accessibility/Input-Monitoring, and it can be an `LSUIElement` agent. **[OBS/INF]**
- **Recoverable Windows story** — even the undetectable timeout removal is survivable: a **liveness heartbeat** from shell→helper (or vice-versa) detects "helper hung/hook dead" and the shell **respawns the helper**, something impossible when the hook is in-process. **[INF]**

**CONS of the sidecar:**
- **IPC latency + complexity** — every key transition and every paste crosses a process boundary (length-prefixed JSON / named pipe / stdio). For hold-to-talk this is sub-ms to low-ms and non-critical, but paste ordering, clipboard save/restore timing, and secure-input checks now have a round-trip. **[INF]**
- **Second signed/notarized native binary per OS** — macOS: Developer-ID sign + notarize + staple the helper too (and it needs its own TCC grants: Accessibility + Input Monitoring, which require app-quit/relaunch to take effect). Windows: sign a second `.exe`; UIPI/UAC considerations for the hook + SendInput into elevated targets. **[OBS from macOS TCC facts + INF]**
- **Build/release/versioning** — two artifacts to build, embed, version-match, and keep IPC-schema-compatible; installer must place + register both; auto-update must update both atomically (Wispr uses Squirrel and code-gens the shared schema to avoid drift). **[OBS/INF]**
- **Distribution weight** — extra binary in the bundle; on Windows a second process in Task Manager. **[INF]**
- **Language/toolchain split (Wispr's version)** — Wispr uses Swift + C#, i.e. two more toolchains beyond the shell. **This con is avoidable for FlowSpeak:** a **single Rust sidecar reusing `handy-keys`/`enigo`** gives isolation with **one** language across both OSes — closer to the project's "one codebase" goal than Wispr's split. **[INF]**

**PROS of all-in-process (Handy model):**
- One binary, one toolchain, one signing/notarization step, no IPC. **[OBS — Handy ships this way]**
- Lowest latency; simplest release. **[INF]**
- **Proven feasible** by Handy/handy-keys with dedicated thread + runloop + consume + partial recovery. **[OBS]**

**CONS of all-in-process:** everything in Q2 — scheduler starvation under saturating inference, no crash isolation, and on Windows an **undetectable, unrecoverable** hook loss. Handy gets away with it partly because it does **not** run a continuous saturating LLM decode next to the hook the way FlowSpeak plans. **[INF]**

---
### 4. RECOMMENDATION FOR v1

**Use a separate native sidecar helper for the hook + injection + secure-input + AX — implemented as ONE shared Rust sidecar binary (reusing `handy-keys` + `enigo`) on both platforms.** Per-platform verdict and the single deciding reason:

- **Windows — SIDECAR (hard requirement). Deciding reason:** the `WH_KEYBOARD_LL` timeout removal is **silent and undetectable** ("no way for the application to know"), and an in-process hook thread can be **starved past the 1000 ms cap by the co-resident ONNX+llama.cpp saturation** — producing a dead hotkey with no recovery path (handy-keys only re-hooks on suspend/session, not on an inference stall). A separate process is the only design where the hook thread cannot be starved by inference **and** where the shell can heartbeat-detect a hung helper and respawn it. **[OBS constraint + INF]**

- **macOS — SIDECAR recommended, though in-process is *survivable*. Deciding reason:** the CGEventTap timeout is **recoverable and self-announcing** (`kCGEventTapDisabledByTimeout` → `CGEventTapEnable`), and handy-keys already heals it via its 100 ms health poll — so Handy's in-process-with-dedicated-CFRunLoop model is **demonstrably safe enough** here. BUT for an *exact-behavior* clone, every heal still **drops the Fn press that occurred during the stall**, and heavy inference makes stalls frequent; plus crash isolation and code-sharing with the Windows sidecar tip it over. If you must minimize scope for macOS v1, an in-process dedicated-thread tap (handy-keys pattern) **plus** the missing pieces (full tap re-create fallback + a real periodic stale-held-key watchdog à la Wispr `CheckStaleKeys`) is an acceptable fallback; Windows has no such fallback. **[OBS + INF]**

**Does the in-process ASR+LLM tip the decision toward Wispr's sidecar model?** **Yes — decisively on Windows, strongly on macOS.** Handy's in-process-with-dedicated-thread model is **demonstrably safe only in the absence of a co-resident saturating LLM** and only where timeout removal is recoverable (macOS). The moment a Qwe3-class llama.cpp decode + ONNX ASR can peg every core in the same process as the hook, you inherit both scheduler-starvation timeouts and crash-propagation — the exact two problems Wispr's helper split was designed to eliminate. The presence of in-process ASR+LLM is the single strongest argument for the sidecar. **[INF, grounded in the OBS OS constraints above]**

**Concrete v1 shape [INF]:**
1. **Sidecar = one Rust binary** embedding `handy-keys` (WH_KEYBOARD_LL consuming + CGEventTap `Default`/HeadInsert/Session consuming, both already implemented) + `enigo` for injection. Keeps the "one codebase" ethos better than Wispr's Swift+C# split.
2. **IPC** = length-prefixed JSON over stdio (Wispr's proven pattern), message set: `TapState`/`TapWatchdog`/`TapRecoveryEvent`, `CheckStaleKeys`/`StaleKeysResponse`, `PasteText`, `SecureInputStatus`, `WindowsKeyUpSimulation`. **[OBS these exist in Wispr]**
3. **Add what handy-keys lacks:** (a) macOS **full tap re-create** fallback when `tap_enable` fails (handy-keys only re-enables); (b) a **dedicated periodic stale-held-key watchdog** (handy-keys only does `reconcile_modifiers` on tap-disable) to prevent the stuck-key/"145 suppressed spacebars" class of bug; (c) Windows **shell↔helper heartbeat + respawn** to convert the undetectable LL-hook removal into a recoverable event. **[INF]**
4. **Isolate inference in the shell/core, hook in the sidecar** — never share a thread pool between llama.cpp/ONNX and the hook. Even if you keep some native code in-process, the **hook specifically** belongs in the sidecar. **[INF]**
5. **Cost accepted:** two signed/notarized binaries per OS, second TCC-granting process on macOS (Accessibility + Input Monitoring, relaunch-to-apply), IPC round-trips on paste — all judged worth it for a safety-critical PTT trigger next to saturating local inference.

---
### 5. FACTS APPENDIX (exact values)
- **Windows hook:** `SetWindowsHookExW(idHook=WH_KEYBOARD_LL=13, lpfn, hmod=NULL, dwThreadId=0)`; WH_KEYBOARD_LL scope = **Global only** but **no DLL required** (callback marshals to installing thread; that thread **must pump messages**). Suppress by returning **nonzero (`LRESULT(1)`)** instead of `CallNextHookEx`. Timeout reg value **`LowLevelHooksTimeout`** at **`HKEY_CURRENT_USER\Control Panel\Desktop`**, milliseconds, **max/default cap 1000 ms (Win10 1709+)**; timeout → **silent removal, undetectable**. `.NET` note: keep callback as a static method so GC doesn't move it. **[OBS, Microsoft Learn]**
- **macOS tap:** `CGEventTapCreate` at `kCGSessionEventTap` / `kCGHeadInsertEventTap`, option `kCGEventTapOptionDefault` (consuming). Disable notifications: **`kCGEventTapDisabledByTimeout = 0xFFFFFFFE`**, **`kCGEventTapDisabledByUserInput = 0xFFFFFFFF`** ("out of band event types…notify it of unusual conditions that disable the event tap"). Re-enable: `CGEventTapEnable(tap, true)`. Fn/Globe: **keycode `0x3F` (63)** = `kVK_Function`, flag `CGEventFlags.maskSecondaryFn`, seen on `kCGEventFlagsChanged`. **[OBS, CoreGraphics CGEventTypes.h + macos-architecture.md]**
- **Permissions [OBS]:** CGEventTap → **Input Monitoring** (`IOHIDCheckAccess`/`CGPreflightListenEventAccess`; **change requires app quit+relaunch**); AX text I/O + posting CGEvents → **Accessibility** (`AXIsProcessTrusted`). rdev/handy-keys macOS both require Accessibility.
- **Crates [OBS]:** `handy-keys 0.3.0` (repo `handy-computer/handy-keys`, uses `objc2_core_graphics` on macOS, `SetWindowsHookExW` on Windows, evdev+uinput on Linux); `rdev` = RustDesk fork (git); `enigo 0.6.1`; `windows 0.61.3`; `tauri 2.11.5`; `tauri-plugin-global-shortcut 2.3.1`. Licenses: handy-keys/rdev/enigo permissive (MIT / MIT-Apache) — safe to reuse. **[OBS/INF]**
- **Wispr helper IPC message set (spec-confirming) [OBS]:** length-prefixed JSON over stdio; schema code-genned Swift+C#+TS via quicktype; helper handles eventTap+flagsChanged, `hasAppleFnKey`, secure-input, concealed-clipboard paste with failed-paste timer, `windowsKeyUpSimulation`.
- **enigo paste (Handy `input.rs`) [OBS]:** 4 strategies — `enigo.text()` Unicode; Ctrl/Cmd+V; Ctrl/Cmd+Shift+V (terminals); Shift+Insert; macOS `Key::Meta`+`Key::Other(9)`, 100 ms sleep before release. Handy #1661: enigo Wayland path silently dropped capital letters — verify Shift/casing survives whatever injection path you choose.

## Open questions
- handy-keys 0.3.0 (what Handy pins) vs main branch: the reinstall/health-poll recovery code was read on main; whether 0.3.0 contains the same watchdog logic is unverified.
- Whether a macOS session-level CGEventTap with kCGEventTapOptionDefault FULLY suppresses the built-in OS Fn/emoji/dictation action for a bare-Fn trigger, or only partially (handy-keys/OpenSuperWhisper consume the flagsChanged but full OS-action suppression is not confirmed).
- Exact HOOK_LOOP_TIMEOUT_MS value and whether handy-keys' Windows watcher window does anything beyond WM_POWERBROADCAST/WM_WTSSESSION_CHANGE (mod.rs only re-exports; deeper listener.rs constants not fully quoted).
- Measured IPC round-trip latency for a stdio length-prefixed JSON helper on push-to-talk key transitions and paste under load — needed to confirm the sidecar adds no perceptible hotkey lag.
- Whether Handy has field reports of silent WH_KEYBOARD_LL loss or CGEventTap timeout under heavy in-process whisper.cpp/ONNX load specifically (would empirically bound the in-process risk).

## Sources
- https://github.com/cjpais/Handy/tree/main/src-tauri/src/shortcut
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/shortcut/handy_keys.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/shortcut/tauri_impl.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/shortcut/handler.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/Cargo.toml
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/input.rs
- https://github.com/handy-computer/handy-keys
- https://docs.rs/handy-keys/latest/handy_keys/
- https://lib.rs/crates/handy-keys
- https://github.com/handy-computer/handy-keys/tree/main/src
- https://github.com/handy-computer/handy-keys/tree/main/src/platform
- https://github.com/handy-computer/handy-keys/tree/main/src/platform/windows
- https://github.com/handy-computer/handy-keys/tree/main/src/platform/macos
- https://raw.githubusercontent.com/handy-computer/handy-keys/main/src/platform/windows/listener.rs
- https://raw.githubusercontent.com/handy-computer/handy-keys/main/src/platform/macos/listener.rs
- https://raw.githubusercontent.com/handy-computer/handy-keys/main/README.md
- https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowshookexw
- https://raw.githubusercontent.com/Narsil/rdev/main/README.md
- https://raw.githubusercontent.com/phracker/MacOSX-SDKs/master/MacOSX10.15.sdk/System/Library/Frameworks/CoreGraphics.framework/Versions/A/Headers/CGEventTypes.h
- /Users/mannbellani/FlowSpeak/docs/research/app-teardown.md
- /Users/mannbellani/FlowSpeak/docs/research/macos-architecture.md
- /Users/mannbellani/FlowSpeak/docs/research/oss-clones.md
