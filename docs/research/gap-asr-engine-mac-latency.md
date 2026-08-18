# v2-211178466b45b9c760a5d0ef9113e3978f1a2

## DECISION: Keep FluidAudio as a Mac-only ASR backend behind an engine-abstraction trait from v1. The single-engine `ort`/Parakeet CPU path does NOT reliably meet a perceived ~300–500 ms budget on a mid-tier Apple-Silicon laptop, and the CoreML EP does NOT deliver the ANE for a Parakeet-TDT int8 graph.

---

### 0. THE DECISIVE FACT (new, OBSERVED): Handy already ships Parakeet ONNX CPU-only on macOS — it does NOT use CoreML/ANE

The `ort-coreml` feature is **never enabled** in Handy. `cjpais/Handy/src-tauri/Cargo.toml` (OBSERVED):
- Base dep: `transcribe-rs = { version = "0.3.8", features = ["onnx"] }` — `["onnx"]` only, **no `ort-coreml`**.
- `[target.'cfg(target_os = "macos")'.dependencies]` adds Metal **only to `transcribe-cpp` (whisper.cpp)**: `transcribe-cpp = { ..., features = ["metal"] }`. It does **NOT** add `ort-coreml` to `transcribe-rs`. Parakeet on Mac therefore inherits the base CPU-only ONNX build.
- The Windows target block's own comment states it plainly: *"ONNX Runtime on Windows is CPU-only (no ort-directml), **matching macOS/Linux**. … Base `transcribe-rs` (features = ["onnx"]) is inherited here, so Parakeet/Moonshine/etc. still run on CPU."* (OBSERVED verbatim.)

**Implication:** the reference implementation the whole Tauri+Rust pivot is modeled on runs Parakeet TDT on the **CPU execution provider on every platform, macOS included**. No ANE, no Metal, no CoreML for Parakeet. This is a deliberate, current (Cargo 0.3.8) engineering choice, not an oversight.

---

### 1. Q1 — Does ORT's CoreML EP support the Parakeet-TDT-0.6B ONNX operators? Which subgraphs fall to CPU?

**The exported Parakeet graph is 3 ONNX sessions** (OBSERVED, transcribe-rs README "Directory Layouts" + `src/onnx/parakeet/mod.rs`):
- `nemo128.onnx` — mel-feature preprocessor (fp32).
- `encoder-model.int8.onnx` — FastConformer encoder (int8 QDQ).
- `decoder_joint-model.int8.onnx` — TDT prediction network + joint (int8 QDQ); LSTM prediction net exposed as `input_states_1/2` → `output_states_1/2` (h,c). Source: istupakov/onnx-asr exports (OBSERVED, README acknowledgments).

**CoreML EP supported-op reality** (OBSERVED, onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html):
- NeuralNetwork format: ~35 ops — Add, Conv, Gemm, MatMul, Softmax, Relu, Sigmoid, Tanh, Concat, Reshape, Transpose, Slice, etc.
- MLProgram format: the above **plus** Gelu, Erf, LayerNormalization, GroupNormalization, InstanceNormalization, ReduceMean/Max, LayerNorm, etc.
- **NOT present in either list:** LSTM, GRU, RNN, or any transducer op; and **no int8/quantized ops** (QuantizeLinear/DequantizeLinear/QDQ, ConvInteger, MatMulInteger, DynamicQuantizeLinear). (OBSERVED — confirmed absent in both format tables.)
- Dynamic shapes: `RequireStaticInputShapes` — *"By default the CoreML EP will also allow inputs with dynamic shapes, however performance may be negatively impacted by inputs with dynamic shapes."* (OBSERVED). Parakeet's audio length is dynamic per utterance → penalty/partition.
- `MLComputeUnits="CPUAndNeuralEngine"` *"does not guarantee the entire model to be executed using ANE only."* (OBSERVED.)

