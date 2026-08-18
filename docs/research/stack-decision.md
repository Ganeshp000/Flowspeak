# v2-52374a83a57729b2ce547fbb7f44f37834bcf

## TRACK: Dual-platform stack decision (Windows 10/11 + macOS 14+, one codebase)

### RECOMMENDATION (one): **Tauri v2 (Rust core + system webview), following Handy's architecture**, with a documented escape hatch to drop thin per-OS native modules (objc2/core-graphics on macOS, `windows` crate on Windows, or a Swift sidecar helper) for the 2-3 highest-fidelity subsystems (Fn-suppression CGEventTap, AX-insert, secure-input detection). This is a hybrid of option (1) and (4): **one shared Rust+React codebase**, native shims only where the webview/cross-platform crates fall short. It is the **only stack proven in production (Handy) to deliver the transparent, non-activating, click-through, above-fullscreen pill on BOTH macOS and Windows from a single codebase**, while embedding ONNX ASR and llama.cpp cleanup in-process. The prior "fully native Swift" decision is indeed killed by the dual-platform requirement — but the Mac spec's recipes (NSPanel, CGEventTap, secure-input) map cleanly onto Tauri (see §MAPPING). **Second choice = Electron** (what Wispr itself ships) if webview-overlay edge cases or rdev Fn-suppression prove blocking; it is the most mature but pays ~800MB RAM. **Flutter is out** (no in-process ML story, no mature Fn/CGEventTap plugin). **Pure option (4) two-native-shells is the fidelity winner but violates the "one codebase" goal (2× UI work).**

---

### 1. THE HARD REQUIREMENT — transparent, non-activating, click-through, above-fullscreen pill on BOTH OSes

**Handy proves Tauri can do this on both OSes. `src-tauri/src/overlay.rs` has three `#[cfg(target_os)]` branches (OBS):**
- **macOS** (via `tauri-nspanel`, ahkohd fork, branch `v2.1`): `PanelBuilder` → real **NSPanel**. `level = PanelLevel::Status` (raw NSWindow level **25**, above the menu bar); style mask `borderless().nonactivating_panel()`; collection behavior `can_join_all_spaces().full_screen_auxiliary()`; window config `decorations(false)`, `transparent(true)`, `focusable(false)`, `no_activate(true)`; corner radius 0; shadow disabled; size 256×46 logical pt (400×120 for streaming). Position via `calculate_overlay_position()`. **This is byte-for-byte the OpenSuperWhisper/`IndicatorWindowManager` NSPanel recipe in the existing Mac spec (§A), reached through a Tauri plugin instead of Swift.** (OBS)
- **Windows**: `WebviewWindowBuilder` with `always_on_top(true)`, `skip_taskbar(true)`, `transparent(true)`, `focusable(false)`, `decorations(false)`, **plus `force_overlay_topmost()` calling Win32 `SetWindowPos(HWND_TOPMOST, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW)`** to re-assert Z-order. In tao/Tauri, `focusable(false)` sets **`WS_EX_NOACTIVATE`** on the window; `always_on_top` sets `WS_EX_TOPMOST`. This is exactly the `WS_EX_NOACTIVATE`/`TOPMOST` combo the task asked to verify. (OBS)
- **Linux**: `gtk-layer-shell` `Layer::Overlay` + `KeyboardMode::None` (irrelevant to us, but shows the per-OS pattern).
- Platform offset constants differ: macOS `OVERLAY_TOP_OFFSET=46 / BOTTOM=15`; Windows/Linux `TOP=4 / BOTTOM=40` (OBS) — proof that even in "one codebase," pixel geometry is tuned per-OS.

