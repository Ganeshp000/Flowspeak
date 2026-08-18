# Track: v2:6061c33be164ccf81f612802f1b4e697580f8dc66915309929a6827949e682b8

## VERDICT SUMMARY (all four questions)

| Q | Wispr Flow behavior | Confidence |
|---|---|---|
| **(1) Hands-free/locked: incremental or only-at-end?** | Text is inserted **ONLY at the end**, all-at-once, when the user clicks the checkmark (✓) or re-presses the hands-free shortcut. **No incremental/streaming insertion** into the target field during the session. Internally the server chunks audio for the formatting pass, but the *paste* is a single event at finish. | OBSERVED |
| **(2) Push-to-talk: any live/partial before release?** | **Nothing before release.** Hold key → speak (waveform only) → release → transcribe+format → paste. No partial text in pill or target field until release. | OBSERVED |
| **(3) Does the Flow Bar render live TEXT during recording?** | **No.** During recording the Flow Bar shows only a **live audio waveform** (moving white bars) + Cancel (X) + Done (✓). No live text preview — desktop *and* iOS Notes both show waveform only. | OBSERVED |
| **(4) Very long dictation: one delay at end, or streamed?** | **One processing step at the end** → single paste. Internally chunked/formatted server-side, but user-visibly it is buffer-to-end then paste-once, with a possible "Taking longer than usual" delay. Not streamed to the field. | OBSERVED |

---

## WISPR FLOW — DETAILED

### Push-to-talk (hold) mode — Q2
- **OBSERVED** (docs "Starting your first dictation", via search): "press and hold while speaking with the bubble showing a **waveform** recording indicator, and when you release, Flow then transcribes." Text appears **only after release**, not while speaking.
- **OBSERVED** (podfeet.com review, Scott Willsey / Allison Sheridan, 2026-03): *"Wispr Flow doesn't show you a transcription as you're talking. This is the opposite of the way the built-in [Apple] dictation works."* Reviewer notes this is deliberate — you can't see interim text, only a small "lozenge" indicator "showing that it's hearing my voice."
- Default push-to-talk key = **Fn** (hold) or **double-tap Fn** for hands-free. Reviewer remapped to hold **right-Command**.
- **Established latency** (from your brief, consistent with sources): cloud ASR+LLM+network ≈ **~700ms** after release; text pastes all-at-once (clipboard paste — see "Fix text not pasting after dictation" article).

### Hands-free / locked mode — Q1
- **OBSERVED** (docs "Use Flow hands-free" 6391241694): Activate by pressing push-to-talk key **twice quickly** (double-tap), or shortcut **Fn+Space** (Mac) / **Ctrl+Win+Space** (Win), or click the Flow Bar. Enables continuous listening with no key held.
- **Finish controls:** **checkmark (✓)** = stop + transcribe + paste transcript into active field; **X (cancel)** = discard without pasting. In hands-free, clicking the waveform/bar body does nothing — must use ✓ / X or re-press shortcut.
- Docs phrase it as *"your text pastes when you're done"* — **all-at-once at finish**, no evidence of mid-session insertion into the field.
- **Session limits (OBSERVED, docs 4841123325 "Longer dictation sessions — now up to 20 minutes"):** max **20 minutes** (Mac/Win); in-app warning at **19-minute** mark ("less than a minute left"); at 20 min the session **auto-stops and the transcription is submitted**. Quote: *"Flow ends the session, transcribes what you said, and pastes it into your active text field."* → transcription occurs **after** session ends; inserted **all at once**.

### Flow Bar visual states — Q3
- **OBSERVED** (docs "Navigating the Wispr Flow App" 5096240724): Recording state shows **"a live waveform"** + **Cancel** and **Stop/Done** controls. Docs explicitly do **NOT** mention any live text preview on the Flow Bar. Waveform area is *"a visual indicator only — it doesn't respond to taps."*
- Idle = small floating "lozenge"/bubble at bottom of screen (expands on hover). Recording = bubble **expands** to show **Cancel (X) + waveform + Done (✓)**.
- **Move-and-dock (OBSERVED):** drag bubble → drop zones appear on **bottom, left, right** edges → release to snap; **Esc** cancels drag; position persists across launches. When docked to a **side edge** the bar **reorients vertically** and the waveform/pickers/tooltips reflow to vertical.
- **iOS Notes exception check:** an early search snippet claimed "Flow shows your words as it transcribes on iOS," but the **direct article fetch** (docs 3529886556 "Using Notes in Wispr Flow for iOS") contradicts it: *"A waveform animation confirms Flow is recording"* — **waveform only, no live text**. So: **no live text preview on any surface**; the waveform is the sole live feedback.

