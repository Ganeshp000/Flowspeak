# Track: v2:c5d1ce403a7e22cba6b0306a991b34759e0784169bf9184ff6adaf93da26a32e


# TRACK: Local ASR Stack for Real-Time Dictation (Apple M4 Pro, 24 GB, macOS 15.7 Sequoia)

## 0. Environment constraints (context)
- **Apple SpeechAnalyzer / SpeechTranscriber** (the new native on-device streaming ASR) is **macOS 26 / iOS 26 only** — NOT usable on macOS 15.7.3. OBSERVED (Apple announced these at WWDC25 as macOS 26 APIs). All engines below are third-party and run on macOS 15.7. This is why a bundled engine is required.
- All engines target Apple Silicon: choose between **ANE (Neural Engine, via CoreML)**, **GPU (via Metal/MLX)**, and **CPU**. ANE adds ~1.3–1.8× over Metal-GPU on M3/M4 for Whisper-class models. OBSERVED (voicci/JustVoice benchmarks).

---

## 1. whisper.cpp (ggml-org) + Metal

**Models relevant:** `large-v3` (1550M, ~2.9 GB fp16), `large-v3-turbo` (809M, ~1.6 GB fp16, **4 decoder layers** vs 32), `distil-large-v3` (756M), quantized `q5_0`/`q8_0` variants (~50% smaller). OBSERVED (whispernotes, HF distil-whisper).

**Streaming:** NOT true streaming. Chunked/offline only. The `stream` example does pseudo-streaming via a sliding window that re-decodes a rolling buffer (VAD-gated), producing flicker/re-writes. Best used as a **batch finalizer on key-release**, not live token stream. INFERRED from architecture + OBSERVED (repo `examples/stream`).

**Speed on Apple Silicon (RTF = ×real-time; higher=faster):** OBSERVED (JustVoice M3/M4 whisper.cpp 1.6.x Metal `WHISPER_METAL=1`):
| Model | M3 (10-core GPU) | M4 (10-core GPU) |
|---|---|---|
| tiny q5 | ~30× | ~38× |
| base q5 | ~18× | ~24× |
| small q5 | ~9× | ~12× |
| medium fp16 | ~3.5× | ~5× |
| large-v3 fp16 | ~1.8× | ~2.6× |
- **large-v3-turbo**: ~5× faster than large-v3 on the same Mac (OBSERVED whispernotes: MBP M2 processed 10-min audio in 63 s (turbo) vs 316 s (v3), 5.0× speedup). Implies turbo on **M4 base ≈ 10–13× RTF**; on **M4 Pro (20-core GPU) ≈ 20–30× RTF** (INFERRED by scaling GPU cores). 
- OBSERVED corroboration: M2 Pro large-v3-turbo Metal + **flash attention** processes 60 s audio in ~2.8 s (~21× RTF). M4 Pro should exceed this.
- OBSERVED (mac-whisper-speedtest, **M4 Pro 24 GB**, short "large" clip, single run): whisper.cpp = **1.2293 s** (vs parakeet-mlx 0.4995 s, fluidaudio-coreml 0.1935 s, mlx-whisper 1.0230 s, whisperkit 2.2190 s, faster-whisper 6.9613 s). Note this test's whisper.cpp used large-v3-turbo-q5_0 + CoreML + 4 threads.

**Accuracy (English WER, Open ASR Leaderboard):** OBSERVED — large-v3-turbo LibriSpeech-clean **2.10%**, LibriSpeech-other 4.24%, mean 7.83%; large-v3 clean 2.01%, mean 7.44% (turbo within ~0.4 pt of v3). distil-large-v3: short-form 9.7% (vs 8.4% v3), long-form within 1% of v3, **6.3× faster**, 756M params. OBSERVED (HF distil-whisper).