**Click-through** (OBS/INF): Tauri exposes `set_ignore_cursor_events(bool)` (JS `setIgnoreCursorEvents`) on both OSes. **Limitation: Tauri has NO per-region hit-testing for click-through** (tauri-apps/tauri issue **#13070**, open). Two mitigations, both used in the wild: (a) size the window tight to the visible pill (Handy 256×46) so the whole window is the interactive pill and there is no dead transparent zone to click through — cleanest; (b) a Rust ~60fps cursor-position poll that toggles `set_ignore_cursor_events` when the cursor enters/leaves the pill rect. The existing Mac spec's ~440×300 host with a small pill + dynamic `ignoresMouseEvents` is strategy (b); Handy uses (a). Recommend (a) for the resting/recording pill, (b) only for the hover-expanded popups.

**macOS transparency requires `macOSPrivateApi: true` in `tauri.conf.json`** (OBS, Handy sets it) — this **permanently disqualifies the Mac App Store**. Irrelevant for us: AX + CGEventTap already force Developer-ID-signed-and-notarized outside-MAS distribution.

**tao patch (OBS, risk):** Handy pins `tao` + `tao-macros` to `tauri-apps/tao` rev `07f3742…` via `[patch]` — i.e. they needed unreleased upstream windowing fixes. Flags that Tauri's window layer still occasionally needs source-level patches for overlay behavior.

**Electron equivalent (OBS, electronjs docs):** `new BrowserWindow({transparent:true, frame:false, hasShadow:false, focusable:false, alwaysOnTop:true, skipTaskbar:true, type:'panel'})`; `win.setAlwaysOnTop(true, 'screen-saver')` — valid level strings `normal|floating|torn-off-menu|modal-panel|main-menu|status|pop-up-menu|screen-saver|dock` (`pop-up-menu` and above sit over the taskbar). `win.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen:true, skipTransformProcessType:true})` — **`visibleOnFullScreen` is macOS-only and the whole call returns `false`/no-ops on Windows** (so Windows above-fullscreen relies solely on `alwaysOnTop:'screen-saver'`). `win.setIgnoreMouseEvents(true, {forward:true})` (`forward` is mac/win only). These are the exact flags in the Mac spec §A ("`setAlwaysOnTop(true,'screen-saver',1000)` + `setVisibleOnAllWorkspaces(...)`") — **because that spec line was reverse-engineered from Wispr, which is Electron.** So Electron does this most ergonomically, but the Windows above-fullscreen path is fiddlier (must lean on `screen-saver`, no workspace flag).

**Flutter (INF, weak):** `window_manager` (leanflutter) supports Linux/macOS/Windows and exposes `setAsFrameless`, `setBackgroundColor`(transparent), `setAlwaysOnTop`, `setSkipTaskbar`, `setIgnoreMouseEvents`, `setVisibleOnAllWorkspaces` per its API, **but non-activating/no-focus-steal and above-fullscreen are not first-class and are not battle-tested for a dictation overlay**; you drop to platform-channel native code for NSPanel/`WS_EX_NOACTIVATE` fidelity anyway. No production dictation-app reference uses it.

---

### 2. GLOBAL LOW-LEVEL KEY HOOKS incl. macOS Fn/Globe (must run in-process)

**Tauri (OBS, the key nuance):** Handy has **TWO runtime-selectable keyboard backends** (`src-tauri/src/shortcut/mod.rs`, enum `KeyboardImplementation::{Tauri, HandyKeys}`, chosen by `user_settings.keyboard_implementation`; HandyKeys auto-falls-back to Tauri on init failure):
- **`tauri_impl.rs`** uses `tauri-plugin-global-shortcut` 2.3.1 → Carbon `RegisterEventHotKey` on macOS. **Explicitly REJECTS the Fn key**: validation returns an error if any token equals `"fn"`/`"function"` ("the 'fn' key is not supported by Tauri global shortcuts"). Cannot suppress events, low priority. **This backend cannot do Wispr's default Fn push-to-talk.** (OBS)
- **`handy_keys.rs`** uses the **`handy-keys` 0.3.0** crate + **`rdev`** (rustdesk-org fork). `handy-keys` **supports `Modifiers::FN` / the `"fn"` token** and hold state (`HotkeyState::Pressed`, `is_key_down`). On macOS `rdev` installs a **CGEventTap under the hood** → this is the in-process CGEventTap path that CAN detect Fn/Globe (keyCode 63 / `maskSecondaryFn`). **This is how a Tauri app does Fn PTT — via the community rdev/handy-keys path, NOT the official plugin.** (OBS)
- **Gap / risk (INF):** `rdev`'s macOS `listen()` is read-only; suppressing the bare-Fn Globe action needs `rdev::grab()` (event-consuming CGEventTap `.defaultTap`), whose macOS reliability is historically shaky, and it does **not** expose the tap-health/`kCGEventTapDisabledByTimeout` watchdog the Mac spec §MACOS-IMPLEMENTATION requires. **Mitigation:** for full fidelity (suppress Globe, dedicated runloop, 5s health timer, stale-key watchdog) write a thin Rust module against `core-graphics`/`objc2` calling `CGEvent::tap_create` directly on a dedicated thread — the exact Swift recipe ported to Rust FFI. Windows default hotkey is `Ctrl+Win` (per Wispr) → `SetWindowsHookExW(WH_KEYBOARD_LL)` via the `windows` crate.

**Electron (OBS/INF):** `globalShortcut` is Carbon-based and also cannot see Fn; production apps use a **native node module** (`uiohook-napi`/`iohook`, N-API) that installs a CGEventTap (mac) / low-level hook (win). Same in-process-native burden as Tauri's rdev path, just via node-gyp instead of a Rust crate.

**Flutter (INF):** no mature Fn/CGEventTap plugin exists; you write the CGEventTap in Swift and the WH_KEYBOARD_LL hook in C++/C# behind a MethodChannel — the most native-code-per-OS of any option here.

**Option 4 native shells (OBS/INF):** best case — native `CGEvent.tapCreate(.defaultTap)` in Swift (the exact Mac spec) and `WH_KEYBOARD_LL` in C#, full suppression + health watchdog, no FFI compromise.

---

### 3. SYNTHETIC KEYSTROKE / PASTE INJECTION

**Tauri/Handy (OBS, `input.rs`):** uses **`enigo` 0.6.1**, four `#[cfg(target_os)]` strategies: (1) Cmd/Ctrl+V — mac `Key::Meta`+`Key::Other(9)`, win `Key::Control`+`Key::Other(0x56 VK_V)`, linux `Ctrl`+`Unicode('v')`; (2) Ctrl/Cmd+Shift+V (terminals); (3) Shift+Insert (win `Key::Other(0x2D)`, linux 0x76; win/linux only); (4) direct `enigo.text()` (Unicode, char-by-char fallback). 100ms sleep before release. Clipboard via `tauri-plugin-clipboard-manager` 2.3.2. Known bug **Handy #1661**: enigo Wayland drops capital letters (Shift+XTEST) → clipboard-paste is the safe default. **`enigo` does NOT cover the Mac spec's richer path** (AX `kAXSelectedTextAttribute` insert, `IsSecureEventInputEnabled()` detection, chunked paste for Claude-Code terminals, `changeCount`-guarded clipboard restore) — those must be hand-rolled in Rust via `objc2`/`core-foundation` FFI (macOS) and the `windows` crate (Windows), or delegated to a Swift helper. **Electron** uses `robotjs`/`nut.js` (same native-module burden). **All stacks need native code for AX-insert + secure-input; none give it for free.**

---

### 4. IN-PROCESS ASR (ONNX/CoreML) + llama.cpp CLEANUP

**ASR (OBS, decisive Tauri win):** Handy embeds **`transcribe-rs` 0.3.8** (ONNX via the **`ort` crate**; engines: Parakeet, Canary, Cohere, Moonshine, SenseVoice, GigaAM; **`ort-coreml` feature = ANE/CoreML on macOS**, DirectML/CUDA on Windows, WebGPU) **+ `transcribe-cpp` 0.1.3** (whisper.cpp in-process; **`metal` on macOS, `vulkan` on Windows/Linux x86_64, default on aarch64**). Both run **in-process** in the Rust core, GPU-accelerated, on both OSes. **This is the cleanest cross-platform ASR story of any stack.** Consequence for the Mac spec: **FluidAudio (Swift-only Parakeet CoreML) does NOT work in Rust → swap to `transcribe-rs`'s ONNX Parakeet TDT 0.6B with the `ort-coreml` EP** — same model, cross-platform, in-process; slightly less ANE-optimal than FluidAudio's native CoreML path but proven in Handy production.

**Cleanup LLM (OBS/INF):** **Handy does NOT embed llama.cpp** — `llm_client.rs` calls Ollama/OpenAI/Anthropic over **HTTP** (`{base_url}/chat/completions`; Anthropic path uses `x-api-key` + `anthropic-version: 2023-06-01`). For FlowSpeak's **in-process Qwen3-4B via llama.cpp** requirement, add **`llama-cpp-2` 0.1.151** (utilityai/llama-cpp-rs, **MIT/Apache-2.0**) — Rust FFI that embeds llama.cpp in-process, features **`metal` (macOS) and `vulkan`/`cuda` (Windows) both confirmed**, loads GGUF, no external process. One Rust dependency, cross-platform. (Alternative: ship a `llama-server` sidecar via Tauri's sidecar mechanism.) The **Claude Haiku toggle is a trivial `reqwest` HTTPS call** (`x-api-key` + `anthropic-version`) from the Rust core — stack-neutral, exactly Handy's `llm_client.rs`. **Electron** would use `node-llama-cpp` + `onnxruntime-node` (heavier, more moving parts); **Flutter** would `dart:ffi` into whisper.cpp/llama.cpp/ONNX by hand (no `transcribe-rs` equivalent — you rebuild the whole ML plumbing).

