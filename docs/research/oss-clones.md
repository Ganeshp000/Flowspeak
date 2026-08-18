# Track: v2:fe71269e79dc1c30dd1276be486a0d305c083eb2755ef989fd32660f98e40d02

## TRACK: Teardown of OSS Wispr Flow alternatives — reuse legality + implementation facts

Confidence tags: **OBS** = observed in a primary source (file/issue/doc); **INF** = inferred. All source files were read for spec/behavior extraction only (no code copied), consistent with the "re-implement from scratch" rule.

---
### 0. TL;DR MASTER TABLE (stack + license + reuse verdict)

| Repo | Lang / UI stack | ASR | Local LLM cleanup | License | Can we lift CODE into a closed-source / source-available commercial app? |
|---|---|---|---|---|---|
| **Handy** (cjpais/Handy) | Rust + Tauri 2.x, React+TS+Tailwind, Zustand | whisper.cpp (`transcribe-cpp`) + ONNX (`transcribe-rs`: Parakeet/Moonshine/SenseVoice/Canary/GigaAM/Cohere) | Yes — generic OpenAI/Anthropic/Ollama post-process (`llm_client.rs`) | **MIT** (OBS) — *but* name/logo/icon/brand NOT open (OBS, README) | **YES, legally** (MIT). Must reproduce MIT license text + copyright; must NOT reuse the "Handy" brand assets. |
| **VoiceInk** (Beingpax/VoiceInk) | **Swift + SwiftUI/AppKit, native macOS 14.4+** | whisper.cpp (`LibWhisper.swift`) + FluidAudio/Parakeet + Apple Speech + cloud | Yes — Ollama (`OllamaService`+LLMkit), Anthropic, OpenAI-compat, local CLI (`AIEnhancementService`) | **GPL-3.0** (OBS, LICENSE) | **NO.** GPLv3 is copyleft: any derivative that ships must itself be GPLv3 open-source. Cannot go into closed-source or a non-GPL source-available product. **Read-only reference for specs/behavior; copy zero lines.** |
| **Whispering** (EpicenterHQ/epicenter, `apps/whispering`) | Svelte 5 + SvelteKit + Tauri, Bun; also runs as browser SPA | Cloud (Groq/OpenAI/ElevenLabs) + local via Speaches / on-device GGUF (Epicenter only) | Transformations pipeline (provider-agnostic) | **AGPL-3.0** (OBS, LICENSE, © 2023-2026 Braden Wong) | **NO — worst case.** AGPL adds the network/SaaS clause; even hosted use triggers source disclosure. Read-only reference only. (Note: a `epicenter-md/epicenter` mirror is reported MIT — treat the canonical EpicenterHQ AGPL as authoritative.) |
| **OpenSuperWhisper** (starmel/OpenSuperWhisper) | **Swift + SwiftUI/AppKit, native macOS**, Xcode project | whisper.cpp (vendored `Whis/*` bindings) + FluidAudio/Parakeet (`Engines/FluidAudioEngine.swift`) | None built-in (transcription only) | **MIT** (OBS) | **YES, legally** (MIT). Best copyable native-Swift skeleton. |
| **OpenWhispr** (OpenWhispr/openwhispr) | Electron 41 + React 19 + TS + Tailwind v4 + shadcn/ui, better-sqlite3, Node 24+ | whisper.cpp + sherpa-onnx (Parakeet) | Cloud BYOK (LLM providers) | **MIT** (OBS) | **YES, legally** (MIT). Wrong UI stack (Electron) for us. |

**Key legal takeaway for FlowSpeak (closed-source-capable, native macOS):** the two repos whose architecture matches us best split on license — **VoiceInk (the ideal architectural twin) is GPLv3 and therefore code-untouchable**; **OpenSuperWhisper (MIT) is the copyable native-Swift skeleton**. Handy/OpenWhispr are MIT but wrong UI stack. Practical plan: **lift MIT code from OpenSuperWhisper + Handy; mine VoiceInk only for design/behavioral specs.**

Dependency licenses relevant to our stack (INF unless noted): whisper.cpp = MIT; sherpa-onnx = Apache-2.0; Silero VAD = MIT; KeyboardShortcuts (Sindre Sorhus) = MIT; `enigo` = MIT/Apache-2.0; `rdev` = MIT; `cpal` = Apache-2.0; FluidAudio = Apache-2.0 (INF — verify). All permissive → safe.

