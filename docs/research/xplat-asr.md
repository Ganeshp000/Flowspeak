# v2-a4cb3b1f60311064aeebc14f03f0d7e14db20

## TRACK: Cross-platform (macOS Apple Silicon + Windows) ASR strategy for FlowSpeak

### 0. BOTTOM LINE (recommendation up front)

**Recommended architecture: SINGLE Rust engine everywhere — ONNX Runtime (`ort` crate) running NVIDIA Parakeet TDT 0.6B (v2 English / v3 multilingual) int8, with per-platform *execution providers* selected at runtime, not per-platform *engines*.** This is exactly the stack the key reference **Handy (cjpais)** ships in production via its `transcribe-rs` crate, and it satisfies the "one codebase, feature-identical, tested on Mac first" hard requirement. **[INFERRED synthesis, OBSERVED that Handy ships this]**

- The Mac spec's FluidAudio/CoreML/ANE choice is the *fastest and lowest-power* path on Apple Silicon (2.1% WER, ~110–145× RTFx, ANE) **but it is Swift-only and does not exist on Windows** — confirmed, it is a SwiftPM/CocoaPods CoreML SDK. Keeping it means a Swift sidecar bolted onto a Rust/Tauri shell (awkward; Handy explicitly avoided this by using pure-Rust ONNX Parakeet). **[OBSERVED]**
- The critical technical reason you **cannot** just run Parakeet-ONNX through the CoreML EP and get ANE acceleration on Mac: **ONNX Runtime's CoreML EP does not support transducer/RNN operators** (see §5). Parakeet TDT is a FastConformer **transducer**; on Mac via `ort` it runs mostly on the **CPU EP**. So "sherpa-onnx/ort Parakeet on Mac" ≈ CPU-bound (still fast on M4 Pro, but no clean ANE win). **[OBSERVED — onnxruntime CoreML EP op list]**
- **Decision rule:** ship single-engine `ort`+Parakeet on BOTH OSes for v1 (fastest route to feature-parity, proven by Handy). If Mac battery/thermals in the field prove unacceptable, add **FluidAudio as a Mac-only backend behind the same `AsrEngine` trait** later (the pattern foxsay/speak2/VoiceInk use). Do NOT block v1 on the Swift path. **[INFERRED]**

---

### 1. FINALIZE-LATENCY TABLE — 10-second utterance, key-release → raw transcript (ASR only, excludes LLM cleanup)

Batch finalize on key-release (push-to-talk end = endpoint). Compute = model inference; total adds VAD (<5 ms), buffer flush, resample, first-token/warm overhead.