**Partitioning verdict for THIS graph:**
- **Decoder/joint → 100% CPU.** It contains the LSTM prediction net (unsupported) and is int8 (unsupported) → whole session runs on the CPU EP. (OBSERVED op-list + INFERRED partition.)
- **Encoder → effectively CPU.** It is int8 QDQ; CoreML EP has no int8 QDQ ops, so QDQ nodes and everything between them fall to CPU. An fp16/fp32 re-export of the encoder *could* place Conv/MatMul/Softmax/LayerNorm on CoreML, but the dynamic audio-length axis triggers the documented dynamic-shape penalty and further partitioning. (INFERRED, high confidence, from op-list + dtype.)
- **Preprocessor (nemo128) → mixed/CPU** (STFT/mel ops largely unsupported on CoreML EP). (INFERRED.)
- **Extra CoreML penalty unique to transducers:** the decode is a **Rust-driven greedy loop** — `decode_sequence()` runs `while t < encodings_len`, calling `decoder_joint.run()` once per frame, up to `MAX_TOKENS_PER_STEP = 10` tokens/frame (OBSERVED `src/onnx/parakeet/mod.rs`). A 10 s utterance ≈ 100 mel-frames/s ÷ `SUBSAMPLING_FACTOR = 8` ≈ **~125 encoder steps → ~125–250 separate `decoder_joint.run()` calls**. Under a CoreML EP each call would cross the CPU↔EP boundary with per-dispatch marshaling — CoreML would be **slower** here than plain CPU, on top of not supporting the ops. (INFERRED, high confidence.)

**Net:** enabling `ort-coreml` yields **no ANE acceleration** for a Parakeet-TDT int8 graph and is plausibly a net regression on the decoder loop. This matches Handy shipping CPU-only.

---

### 2. Q2 — Actual measured / best-available ORT Parakeet latency & RTF on Apple Silicon

**The single best-available measured Apple-Silicon number (OBSERVED, upgrades the prior "scaled-from-SBC" guess):**
`cjpais/transcribe-rs` README "Performance" table, Parakeet **int8**:

| Platform | Speed (RTFx) |
|---|---|
| **MBP M4 Max** | **~30× real-time** |
| Zen 3 (5700X) | ~20× |
| Skylake (i5-6500) | ~5× |
| Jetson Nano CPU | ~5× |