---
### 1. GLOBAL HOTKEY, incl. Fn/Globe HOLD (the hardest UI primitive)

**Critical fact (INF, strong):** the Fn/Globe key **cannot** be registered through Carbon `RegisterEventHotKey` or the popular `KeyboardShortcuts` library (which wraps Carbon hotkeys) — those only see standard keys+modifiers. Wispr Flow's "hold Fn to talk" therefore **requires a CGEventTap on `flagsChanged`**. Only OpenSuperWhisper does this correctly among the natives.

- **OpenSuperWhisper — `ModifierKeyMonitor.swift` (OBS, MIT, COPYABLE — the exact primitive we need):**
  - API: `CGEventTap` (`CGEvent.tapCreate`) at `.cgSessionEventTap` / `.headInsertEventTap`, listen-only, mask = `CGEventMask(1 << CGEventType.flagsChanged.rawValue)`.
  - **Fn/Globe detection:** keyCode `63` (UInt16); `CGEventFlags.maskSecondaryFn`; `NSEvent.ModifierFlags.function`.
  - Hold down/up = flag-presence transition: down when `flags.contains(cgFlag)` becomes true while `isModifierPressed==false` → `onKeyDown`; up on the inverse → `onKeyUp`.
  - Also supports L/R Command/Option/Shift/Control as modifier-only PTT triggers (keycodes 54–62).
  - `ShortcutManager.swift` (OBS): three mutually-exclusive trigger modes — Mouse button (`MouseButtonMonitor`) > Modifier-only (`ModifierKeyMonitor`) > regular `KeyboardShortcuts` (default binding = ` ` ` + Option). Hold-to-record threshold `holdThreshold = 0.3s` via delayed `DispatchWorkItem`; toggle mode otherwise; double-press detection uses `NSEvent.doubleClickInterval`. "Tear all down, enable exactly one."
- **VoiceInk — `RecordingShortcutManager.swift` (OBS, GPL, ref-only):** `NSEvent.addGlobalMonitorForEvents(matching:)` + custom `ShortcutMonitor`; hybrid hold/tap threshold `hybridPressThreshold = 0.5s`, `shortcutPressCooldown = 0.5s`; `.pushToTalk` mode toggles on keyDown / off on keyUp regardless of duration. Fn handled via a separate modifier path (not shown in this file). Uses `KeyboardShortcuts` (Sindre) for standard-key bindings.
- **Handy — `shortcut/handy_keys.rs` + `shortcut/tauri_impl.rs` (OBS, MIT):** cross-platform via `rdev` crate + custom `handy-keys` lib; hotkeys parsed from strings ("option+space"); **FN IS a supported modifier token** (`handy_keys::Modifiers::FN` → `"fn"`), combinable with other keys; hold represented via `HotkeyState::Pressed` + `is_key_down` bool in `FrontendKeyEvent`. On macOS `rdev` uses a CGEventTap under the hood. No Globe-only special case.

**Permission gate (OBS/INF):** CGEventTap creation + synthetic event injection both require **Accessibility** (`AXIsProcessTrusted()` / TCC). Mic needs Microphone permission; screen-context needs Screen Recording.

---
### 2. TEXT INSERTION INTO FRONTMOST APP (exact APIs)

**Dominant pattern across ALL apps: put text on `NSPasteboard.general`, synthesize Cmd+V, then restore the old clipboard.** Direct per-character typing is the fallback for apps where paste fails (remote desktop, some agents).

- **OpenSuperWhisper — `Utils/ClipboardUtil.swift` (OBS, MIT, COPYABLE — cleanest reference):**
  - Save clipboard by type (string/data/URLs); **restore only if `NSPasteboard.general.changeCount` unchanged** (prevents clobbering user copies) — the correct guard.
  - Paste = `CGEvent(keyboardEventSource:virtualKey:keyDown:)` with `.maskCommand`, posted to `.cghidEventTap`.
  - **V-keycode resolution (important, layout-safe):** hardcoded `qwertyKeyCodeV = 9` for QWERTY-⌘ layouts (e.g. "Dvorak - QWERTY ⌘"); else `UCKeyTranslate()` scans keycodes 0–50 to find "v" in the current layout; Cyrillic/non-Latin → fall back to keycode 9.
  - Timing: `clipboardRestoreDelay = 1.5s` (1500 ms) before restoring; `usleep(100000)` (100 ms) after input-source switch.
- **VoiceInk — `Paste/CursorPaster.swift` + `ClipboardManager.swift` + `PasteMethod.swift` (OBS, GPL, ref-only):**
  - Two methods behind a `PasteMethod` enum. **CGEvent primary:** source `.privateState`, virtual keys `0x37`=Cmd, `0x09`=V, sequence Cmd↓ V↓ V↑ Cmd↑, `pasteShortcutEventDelay = 10ms` between events, post `.cghidEventTap`; gated on `AXIsProcessTrusted()`. **AppleScript fallback:** `NSAppleScript` `keystroke "v" using command down` / `key code 9 using command down`; layout detected via `TISCopyCurrentKeyboardInputSource` + `TISGetInputSourceProperty`.
  - Delays: pre-paste 100 ms (clipboard settle); restore ≥250 ms.
  - Does **not** explicitly handle secure-input fields.
- **Handy — `input.rs` (OBS, MIT):** `enigo` crate, four strategies: (1) `enigo.text()` direct Unicode input; (2) Ctrl/Cmd+V; (3) Ctrl/Cmd+Shift+V (terminals); (4) Shift+Insert. macOS keys `Key::Meta`+`Key::Other(9)`; 100 ms sleep before release. Linux X11 `xdotool`, Wayland `wtype`/`dotool`.
- **OpenWhispr:** "automatic pasting" (library unnamed; Electron → likely nut.js/robotjs + clipboard; INF).

---
### 3. AUDIO CAPTURE

- **OpenSuperWhisper — `AudioRecorder.swift`/`MicrophoneService.swift` (INF native AVFoundation).**
- **VoiceInk — `CoreAudioRecorder.swift` (OBS):** raw **CoreAudio AUHAL** (`kAudioUnitSubType_HALOutput`, `AudioComponentInstanceNew`, `AudioUnitRender`). Device-native Float32 multichannel → **16 kHz mono Int16** with linear-interpolation resample; lock-free ring buffer (96 slots, `maxFramesPerRender=4096`), render on the audio thread with no allocation. No system media-control (does not pause music) in this file — media control lives in `MediaController.swift`.
- **Handy — `audio_toolkit/audio/recorder.rs` (OBS):** `cpal` capture + `rubato` resample to 16 kHz; Silero VAD (`vad-rs`, ONNX) filters silence before ASR.

**Spec for us:** ASR needs **16 kHz mono float32**. whisper.cpp expects PCM f32 normalized to [-1,1]. Plan a resampler from the M4's 48 kHz mic.

---
### 4. ASR ENGINE — streaming vs chunked + model catalogs

- **VoiceInk — `WhisperTranscriptionService.swift` (OBS):** **whole-buffer / batch**, not streaming. Flow: load `WhisperContext` → read all samples → `setLanguage` → `setPrompt(context.prompt)` (maps to whisper.cpp `initial_prompt`) → `fullTranscribe(samples:)` → `getTranscription()`. Vendored bindings in `Transcription/Whisper/LibWhisper.swift`; VAD via `VADModelManager` + bundled `ggml-silero-v5.1.2.bin`.
- **Handy — `managers/transcription.rs` (OBS):** **dual path** — `start_stream()` streaming (partial `StreamTextEvent`, live preview) for streaming-capable ONNX models, else batch `transcribe()` (`Vec<f32>` → `session.run`). Engine enum `LoadedEngine`: `TranscribeCpp` (whisper) vs ONNX (Parakeet/Moonshine/SenseVoice/GigaAM/Canary/Cohere). Post-process: `post_process_transcription_text()` → `apply_custom_words()` (fuzzy correction) → `filter_transcription_output()` (filler removal). **This file does NOT insert text — it only emits events; insertion is `input.rs`.**

**VoiceInk model registry (`TranscriptionModelRegistry.swift`, OBS) — names + sizes + engine:**
| Model | Size | Engine |
|---|---|---|
| Apple Speech | native | Apple |
| Parakeet V2 / V3 / Unified | 474 MB / 494 MB / 1.2 GB | FluidAudio |
| Nemotron Latin / Multilingual | 620 / 672 MB | FluidAudio |
| whisper tiny(.en) | 75 MB | whisper.cpp |
| whisper base(.en) | 142 MB | whisper.cpp |
| whisper large-v2 / v3 | 2.9 GB | whisper.cpp |
| whisper large-v3-turbo | 1.5 GB | whisper.cpp |
| whisper large-v3-turbo-q5_0 | 547 MB | whisper.cpp |

**Handy catalog (`catalog/catalog.json`, generated 2026-07-01, OBS) — carries speed/accuracy scores** (0–100). Highlights for an M4 Pro local target: `parakeet-tdt-0.6b-v2` 730 MB speed 85/acc 89; `parakeet-tdt-0.6b-v3` 740 MB speed 79 (25 langs); `whisper-large-v3-turbo` 886 MB; `whisper-large-v3` 1669 MB; `moonshine-base` 77 MB speed 99/acc 80; `moonshine-streaming-small/medium` (streaming) acc 84/87; `nemotron-3.5-asr-streaming-0.6b` 751 MB (28 langs, streaming); `canary-1b-flash` 1048 MB acc 90; heavy `Voxtral-Small-24B` 25.8 GB. Sweet spot for us: **Parakeet v2/v3 (fast CPU/ANE) or whisper-large-v3-turbo (quality)**.

---
### 5. FLOATING RECORDER UI (window type + geometry)

- **OpenSuperWhisper — `IndicatorWindowManager.swift` (OBS, MIT, COPYABLE — canonical floating-pill recipe):**
  - Class **`NSPanel`**; `styleMask = [.borderless, .nonactivatingPanel]`; **`level = .statusBar`**; `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]`; `isFloatingPanel=true`, `backgroundColor=.clear`, `isOpaque=false`, `hasShadow=false`, **`ignoresMouseEvents=true`** (click-through), `hidesOnDeactivate=false`.
  - Card `200×36`, window `256×96`, appear offset 20; positions "card bottom 20 pt above cursor" (cursor-anchored) or "100 pt from top-center"; bounds-clamped.
  - Layer-level `CASpringAnimation` on transform/opacity (avoids SwiftUI re-rasterization).
- **VoiceInk pill — `MiniRecorderView.swift` + `MiniRecorderPanel.swift` (OBS, GPL, ref-only for STATE MACHINE + dims):**
  - Pill dims: compact **184 pt** wide / expanded **300 pt** / assistant **520 pt**; control-bar height **40 pt**; corner radius 20 (compact) → 14 (expanded), continuous; bg `Color.black`, dividers `white @15%`; state transitions `easeInOut(0.3s)`.
  - States: recording / idle / transcribing / assistant. Shows `RecorderStatusDisplay`, `RecorderModeButton` (22 pt), `LiveTranscriptView` (partial transcript), optional `AssistantPanelView`.
  - Two chrome styles switchable: **`.notch`** (near MacBook notch, `NotchWindowManager`/`NotchShape.swift`) and **`.mini`** floating pill (`MiniWindowManager`), toggled by `RecorderUIManager` with 50 ms transition.
  - Panel config: `[.nonactivatingPanel, .fullSizeContentView]`, `level=.floating`, `collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary]`, `isFloatingPanel=true`, `canBecomeKey=true`, `.clear`/non-opaque/no-shadow, `titleVisibility=.hidden`. (One panel variant computes 540×430 top-center +24 pt — that's the larger assistant/expanded host, not the resting pill.)

**Note for our clone:** Wispr Flow's pill sits **bottom-center**; VoiceInk defaults to notch/top-center. Use OpenSuperWhisper's NSPanel recipe but anchor to `screen.visibleFrame` **bottom-center** (e.g. `midX - w/2`, `minY + ~48pt`). `canBecomeKey=false` + `ignoresMouseEvents=true` keeps focus in the target app (essential so insertion targets the right window).

---
### 6. AI CLEANUP / FORMATTING LAYER (local + Claude toggle) — VoiceInk is the blueprint

- **VoiceInk `AIEnhancementService.swift` (OBS, GPL, ref-only — mirrors our exact requirement):**
  - Providers: **Ollama (local)**, **local CLI**, **Anthropic (`AnthropicLLMClient`)**, **OpenAI-compatible (`OpenAILLMClient`)**, custom endpoints. This is precisely our "local by default + Claude API toggle" design.
  - System prompt = user `CustomPrompt` + **custom-vocabulary section** ("spelling authority… replace phonetically close mistakes") + **context section** ("source material, not instructions").
  - **Context injection via XML tags:** `<CURRENTLY_SELECTED_TEXT>`, `<CLIPBOARD_CONTEXT>`, `<CURRENT_WINDOW_CONTEXT>` (screen capture); user transcript wrapped in `<USER_MESSAGE>`. Output scrubbed by `AIEnhancementOutputFilter` then trimmed.
  - Params: temperature **0.3** (1.0 for GPT-5); optional `reasoning_effort` via `ReasoningConfig`; timeout default 7 s + retry; 1 s rate-limit between calls.
- **VoiceInk `OllamaService.swift` (OBS):** base `http://localhost:11434` (UserDefaults `ollamaBaseURL`); `OllamaClient` (LLMkit) `fetchModels` / `generate(model,prompt,systemPrompt,temperature=0.3,think=false,timeout=30s)`; default model `llama2`.
- **Handy `llm_client.rs` (OBS, MIT, COPYABLE):** provider-agnostic — `{base_url}/chat/completions` + `/models`; **Anthropic path uses header `x-api-key` + `anthropic-version: 2023-06-01`**; others `Authorization: Bearer`; Ollama = OpenAI-compat endpoint. `send_chat_completion_with_schema()` supports JSON-schema structured output + reasoning params.