---

### 5. 60fps WAVEFORM

- **Tauri (INF):** Handy computes spectra with **`rustfft` 6.4.0** in Rust, streams levels to the webview, renders the 5-7 bar waveform on an HTML `<canvas>` in React. 60fps for a handful of bars in WKWebView (mac) / WebView2 (win) is comfortable; heavier than native but adequate. The Mac spec's native `TimelineView`+`Canvas`/Metal path is lost but not needed for 5-7 bars.
- **Flutter:** trivially 60fps (Skia) — its one clear strength.
- **Electron:** canvas fine, on top of Chromium overhead.
- **Option 4 native:** best (native Metal/Direct2D).

---

### 6. BINARY / INSTALLER SIZE + MEMORY

- **Shell binary:** Tauri ~2.5-10MB (system webview, not bundled) ; Electron ~120-180MB (bundles Chromium+Node) ; Flutter ~20-40MB (Skia) ; native shells ~small. (OBS/INF)
- **Installer is dominated by MODELS on every stack:** Parakeet ONNX ~0.5GB + Qwen3-4B GGUF ~2.5GB ⇒ ~3GB, so the shell delta is noise for download size. **But idle RAM differs materially:** Tauri/native shell ≈ 40-120MB baseline; **Electron ≈ 150-250MB baseline, and Wispr's own Windows Electron build measured ~800MB RAM (OBS, prior review research)**; once Parakeet (~500MB) + Qwen3-4B (~2.5GB resident) load, model RAM dominates on any stack, but Electron's baseline stacks on top. For an always-running background dictation utility, **Tauri's lower idle footprint is a real, ongoing UX advantage.**