### Long-dictation processing internals — Q4
- **OBSERVED** (docs "Fix Taking longer than usual" 4984532368, via search summary): *"For longer sessions, Flow processes text in **chunks**. If an issue occurs at the end of that process, Flow pastes either the full unformatted transcript or a combination of the formatted portion and the raw remainder."* Also: *"dictations over roughly 30 seconds could result in the end of text being silently dropped if a formatting step failed on the **last chunk**"* (since fixed).
- **INTERPRETATION (INFERRED, high confidence):** Wispr Flow **does chunk audio internally** for the server-side ASR + LLM-formatting pipeline (so it isn't a single monolithic pass over 20 min of audio), BUT the **user-facing insertion is still one paste at the end**. The chunking is a backend latency/reliability optimization, not user-visible streaming into the field.
- **"Taking longer than usual"** notice appears when server processing genuinely lags → confirms a **single end-of-session processing delay** exists (there is no continuous flow of text to hide it). Recent update: notice now auto-dismisses the instant text pastes.
- **Smart Formatting** (docs 5373093536) = the **AI/LLM cleanup pass** (punctuation, capitalization, list formatting, context-aware lowercasing / trailing-period removal in messaging apps). Raw transcript preserved; recoverable via **Undo AI edit** on Home tab. Docs don't state per-chunk vs whole-transcript, but the chunked-formatting note above implies formatting runs **over chunks then concatenated**, output pasted once.

---

## CORROBORATION — COMPARABLE SHIPPING DESKTOP DICTATION APPS

### Handy (github.com/cjpais/Handy) — has BOTH paths; batch by default
- **OBSERVED (README):** default UX = press shortcut → speak → **release → batch transcribe whole recording → paste**. Reviews report **2–5 s** wait after stop; *"No real-time streaming: the model processes audio after you stop."* Silero VAD trims silence (preprocessing, not streaming).
- **Models:** Whisper (GPU-accel): Small 487 MB, Medium 492 MB, Turbo 1600 MB, Large 1100 MB; **Parakeet V3** (CPU-optimized, auto language detect) = everyday default; Moonshine; optional Cohere Transcribe local batch engine.
- **OBSERVED (src-tauri/src/managers/transcription.rs) — the dual-path detail your brief asked about:**
  - **Streaming path:** `start_stream()` → spawns `run_stream_worker()` → opens a `StreamRouter` channel; audio frames fed via `StreamRouter::feed()`; live partials emitted as **`StreamTextEvent`** via `emit_stream_text(committed, tentative)`. `committed` = append-only flicker-free prefix; `tentative` = volatile suffix the model may still rewrite. Also `StreamPhaseEvent` (`phase: StreamPhase::Working`).
  - **Batch path:** `transcribe()` runs synchronously, returns final text after inference.
  - **Gating flag:** streaming only when the loaded session reports `caps.supports_streaming`. **Only transcribe-cpp (Whisper-family) models expose streaming**; **all ONNX engines (Parakeet, Moonshine, SenseVoice, GigaAM, Canary, Cohere) fall back to batch.** If a non-streaming model is selected during `start_stream()`, worker calls `drain_until_finalize()` — silently drains frames so the finalize handshake completes, returns `None`, and the caller **falls back to batch**.
  - **Takeaway for FlowSpeak:** streaming live-preview is tied to Whisper.cpp models; the fast Parakeet CoreML/ONNX path is **batch-only** in Handy. This directly parallels the FlowSpeak decision — a Parakeet batch path means no free streaming partials.

### VoiceInk (github.com/Beingpax/VoiceInk) — whole-buffer BATCH
- **OBSERVED:** *"VoiceInk works on **completed audio segments**, so there's latency between stopping recording and seeing text."* Pipeline: global hotkey (default **Cmd+Shift+Space**) → **AVAudioEngine** captures PCM buffers → on stop, transcribe whole buffer → paste.
- **Models:** embeds **whisper.cpp** (tiny→large) **and NVIDIA Parakeet V2/V3 via FluidAudio** (added v1.20). No streaming/partial-result path documented — it is a **batch finalizer**, same architecture FlowSpeak's simple design would use.

### superwhisper — batch-on-utterance for dictation
- **OBSERVED:** Live system-wide dictation (Option-Space) optimized for **low latency**, but it still **processes the completed utterance** then inserts (batch, not word-streaming). Separate **file transcription** mode for long media. *"Batch transcription produces more accurate results because the model has full context of your utterance."* → confirms industry norm: **buffer utterance → batch → insert**.

### MacWhisper — batch; live dictation "bolted on"
- **OBSERVED:** Architecturally a **file batch transcriber** (queue 20 files, Neural Engine, sequential). Its dictation mode: *"**2.4 seconds of silence** after you speak before any text appears, **no real-time streaming**, and text drops **all at once** rather than flowing as you speak."* Explicit confirmation that a shipping Mac dictation app does **all-at-once insertion**, no streaming.

### FluidAudio (github.com/FluidInference/FluidAudio) — the streaming option IF FlowSpeak wants true streaming
- **OBSERVED:** Ships **both** backends —
  - **Batch:** `Parakeet TDT v3 (0.6B)` CoreML, multilingual (25 EU langs + JA/ZH). This is the fast batch path (aligns with your "~1 min audio in ~0.5s" fact).
  - **Streaming:** `Parakeet EOU (120M)` CoreML — **true real-time streaming ASR with end-of-utterance detection, English-only.** API: **`StreamingEouAsrManager`** with `loadModels()`, `process(audioBuffer:)`, `finish()`, `reset()`; callbacks **`setEouCallback`** (EOU) + **`partialCallback`** (partial results, carrying text/isFinal/confidence/eouDetected/segmentIndex).
  - **Chunk sizes:** **160 ms** (lowest latency), **320 ms** (balanced, recommended default), **1600 ms** (highest throughput). `eouDebounceMs` default **1280 ms** silence before EOU fires.
  - **Perf @ 320ms:** ~**5% WER**, ~**12× RTFx** on LibriSpeech test-clean. Chunk sizes 160/320/1600 ms with built-in silence detection.
  - **Model downloads:** 800k+ on HuggingFace. Swift 6.0+, iOS/macOS, SPM; Rust/Tauri + React Native wrappers.

---

## ARCHITECTURAL IMPLICATION FOR FlowSpeak (synthesis)

- **Wispr Flow itself uses a BATCH-finalizer UX in BOTH modes** — text is never streamed into the field or shown as text in the pill; the only live element is the **waveform**. Every comparable shipping desktop app (VoiceInk, MacWhisper, superwhisper, Handy-default) does the same: **buffer → batch transcribe → single paste.** So a **batch finalizer is the validated, spec-accurate choice** for FlowSpeak to match Wispr Flow; a true streaming path is **NOT required** to replicate the observed behavior.
- **For long hands-free sessions (Q4):** to avoid one huge delay at the 20-min checkmark, mirror Wispr's *internal* trick — **chunk-transcribe rolling audio segments during recording** (Parakeet CoreML batch on e.g. 20–30 s windows, buffered), then run **one LLM cleanup over the concatenated transcript at checkmark** and paste once. This keeps the fast Parakeet batch path (no streaming model needed) while bounding end-of-session latency. User still sees only the waveform.
- **If FlowSpeak wants live text streaming** (a feature Wispr Flow deliberately does NOT have), the only drop-in local option is **FluidAudio `StreamingEouAsrManager` / Parakeet-EOU-120M** (English-only, 320 ms chunks, partial+EOU callbacks) — but note this would **diverge** from Wispr Flow's actual behavior and Parakeet-TDT-v3 batch cannot stream.
- **Waveform note:** matches your established fact — moving white bars, audio-reactive, flat on silence; no text. Keep the pill text-free during recording to be faithful to Wispr Flow.

## CONFIDENCE NOTES
- Q1/Q2/Q3 = **OBSERVED** (multiple: Wispr help docs + podfeet review + navigating-app article). High confidence.
- Q4 user-facing single-paste = **OBSERVED**; internal server-side chunking = **OBSERVED** (troubleshooting doc) but exact chunk boundaries/per-chunk-vs-whole LLM = **INFERRED**.
- Comparable-app streaming/batch classifications = **OBSERVED** from source/README/reviews (Handy source code strongest — exact fn names verified).
- The desktop app is cloud-backed (ASR+LLM server-side); FlowSpeak's target is local, so absolute latency numbers differ but the **temporal UX pattern** (batch, paste-once, waveform-only) is what transfers.

## Sources
- https://docs.wisprflow.ai/articles/6391241694-use-flow-hands-free
- https://docs.wisprflow.ai/articles/6409258247-starting-your-first-dictation
- https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android
- https://docs.wisprflow.ai/articles/4841123325-longer-dictation-sessions-now-up-to-20-minutes
- https://docs.wisprflow.ai/articles/4984532368-fix-taking-longer-than-usual-and-transcription-errors
- https://docs.wisprflow.ai/articles/5373093536-how-do-i-use-smart-formatting-and-backtrack
- https://docs.wisprflow.ai/articles/3529886556-using-notes-in-wispr-flow-for-ios
- https://docs.wisprflow.ai/articles/7971211038-fix-text-not-pasting-after-dictation
- https://www.podfeet.com/blog/2026/03/wispr-flow-scott-willsey/
- https://github.com/cjpais/Handy
- https://raw.githubusercontent.com/cjpais/Handy/main/README.md
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/managers/transcription.rs
- https://github.com/Beingpax/VoiceInk
- https://starlog.is/articles/developer-tools/beingpax-voiceink/
- https://superwhisper.com/docs/get-started/transcribe-files
- https://www.getvoibe.com/resources/macwhisper-vs-superwhisper/
- https://lumevoice.com/blog/macwhisper-review-2026/
- https://docs.fluidinference.com/asr/streaming
- https://github.com/FluidInference/FluidAudio
- https://huggingface.co/FluidInference/parakeet-realtime-eou-120m-coreml
- https://spokenly.app/blog/handy-review
- https://www.getvoibe.com/resources/handy-review/