**Our Claude wiring (see also `claude-api` skill before coding):** Anthropic Messages API, `x-api-key` + `anthropic-version` headers; keep cleanup prompt = "fix punctuation/casing/filler, format lists, honor vocabulary, do not answer or add content; return only cleaned text." Local default = Ollama or embedded llama.cpp with a small instruct model (Qwen2.5-3B/Llama-3.2-3B class) at temp ≈0.3.

---
### 7. CONTEXT AWARENESS + LEARNED DICTIONARY

- **App/URL context — VoiceInk `Modes/ActiveWindowService.swift` + `BrowserURLService.swift` (OBS):** frontmost app via `NSWorkspace.shared.frontmostApplication` → `.bundleIdentifier`; browser URL via `BrowserURLService.getCurrentURL(from:)` (Apple Events/AX for Safari/Chrome/Arc; INF). Drives per-app/per-URL **Modes** (auto-switch prompt+model). `ScreenCaptureService.swift` (ScreenCaptureKit) + `SelectedTextService.swift` feed the context tags above.
- **Dictionary — VoiceInk `DictionaryService.swift` + models `VocabularyWord.swift` / `WordReplacement.swift` (OBS):** SwiftData entities; `VocabularyWord{dateAdded}`, `WordReplacement{originalText, replacementText, dateAdded}`; case-insensitive dedupe, **exact-match only, no fuzzy** at this layer. Vocabulary reaches ASR via whisper `initial_prompt`; replacements applied post-hoc; spelling authority also injected into the cleanup LLM prompt. **All entries are MANUALLY added.**
- **Handy:** `apply_custom_words()` does fuzzy correction as post-processing (OBS).