**Proper nouns / vocabulary biasing:** WEAK native support. No hotword/logit-biasing API historically (issue #1979, Mar 2024). Only lever is `initial_prompt` (a.k.a. `--prompt`), **capped at 224 tokens**; only the *last* 224 tokens are used; it soft-biases style/spelling but is unreliable for enforcing a large custom dictionary. Newer whisper.cpp added a `hotwords`/`--grammar` (GBNF) path but grammar is impractical for open dictation. OBSERVED (issue #1979, whisper prompting guide, discussion #348).

**License:** MIT (whisper.cpp code + ggml). Whisper weights MIT (OpenAI). OBSERVED.

**Integration (Swift/Rust):** C API (`whisper.h`) → trivial FFI. **Rust**: `whisper-rs` crate (safe bindings). **Swift**: C interop or `SwiftWhisper` wrapper; can build as a static lib and link, or run as sidecar. Metal shaders bundled. Mature, battle-tested. OBSERVED.

---

## 2. NVIDIA Parakeet TDT 0.6B (v2 English / v3 multilingual)

**Architecture:** FastConformer encoder + **TDT (Token-and-Duration Transducer)** decoder, 600M params. Punctuation + capitalization + word/segment/char timestamps built in. Single-pass up to 24 min (full attention) / 3 hr (local attention). OBSERVED (nvidia HF cards).

**Accuracy:** 
- **v2 (English-only)**: **#1 on HF Open-ASR Leaderboard, 6.05% avg WER**, RTFx **3380** (batch=128, server GPU). Released 2025-05-01. OBSERVED.
- **v3 (25 European langs incl. EN)**: Open-ASR avg **6.34% WER**, RTFx 3332.74; English Fleurs 4.85% / CoVoST 6.80%. OBSERVED (nvidia HF v3 card).
- On **Apple Silicon via FluidAudio** (real-device): v2 LibriSpeech-clean **2.1% WER**; v3 English-US **5.4% WER**. OBSERVED (FluidAudio Benchmarks.md).

**Streaming:** Base model is offline/chunked. TDT is causal-friendly; **true streaming exists via wrappers** — FluidAudio ships cache-based streaming variants (see §2b). parakeet-mlx exposes `transcribe_stream()` (chunked with context windows, not frame-native). OBSERVED.

**Proper nouns / vocabulary biasing:** WEAK. HF card explicitly warns: *"If a word is not trained in the language model and not present in vocabulary, the word is not likely to be recognized."* No native word-boosting/hotword API in the open checkpoints. This is Parakeet's main weakness for a custom-dictionary feature. OBSERVED.

**License:** Model weights **CC-BY-4.0** (attribution required, commercial OK). OBSERVED. (Attribution obligation matters for a shipped product.)

### 2a. parakeet-mlx (senstella) — GPU/MLX port
- Apache-2.0 (code). Supports ParakeetTDT/RNNT/CTC/TDTCTC; default `mlx-community/parakeet-tdt-0.6b-v3`. OBSERVED.
- `transcribe_stream()` streaming (context default (256,256)); `chunk_duration` 120 s / `overlap_duration` 15 s for long audio; word timestamps; SRT/VTT/JSON output. **No built-in mic streaming, no hotword/vocab biasing.** OBSERVED.
- Min **2 GB unified memory** (runs on 8 GB Airs). OBSERVED.
- Speed: **M3 MBP transcribed 1 h 08 m video in 1 m 02 s ≈ 66× RTF**; M4 Pro speedtest short clip **0.4995 s** (2.5× faster than whisper.cpp in same test). OBSERVED.
- **Integration = Python/MLX only** → would require a Python sidecar process from Swift/Rust (not ideal for a shipped native app).

### 2b. FluidAudio (FluidInference) — Swift/CoreML/ANE port ★ most relevant for native macOS
- **Native Swift SDK, CoreML on ANE.** macOS 14.0+ / iOS 17.0+ (so **works on macOS 15.7**). SwiftPM + CocoaPods. License Apache-2.0 (SDK). OBSERVED.
- Ships Parakeet **v2 (EN)**, **v3 (multilingual)**, a **Parakeet "Unified" batch+streaming** model, a **Parakeet EOU (120M) streaming w/ end-of-utterance** model, and **Nemotron streaming 0.6B**. OBSERVED.
- **Benchmarks (M4 Pro primary rig):** OBSERVED (Benchmarks.md):
  - Parakeet v2 LibriSpeech-clean: **2.1% WER, 145.8× RTFx**
  - Parakeet v3 English-US: **5.4% WER, 207.4× RTFx** (24-lang avg 14.7% WER, 209.8× RTFx)
  - Parakeet Unified: batch **2.15% WER / 123.3× RTFx**; **streaming 2.21% WER / 29.1× RTFx**
  - Parakeet **EOU streaming**: 320 ms chunks **4.88% WER / 19.25× RTFx**; 160 ms chunks 8.23% WER / 5.78× RTFx
  - Nemotron streaming: 1120 ms chunk tier 2.58% WER / 24.3× RTFx; 2240 ms default 2.64% WER / 87.4× RTFx
  - Batch ASR overall ≈ **110× RTF on M4 Pro (1 min audio ≈ 0.5 s)**
  - CoreML compile (iPhone 16 Pro Max reference): encoder 162 ms warm / 3361 ms cold; decoder 8.11 ms warm.
- Also bundles **Silero VAD v6.2.1** and speaker diarization in the same SDK — one dependency covers VAD + ASR.
- **Weakness inherited:** no native vocabulary biasing (Parakeet limitation).

---

## 3. Moonshine (moonshine-ai / useful-sensors)

**Models (v2 streaming):** Tiny 34M, Small 123M, Medium 245M. Ergodic sliding-window Transformer encoder (bounded local attention, no positional embeddings) → autoregressive decoder; 50 Hz frontend. **Designed for true streaming** with KV/frame caching. OBSERVED (arxiv 2602.12241, HF cards).

**Latency & WER:** OBSERVED (WER = Open-ASR 8-dataset avg):
| Model | Params | WER | Latency (MacBook Pro) | Latency (arxiv) |
|---|---|---|---|---|
| Tiny streaming | 34M | 12.00% | ~34 ms | 50 ms (5.8× < Whisper-Tiny) |
| Small streaming | 123M | 7.84% | ~73 ms | 148 ms (13.1× < Whisper-Small) |
| Medium streaming | 245M | 6.65% | ~107 ms | 258 ms (43.7× < Whisper-Large-v3) |
- Medium beats Whisper-Large-v3 WER with **6× fewer params**. OBSERVED.

**Format/runtime:** ONNX → memory-mappable **`.ort` flatbuffer** (OnnxRuntime). Sub-1 GB memory budget; microcontroller variants ~1 MB. OBSERVED.

**Languages:** STT EN + Spanish/Arabic/Japanese/Korean/Mandarin/Ukrainian/Vietnamese. OBSERVED.

**Vocabulary biasing:** none documented. OBSERVED.

**License:** MIT. OBSERVED.

**Integration:** Python (`moonshine-voice mic/transcribe`), **Swift Package Manager (iOS/macOS)**, C++ headers + prebuilt binaries, Android Maven. → Clean native Swift path AND ONNXRuntime path for Rust. OBSERVED.

**Fit:** Excellent for **low-latency live preview** in the pill during hold (very low WER-for-size, native streaming, MIT), but lower accuracy ceiling than Parakeet/large-v3-turbo for final text.

---

## 4. Kyutai STT (delayed-streams-modeling / Moshi)

**Models:** `stt-1b-en_fr` (~1B, EN/FR, **0.5 s delay**, **built-in semantic VAD**, word timestamps); `stt-2.6b-en` (~2.6B, EN-only, **2.5 s delay**). OBSERVED.

**Streaming:** **True streaming, best-in-class** — Delayed Streams Modeling processes 80 ms frames at 12.5 Hz; native token-by-token output with a fixed model-delay, plus built-in endpointing/VAD (no separate VAD needed). OBSERVED.

**Accuracy:** On par with or **beating Whisper-large-v3 on English** despite being streaming (large-v3 = 2.7% WER LibriSpeech reference). No exact Kyutai LibriSpeech number published in sources. OBSERVED (qualitative) / INFERRED (exact WER).

**Throughput:** H100 = 400 realtime streams; L40S = 64 streams @ RTF 3×. OBSERVED.

**Apple Silicon:** **`moshi-mlx` ≥ 0.2.6** runs on Mac (tested M3 MBP); 1B tested on iPhone 16 Pro via `moshi-swift`. **No published M-series RTF number** — a big data gap; the 2.6B model at 2.5 s delay is heavy for 24 GB + snappy dictation. INFERRED: 1B model on M4 Pro should run >1× realtime but Python/MLX or Swift-Moshi integration is less mature than WhisperKit/FluidAudio. 

**License:** weights **CC-BY-4.0**; code MIT (Python) / Apache-2.0 (Rust). OBSERVED.

**Integration:** PyTorch (`moshi`), **Rust (`moshi-server`)**, MLX (`moshi-mlx`), **Swift (`moshi-swift`)**. Rust path is production-grade. OBSERVED.

**Fit:** Strongest *conversational/live-caption* engine, but the built-in 0.5–2.5 s delay and heavier weights make it overkill/laggier than needed for **push-to-talk dictation where key-release already marks end-of-speech**. Keep as an alternative, not primary.

---

## 5. WhisperKit / argmax-oss-swift (Argmax)

**Packaging:** As of **v1.0.0 (May 2026)** WhisperKit is part of **argmax-oss-swift** (with SpeakerKit + TTSKit). SwiftPM `from: "0.9.0"`. **macOS 14.0+** (works on 15.7), iOS 16+, Xcode 16+. **License MIT.** OBSERVED.

**Models:** `large-v3` compressed **626 MB**, `large-v3-turbo`, base/small/tiny (multi + `.en`). CoreML/ANE. Auto-download + cache. Custom **prompt** guidance, `logprobs`, temperature, word+segment timestamps, language detect. OBSERVED.

**Streaming:** Pseudo-streaming via `AudioStreamTranscriber` / SSE — emits **"hypothesis" (volatile) then "confirmed" (stable)** text on a rolling window (same UX pattern Wispr Flow uses). Not frame-native but purpose-built for live dictation display. OBSERVED.

**Benchmarks (from WhisperKit arxiv 2507.10860, MBP M3 Max):** OBSERVED:
- Streaming per-word latency: **hypothesis 0.45 s mean**, confirmed ~1.7 s.
- Audio Encoder **218 ms** (d750 mask, ANE; 65% faster than 612 ms baseline); Text Decoder forward pass **4.6 ms** (Stateful models, 45% faster than 8.4 ms), 0.3 W/pass.
- WER (d750 large-v3-turbo variant): LibriSpeech-clean **2.25%**, Earnings22 12.85%, CommonVoice17-EN 12.87%.
- large-v3-turbo compressed **1.6 GB → 0.6 GB** via OD-MBP (Outlier-Decomposed Mixed-Bit Palettization), retains within ~1% WER.
- **M2 Ultra large-v3-turbo: 72× RTF (GPU+ANE), 42× RTF (ANE-only default).** M4 Pro INFERRED ~30–50× RTF ANE.
- mac-whisper-speedtest M4 Pro short clip: whisperkit 2.2190 s (slower in that specific harness vs FluidAudio/parakeet-mlx — likely cold-load/config artifact). OBSERVED.

**Vocabulary biasing:** prompt-based only (same 224-token Whisper limitation), but better than Parakeet because Whisper responds reasonably to `initialPrompt` spelling hints. OBSERVED/INFERRED.

**Fit:** Best **native-Swift Whisper** option; strong live-dictation UX primitives; MIT; slightly slower + slightly worse short-form WER than Parakeet-FluidAudio but **better proper-noun handling** and multilingual robustness.

---

## 6. VAD / Endpointing — Silero VAD

- **Version:** latest **v6.2.1 (2026-02-24)**; v5 was the "3× faster, 6000+ languages" rewrite. Use v5+/v6. OBSERVED.
- **Chunking:** **fixed 512-sample window = 32 ms @ 16 kHz** (256 samples @ 8 kHz). v5+ passes prior-chunk context internally. OBSERVED.
- **Latency:** **<1 ms per 32 ms chunk** (single CPU thread); ~23× realtime+ overall; FluidAudio measured **RTFx 1077–1230×** on Apple Silicon, MUSAN accuracy 94.0% / F1 94.3%, recall 100%. OBSERVED.
- **Size:** ~2 MB (JIT). **License MIT.** ONNX Runtime is now an *optional* dependency. OBSERVED.
- **Streaming API:** `VADIterator` (stateful, feed 512-sample frames). OBSERVED.
- **Tunable params + recommended dictation values:**
  - `threshold`: default **0.5** (speech prob). Raise to 0.6–0.85 in noisy rooms. OBSERVED (defaults).
  - `min_silence_duration_ms`: default 100 ms. **For dictation auto-stop use 500–700 ms** (see below).
  - `speech_pad_ms`: default ~30 ms (pad both ends so leading/trailing phonemes aren't clipped). Consider 100–200 ms lead pad for dictation.
  - `min_speech_duration_ms`: default ~250 ms (drops coughs/clicks).
- **Integration:** Rust (`voice_activity_detector` crate, `silero-vad-rust` with bundled ONNX), Swift, C++, C#, Go, Java. Also embedded inside FluidAudio's Swift SDK. OBSERVED.

**End-of-speech silence thresholds (dictation UX):** OBSERVED (production VAD guidance):
- Typical endpoint delay **300–800 ms**; it is usually the single largest contributor to perceived latency.
- **200 ms** = too aggressive (clips mid-sentence pauses); **800 ms+** = feels sluggish; a **100 ms** change is perceptible.
- **Recommendation for FlowSpeak:** Because the primary mode is **hold-Fn push-to-talk, key-release IS the endpoint** — no silence timer needed for finalization; run VAD only to (a) trim leading/trailing silence and (b) gate live streaming chunks. For an optional **hands-free / tap-to-toggle** mode, use **min_silence_duration ≈ 600 ms** (balance of responsive vs no mid-thought cutoff), threshold 0.5, speech_pad 150 ms lead. INFERRED (synthesis of the numbers above + push-to-talk semantics).

---

## 7. Cross-engine comparison table (English dictation on M4 Pro)

| Engine | True streaming | English WER (clean) | Speed on M-series | Mem (weights) | Vocab biasing | Native Swift? | License |
|---|---|---|---|---|---|---|---|
| **Parakeet v2 / FluidAudio** | via streaming variant | **2.1%** | **~145× RTFx batch / ~110× overall (M4 Pro)** | ~0.6–1 GB | ✗ (none) | **✓ (CoreML/ANE)** | code Apache-2.0 / weights CC-BY-4.0 |
| parakeet-mlx | chunked stream | ~2–6% | ~66× (M3) | ≥2 GB unified | ✗ | ✗ (Python/MLX) | Apache-2.0 / CC-BY-4.0 |
| **WhisperKit large-v3-turbo** | pseudo (hyp/confirmed) | 2.25% | 42× ANE / 72× GPU+ANE (M2 Ultra); ~30–50× (M4 Pro, INFERRED) | 0.6 GB (compressed) | prompt only (224 tok) | **✓ (CoreML/ANE)** | MIT / MIT weights |
| whisper.cpp large-v3-turbo | chunked only | 2.10% | ~20–30× RTF (M4 Pro, INFERRED); 60 s→2.8 s M2 Pro | ~1.6 GB (fp16) / less quantized | prompt only (224 tok) | via C FFI / Rust | MIT |
| distil-large-v3 (whisper.cpp) | chunked | ~2.1% short / 9.7% mixed | ~6.3× faster than v3 | ~0.75 GB | prompt only | via FFI | MIT |
| **Moonshine v2 Medium** | **✓ native** | 6.65% (8-ds avg) | ~107–258 ms latency | <1 GB | ✗ | ✓ (SPM) + ONNX | MIT |
| **Kyutai stt-1b-en_fr** | **✓ native (DSM)** | ~≤ large-v3 | no M-series RTF pub; 0.5 s built-in delay | ~1 GB (1B) | ✗ | ✓ (moshi-swift, immature) | MIT/Apache / CC-BY-4.0 |
| Kyutai stt-2.6b-en | ✓ native | ~ SOTA | heavy; 2.5 s delay | ~2.6 GB | ✗ | ✓ (immature) | MIT/Apache / CC-BY-4.0 |
| Silero VAD v6.2.1 | ✓ | n/a (VAD) | 1000×+ RTFx, <1 ms/32 ms | ~2 MB | n/a | ✓ | MIT |

---

## 8. RECOMMENDATION

**Primary engine: NVIDIA Parakeet TDT 0.6B v2 (English) via the FluidAudio Swift/CoreML SDK, running on the ANE.**
Rationale (all OBSERVED): (1) **Fastest** measured on M4 Pro — 2.1% WER LibriSpeech-clean at 145× RTFx batch / ~110× overall, and it won the head-to-head M4 Pro 24 GB speedtest at 0.19 s. (2) **Fully native Swift + CoreML/ANE, macOS 14+** → no Python sidecar, low power, fits a bundled shippable app on 24 GB. (3) FluidAudio bundles **Silero VAD v6.2.1 + a Parakeet-EOU streaming model** in the same SDK, so live in-pill preview during hold and VAD trimming come for free. Use the **streaming/EOU model for the live preview during hold-Fn**, and the **v2 batch model for the high-accuracy finalize on release**.

**Fallback / secondary: WhisperKit `large-v3-turbo` (argmax-oss-swift, MIT), also native Swift/ANE.** Ship it as a user-selectable engine for (a) users who need **better proper-noun/spelling robustness** (Whisper responds to `initialPrompt` hints; Parakeet does not) and (b) **multilingual** input. Portable third-tier fallback = **whisper.cpp large-v3-turbo via Rust/C FFI** for environments where CoreML model compilation fails.

**Custom-dictionary feature (critical):** Neither Parakeet nor Whisper has real native word-boosting. Do **NOT** rely on the ASR for the dictionary. Instead: (1) feed the user's dictionary/proper-nouns into the **LLM cleanup layer prompt** (this is where Wispr-style vocab learning actually lands — it's a text-correction problem, and it's owned by the cleanup track); (2) optionally pass the top ~30 most-frequent custom terms into WhisperKit/whisper.cpp `initialPrompt` (224-token cap) as a light acoustic nudge; (3) maintain a **phonetic/fuzzy post-correction map** (e.g. Double-Metaphone) applied before/with cleanup. INFERRED (best-practice synthesis).

**Endpointing:** Push-to-talk = key-release is the endpoint (no silence timer needed to finalize). Run Silero VAD only to trim silence and gate streaming frames (512-sample/32 ms, threshold 0.5, speech_pad 150 ms). For an optional hands-free mode, min_silence_duration ≈ 600 ms.

**Expected end-to-end transcription latency for a 10-second utterance (M4 Pro, excluding the separate LLM-cleanup track):**
- **Primary (Parakeet v2 / FluidAudio, batch finalize):** 10 s ÷ ~110× RTF ≈ **~90 ms** compute; add VAD (<5 ms) + audio buffer flush + text-injection ≈ **~150–250 ms total from key-release to raw transcript**. OBSERVED-derived. This matches the "instant" feel of Wispr Flow. Live preview during the hold is continuous (per-chunk ~20–60 ms via the streaming model).
- **Fallback (WhisperKit large-v3-turbo, ANE):** 10 s ÷ ~30–50× ≈ 200–330 ms compute + 218 ms encoder warm ≈ **~300–500 ms** from release. INFERRED from M3 Max encoder 218 ms + M2 Ultra 42–72× RTF scaled.
- **whisper.cpp large-v3-turbo Metal:** 10 s ÷ ~25× ≈ **~350–400 ms**. INFERRED (M2 Pro 60 s→2.8 s baseline scaled up for M4 Pro).

Net: with Parakeet-FluidAudio primary, raw ASR finalization lands **well under ~250 ms** after the user releases Fn, leaving latency headroom for the LLM cleanup layer to still feel real-time.


## Sources
- https://arxiv.org/html/2507.10860v1
- https://github.com/senstella/parakeet-mlx
- https://github.com/anvanvan/mac-whisper-speedtest
- https://github.com/kyutai-labs/delayed-streams-modeling
- https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2
- https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- https://github.com/snakers4/silero-vad
- https://github.com/moonshine-ai/moonshine
- https://arxiv.org/html/2602.12241v1
- https://huggingface.co/UsefulSensors/moonshine-streaming-tiny
- https://github.com/FluidInference/FluidAudio
- https://raw.githubusercontent.com/FluidInference/FluidAudio/main/Documentation/Benchmarks.md
- https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml
- https://justvoice.ai/blog/whisper-benchmark-apple-silicon-m3-m4
- https://whispernotes.app/blog/introducing-whisper-large-v3-turbo
- https://github.com/argmaxinc/WhisperKit
- https://github.com/argmaxinc/WhisperKit/discussions/243
- https://github.com/huggingface/distil-whisper
- https://huggingface.co/distil-whisper/distil-large-v3
- https://github.com/ggml-org/whisper.cpp/issues/1979
- https://huggingface.co/kyutai/stt-2.6b-en
- https://kyutai.org/stt/
- https://pypi.org/project/moshi-mlx/
- https://altersquare.io/vad-end-of-speech-detection-hardest-problem-production-voice-agents/
- https://developers.deepgram.com/docs/understanding-end-of-speech-detection
- https://www.voicci.com/blog/apple-silicon-whisper-performance.html
- https://mikeesto.com/posts/parakeet-tdt-06b-v2/
- https://venturebeat.com/ai/nvidia-launches-fully-open-source-transcription-ai-model-parakeet-tdt-0-6b-v2-on-hugging-face