| Hardware tier | Engine + EP | RTF (×realtime) | Compute for 10 s | **Total (release→text)** | Source basis |
|---|---|---|---|---|---|
| **M4 Pro (24 GB)** | FluidAudio Parakeet v2, CoreML/**ANE** | ~110× | ~90 ms | **~150–250 ms** | OBSERVED (FluidAudio Benchmarks.md; local spec) |
| **M4 Pro (24 GB)** | `ort` Parakeet v2 int8, **CPU EP** (partial CoreML) | ~25–50× (est) | ~200–400 ms | **~300–550 ms** | INFERRED (A76 0.088 RTF scaled to M4 P-cores) |
| **M4 Pro (24 GB)** | whisper.cpp large-v3-turbo, Metal | ~20–30× | ~350–500 ms | **~500–700 ms** | INFERRED (M2 Pro 60 s→2.8 s scaled) |
| **Mid CPU-only Win laptop** (i5-1235U class, 4–8 thr) | `ort`/sherpa Parakeet int8, **CPU/XNNPACK** | ~5–11× | ~1–2 s | **~1.5–2.5 s** | OBSERVED (Handy "~5× mid-range"; A76 4-thr 0.088=11×) |
| **Mid CPU-only Win laptop** | whisper.cpp turbo, CPU (AVX2) | ~2–5× | ~2–5 s | **~2.5–6 s** | INFERRED (turbo 809M heavy on CPU) |
| **NVIDIA RTX 4060 desktop** | `ort` Parakeet int8, **CUDA EP** | ~50–150× (est) | ~70–200 ms | **~150–350 ms** | INFERRED (Parakeet ~2000× H100 batch; single-stream 4060) |
| **NVIDIA RTX 4060 desktop** | `ort` Parakeet int8, **DirectML EP** | ~30–90× (est) | ~110–330 ms | **~250–450 ms** | INFERRED (DirectML ≈70–90% CUDA) |
| **NVIDIA RTX 4060 desktop** | whisper.cpp turbo, CUDA / Vulkan | ~40–60× / ~30–50× | ~170–330 ms | **~300–500 ms** | INFERRED (large-v3 ~8× whisper.cpp CUDA on 4070 × turbo 7.5×) |
| **Min-viable Win floor** (2-core AVX2, 4 GB RAM) | `ort` Parakeet v2 int8, CPU | ~2–4× | ~2.5–5 s | **~3–6 s** | OBSERVED-derived (A76 1-thr 0.220 RTF = 4.5×) |
| **Min-viable Win floor** | whisper.cpp **tiny/base** q5, CPU | ~2–15× (tiny fast) | 0.7–5 s | **~1–6 s** | OBSERVED (whisper.cpp base ~15× on x86) |

**Windows hardware floor definition:** any x86-64 with **AVX2**, ≥4 GB RAM, ≥2 cores runs Parakeet v2 int8 (~630 MB model + ~0.5–1 GB runtime RAM) at 2–4× realtime — usable but sluggish. Below AVX2 / <4 GB, fall back to **whisper tiny/base** or cloud. **[INFERRED]**

---

### 2. sherpa-onnx (k2-fsa) — Parakeet ONNX + execution providers

**Parakeet TDT models shipped (all OFFLINE/batch, 16 kHz, greedy_search):** **[OBSERVED — k2-fsa.github.io pretrained_models]**
- `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2` — **English**, ~1.3 GB archive; components `encoder.int8.onnx` 622 MB, `decoder.int8.onnx` 6.9 MB, `joiner.int8.onnx` 1.7 MB; **fp16 variant** `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-fp16.tar.bz2` also exists. Converted from `nvidia/parakeet-tdt-0.6b-v2`.
- `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` — **25 European langs**, ~640 MB; `encoder.int8.onnx` 622 MB, `decoder.int8.onnx` 12 MB, `joiner.int8.onnx` 6.1 MB.
- `sherpa-onnx-nemo-parakeet-unified-en-0.6b-int8-non-streaming.tar.bz2` — English "Unified", ~1.3 GB, still non-streaming in sherpa-onnx.

**CRITICAL — sherpa-onnx has NO streaming Parakeet.** Online/streaming transducers = **Zipformer** (`sherpa-onnx-streaming-zipformer-en-2023-06-26`, etc.), Conformer, LSTM only. Parakeet/Nemotron are offline. So live in-pill preview needs either a Zipformer streaming model or a chunked-Parakeet hack. For push-to-talk FlowSpeak this is fine — batch-finalize on release is the primary path; live preview is optional. **[OBSERVED — online-transducer index]**

**RTF (OBSERVED, only ARM published):** Parakeet v2 int8 on **Cortex A76 (RK3588 SBC)** greedy_search: 1 thread **0.220 RTF (4.5×)**, 2 thr 0.142, 3 thr 0.118, **4 thr 0.088 RTF (11.4×)**. No official x86/CoreML RTF published. A76 is a low-power 2019-class mobile core → any modern x86 laptop CPU is faster.

**Execution providers (from `provider.cc` `StringToProvider()`):** recognized strings = `cpu` (kCPU), `cuda` (kCUDA), `coreml` (kCoreML), `xnnpack` (kXnnpack), `nnapi` (kNNAPI), `trt` (kTRT/TensorRT), `directml` (kDirectML), `spacemit`. Case-insensitive; **unrecognized → falls back to CPU with a warning**. **[OBSERVED — raw source]**

**Provider wiring (from `session.cc` `GetSessionOptionsImpl`):** **[OBSERVED — raw source]**
- **CUDA**: sets device_id + `OrtCudnnConvAlgoSearchHeuristic`.
- **TensorRT**: online models only, falls through to CUDA if unavailable; workspace/fp16/cache config.
- **DirectML**: `#if defined(_WIN32) && SHERPA_ONNX_ENABLE_DIRECTML==1` — Windows-only, **disables memory patterns, forces sequential execution**.
- **CoreML**: `#if defined(__APPLE__) && ORT_API_VERSION>=15 && !defined(SHERPA_ONNX_DISABLE_COREML)` — macOS-only, requires onnxruntime ≥1.15; message "CoreML is for Apple only since onnxruntime>=1.15. Fallback to cpu!"
- **XNNPACK**: requires ORT_API ≥12 (fast CPU path).
- **NNAPI** Android; **SpacemiT** RISC-V.

So sherpa-onnx GPU = **CUDA (Linux/Win)** + **DirectML (Win)**; CoreML compiles on Mac but is gated by the transducer-op problem (§5). **[OBSERVED/INFERRED]**

**Rust bindings:** Two crates — **`sherpa-onnx`** (official, safe bindings, wraps C API with RAII types; **v~1.13.x, Apache-2.0**; links static by default, **auto-downloads prebuilt lib from GitHub releases** if `SHERPA_ONNX_LIB_DIR` unset; prebuilts for Windows x64, macOS arm64/x86_64, Linux x86_64/aarch64; exposes `OfflineRecognizer`, `OnlineRecognizer`, `VoiceActivityDetector`, TTS, punctuation, diarization). And **`sherpa-rs` (thewh1teagle) — now ARCHIVED/DEPRECATED**, points users to the official crate. Use the official `sherpa-onnx` crate. **[OBSERVED — docs.rs, crates.io]** NOTE: the prebuilt lib archives may be **CPU-only builds by default**; CUDA/DirectML/CoreML variants require the matching build flag / a GPU-enabled prebuilt — verify the release asset before relying on GPU. **[INFERRED — build-flag gating]**

**Bundled VAD:** sherpa-onnx ships Silero VAD (and ten-vad) internally — one dependency covers VAD+ASR on both OSes. **[OBSERVED]**

**License:** code Apache-2.0; **Parakeet weights CC-BY-4.0 (attribution required in shipped app, both platforms).** **[OBSERVED]**

---

### 3. transcribe-rs (cjpais) — what Handy ACTUALLY ships (most load-bearing reference)

**This is the proven dual-platform Rust ASR crate.** **[OBSERVED — github.com/cjpais/transcribe-rs, Handy README]**
- "Multi-engine speech-to-text library for Rust," **MIT**. Uses the **`ort` crate (ONNX Runtime)** for the ONNX engines and **whisper.cpp** (`transcribe-cpp`) for Whisper.
- Engines: **Parakeet (v2/v3 int8)**, Canary (Flash + V2), Cohere, Moonshine, SenseVoice, GigaAM, Whisper (whisper.cpp), Whisperfile, OpenAI API.
- **GPU accel via ort EPs: NVIDIA CUDA, AMD ROCm, Microsoft DirectML, Apple CoreML, WebGPU, Vulkan**; Metal for macOS via whisper.cpp. Docs note **"DirectML requires special ORT session settings … you must explicitly select it."**
- Input contract: **16 kHz, mono, 16-bit PCM WAV** — matches the resample target.
- Handy's shipped model sizes: **Parakeet V2 473 MB, V3 478 MB** (int8 single-file packaging); Whisper Small 487 MB / Turbo 1600 MB / Large 1100 MB (ggml; note Handy's "Medium 492 MB" figure looks misreported — treat Whisper sizes as approximate). **[OBSERVED, sizes flagged]**
- Handy's stated Parakeet perf: **"~5× real-time on mid-range hardware," CPU-focused.** **[OBSERVED]**

**Handy full Rust stack (the template to copy):** `transcribe-rs` (Parakeet ONNX) + `transcribe-cpp` (whisper.cpp) + **`cpal`** (audio I/O) + **`vad-rs`** (Silero VAD via ort) + **`rubato`** (48k→16k resample) + **`rdev`** (global hotkey). Pure Rust, Tauri v2 shell, Windows+macOS+Linux. **[OBSERVED]**

**Community ONNX Parakeet weights (`istupakov/parakeet-tdt-0.6b-v3-onnx`, runs via `onnx-asr`):** files — `encoder-model.int8.onnx` **652 MB**, `decoder_joint-model.int8.onnx` **18.2 MB** (→ ~670 MB int8 total); full fp32 `encoder-model.onnx` 41.8 MB + `encoder-model.onnx.data` **2.44 GB**; `decoder_joint-model.onnx` 72.5 MB; `nemo128.onnx` (mel) 140 KB. **CC-BY-4.0.** (Search-reported fp16 1.30 GB / int8 1.02 GB / int4 0.74 GB packaging also exists.) **[OBSERVED — HF tree]**

---

### 4. whisper.cpp — the "identical codebase both OSes" option

**Identical C/GGML codebase on both platforms:** Metal (Mac, + optional CoreML encoder), and on Windows **CPU (AVX/AVX2/OpenBLAS), Vulkan (cross-vendor), CUDA (NVIDIA)**. No DirectML in core (Vulkan is the cross-vendor GPU path). **[OBSERVED]**

**Models / sizes:** large-v3-turbo **809M**, ~1.6 GB fp16; q5_0 ≈ 574 MB, q8_0 ≈ 874 MB. large-v3 1.55B. distil-large-v3 756M. Turbo peak RAM: **fp16 2537 MB, int8 1545 MB**. **[OBSERVED — tesseraai, HF]**

**Speed:** turbo is **~7.5× faster than large-v3** (turbo 19.155 s vs v3 143 s, same clip). Windows GPU: **Vulkan ≈ 70–90% of CUDA** on the same NVIDIA card (ship Vulkan to avoid the multi-GB CUDA Toolkit dependency). whisper.cpp CUDA large-v3 ≈ **~8× realtime on RTX 4070**; faster-whisper int8 ≈ 12× (4070) / 7× (4060). CPU: whisper.cpp **base ~15× realtime on x86**, but **turbo (809M) on CPU is only ~2–5× realtime** and much heavier than Parakeet int8. **[OBSERVED — promptquorum, tesseraai]**

**WER:** turbo LibriSpeech-clean 2.10%, FLEURS ~7.75%. **[OBSERVED]**

**Role for FlowSpeak:** best as the **multilingual / better-proper-noun fallback engine** (Whisper honors `initial_prompt` 224-token spelling hints; Parakeet does not) and the **CPU-floor tiny/base fallback**. Not the primary — Parakeet int8 is faster and lighter on the CPU tiers that matter most. **License MIT (code + weights).** Rust: `whisper-rs`. **[OBSERVED]**

---

### 5. THE CoreML-EP TRANSDUCER PROBLEM (why Mac ANE ≠ ort/sherpa)

ONNX Runtime CoreML EP: macOS ≥10.15; `MLComputeUnits` = `CPUOnly` / `CPUAndNeuralEngine` / `CPUAndGPU` / `ALL`; `ModelFormat` `NeuralNetwork` (default) or `MLProgram` (macOS 12+). **Supported op set is a SUBSET — transducers and RNNs are NOT in the supported-ops list; only 1D/2D Conv, 2D Pool, etc.** Unsupported nodes are partitioned to the **CPU EP** (or block the CoreML subgraph), and **dynamic shapes degrade perf** (`RequireStaticInputShapes`, `SpecializationStrategy`). **[OBSERVED — onnxruntime CoreML-ExecutionProvider docs]**

Consequence: Parakeet's **TDT/RNNT decoder loop + joiner run on CPU**; only parts of the FastConformer encoder can touch ANE, with costly CPU↔ANE transfers → no clean ANE win, sometimes slower than pure CPU. **This is precisely why FluidAudio ships a purpose-built CoreML conversion (not the ONNX CoreML EP) and hits 110–145× RTFx on ANE.** It also confirms the Mac spec was right to pick FluidAudio for the *native* build — but that path is unavailable to a Rust/ONNX codebase. **[OBSERVED + INFERRED]**

---

### 6. EXECUTION-PROVIDER MATRIX (the crux of "one engine, variable hardware")

| Platform / HW | Best EP | Feature-flag / provider string | Friction | Notes |
|---|---|---|---|---|
| macOS Apple Silicon | **CPU EP / XNNPACK** (ort) | `cpu` / built-in | none | CoreML EP won't accelerate the transducer (§5); M-CPU still fast |
| macOS Apple Silicon (max perf) | **FluidAudio CoreML/ANE** (NOT ort) | Swift pkg | Swift FFI from Rust | 110–145× RTFx, lowest power — separate backend |
| Windows + NVIDIA | **CUDA EP** | ort `cuda` / sherpa `cuda` | ships cuDNN+CUDA DLLs (multi-GB) or user install | fastest |
| Windows + NVIDIA (low-friction) | **DirectML EP** | ort `directml` / sherpa `directml` | ships `DirectML.dll` (~few MB) | ≈70–90% CUDA; works on AMD/Intel too |
| Windows + AMD/Intel iGPU/dGPU | **DirectML EP** | `directml` | DX12 device needed | only cross-vendor GPU option in ort/sherpa |
| Windows CPU-only | **CPU EP / XNNPACK** | `cpu`/`xnnpack` | none | Parakeet int8 = 2–11× realtime |
| Windows GPU via whisper.cpp | **Vulkan** | ggml build | none (no CUDA toolkit) | cross-vendor; ≈70–90% CUDA |

**DirectML hard facts:** requires **DX12 + Windows 10 v1903+**; GPUs = NVIDIA Kepler+ / AMD GCN1+ / Intel Haswell HD+ / Qualcomm Adreno 600+; **prefers static shapes** (use `AddFreeDimensionOverrideByName`, fix batch=1); **does NOT support multi-threaded `Run` on one session** (fine — dictation uses one session serially); DirectML 1.15.2, opset ≤20. **Maintenance flag: "DirectML is in sustained engineering; new development directed to WinML."** **[OBSERVED — onnxruntime DirectML docs]**

**CUDA-EP friction:** needs matching CUDA Toolkit + cuDNN DLLs shipped/installed (multi-GB) — a real install-UX cost. For a consumer dictation app, **default to DirectML on Windows GPUs and CPU/XNNPACK on the rest; offer CUDA as an opt-in "power" download.** **[INFERRED]**

**`ort` crate (pyke):** Rust bindings to ONNX Runtime, MIT/Apache-2.0, ~v2.x; EP feature flags include `cuda`, `tensorrt`, `directml`, `coreml`, `rocm`, `openvino`, `webgpu`, `cpu`, `xnnpack`; downloads/bundles onnxruntime binaries. Registering an EP is a *request* — it silently falls back to CPU if the EP/hardware is absent, so you must query and surface the active EP. **[OBSERVED transcribe-rs EP list; INFERRED flag names/fallback — verify exact flags against ort 2.x docs, pyke page was 403]**

---

### 7. Moonshine ONNX — edge-streaming option

- **OnnxRuntime, confirmed Windows + macOS (arm64 & x86_64) + Linux/iOS/Android/RPi.** `.ort` memory-mappable flatbuffer format. Bindings: **C++ (header-only), C, Python, Swift, Java** (no first-party Rust, but usable via ort or `transcribe-rs` which lists Moonshine). **MIT.** **[OBSERVED]**
- Models (v2 streaming): Tiny 34M, Small 123M, Medium 245M (+ non-streaming Tiny 26M, Base 58M). Example files: `encoder_model.ort` 29.9 MB + `decoder_model_merged.ort` 104 MB (a specific size tier). **[OBSERVED]**
- WER (8-dataset avg): Tiny 12.0%, Small 7.84%, Medium 6.65%. Latency (MacBook Pro): Tiny 34 ms, Small 73 ms, Medium 107 ms per inference — **true native streaming**, purpose-built for edge. **[OBSERVED]**
- **Fit:** ideal for **low-latency live in-pill preview during hold** on BOTH OSes (native streaming, tiny, MIT), pairing with Parakeet batch-finalize on release. Accuracy ceiling below Parakeet/turbo for the final text. No vocab biasing. **[OBSERVED/INFERRED]**

---

### 8. NEW / notable mid-2026 on-device ASR

- **NVIDIA Nemotron-0.6B streaming** (arxiv 2604.14493, "Pushing the Limits of On-Device Streaming ASR"): 0.6B transducer, **ONNX-compatible, int4 k-quant, targets CPU + mobile**, reports beating **Parakeet-TDT-0.6b and Moonshine** on the streaming compact-model tradeoff. FluidAudio already ships a Nemotron streaming CoreML variant (2.58% WER @1120 ms chunk on M4 Pro). **A cross-platform ONNX release would be the ideal single-engine STREAMING model** — watch sherpa-onnx / NeMo for the export. **[OBSERVED paper; INFERRED availability]**
- **Voxtral Transcribe 2 (Mistral, Feb 2026):** 4B (3.4B LM + 970M enc), **native streaming 80 ms–2.4 s delay**, WER 5.9% batch / 6.73% streaming / 8.72% low-latency; 13 langs; **Apache-2.0**; **16 GB VRAM BF16, 2.5 GB Q4**. Rust + C (`voxtral.c`) + MLX community impls exist but ecosystem is ~2 months old. **Too heavy (4B) for the CPU-floor tier**; interesting future multilingual/streaming option, not v1 primary. **[OBSERVED]**
- **NVIDIA Canary 1B Flash** (Apache-2.0, EN/DE/FR/ES, 5.63% WER) and **IBM Granite Speech 3.3** (6.10% EN, permissive, on-prem) — both available as ONNX/NeMo; Canary is in `transcribe-rs`. Multilingual alternates, GPU-favoring, heavier than Parakeet 0.6B. **[OBSERVED]**
- Ecosystem maturity check: whisper.cpp ~46.9k stars, 3 yrs of optimization — the safe fallback; Parakeet-via-ort/sherpa is the accuracy+speed sweet spot for English; Voxtral/Nemotron are the ones to track. **[OBSERVED]**

---

### 9. VAD — Silero, cross-platform

- **Silero VAD v5+/v6.2.1**, ONNX, **MIT**, ~2 MB. Runs identically on both OSes via **`vad-rs`** (Handy's choice, ort-backed) or bundled inside **sherpa-onnx** / **FluidAudio**. **[OBSERVED]**
- **Frame/chunk = fixed 512 samples = 32 ms @ 16 kHz** (256 @ 8 kHz); v5+ carries prior-chunk context internally; `VADIterator` stateful API. Latency <1 ms per 32 ms frame; ~1000× RTFx on Apple Silicon. **[OBSERVED — local spec + snakers4]**
- Dictation params: threshold 0.5 (0.6–0.85 noisy); push-to-talk → key-release is the endpoint (no silence timer to finalize); run VAD only to trim leading/trailing silence + gate live-preview frames; hands-free mode `min_silence_duration ≈ 600 ms`, `speech_pad ≈ 150 ms`. **[OBSERVED/INFERRED — local spec]**
- **One VAD engine, both OSes — zero platform divergence.** Use `vad-rs` if the shell is Rust (matches Handy). **[INFERRED]**

---

### 10. AUDIO CAPTURE ABSTRACTION + 16 kHz mono resample

- **`cpal` crate** = single Rust abstraction over **WASAPI (Windows) / CoreAudio (macOS) / ALSA (Linux)**; sample formats F32/I16/U16; APIs `Host::default_input_device()`, `Device::supported_input_configs()` → `SupportedStreamConfigRange`, `build_input_stream()`. (docs.rs reported v0.18.x — treat exact version as approximate; Handy pins a specific cpal.) **[OBSERVED]**
- **Known gap — cpal does NOT emit device-hotplug / default-device-switch notifications.** Handling default-mic changes and unplug requires platform hooks: **Windows `IMMNotificationClient` (WASAPI) `OnDefaultDeviceChanged`/`OnDeviceStateChanged`**, **macOS CoreAudio property listener `kAudioHardwarePropertyDefaultInputDevice`** (or AVFoundation route-change), or a polling fallback that re-enumerates and rebuilds the input stream. This is a real cross-platform engineering task the single-cpal abstraction does not solve for free. **[OBSERVED cpal limitation; INFERRED platform-API remedy]**
- **Resample 48 kHz→16 kHz mono** with **`rubato`** (Handy uses it) — sinc/FFT resampler, MIT. Capture at device native rate, downmix to mono, resample to 16 kHz, feed 512-sample frames to VAD and the ASR encoder (which needs 16 kHz mono per all engines). **[OBSERVED]**
- Native alternative on Mac would be `AVAudioEngine` (Swift) — but using cpal keeps the audio path single-codebase; only reach for AVAudioEngine if you also adopt the FluidAudio Swift backend. **[INFERRED]**

---

### 11. MODEL DOWNLOAD / FIRST-RUN SIZES (per platform, identical models)

| Model (recommended) | Download | RAM (weights+rt) | Role |
|---|---|---|---|
| Parakeet v2 int8 (English) | ~630 MB–1.3 GB archive | ~0.8–1.2 GB | **primary finalize (EN)** |
| Parakeet v3 int8 (25 lang) | ~640–670 MB | ~0.8–1.2 GB | multilingual finalize |
| Moonshine Medium (.ort) | ~250–500 MB | <1 GB | live streaming preview |
| Silero VAD | ~2 MB | tiny | endpointing (bundled) |
| whisper large-v3-turbo q5_0 | ~574 MB (q8 ~874 MB, fp16 1.6 GB) | 1.5–2.5 GB | Whisper fallback / proper nouns |
| whisper tiny/base q5 | ~40–150 MB | small | CPU-floor fallback |

First-run: download one primary (~600 MB) + VAD; gate GPU-EP (CUDA) extras behind an opt-in. Same artifacts stream from the same CDN to both OSes. **[OBSERVED sizes]**

---

### 12. LICENSES (shipping obligations)

| Component | License | Obligation |
|---|---|---|
| Parakeet TDT v2/v3 **weights** | **CC-BY-4.0** | **attribution in-app, both platforms** |
| sherpa-onnx code | Apache-2.0 | notice |
| `ort` crate / ONNX Runtime | MIT / Apache-2.0 / MIT | notice |
| whisper.cpp + ggml + Whisper weights | MIT | notice |
| Moonshine | MIT | notice |
| Silero VAD | MIT | notice |
| cpal | Apache-2.0/MIT | notice |
| rubato / rdev / vad-rs / transcribe-rs | MIT | notice |
| FluidAudio SDK (Mac only) | Apache-2.0 (weights CC-BY-4.0) | attribution |
| DirectML.dll | MS proprietary redistributable | redistribution terms |
| CUDA/cuDNN runtime | NVIDIA proprietary | redistribution terms (or user-install) |

**[OBSERVED]** — The CC-BY-4.0 on Parakeet is the one non-trivial obligation: add an attribution line to About/licenses screen.

---

### 13. FINAL ARCHITECTURE RECOMMENDATION

1. **Shell/core: Rust (Tauri v2), mirroring Handy.** One codebase, Windows+macOS. **[INFERRED, Handy OBSERVED]**
2. **ASR: single `AsrEngine` trait; default impl = `ort` + Parakeet TDT v2 int8 (English) / v3 (multilingual), batch-finalize on key-release.** EP auto-select: macOS→CPU/XNNPACK; Windows NVIDIA→DirectML (default) or CUDA (opt-in); Windows AMD/Intel→DirectML; CPU-only→CPU/XNNPACK. Surface the active EP; fall back gracefully.
3. **Live preview (optional): Moonshine Small/Medium `.ort` streaming** behind the same trait — true streaming on both OSes. (Or skip preview for v1; push-to-talk tolerates it.)
4. **Fallbacks: whisper.cpp large-v3-turbo (Vulkan on Win, Metal on Mac) for multilingual/proper-noun; whisper tiny/base for the CPU floor.**
5. **VAD: Silero via `vad-rs` (one engine both OSes).** Audio: `cpal` + `rubato`, **plus explicit WASAPI/CoreAudio device-change listeners** (cpal gap).
6. **Optional Mac accelerator (post-v1): FluidAudio CoreML/ANE as a Mac-only `AsrEngine` impl** if field battery/thermals demand the ANE — only worth the Swift-FFI maintenance cost if measured power on `ort`-CPU is unacceptable. On M4 Pro the CPU path already finalizes 10 s in ~300–550 ms, so this is a battery/thermal optimization, not a correctness need.
7. **Custom dictionary: do it in the LLM cleanup layer + phonetic post-correction, NOT the ASR** (neither Parakeet nor Whisper has real word-boosting; CoreML/DirectML don't change that). **[OBSERVED — carries over from local spec]**

**Single-engine vs per-platform verdict:** Single-engine (`ort`+Parakeet) wins on the stated priorities (one codebase, feature-identical, Mac-first, low maintenance) and is production-proven by Handy. Per-platform (FluidAudio+ort) buys ~1.5–3× Mac speed and materially lower Mac power, at the cost of a second ASR code path and Swift interop — defer it to a measured optimization, don't gate v1 on it. **[INFERRED]**

---

### 14. OPEN QUESTIONS / DATA GAPS
- No published x86 or Apple-Silicon RTF for Parakeet-int8 via `ort`/sherpa (only ARM Cortex-A76). The M4-Pro-CPU and Windows-laptop numbers in §1 are scaled estimates — **benchmark `transcribe-rs`/sherpa Parakeet on the actual M4 Pro and a target Windows laptop before committing latency SLAs.**
- Whether the `ort`/sherpa **prebuilt** binaries enable CUDA/DirectML/CoreML by default, or require a custom build — verify the exact release asset + feature flags.
- Exact `ort` 2.x EP feature-flag strings (pyke docs page returned 403) — confirm `directml`/`coreml`/`cuda` flag names against current ort docs.
- cpal current version and its device-change story in the version Handy pins.
- Whether an ONNX export of **Nemotron-0.6B streaming** ships in sherpa-onnx/NeMo (would enable a single cross-platform *streaming* engine).

## Open questions
- No x86/Apple-Silicon RTF published for Parakeet-int8 via ort/sherpa (only ARM Cortex-A76 0.220-0.088 RTF); M4 Pro CPU and Windows-laptop latency figures are scaled estimates that must be benchmarked on real hardware before committing SLAs.
- Unclear whether ort/sherpa-onnx PREBUILT binaries ship with CUDA/DirectML/CoreML enabled by default or require a custom build with SHERPA_ONNX_ENABLE_DIRECTML / matching feature flags.
- Exact ort 2.x execution-provider feature-flag strings unconfirmed (pyke docs page returned HTTP 403) - confirm directml/coreml/cuda flag names.
- cpal has no native device-hotplug/default-device-change notification; the exact remedy (WASAPI IMMNotificationClient vs CoreAudio property listener vs polling) and what Handy actually does needs source confirmation.
- Whether an ONNX export of NVIDIA Nemotron-0.6B streaming (arxiv 2604.14493) is available in sherpa-onnx/NeMo - would enable a single cross-platform STREAMING engine instead of Moonshine for live preview.
- Handy's reported Whisper model sizes (Small 487MB / Medium 492MB) look internally inconsistent/misreported; verify actual ggml sizes.

## Sources
- https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html
- https://github.com/k2-fsa/sherpa-onnx/issues/2183
- https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx
- https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/tree/main
- https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/sherpa-onnx/csrc/provider.cc
- https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/sherpa-onnx/csrc/session.cc
- https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/index.html
- https://docs.rs/sherpa-onnx
- https://crates.io/crates/sherpa-onnx
- https://github.com/thewh1teagle/sherpa-rs
- https://github.com/cjpais/Handy
- https://github.com/cjpais/transcribe-rs
- https://docs.rs/cpal/latest/cpal/
- https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html
- https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
- https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- https://ort.pyke.io/perf/execution-providers
- https://github.com/moonshine-ai/moonshine
- https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026
- https://tesseraai.cloud/en/blog/whisper-large-v3-turbo-vs-large-v3-cpu-eu/
- https://weesperneonflow.ai/en/blog/2026-03-31-voxtral-whisper-open-source-speech-models-comparison-2026/
- https://arxiv.org/pdf/2604.14493
- https://deepwiki.com/k2-fsa/sherpa-onnx/7.1-gpu-support-(cuda-and-directml)
- https://github.com/k2-fsa/sherpa-onnx/releases
- https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2
- https://github.com/FluidInference/FluidAudio
- https://snailtext.app/blog/how-whisper-cpp-works/