---
### 8. WHAT EACH CONSPICUOUSLY LACKS vs WISPR FLOW

Wispr Flow baseline (OBS, wisprflow.ai/features + reviews): auto-edit (filler removal, list/punctuation formatting, "figures out what you meant"), context spelling of uncommon names, **auto-learned dictionary** (corrected spellings auto-added), Command Mode, Whisper Mode (whispered speech), Course Correction (mid-sentence fixes), cross-device sync of dictionary/snippets, cloud latency <700 ms p99 (Baseten) / ~1–2 s felt, 100+ languages, **cloud-only, no offline**.

- **Auto-learned dictionary (biggest gap):** Wispr auto-adds from your corrections. **None** of the OSS apps auto-learn — VoiceInk/Handy require manual vocab entry. INF: FlowSpeak can beat them here by diffing final-edited text vs inserted text and auto-proposing vocab.
- **Formatting/cleanup quality:** entirely dependent on the cleanup LLM. Local small models (llama2/3B) give weaker list/punctuation formatting than Wispr's tuned cloud model. VoiceInk has the richest context plumbing but it's **off by default**. Handy's post-process is regex/fuzzy-lite. OpenSuperWhisper/OpenWhispr have essentially **no formatting layer**.
- **Real-time word-by-word streaming:** VoiceInk whisper = whole-buffer (feels laggy on long dictation); only Handy + streaming ONNX models (Moonshine/Nemotron streaming) show live partials. Wispr streams.
- **Course-correction / Command mode:** absent everywhere (VoiceInk's "Assistant" panel is adjacent, not equivalent).
- **Cross-device sync:** all OSS apps are local-only; no sync of dictionary/snippets.
- **Whisper Mode (whispered audio):** none special-cases quiet/whispered speech.
- **Onboarding/permission polish:** OSS apps have rough TCC/Accessibility onboarding (see issues).

FlowSpeak's inherent edge: fully local by default (privacy + zero latency/cost) with a Claude toggle — matching Wispr's quality only when the cloud toggle is on, an acceptable tradeoff on an M4 Pro/24 GB (can run whisper-large-v3-turbo + a 3B cleanup model comfortably).

---
### 9. NOTABLE OPEN ISSUES = the hard problems to design around (OBS)

**Secure input / injection reliability (macOS-relevant):**
- **VoiceInk #737** (open): `CursorPaster.pasteUsingAppleScript()` crashes on **macOS 26** — `EXC_BREAKPOINT dispatch_assert_queue_fail` (must run paste on the main queue). *(We target 15.7.3 so avoid the 26 API but heed the main-thread rule.)*
- **VoiceInk #735** (open): global shortcut broken on macOS 26.
- **VoiceInk #758** (open): Direct-Typing paste fails in **Remote Desktop** sessions.
- **VoiceInk #761** (open): long paste **collapses into a placeholder in terminal AI agents (Claude Code)** → fix = opt-in **"Paste in Chunks"** (sizes 250/500/750/1000, default 250), whitespace/newline-preferred split — "mirrors the behavior Wispr Flow documents for Claude Code." **Implement chunked paste from day one.**
- **VoiceInk #803 / #785** (open): **paste target resolved at record-start vs at delivery** — "start dictating, then click the target field" breaks because the app pins the mode/target too early. Design decision: capture target window at record-start but allow re-resolve at paste-time (opt-in).
- **VoiceInk #831** (open): 5–7 s freeze when a specific app (Firestorm Viewer) has focus — synchronous AX query blocking the main thread. **Do AX/`NSWorkspace` context reads off the main thread with timeouts.**
- **VoiceInk #776** (open): users want transcription without granting Accessibility (paste-only-to-own-window fallback).
- **OpenSuperWhisper #141** (closed): pasting into **VMs types "V" instead of pasting** — Cmd flag/keycode race; **#129/#120/#153** clipboard race → *previous* transcription pasted / unreliable paste after window/desktop switch; **#184** missing space between sentences.
- **Handy #1661** (closed): Wayland `direct` injection **silently drops every capital letter** (enigo Shift over XTEST) — masqueraded as an ASR bug; workaround `ctrl_v`. Lesson: **verify Shift/casing survives your injection path; keep clipboard-paste as default, per-char typing as fallback.**
- **Handy #1618** (open): macOS **stale TCC/Accessibility entries after update/reinstall** silently break input automation; onboarding window loses foreground after the mic prompt. **Detect "configured but non-functional" Accessibility and offer a reset path.**
- **Handy #1706** (open): with push-to-talk off, recording isn't saved or pasted.

**Secure-input fields (password boxes / `EnableSecureEventInput`) — INF:** none of the repos show handling. When a secure field is focused, the OS blocks the CGEventTap from seeing keys and can block synthetic key injection, so both Fn-tap PTT and Cmd+V paste can silently fail. FlowSpeak should detect secure-input state (`IsSecureEventInputEnabled()`) and surface a "can't type into password fields" message rather than dropping text.

---
### 10. RECOMMENDATION — best skeleton + exact files to read

**Best copyable skeleton (MIT, native Swift/AppKit, matches our OS + UI): `starmel/OpenSuperWhisper`.** It already implements, in a form we can legally lift: CGEventTap Fn/Globe hold PTT, NSPanel floating indicator, clipboard-save/paste/restore with layout-safe keycode resolution, whisper.cpp Swift bindings, and FluidAudio/Parakeet. Its gaps (no AI cleanup, no modes, no auto-dictionary) are exactly the features we add.

**Best architectural/behavioral reference (GPL — READ ONLY, copy zero code): `Beingpax/VoiceInk`.** It is the closest twin to FlowSpeak's full feature set (local ASR + Ollama/Anthropic/OpenAI cleanup toggle + screen/selected/clipboard context + modes + vocabulary + pill/notch recorder). Mine it for design decisions, prompt structure, state machine, and dimensions only.

**Secondary MIT reference: `cjpais/Handy`** for the model catalog (speed/accuracy scores), multi-engine transcription abstraction, streaming path, and provider-agnostic LLM client (incl. Anthropic headers).

**Files to open during implementation:**

*COPYABLE (MIT — OpenSuperWhisper):*
- `OpenSuperWhisper/ModifierKeyMonitor.swift` — Fn/Globe hold via CGEventTap (keyCode 63, `maskSecondaryFn`).
- `OpenSuperWhisper/ShortcutManager.swift` — mutually-exclusive trigger orchestration, 0.3 s hold threshold, double-press.
- `OpenSuperWhisper/Utils/ClipboardUtil.swift` — pasteboard save/`changeCount`-guarded restore, Cmd+V CGEvent, `UCKeyTranslate` V-keycode resolution.
- `OpenSuperWhisper/Indicator/IndicatorWindow.swift` + `IndicatorWindowManager.swift` — NSPanel `.statusBar` borderless nonactivating click-through floating pill + spring animation.
- `OpenSuperWhisper/AudioRecorder.swift`, `MicrophoneService.swift` — capture.
- `OpenSuperWhisper/Engines/{WhisperEngine,FluidAudioEngine,TranscriptionEngine}.swift`, `Whis/WhisperFullParams.swift` + `Whis/Whis.swift` — whisper.cpp bindings + params (`initial_prompt`, VAD, alignment heads).
- `OpenSuperWhisper/Utils/{FocusUtils,KeyboardLayoutProvider,AutocorrectWrapper}.swift`; `PermissionsManager.swift` (TCC handling).

*COPYABLE (MIT — Handy, Rust — port ideas not code verbatim if we stay Swift):*
- `src-tauri/src/input.rs` — 4 paste strategies + platform keycodes.
- `src-tauri/src/catalog/catalog.json` — model catalog w/ speed/accuracy.
- `src-tauri/src/managers/transcription.rs` — streaming vs batch, `apply_custom_words` fuzzy + filler filter.
- `src-tauri/src/llm_client.rs` — Anthropic/OpenAI/Ollama cleanup client.
- `src-tauri/src/audio_toolkit/vad/silero.rs` — Silero VAD.

*READ-ONLY REFERENCE (GPL — VoiceInk — specs/behavior only, do NOT copy):*
- `VoiceInk/Paste/{CursorPaster,ClipboardManager,PasteMethod}.swift` — paste-method enum + AppleScript fallback + chunking hooks (issue #761).
- `VoiceInk/Shortcuts/RecordingShortcutManager.swift` — hybrid 0.5 s hold/tap.
- `VoiceInk/Services/AIEnhancement/{AIEnhancementService,AIEnhancementOutputFilter}.swift` + `OllamaService.swift` — cleanup prompt, XML context tags, temp 0.3, provider switch.
- `VoiceInk/Modes/{ActiveWindowService,BrowserURLService}.swift`, `Services/{ScreenCaptureService,SelectedTextService}.swift` — context capture.
- `VoiceInk/Transcription/Whisper/{WhisperTranscriptionService,WhisperPrompt,WhisperModelManager,VADModelManager}.swift` — vocab-via-`initial_prompt`, HF download + Core ML encoder extraction.
- `VoiceInk/Models/{TranscriptionModelRegistry,VocabularyWord,WordReplacement}.swift`; `Services/{DictionaryService,KeychainService,UserDefaultsManager}.swift` — model catalog, dictionary, storage (SwiftData + UserDefaults + Keychain).
- `VoiceInk/Views/Recorder/{MiniRecorderView,MiniRecorderPanel,NotchRecorderView,NotchShape,RecorderStateProvider}.swift` — pill/notch geometry + state machine.

---
### 11. SETTINGS STORAGE + MODEL-DOWNLOAD UX (quick reference, OBS)

- **VoiceInk:** UserDefaults (prefs) + **SwiftData** (models/vocab/history) + **Keychain** (API keys). Model download: `WhisperModelManager` pulls `ggml-*.bin` from `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/` + extracts Core ML `*-encoder.mlmodelc`; progress throttled ≥0.5 s, combined 50% main + 50% Core ML; card UI in `Views/AI Models/ModelCardView.swift`. FluidAudio/Parakeet via `FluidAudioModelManager`.
- **Handy:** `tauri-plugin-store` JSON in `~/Library/Application Support/com.pais.handy/`; history in `history.db` (SQLite); models in `/models` subdir; auto-download on first-run from `handy-computer` HF org, manual install supported.
- **OpenSuperWhisper:** `AppPreferences`/UserDefaults (`Settings.swift`); Homebrew install (`brew install opensuperwhisper`); downloadable whisper + Parakeet models.
- **Whispering:** IndexedDB (browser) / Tauri app-data (desktop).
- **OpenWhispr:** `better-sqlite3`.

## Open questions
- Exact license of FluidAudio (Parakeet macOS/CoreML runtime) — reported Apache-2.0 but not directly verified; matters if we vendor it for local Parakeet on Apple Silicon.
- Whether the canonical Whispering (EpicenterHQ, AGPLv3) has any earlier MIT-licensed snapshot (braden-w/whispering) whose code could be reused — the epicenter-md/epicenter mirror is reported MIT and should be license-audited before any reuse.
- VoiceInk BrowserURLService exact mechanism (Apple Events vs AXUIElement) for reading the active browser URL per browser — not confirmed from source, only inferred.
- OpenWhispr's exact text-insertion library (nut.js vs robotjs vs AppleScript) and hotkey library — README did not disclose; would need a source-file read of the Electron main process.
- Wispr Flow's own pill exact resting position/dimensions/hex colors on macOS (bottom-center offset, size, colors) — needed to match 'exact detail'; this track covered OSS clones, not a pixel teardown of Wispr Flow itself.
- How to reliably detect and gracefully handle macOS secure-input (password) fields (IsSecureEventInputEnabled) — none of the OSS repos implement this; needs first-party design.

## Sources
- https://github.com/cjpais/Handy
- https://raw.githubusercontent.com/cjpais/Handy/main/README.md
- https://github.com/cjpais/Handy/blob/main/AGENTS.md
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/shortcut/handy_keys.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/input.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/managers/transcription.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/llm_client.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/catalog/catalog.json
- https://github.com/cjpais/Handy/issues/1661
- https://github.com/cjpais/Handy/issues/1618
- https://github.com/cjpais/Handy/issues/1706
- https://github.com/Beingpax/VoiceInk
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/README.md
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/LICENSE
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Paste/CursorPaster.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Shortcuts/RecordingShortcutManager.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Services/AIEnhancement/AIEnhancementService.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Modes/ActiveWindowService.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Transcription/Whisper/WhisperModelManager.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Transcription/Whisper/WhisperTranscriptionService.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Transcription/Whisper/WhisperPrompt.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Services/DictionaryService.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/CoreAudioRecorder.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Models/TranscriptionModelRegistry.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Services/OllamaService.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Views/Recorder/MiniRecorderView.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Views/Recorder/MiniRecorderPanel.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Views/Recorder/MiniWindowManager.swift
- https://raw.githubusercontent.com/Beingpax/VoiceInk/main/VoiceInk/Transcription/Engine/RecorderUIManager.swift
- https://github.com/Beingpax/VoiceInk/issues/737
- https://github.com/Beingpax/VoiceInk/issues/761
- https://github.com/Beingpax/VoiceInk/issues/758
- https://github.com/Beingpax/VoiceInk/issues/803
- https://github.com/Beingpax/VoiceInk/issues/831
- https://github.com/starmel/OpenSuperWhisper
- https://raw.githubusercontent.com/starmel/OpenSuperWhisper/master/OpenSuperWhisper/ModifierKeyMonitor.swift
- https://raw.githubusercontent.com/starmel/OpenSuperWhisper/master/OpenSuperWhisper/ShortcutManager.swift
- https://raw.githubusercontent.com/starmel/OpenSuperWhisper/master/OpenSuperWhisper/Utils/ClipboardUtil.swift
- https://raw.githubusercontent.com/starmel/OpenSuperWhisper/master/OpenSuperWhisper/Indicator/IndicatorWindow.swift
- https://raw.githubusercontent.com/starmel/OpenSuperWhisper/master/OpenSuperWhisper/Indicator/IndicatorWindowManager.swift
- https://github.com/EpicenterHQ/epicenter
- https://raw.githubusercontent.com/EpicenterHQ/epicenter/main/apps/whispering/README.md
- https://raw.githubusercontent.com/EpicenterHQ/epicenter/main/apps/whispering/LICENSE
- https://github.com/OpenWhispr/openwhispr
- https://raw.githubusercontent.com/OpenWhispr/openwhispr/main/README.md
- https://wisprflow.ai/features
- https://spokenly.app/blog/wispr-flow-review
- https://tldv.io/blog/wisprflow/