- This is the exact crate Handy ships (`transcribe-rs 0.3.8`). transcribe-rs defaults to CPU (`OrtAccelerator::Auto` → CoreML only if `ort-coreml` compiled; Handy doesn't). All other rows are explicitly CPU (Zen 3 / Skylake / "Jetson Nano CPU"). The M4 Max row is therefore a **CPU-EP** number. (OBSERVED that the number exists; INFERRED that it is CPU EP — high confidence from context + default.)
- **No published CoreML-EP RTF/latency number for Parakeet on Apple Silicon exists.** istupakov/onnx-asr — the actual ONNX export source — benchmarks only 9800X3D, Cortex-A53, T4 CUDA, RTX 5070 Ti TensorRT; **zero CoreML, zero Apple Silicon** rows (OBSERVED). This confirms the CoreML-EP-on-ANE path for Parakeet is **entirely unmeasured**.
- Config that produces the 30×: `ort = "=2.0.0-rc.12"` (OBSERVED, transcribe-rs Cargo.toml); `Session::builder().with_optimization_level(Level3).with_parallel_execution(true)`, intra-op threads = ORT default (≈ physical cores), EP list `[CPU::default()]` (OBSERVED `src/onnx/session.rs`).

**Latency translation (10 s utterance, batch finalize on key-release):**
- **M4 Max (top-tier), CPU EP:** 10 s ÷ 30 ≈ **~333 ms** compute. + preprocess/tokenize/inject ≈ **~400–550 ms end-to-end**. (OBSERVED base; INFERRED overhead.)
- **M4 Pro / M3 Pro (mid-high):** fewer P-cores + ~half memory bandwidth vs Max → **~20–24×** → 10 s ÷ 22 ≈ **~450 ms** compute → **~550–700 ms end-to-end**. (INFERRED by core/BW scaling; UNMEASURED.)
- **Mid-tier: base M2/M3/M4 Air, M1:** ~**12–18×** → 10 s ÷ 15 ≈ **~667 ms** compute → **~750–1000 ms end-to-end**; M1 ≈ ~10× → ~1 s compute. (INFERRED; UNMEASURED — stated plainly as an estimate, not a measurement.)

**Corroborating (non-ORT) Apple-Silicon Parakeet points (OBSERVED):** mac-whisper-speedtest M4 Pro 24 GB short clip — `parakeet-mlx` (MLX/GPU) **0.4995 s**, `fluidaudio-coreml` (ANE) **0.1935 s**. ORT-CPU is slower than the MLX-GPU 0.4995 s on the same clip → ORT-CPU short-clip ≳0.5 s, consistent with the table.

**CoreML-EP-for-Parakeet estimate (if FlowSpeak enabled `ort-coreml` itself):** best case CoreML accelerates only an fp16/fp32-re-exported encoder while the int8→fp cost doubles model memory; decoder loop stays on CPU and dominates short-utterance latency; expected **no better, likely worse, than the ~30×/mid-tier CPU numbers above**, and **UNMEASURED**. Do not treat any CoreML-EP Parakeet figure as real until benchmarked on-device.

---

### 3. Q3 — FluidAudio native CoreML/ANE vs ORT-CPU: latency AND power

**(a) Latency (OBSERVED, same machine class M4 Pro):**
- FluidAudio Parakeet **v2 batch: 2.1% WER, 145.8× RTFx overall / 128.6× median** (LibriSpeech-clean; Documentation/Benchmarks.md); README states **~190× RTFx** ("1 hour audio in ~19 s"). v3 English-US 5.4% WER / 207.4× RTFx.
- FluidAudio end-to-end for 10 s ≈ 10 ÷ 130 ≈ **~77–90 ms compute → ~150–250 ms key-release-to-transcript** (OBSERVED-derived, prior local-asr.md track).
- **ANE is ~4–6× faster than ORT-CPU on the same chip** (FluidAudio ~130–190× vs ORT-CPU ~20–30× on M4-class), and the gap *widens* on mid-tier chips because the ANE is present and comparably fast across the M-series while CPU throughput drops with fewer P-cores.
- Head-to-head M4 Pro 24 GB single clip (OBSERVED): fluidaudio-coreml **0.1935 s** vs parakeet-mlx 0.4995 s vs whisper.cpp-turbo 1.2293 s.

**(b) Power / thermals / battery (OBSERVED claims, FluidAudio README):**
- *"Models run efficiently on Apple's ANE for maximum performance with minimal power consumption."*
- *"inference offloaded to the Apple Neural Engine (ANE), resulting in less memory and generally faster inference."*
- *"optimized for background processing, ambient computing and **always on workloads** by running inference on the ANE, **minimizing CPU usage and avoiding GPU/MPS entirely**."*
- Reference CoreML compile/inference (iPhone 16 Pro Max, OBSERVED prior track): encoder 162 ms warm / 3361 ms cold; decoder 8.11 ms warm.
- **Why this matters for an always-resident dictation app (INFERRED, well-established ANE property):** ORT-CPU Parakeet saturates all P-cores for the full ~333–1000 ms of every finalize — a repeated multi-watt burst (Apple-Silicon P-core cluster peaks ~10–20 W) that heats the chassis and drains battery on a tool invoked dozens–hundreds of times/day. The ANE performs the same inference at roughly an order of magnitude lower energy (hundreds of mW–low single-watt), sustained and fanless. For a background-resident dictation app, the ANE's power/thermal advantage is arguably as decisive as the latency advantage. No exact watt/mAh numbers are published (OBSERVED gap) — the advantage is directional but strong and is FluidAudio's explicit design goal.

FluidAudio license: **Apache-2.0** SDK; bundled CoreML models MIT/Apache-2.0 (OBSERVED README). Parakeet weights CC-BY-4.0 (attribution) (OBSERVED HF card). macOS 14.0+/iOS 17.0+ → runs on the 15.7.3 target. Swift-only; no Windows.

---

### 4. Q4 — BOTTOM LINE: does single-engine ORT/Parakeet meet the budget? Numbers that decide it

Budget: perceived ~300–500 ms; committed <900 ms; 10 s utterance; batch finalize.

| Engine / machine | Compute (10 s) | End-to-end | Perceived 300–500 ms? | Committed <900 ms? | Power |
|---|---|---|---|---|---|
| **FluidAudio ANE**, M4 Pro | ~77–90 ms (OBS) | **~150–250 ms** (OBS-derived) | ✅ comfortably | ✅ | very low (ANE) |
| **ORT-CPU (Handy path)**, **M4 Max** top-tier | ~333 ms (OBS 30×) | ~400–550 ms | ⚠️ borderline, best case | ✅ | high (all P-cores) |
| ORT-CPU, **M4/M3 Pro** | ~450 ms (INF ~22×) | ~550–700 ms | ❌ over | ✅ | high |
| ORT-CPU, **mid-tier M1/M2/M3/M4 base Air** | ~600–1000 ms (INF ~10–18×) | ~750–1150 ms | ❌ | ⚠️/❌ (M1 & long utterances slip past 900 ms) | high |

**Answer:** The single-engine ORT/Parakeet **CPU** path meets the perceived ~300–500 ms budget **only on top-tier M4 Max/Pro silicon, and only marginally**. On the **mid-tier Apple-Silicon laptop the question specifies (base M-series Air, M1)** it lands at **~600–1000+ ms end-to-end** — it **misses the perceived budget outright** and, for longer utterances, **risks the committed <900 ms budget**, while burning multi-watt CPU bursts on an always-resident app. Routing through the CoreML EP does **not** rescue this: the int8 QDQ encoder and LSTM transducer decoder are unsupported and fall back to CPU (Q1), and there is **no measured evidence** it helps — it is likely a regression on the ~200-call decoder loop.

**Therefore FlowSpeak must keep FluidAudio as a Mac-only ASR backend behind an engine-abstraction trait from v1.** This does reintroduce the Swift dependency the Tauri+Rust pivot aimed to remove, and it forks the "one codebase" promise **at the ASR-engine seam only** — which is the right and minimal place to fork:
- Handy already models ASR as a swappable engine (`LoadedEngine` enum: `TranscribeCpp` vs ONNX), so the trait boundary is a natural, low-cost seam — not a rewrite. (OBSERVED, oss-clones track.)
- Everything else stays shared Rust/Tauri: hotkey/CGEventTap, text injection, VAD, LLM cleanup, UI. Only the Mac ASR backend calls into a small Swift/FluidAudio (or FFI/sidecar) shim; Windows uses `transcribe-rs`/`ort` CPU (or DirectML/CUDA) Parakeet.
- Fallback ladder on Mac: FluidAudio (ANE, primary) → `transcribe-rs` ONNX CPU (portable fallback if CoreML model compile fails). FlowSpeak gets ANE-class latency + power on Mac and keeps a single ORT path on Windows.

**One-line decider:** FluidAudio ANE = ~150–250 ms at low power (OBSERVED); best-case ORT-CPU = ~400 ms on an M4 Max and ~700–1000 ms on the mid-tier target (OBSERVED 30× top-tier + INFERRED scaling); the CoreML EP cannot run the transducer on the ANE (OBSERVED op-list). The ~4–6× latency gap and the order-of-magnitude power gap on an always-resident app justify a Mac-only FluidAudio backend behind a trait.

---

### 5. Reusable spec facts (OBSERVED)
- `ort` pinned `=2.0.0-rc.12`; features: `ort-coreml`, `ort-cuda`, `ort-tensorrt`, `ort-directml`, `ort-rocm`, `ort-webgpu`, `ort-xnnpack` (transcribe-rs Cargo.toml). `OrtAccelerator::Auto` default; Auto pushes CoreML EP **only if `ort-coreml` compiled**, always appends `CPU::default()` as final fallback; DirectML/WebGPU excluded from Auto (need `parallel_execution(false)`+`memory_pattern(false)`). `set_ort_accelerator()` must be called before model load.
- Parakeet model files: `encoder-model.int8.onnx`, `decoder_joint-model.int8.onnx`, `nemo128.onnx`, `vocab.txt`. Input: 16 kHz mono 16-bit PCM. `SUBSAMPLING_FACTOR=8`, `MAX_TOKENS_PER_STEP=10`, `DEFAULT_LEADING_SILENCE_MS=250`. Greedy TDT loop is Rust-driven over `decoder_joint.run()`.
- Handy Windows/macOS/Linux all CPU-only for ORT by design; DirectML dropped because pyke's prebuilt ORT ships `/arch:AVX2` baseline that crashes pre-Haswell CPUs (build links baseline ORT dynamically via `ORT_LIB_LOCATION`). (OBSERVED Handy Cargo.toml comments — relevant to the Windows ORT plan too.)
- FluidAudio: Parakeet v2 2.1% WER/145.8× (v3 5.4%/207.4×), ~190× README; Apache-2.0; macOS 14+/iOS 17+; ANE-only, avoids GPU/MPS; bundles Silero VAD v6.2.1 + diarization.

## Open questions
- Unmeasured: actual on-device RTF/latency of Parakeet-TDT-0.6B via ort/transcribe-rs CPU EP on M1/M2/M3/M4-base (mid-tier) and M4 Pro — only the M4 Max ~30x CPU point is published; the mid-tier figures here are core/bandwidth-scaled estimates and should be benchmarked on real hardware before finalizing the budget.
- Unmeasured: whether enabling ort-coreml with an fp16/fp32-re-exported Parakeet encoder yields any net speedup over CPU on Apple Silicon (encoder-only CoreML while decoder stays CPU) — no published number exists; needs a direct on-device test.
- No published watt/mAh numbers quantifying FluidAudio ANE vs ort-CPU Parakeet energy per transcription on Apple Silicon — the power advantage is directional (ANE design goal) but not numerically benchmarked.
- Exact ort 2.0.0-rc.12 CoreML::default() config (ModelFormat NeuralNetwork vs MLProgram, default MLComputeUnits) was not fetched from ort source; moot for Handy (not enabled) but relevant if FlowSpeak enables ort-coreml itself.
- FFI/integration cost of calling FluidAudio (Swift) from a Tauri/Rust core — swift-bridge vs C-ABI shim vs XPC sidecar — not yet scoped; determines how heavy the reintroduced Swift dependency actually is.

## Sources
- https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html
- https://raw.githubusercontent.com/cjpais/transcribe-rs/main/README.md
- https://raw.githubusercontent.com/cjpais/transcribe-rs/main/Cargo.toml
- https://raw.githubusercontent.com/cjpais/transcribe-rs/main/src/accel.rs
- https://raw.githubusercontent.com/cjpais/transcribe-rs/main/src/onnx/session.rs
- https://raw.githubusercontent.com/cjpais/transcribe-rs/main/src/onnx/parakeet/mod.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/Cargo.toml
- https://api.github.com/repos/cjpais/transcribe-rs/git/trees/main?recursive=1
- https://raw.githubusercontent.com/FluidInference/FluidAudio/main/Documentation/Benchmarks.md
- https://raw.githubusercontent.com/FluidInference/FluidAudio/main/README.md
- https://github.com/istupakov/onnx-asr
- https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx
- https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2
- https://mikeesto.com/posts/parakeet-tdt-06b-v2/
- https://github.com/anvanvan/mac-whisper-speedtest
- /Users/mannbellani/FlowSpeak/docs/research/local-asr.md
- /Users/mannbellani/FlowSpeak/docs/research/oss-clones.md
- /Users/mannbellani/FlowSpeak/docs/research/macos-architecture.md