---

### 7. AUTO-UPDATE + CODE-SIGNING

- **Tauri (OBS, one mechanism both OSes):** `tauri-plugin-updater` 2.10.0. Static **`latest.json`** manifest (`version` SemVer, `platforms.{OS-ARCH}.url/signature`, keys like `darwin-aarch64`/`windows-x86_64`). Custom **minisign-style signer** (`tauri signer generate`, `TAURI_SIGNING_PRIVATE_KEY`). Artifacts: macOS `.app.tar.gz`+`.sig`; Windows NSIS/MSI `.exe`/`.msi`+`.sig` with `installMode` passive/basicUi/quiet (quiet can't elevate → user-scope installs). Signing: macOS Developer-ID + notarization (hardened runtime, min OS 10.15, `Entitlements.plist`); Windows **Azure trusted-signing-cli** + custom NSIS template (both OBS from Handy config). **One updater story spanning both OSes = a distinct advantage over the native path.**
- **Electron:** `electron-updater`/Squirrel — `Squirrel.Mac` on macOS, NSIS/Squirrel on Windows (two mechanisms, mature). Signing similar.
- **Option 4 native:** **Sparkle 2 (EdDSA appcast) on macOS + a separate Windows updater** — two mechanisms, ~2× the release plumbing.
- **Flutter:** no first-party desktop updater; `auto_updater` plugin is immature → effectively Sparkle+Windows separate.
- **Signing friction ranking (low→high):** Electron ≈ Tauri < native-two-pipelines; Tauri's only extra is `macOSPrivateApi` killing MAS (moot for us) and the occasional `tao` patch.

---

### 8. WHAT WISPR FLOW ITSELF SHARES vs FORKS (OBS, per task context + bundle id `com.electron.wispr-flow`)

Wispr Flow is **Electron on both OSes with a shared renderer**, and forks only a **thin native helper per OS** (a **native Swift accessibility helper on macOS**; the Windows default hotkey `Ctrl+Win` implies a native low-level hook there too). So Wispr's real-world answer to "one codebase, feature-identical" is **shared Electron renderer + per-OS native helper** — i.e. essentially option (2) with a sliver of option (4). This validates the recommended pattern (shared cross-platform UI + thin native shim), and shows even the reference product does NOT do 100% shared code — it forks the OS-integration helper. Tauri lets us do the same with a smaller/cheaper shell.

---

### 9. HANDY CROSS-PLATFORM PAIN (open issues, OBS) — the residual per-OS work

- **#1682** Windows-on-ARM GPU transcription failure (per-arch ONNX/whisper backend selection: x86_64 uses vulkan/DirectML, aarch64 differs).
- **#1669** macOS Touch Bar corner white-flicker while idle (T2 MacBook) — overlay rendering quirk.
- **#1706** push-to-talk-off → recording not saved/pasted.
- **#1683** update-dialog visibility; **#1656** `.gguf` not recognized; **#1629** portable-mode model path.
- **#1661** (closed) enigo Wayland drops capitals.
- Handy's `src-tauri/src` platform-forked modules: `overlay.rs` (3 cfg branches), `shortcut/` (Tauri vs HandyKeys), `apple_intelligence.rs` (mac-only), Windows `windows 0.61.3` (`Win32_Media_Audio_Endpoints`, `Win32_UI_WindowsAndMessaging`) + `winreg 0.55` (autostart), Linux `gtk-layer-shell`. **Takeaway: even the best dual-platform reference forks ~6 platform-specific modules; "one codebase" ≠ "zero per-OS code."**

---

### 10. SCORED COMPARISON (1=poor … 5=excellent; weighted total, weights in ⟨⟩)

| Criterion ⟨weight⟩ | Tauri v2 | Electron | Flutter | Rust core + 2 native shells |
|---|---|---|---|---|
| Transparent non-activating click-through pill above fullscreen, both OSes ⟨3⟩ | **5** (Handy: NSPanel + WS_EX_NOACTIVATE) | 4 (rich APIs; Win above-FS fiddlier) | 2 (not battle-tested) | 5 (native, best fidelity) |
| Global Fn/Globe hook + suppression ⟨3⟩ | 4 (rdev/handy-keys does Fn; suppression = risk) | 3 (native node module) | 1 (all custom native) | 5 (native CGEventTap .defaultTap) |
| Keystroke/paste + AX-insert + secure-input ⟨2⟩ | 3 (enigo + hand-rolled AX) | 3 (robotjs/nut.js + native) | 2 (all via channels) | 5 (native AX, exact spec) |
| In-process ONNX/CoreML ASR + llama.cpp ⟨3⟩ | **5** (transcribe-rs + llama-cpp-2) | 3 (node modules/sidecars) | 3 (dart:ffi, all hand-rolled) | 5 (shared Rust core) |
| 60fps waveform ⟨1⟩ | 4 (webview canvas) | 4 | 5 (Skia) | 5 (native) |
| Shell binary size ⟨1⟩ | 5 (~10MB) | 2 (~150MB) | 4 (~25MB) | 4 |
| Idle memory ⟨2⟩ | 4 (low; models dominate) | 2 (~800MB in Wispr) | 3 | 5 (lowest) |
| Auto-update, one mechanism both OSes ⟨2⟩ | **5** (tauri-updater latest.json) | 4 (Squirrel×2) | 3 (immature) | 3 (Sparkle+Win, 2 pipelines) |
| Code-signing friction ⟨1⟩ | 3 (MAS-out via privateApi; Azure) | 4 | 3 | 3 (2 pipelines) |
| ONE codebase / dev velocity / parity ⟨3⟩ | **5** (Handy = feature-identical) | 4 (Wispr's model) | 3 (Dart UI shared, integ native) | 2 (Swift+C# = 2 UI codebases) |
| Proven reference for THIS exact app ⟨2⟩ | **5** (Handy, dual-platform, MIT) | 5 (Wispr itself) | 2 (none) | 3 (uniffi mature; cs-bindgen less) |
| **Weighted total (/125)** | **≈108** | **≈89** | **≈63** | **≈95** |

Tauri wins on the two decisive, highest-weight axes (**single codebase + in-process ML**) plus the proven dual-platform pill. Option-4 wins raw fidelity but loses ~13 points almost entirely to the two-UI-codebase penalty against the explicit "ideally ONE codebase" mandate. Electron is the safe, heavy middle. Flutter is disqualified by system-integration gaps.

---

### 11. MAPPING THE EXISTING MAC SPEC ONTO TAURI (what changes, what survives)

| Mac spec artifact | Tauri realization |
|---|---|
| NSPanel recipe §A (borderless, nonactivatingPanel, level `.statusBar`=25, collectionBehavior canJoinAllSpaces+fullScreenAuxiliary+ignoresCycle, ignoresMouseEvents, canBecomeKey=false) | **`tauri-nspanel` `PanelBuilder`**: `PanelLevel::Status`, `borderless().nonactivating_panel()`, `can_join_all_spaces().full_screen_auxiliary()` (+`.ignores_cycle()`), `no_activate(true)`, `focusable(false)`, `transparent(true)`, shadow off. **Identical primitive, reached via plugin.** Windows twin: `focusable(false)`→`WS_EX_NOACTIVATE` + `always_on_top` + `SetWindowPos(HWND_TOPMOST,…NOACTIVATE)`. |
| CGEventTap recipe (Fn keyCode 63 / `maskSecondaryFn`, `.defaultTap` suppression, dedicated runloop, 5s health watchdog, stale-key watchdog) | Baseline via **`rdev`+`handy-keys`** (Fn token, CGEventTap under hood). For full suppression+watchdog fidelity, **thin `core-graphics`/`objc2` Rust module** calling `CGEvent::tap_create(.defaultTap)` on a dedicated thread — the Swift recipe ported to Rust FFI. Windows: `windows` crate `SetWindowsHookExW(WH_KEYBOARD_LL)`, default `Ctrl+Win`. |
| FluidAudio (Swift Parakeet CoreML) | **Replaced by `transcribe-rs` ONNX Parakeet TDT 0.6B + `ort` w/ `ort-coreml` EP (mac) / DirectML (win)** — same model, in-process, cross-platform. |
| Qwen3-4B cleanup via llama.cpp | **`llama-cpp-2` 0.1.151** in the Rust core, `metal`(mac)/`vulkan`(win) features, GGUF in-process. Claude Haiku toggle = `reqwest` HTTPS (`x-api-key`+`anthropic-version`). |
| Clipboard paste + `changeCount`-guarded restore + AX-insert fast path + secure-input toast + chunked paste (§text-insertion) | `tauri-plugin-clipboard-manager` + `enigo` for the common path; **hand-rolled `objc2`/`core-foundation` module for AX `kAXSelectedTextAttribute` insert + `IsSecureEventInputEnabled()` + chunked paste** (not in enigo). Windows twin via `windows` crate UIAutomation/SendInput. |
| Menu-bar `NSStatusItem`, activationPolicy `.accessory` | Tauri `tray-icon` feature (`tauri 2.11.5` enables it) + `ActivationPolicy::Accessory`. |
| Launch at login (SMAppService) | `tauri-plugin-autostart` 2.5.1 (SMAppService mac / `winreg` Run key win). |
| Permissions (Mic/Accessibility/Input-Monitoring) | `tauri-plugin-macos-permissions` 2.3.0 (check/request); Input-Monitoring quit-relaunch prompt unchanged. |
| Sparkle EdDSA appcast | Replaced by `tauri-plugin-updater` `latest.json` (both OSes, one mechanism). |
| 60fps waveform (TimelineView/Canvas) | `rustfft` levels → React `<canvas>` in WKWebView/WebView2. |

**Net:** ~80% of the Mac spec's *behavior* survives; the *implementations* move from Swift/AppKit to Rust crates + a small `objc2`/`windows`-crate native shim layer, and FluidAudio→ONNX-Parakeet is the one model-runtime substitution. The batch-finalize pipeline (record→ASR→LLM cleanup→inject) is unchanged. Add a Windows twin for each native shim (WS_EX_NOACTIVATE, WH_KEYBOARD_LL, UIAutomation/SendInput, registry autostart).

---

### 12. KEY RISKS / OPEN ENGINEERING QUESTIONS FOR TAURI PATH
1. **rdev `grab()` Fn-suppression reliability on macOS** — does it suppress the bare-Fn Globe action and survive `kCGEventTapDisabledByTimeout`? If not, fall back to a direct `objc2`/`core-graphics` CGEventTap module (the escape hatch). Highest technical risk. (INF)
2. **AX-insert + secure-input parity** — not covered by enigo; must write ~200 lines of `objc2` AX FFI (mac) + UIAutomation (win). (INF)
3. **`tao` patch dependency** — Handy pins a tao rev for windowing; overlay behavior may need tracking upstream tao fixes. (OBS)
4. **ANE optimality** — ONNX-Parakeet via ort-coreml is slightly less ANE-efficient than native FluidAudio; benchmark on M4 Pro to confirm the batch-finalize latency budget still holds. (INF)
5. **Webview transparency + click-through interaction on Windows 11** — tauri #7328 reports taskbar-overlay artifacts with transparency+fullscreen on Win11; validate on real hardware. (OBS)

Escape hatch philosophy: Tauri does not force purity — Handy ships 6 `#[cfg]` platform modules and Wispr ships an Electron renderer + Swift helper. **Adopt the same discipline: shared Rust+React by default, thin native modules (objc2 / `windows` crate / optional Swift sidecar) only for CGEventTap-suppression, AX-insert, and secure-input.** This captures ~90% of option-4's fidelity at ~1× the codebase cost.

## Open questions
- Does rdev grab() on macOS reliably suppress the bare-Fn/Globe system action AND recover from kCGEventTapDisabledByTimeout, or must FlowSpeak ship a direct objc2/core-graphics CGEventTap module for Fn PTT? (highest technical risk for the Tauri path)
- Measured M4 Pro latency of ONNX-Parakeet-via-ort-coreml vs native FluidAudio CoreML for the batch-finalize budget — is the ANE-optimality loss acceptable?
- Exact tauri-nspanel v2.1 PanelLevel enum raw values and whether it exposes ignores_cycle() collection behavior (level.rs fetch 404'd; Status=25 confirmed via overlay.rs usage)
- Windows 11 transparency+click-through+above-fullscreen artifact severity (tauri #7328) on real hardware
- Does tauri-plugin-clipboard-manager expose changeCount-equivalent guarding, or must clipboard save/restore be hand-rolled per-OS?
- License of FluidAudio is moot if switching to transcribe-rs/ort — but confirm transcribe-rs and transcribe-cpp own licenses (README acknowledged NVIDIA/Mozilla contributions but did not state SPDX)

## Sources
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/Cargo.toml
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/tauri.conf.json
- https://github.com/cjpais/Handy/tree/main/src-tauri/src
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/overlay.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/input.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/shortcut/tauri_impl.rs
- https://github.com/cjpais/Handy/tree/main/src-tauri/src/shortcut
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/shortcut/mod.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/AGENTS.md
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/Entitlements.plist
- https://github.com/ahkohd/tauri-nspanel
- https://raw.githubusercontent.com/ahkohd/tauri-nspanel/v2.1/README.md
- https://v2.tauri.app/learn/window-customization/
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/plugin/global-shortcut/
- https://github.com/tauri-apps/tauri/issues/13070
- https://github.com/tauri-apps/tauri/issues/11488
- https://github.com/tauri-apps/tauri/issues/5793
- https://github.com/tauri-apps/tauri/issues/7328
- https://github.com/tauri-apps/tauri/issues/9439
- https://www.electronjs.org/docs/latest/api/browser-window
- https://pub.dev/packages/window_manager
- https://raw.githubusercontent.com/leanflutter/window_manager/main/README.md
- https://raw.githubusercontent.com/cjpais/transcribe-rs/main/README.md
- https://github.com/utilityai/llama-cpp-rs
- https://docs.rs/crate/llama-cpp-2/latest/features
- https://github.com/NordSecurity/uniffi-bindgen-cs
- https://github.com/cjpais/Handy/issues/1682
- https://github.com/cjpais/Handy/issues/1669
- https://github.com/cjpais/Handy/issues/1706
- https://github.com/cjpais/Handy/issues/1661
- https://crates.io/crates/transcribe-rs
- https://crates.io/crates/tauri-plugin-macos-input-monitor
