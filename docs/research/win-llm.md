# v2-7946dcc6f29881d7ce1d31f024a344d30abfb

## TRACK: Local Cleanup-LLM on Windows Hardware Variance (FlowSpeak)

### 0. Framing — the workload and why Windows breaks the Mac assumption
- **Cleanup workload profile** (from cleanup-llm research): deletion-style edit — strip fillers (um/uh), restore punctuation/casing, light reformat, apply user dictionary. ~50-word (~67-token) input → ~67-token output. It is an **instruction-following + editing** task; IFEval matters, MMLU/MATH do not. Mac spec: **Qwen3-4B-Instruct-2507 Q4_K_M** (~2.4–2.6 GB), llama.cpp embedded in-process, resident, prefill-on-hotkey-down, streaming, ~300–500 ms perceived. INFERRED-carryover.
- **The Windows problem restated in latency terms.** With the system prompt KV-cached resident (prefilled once on hotkey-down), the *per-dictation* cost is only: prefill of the transcript (~70 tok) + decode of the output (~70 tok). Decode (tg) is **memory-bandwidth-bound** and dominates; prefill (pp) is compute-bound and small for 70 tokens. So **decode tok/s at the given model size is the deciding number.** The whole tiering below is: *what decode rate does this machine give on a 4B/1.7B/1B Q4, and does 70 tokens land under budget?*
- **Scaling model used throughout** (INFERRED, standard): tg scales ~inversely with quantized weight bytes. 7B Q4≈4.1 GB, 4B Q4≈2.4 GB, 1.7B Q4≈1.1 GB, 1B Q4≈0.7 GB → **4B tg ≈ 1.7× a 7B tg; 1.7B ≈ 3.7×; 1B ≈ 4–5×** (overhead-capped). pp scales similarly (~inverse params). Public llama.cpp scoreboards standardize on **Llama-2-7B Q4_0**, so all raw numbers below are 7B unless stated and I scale to 4B/1.7B/1B for the cleanup call.

---

### 1. llama.cpp backend performance on Windows — measured numbers
All pp512 (prompt-processing t/s) / tg128 (generation t/s), Llama-2-7B Q4_0, from the CUDA/ROCm/Vulkan scoreboard (knightli, Apr 2026) and the two official ggml discussions (#10879 Vulkan, #15013 CUDA). OBSERVED-secondary.

**(a) NVIDIA laptop dGPU — the fast Windows tier**
| GPU (mobile) | Backend | pp512 | tg128 (7B) | →4B tg (×1.7, INFERRED) |
|---|---|---|---|---|
| RTX 4060 Mobile | Vulkan | 2135 | 59.5 | ~101 |
| RTX 3070 Mobile | Vulkan | 1689 | 63.6 | ~108 |
| RTX 3060 Mobile | Vulkan | 1060 | 49.0 | ~83 |
| RTX 4050 Mobile (6 GB) | Vulkan | 1154 | 41.9 | ~71 |
| RTX 4050 Laptop | **CUDA** | 1726 | 43.7 | ~74 |
| GTX 1660 Ti Mobile | Vulkan | 512 | 56.6 | ~96 |
- **CUDA is 10–26 % faster than Vulkan on the same NVIDIA GPU** (OBSERVED: RTX 5090 CUDA pp 14073 vs Vulkan 10381 = ~26 % faster; RTX 4090 ~21 %). tg gap is smaller (bandwidth-bound). So CUDA is a **perf upgrade, not a necessity**, for NVIDIA.
- 4B Q4 (~2.4 GB weights + KV) fits in **6 GB VRAM** → RTX 3050/4050 6 GB and up run it fully offloaded. **Committed cleanup ≈ 70/80 ≈ 0.9 s; perceived (streaming TTFT) ≈ 0.2–0.3 s.** Meets Mac-class budget.

**(b) AMD APU / iGPU (Vulkan, shared RAM)**
| iGPU / APU | pp512 | tg128 (7B) | →4B tg | →1.7B tg |
|---|---|---|---|---|
| Ryzen AI Max+ 395 (Strix Halo, RDNA3.5) | 1289 | 53.6 | ~91 | — |
| Ryzen AI 9 300 series (Radeon 890M, RDNA3.5) | 479 | 22.4 | ~38 | ~83 |
| Ryzen 7000 (780M, RDNA3) | 282 | 19.9 | ~34 | ~74 |
| Ryzen 8000 (780M) | 266 | 20.5 | ~35 | ~76 |
| Ryzen Z1 Extreme (780M handheld) | 199 | 18.8 | ~32 | ~70 |
| Ryzen 6000 (680M) | 241 | 21.3 | ~36 | ~79 |
| Ryzen 5000 (Vega) | 91 | 11.0 | ~19 | ~41 |
| Ryzen 4000 (Vega) | 104 | 9.6 | ~16 | ~36 |
- Independent corroboration (zenvanriel, iGPU Vulkan offload): **AMD Radeon 780M → 3B models 30–50 t/s, 7B Q4 12–20 t/s**; Intel Iris Xe → **3B 15–25 t/s, 7B 6–10 t/s**. TechHara (Ryzen 5 5600H, Vega 7): iGPU Vulkan pp **76 t/s vs CPU 34 t/s (2× prefill win)** but **tg unchanged ~10 t/s** (bandwidth-bound; iGPU and CPU share the same DDR). OBSERVED.
- **Key AMD reality:** on RDNA3 APUs (780M/890M) a 4B Q4 gives ~34–38 tg → **committed 70-tok cleanup ≈ 1.9–2.1 s, perceived ~0.35 s streaming.** Good with streaming, borderline for full-commit. Older Vega APUs (Ryzen 4000/5000) at ~16–19 tg (4B) are too slow for 4B → drop to 1.7B.
- **iGPU uses system RAM (UMA/VGM).** AMD "Variable Graphics Memory" can dedicate up to ~half of system RAM to the iGPU; on 16 GB that's workable for a 2.4 GB model, on 8 GB it starves the OS. INFERRED (AMD VGM; direct blog fetch 403'd this session).

**(c) Intel iGPU (Vulkan) — the weak-but-common tier**
- Iris Xe (i7-1185G7, Tiger Lake GT2): Vulkan **pp512 106, tg128 5.9** (7B); an earlier build measured 50.9/8.3 — driver-sensitive. OBSERVED (#10879). Practical 3B ~15–25 tg (zenvanriel). → **4B tg ≈ 10–14 → committed 70-tok ≈ 5–7 s (too slow); 1.7B ≈ 22–30 → ~2.3–3.2 s; 1B ≈ 30–45 → ~1.5–2.3 s.**
- **Intel has a faster non-Vulkan path: SYCL.** On Arc A750, SYCL pp **1616 vs Vulkan 88** and tg **36.6 vs 27.6** (OBSERVED #10879) — SYCL/oneAPI massively out-prefills Vulkan on Intel because ANV/Mesa lacks proper Xe coopmat. But SYCL needs the oneAPI runtime (heavy bundle) and mainly helps discrete Arc, not Iris Xe iGPUs. **For Iris Xe, Vulkan is the pragmatic choice but is slow → this tier should run a 1B/1.7B or default to Claude.**

**(d) CPU-only (AVX2), no usable GPU — the fallback tier**
- 7B Q4 CPU tg: Ryzen 5 5600H (6c) **~10 t/s** (TechHara); general "10–15 t/s on Llama-3 8B Q4" (myaihardware, multiple). Desktop CPUs (9950X/14900K) reach pp 190–220 but still tg 11–12 on 8B. pp512 CPU is low: **5600H = 34 t/s (7B)**. OBSERVED.
- Scaled to cleanup sizes (mid 8-core AVX2 laptop, resident system-prompt KV): **4B ≈ 16–18 tg, pp ~55 → committed 70-tok ≈ 70/17 + 70/55 ≈ 4.1 + 1.3 = ~4–4.5 s (FAIL).** **1.7B ≈ 35–40 tg → ~1.8–2.0 s (borderline).** **1B ≈ 50–60 tg, pp ~150 → 70/55 + 70/150 ≈ 1.3 + 0.5 = ~1.7 s (near-budget).**
- **Direct answer to "is a ~50-token cleanup under ~1.5 s feasible CPU-only?":** With a **4B — NO** (~4 s). With **1.7B — borderline** (~1.9 s). With **1B — marginally yes** (~1.5–1.8 s) *only if* the system prompt is KV-cached resident, output is length-capped, and threads are pinned. Perceived (streaming first-token) is ~0.5–0.7 s in all these, but full commit is what breaks the 4B. **CPU-only ⇒ must drop to 1B-class or route to Claude.**
- AVX2 vs AVX512: AVX-512 (Zen4/5, some Intel) lifts pp materially; AVX2 is the floor. Machines **without AVX2** (pre-2013 / Atom / some Celeron) should not run any local LLM → raw passthrough or Claude only.

---

### 2. llama.cpp Windows build & distribution story
- **Prebuilt release artifacts are split per backend** (OBSERVED, releases page, build b10064): `llama-bXXXX-bin-win-cpu-x64.zip`, `-cpu-arm64.zip`, `-vulkan-x64.zip`, `-cuda-12.4-x64.zip`, `-cuda-13.3-x64.zip`, `-hip-radeon-x64.zip`, `-sycl-x64.zip`, `-openvino-2026.x-x64.zip`, `-opencl-adreno-arm64.zip`. **CUDA runtime is a separate ~373 MB** `cudart-llama-bin-win-cuda-12.4-x64.zip` per CUDA version.
- **Runtime backend selection is a first-class feature:** build with **`-DGGML_BACKEND_DL=ON`** → each backend compiles to its own DLL (`ggml-vulkan.dll`, `ggml-cuda.dll`, `ggml-cpu-*.dll`) loaded at runtime; `--list-devices` / `--device` (or the C API auto-load) pick at runtime. You can build **multiple backends into one install** (`-DGGML_CUDA=ON -DGGML_VULKAN=ON`). OBSERVED (docs/build.md).
- **`-DGGML_CPU_ALL_VARIANTS=ON`** produces multiple CPU micro-arch DLLs (sse4.2 / avx / avx2 / avx512 …) and loads the best for the detected CPU at runtime — **this is how you ship ONE binary that runs on AVX2 and non-AVX2 machines** without crashing on illegal-instruction. (Not spelled out in build.md but is the ggml CI/release mechanism; INFERRED from artifact structure + GGML_BACKEND_DL.) Pair with `-DGGML_NATIVE=OFF` so you don't hard-bake the build-machine's ISA.
- **Recommended FlowSpeak distribution (INFERRED):**
  1. **Bundle by default: `ggml-cpu` (all-variants) + `ggml-vulkan.dll`.** Vulkan is the single MVP GPU backend — one DLL covers Intel Iris/Arc + AMD Radeon + NVIDIA, needs only the GPU vendor's normal Windows driver (Vulkan ICD is present on essentially all Win10/11 with GPU drivers), **no vendor SDK at runtime, no 370 MB cudart.** Perf is ~74–90 % of native (OBSERVED cross-vendor).
  2. **Optionally download `ggml-cuda.dll` + `cudart` (~370 MB) on demand** only for detected NVIDIA users who want the extra 10–26 %. Don't ship it to everyone.
  3. Skip SYCL/HIP/OpenVINO in v1 (heavy vendor runtimes, marginal audience) — Vulkan already covers their hardware.
- This is exactly the "ship prebuilt DLLs per backend + runtime backend selection" model the track asked about, and llama.cpp supports it natively. **One codebase, embed `libllama`, ship Vulkan+CPU DLLs, download CUDA opportunistically.**

---

### 3. Smaller-model options for weak hardware (quality vs size)
IFEval (instruction-following) is the right proxy for our deletion-style cleanup. Lower-param models degrade IF fastest.
| Model | Params | Q4 size | IFEval | License | Notes |
|---|---|---|---|---|---|
| Qwen3-4B-Instruct-2507 | 4B | ~2.4 GB | **83.4** | Apache-2.0 | Mac default; the quality ceiling. OBSERVED (carryover) |
| Llama-3.2-3B-Instruct | 3B | ~2.0 GB | **77.4** | Llama-3.2 Community | Strong mid option. OBSERVED (HF card) |
| Qwen3-1.7B | 1.7B | ~1.1 GB | ~68–72 (INFERRED; HF card omits the number, could not re-fetch primary) | Apache-2.0 | Best small-model IF/size; thinking+non-thinking, use `enable_thinking=False`. 32K ctx. OBSERVED (params/license), IFEval INFERRED |
| Llama-3.2-1B-Instruct | 1.23B | ~0.7 GB | **59.5** | Llama-3.2 Community | The CPU/8 GB floor. Usable for deletion cleanup with a tight prompt but over-edits/hallucinates more. OBSERVED (HF card; MMLU 49.3, GSM8K 44.4) |
| Gemma-3-1B-it | 1B | ~0.7 GB (QAT int4 avail.) | not published on card (BBH 28.4, HellaSwag 62.3) | Gemma (custom AUP) | Weak reasoning at 1B; license less clean for bundling. OBSERVED |
- **Selection guidance:** Weak tiers should prefer **Qwen3-1.7B (Apache-2.0, best small IF/byte)** over the 1B where RAM/latency allow; fall to **Llama-3.2-1B** only on CPU-only/8 GB. Note the license split: **Qwen3 (1.7B/4B) is Apache-2.0 = cleanest to bundle**; Llama-3.2 and Gemma carry custom AUP/naming clauses — favors an all-Qwen ladder (1.7B → 4B) for legal simplicity across both platforms.
- **Sub-LLM alternative for the weakest tier (INFERRED):** a deterministic "raw+" cleanup — regex filler-strip + truecasing + a tiny ONNX **punctuation-restoration** model (e.g. a distil-BERT punctuator, ~100–300 MB, runs <100 ms CPU). No hallucination, no GPU, sub-100 ms. Sits between raw passthrough and a real LLM; good default for CPU-only/8 GB machines that can't host a 1B comfortably.
- **Prompt-hardening for small models:** the smaller the model, the more conservative the instruction should be (bias toward "minimal edit / keep close to raw"), few-shot examples, low temperature (0–0.2), tight `max_tokens` (≈ input_len×1.2). A 1B at IFEval 59.5 will otherwise drop content or rewrite meaning.

---

### 4. ONNX Runtime GenAI / DirectML path — does it beat llama.cpp Vulkan on iGPU?
- **onnxruntime-genai** (MIT, github.com/microsoft/onnxruntime-genai): EPs = **CPU, CUDA, DirectML, QNN (NPU), OpenVINO, WebGPU** (+ NvTensorRT WIP, AMD GPU roadmap). Models: **Phi (3/3.5/4), Llama, Qwen, Gemma, Mistral, Granite, DeepSeek, Whisper.** APIs: **Python, C#, C/C++, Java.** Packages split per EP (`onnxruntime-genai`, `-cuda`, `-directml` …). OBSERVED.
- **DirectML** = Microsoft's DX12 compute abstraction covering **AMD + Intel + NVIDIA GPUs with one binary** — same portability pitch as Vulkan, but Windows-only (kills the dual-platform "one codebase" goal — DirectML has no macOS).
- **Measured DirectML LLM perf:** Phi-3-mini-4k INT4 (AWQ) on **RTX 4090: 245–267 tok/s** (OBSERVED, onnxruntime.ai). Microsoft claims Phi-3-mini "**up to 3× faster than llama.cpp for large sequence lengths**" and Phi-2 "3.9× avg / 13.4× at long seq" — **but these are (a) long-sequence prefill-dominated, not our 70-token case, and (b) measured on discrete/server GPUs, NOT iGPUs.** No published DirectML-vs-Vulkan iGPU head-to-head exists (OBSERVED gap). Community consensus (INFERRED): on Intel/AMD **iGPUs**, current llama.cpp Vulkan is **competitive-to-faster** than DirectML and uses less overhead/VRAM; DirectML's edge is at long context on strong GPUs.
- **Verdict:** ONNX GenAI/DirectML does **not** clearly beat llama.cpp Vulkan on iGPU for a short cleanup call, **is Windows-only (breaks single-codebase)**, and locks you to ONNX-format models (a smaller, harder-to-produce set than GGUF). **Its one unique advantage is the NPU (QNN) path**, which llama.cpp cannot use. Recommendation: **do not adopt ONNX GenAI as the default engine**; keep llama.cpp+Vulkan cross-platform, and only consider ONNX/QNN as an *opportunistic Copilot+ NPU path* if v2 wants it.

---

### 5. Windows AI Foundry / Phi Silica / Windows ML / Foundry Local (the NPU + "built-in model" question)
- **Copilot+ PC bar = NPU ≥ 40 TOPS + (de facto) 16 GB RAM** (OBSERVED, npu-devices doc). Qualifying silicon: **Qualcomm Snapdragon X/X Elite, Intel Core Ultra 200V (Lunar Lake), AMD Ryzen AI 300.** These are a **small single-digit % of the installed Windows base today** (INFERRED — Copilot+ only shipped mid-2024+); your dual-platform clone cannot rely on them.
- **Phi Silica** (learn.microsoft.com/windows/ai/apis/phi-silica): a **~3.3B Phi-3.5-mini-derived** on-device SLM, **preinstalled on the Copilot+ NPU**, uses **speculative decoding + prompt compression** on NPU. Reported (Microsoft Dec-2024 launch, widely cited, could not re-fetch primary this session): **TTFT ~230 ms, ~20 tok/s decode, 4K context** — i.e. **NPU decode is ~20 tok/s, NOT faster than a mid iGPU**; the NPU's win is **power/battery**, not latency. INFERRED-secondary.
- **Phi Silica is a poor primary dependency for a 3rd-party product:**
  - **Limited Access Feature** — requires an **LAF unlock token** request from Microsoft (friction/gating). OBSERVED.
  - **Being deprecated:** replaced by **"Aion Instruct"** — sideloadable Sept 2026, Insider Oct 2026, **Phi Silica removed Nov 2026** (OBSERVED). Building on it now is building on sand.
  - **Not available in China** (OBSERVED). Content moderation (`ContentFilterOptions`) is on by default.
  - Non-Copilot+ **GPU path exists** (NVIDIA RTX 30+ 6 GB / AMD RX 9060+ 6 GB) but **requires Developer Mode enabled + latest IHV driver + Insider build 26300.8553**, has **no speculative decoding / no prompt compression**, and **downloads a multi-GB model on demand via `EnsureReadyAsync`** — not shippable to normal users. OBSERVED.
  - API is WinRT (`Microsoft.Windows.AI.Text.LanguageModel`, `GenerateResponseAsync`, `GetReadyState`/`EnsureReadyAsync`) via **Windows App SDK** — **callable from a Win32 (unpackaged) app** via the App SDK, C#/C++. OBSERVED.
- **Windows ML (new)** is the recommended NPU access path: **auto-discovers hardware and downloads the right EP (QNN for Qualcomm, OpenVINO for Intel) via Windows Update**, falls back GPU→CPU. You ship an ONNX model, WinML picks NPU/GPU/CPU. OBSERVED. Still Windows-only.
- **Foundry Local** (learn.microsoft.com/azure/ai-foundry/foundry-local) is the most interesting Microsoft option: an **end-to-end local runtime built on ONNX Runtime, ~20 MB added to your app**, **in-process OpenAI-compatible SDK (C#/JS/Rust/Python)**, **auto-detects hardware and selects best EP (CPU/GPU-DirectML-CUDA/NPU-QNN), auto-falls back to CPU**, **downloads+caches curated quantized models on first use** (catalog: GPT-OSS, Qwen, DeepSeek, Mistral, Phi, Whisper), **runs on Windows, macOS (Apple Silicon), and Linux.** OBSERVED. It literally solves "hardware detection → best backend → model download" for you — **but** it's ONNX-only (curated catalog, not arbitrary GGUF), a Microsoft-controlled dependency, and its macOS/Linux maturity for our exact 4B cleanup model is unproven. **Worth a spike as an alternative to hand-rolled llama.cpp tiering, especially because it's genuinely cross-platform; but for control/latency/model-choice, embedded llama.cpp+Vulkan remains the recommended primary.**
- **Net NPU recommendation:** **Do NOT build a dedicated NPU path in v1.** NPU LLM decode (~10–20 tok/s) is not a latency win over iGPU/dGPU; the audience is tiny; the best API (Phi Silica) is gated + being deprecated; and any NPU path is Windows-only, fighting the single-codebase requirement. Revisit via **Windows ML / Foundry Local** in v2 as a *power-efficiency* option on Copilot+ laptops (matters on battery), not a speed one.

---

### 6. Hardware detection on Windows (signals + APIs)
INFERRED (standard Win32/DXGI/CPUID), for the auto-tier selector:
- **RAM:** `GlobalMemoryStatusEx` (total/avail) or `GetPhysicallyInstalledSystemMemory`.
- **GPU vendor/type/VRAM:** DXGI `IDXGIFactory1::EnumAdapters1` → `DXGI_ADAPTER_DESC` (VendorId **0x10DE NVIDIA / 0x1002 AMD / 0x8086 Intel**; `DedicatedVideoMemory` large ⇒ dGPU, ~0/shared ⇒ iGPU). Cross-check with Vulkan `vkEnumeratePhysicalDevices` + `VkPhysicalDeviceProperties.deviceType` (`DISCRETE_GPU`/`INTEGRATED_GPU`) — also confirms a working Vulkan ICD (required to use the Vulkan backend at all).
- **CUDA availability:** attempt to load `nvcuda.dll` / query `nvml`; presence ⇒ offer CUDA download.
- **AVX2 / AVX-512:** `__cpuidex` leaf 7 (AVX2 = EBX bit 5; AVX-512F = EBX bit 16). Gate all local LLM on AVX2.
- **NPU / Copilot+:** enumerate via **DXCore** (`IDXCoreAdapterList`, `DXCORE_ADAPTER_ATTRIBUTE_D3D12_GENERIC_ML` / MCDM) or check for QNN/OpenVINO EP presence; ≥40 TOPS ⇒ Copilot+.
- **Core count** for llama.cpp `--threads` tuning (physical cores, not SMT).

---

### 7. Co-residency RAM budget (cleanup LLM + local ASR, Windows)
- 4B Q4 ≈ **2.4–2.6 GB weights + ~0.3–0.5 GB KV** (≤1K ctx) ≈ **~3 GB**. 1.7B ≈ ~1.4 GB. 1B ≈ ~0.9 GB.
- Local ASR on Windows (cross-track; no ANE, so CPU/GPU): whisper.cpp large-v3-turbo q5 ≈ **1.0–1.6 GB**, or a Parakeet/ONNX ≈ **0.6–1.2 GB**. Budget ~1.5 GB.
- Windows 11 idle ≈ **3–4 GB**; target app + browser ≈ 1–3 GB.
- **16 GB machine:** 4B(3 GB)+ASR(1.5 GB)=4.5 GB models + 4 GB OS + 3 GB apps ≈ 11.5 GB → **~4 GB headroom, both models resident OK.** 4B viable, keep pinned (`--mlock`) to avoid cold-load.
- **8 GB machine:** 4.5 GB models + 4 GB OS ≈ **8.5 GB — already over budget** before any app; adding the browser forces **heavy paging → multi-second cold reloads → unusable.** Plus **iGPU offload steals more system RAM** (UMA/VGM allocates the model into "VRAM" carved from the same 8 GB). **8 GB ⇒ never keep a 4B resident.** Options: (a) local **1B (~0.9 GB) + tiny ASR (~0.6 GB)** ≈ 1.5 GB, workable; or (b) **ASR-only local + cleanup via Claude/raw.**
- **Rule:** local 4B requires **≥16 GB and either a dGPU or a recent (RDNA3/Arc) iGPU**. Below that, cleanup tier drops to 1.7B/1B or off-device.

---

### 8. Model download UX on Windows
INFERRED (mirrors Ollama/LM Studio/Foundry Local patterns):
- **Ship the installer WITHOUT weights** (installer ≈ app + CPU/Vulkan DLLs, tens of MB). Download the cleanup model on first local-mode use.
- **Default model dir: `%LOCALAPPDATA%\FlowSpeak\models`** (per-user, no admin, not roamed, survives app updates). `%PROGRAMDATA%` only if sharing across users (needs installer elevation). Let users relocate (large files, small SSDs) — store the path in settings.
- **Pick the download by detected tier**, so weak machines pull the **1B (~0.7 GB)** or **1.7B (~1.1 GB)**, not the **4B (~2.4 GB)** — saves bandwidth and never installs a model the machine can't run.
- **Resumable (HTTP range) + SHA256 verify + progress UI + metered-connection warning + size cap** (default auto-download cap; require explicit consent above it). This is exactly the pattern Foundry Local uses (multi-GB, background, progress, removable) and Phi Silica's `EnsureReadyAsync` consent dialog. OBSERVED-analog.
- Until the model is present: default to **Claude mode (if API key set)** or a "download to enable local" prompt — Claude is the zero-download fallback.

---

### 9. Fallback / mode policy (the product decision)
- **Deadline + raw-transcript safety net** (carryover from cleanup research, applies doubly on weak Windows HW): hard per-call deadline (~1200–1500 ms local budget target, but on slow tiers set higher, e.g. 2500 ms) and a **first-token deadline ~600–800 ms**; on breach/error/empty → **inject raw ASR transcript verbatim** so the user is never blocked. Cleanup is an enhancement, never a gate.
- **When local is too slow for a machine, default that machine to:** (1) **Claude Haiku 4.5** path if online + API key present (network-bound ~400–800 ms p50, but reliable regardless of local HW); else (2) **raw-ASR passthrough** (optionally + the deterministic punctuation/casing "raw+" cleanup). Surface a clear settings explanation: *"This PC's hardware runs local AI cleanup slowly; we've defaulted to Cloud cleanup (Claude) / raw text. You can force local in Settings."*
- Provider abstraction (`CleanupProvider` local↔claude) and streaming-insert are unchanged from the Mac spec — the Windows work is purely the **tier detector choosing model+backend+default-mode**.

---

### 10. TIER TABLE — hardware class → model + backend → expected cleanup latency → default mode
Latency = 70-tok input / 70-tok output cleanup, system prompt KV-resident. "Perceived" = streaming first-token; "Committed" = full output landed. INFERRED from the OBSERVED tok/s above.

| Tier | Hardware class | Model + backend | Prefill(70) | Committed (70 out) | Perceived | Default cleanup mode |
|---|---|---|---|---|---|---|
| **A — Fast** | NVIDIA dGPU ≥6 GB (RTX 30/40/50 mobile+desktop) **or** Strix Halo (Ryzen AI Max 395), **≥16 GB** | **Qwen3-4B Q4_K_M**, **CUDA** (dl on demand) or Vulkan | ~30 ms | **~0.7–0.9 s** | ~0.25 s | **LOCAL** (matches Mac) |
| **B — Good iGPU** | Recent AMD APU (Radeon 780M/890M, RDNA3+) or Intel Arc iGPU, **≥16 GB** | **Qwen3-4B Q4_K_M**, **Vulkan** | ~0.1 s | **~1.9–2.1 s** | ~0.35 s | **LOCAL** (streaming; commit slightly over budget) |
| **C — Weak iGPU** | Intel Iris Xe / older AMD Vega iGPU, **16 GB** | **Qwen3-1.7B Q4**, Vulkan | ~0.2 s | **~2.3–3.2 s** | ~0.5 s | **LOCAL-small**; if Claude key present, **default Claude**, local as opt-in |
| **D — CPU-only** | AVX2 CPU, no usable GPU, **≥16 GB** | **Llama-3.2-1B / Qwen3-1.7B Q4**, CPU (all-variants DLL) | ~0.5 s | **~1.7–2.0 s** (1B) / ~1.9 s (1.7B) | ~0.6 s | **Claude if online+key**; else **1B local** best-effort; else raw+ |
| **E — Constrained** | **8 GB RAM** (any GPU) — co-residency with 4B impossible | **Llama-3.2-1B Q4** (~0.9 GB) *or none* | ~0.5 s | ~1.7 s (1B) | ~0.6 s | **Claude / raw+ passthrough** default; tiny 1B only as explicit opt-in |
| **F — Copilot+ (opportunistic)** | NPU ≥40 TOPS (Snapdragon X / Core Ultra 200V / Ryzen AI 300), 16 GB | v1: same as A/B on its iGPU/GPU. v2 option: Phi Silica/Aion via Windows ML (NPU) | — | ~1 s (NPU ~20 tok/s) | ~0.3 s | **LOCAL** (iGPU path); NPU only for battery, not speed |
| **G — Incapable** | No AVX2 / <8 GB / no GPU | none | — | — | — | **Raw-ASR passthrough** or **Claude only** |

**One-line policy:** default **LOCAL Qwen3-4B (Vulkan, CUDA-opt-in)** on Tiers A/B (dGPU or recent iGPU + ≥16 GB); **drop to 1.7B/1B** on Tiers C/D; **default to Claude Haiku 4.5 (or raw+) on Tiers D/E/G** where local can't hit ~1.5–2 s or won't co-reside with ASR. **Vulkan is the single cross-platform GPU backend; CPU-all-variants DLL is the safety floor; no dedicated NPU path in v1.**

### Key numbers to re-validate on real Windows hardware (open items)
- All 4B/1.7B/1B figures are **scaled from OBSERVED 7B Q4_0 scoreboards** (×1.7/×3.7/×~4.5) — validate on a real RDNA3 APU, an Iris Xe laptop, and an AVX2 CPU-only laptop before locking the tier thresholds.
- Qwen3-1.7B IFEval exact value unconfirmed (HF card omits it); ~68–72 INFERRED.
- Phi Silica ~20 tok/s / 230 ms TTFT is secondary/2024-launch; primary re-fetch failed this session.
- DirectML-vs-Vulkan on **iGPU** has no public head-to-head — spike it if ONNX is seriously considered.
- Foundry Local cross-platform (macOS/Linux) maturity for our exact 4B cleanup model is unproven — worth a spike as an alternative to hand-rolled llama.cpp tiering.

## Open questions
- 4B/1.7B/1B cleanup latencies are scaled from OBSERVED 7B Q4_0 scoreboards (memory-bandwidth scaling ×1.7/×3.7/×~4.5); validate on a real RDNA3 APU (780M/890M), an Intel Iris Xe laptop, and an AVX2 CPU-only laptop before locking tier thresholds and default-mode cutoffs.
- Qwen3-1.7B exact IFEval score is unconfirmed (HF card and technical report omit a clean instruct-mode IFEval table); estimated ~68-72, needs a primary source.
- Phi Silica NPU throughput/TTFT (~20 tok/s, ~230 ms) is from the 2024 launch coverage; primary re-fetch failed this session and the model is being deprecated (replaced by Aion Instruct, Phi Silica removed Nov 2026) - re-verify if any NPU path is pursued.
- No public DirectML-vs-llama.cpp-Vulkan head-to-head on integrated GPUs exists; if ONNX Runtime GenAI/DirectML is seriously considered for the iGPU tier, run an in-house Phi-3.5-mini-INT4 (DirectML) vs Qwen3-4B-Q4 (Vulkan) benchmark on Iris Xe and Radeon 780M.
- Foundry Local is genuinely cross-platform (Windows/macOS-AppleSilicon/Linux) and auto-handles hardware detection + EP selection + model download in ~20MB - but it is ONNX-only with a curated catalog; spike whether it can host our exact 4B cleanup model at target latency on both platforms as an alternative to hand-rolled llama.cpp tiering.
- AMD Variable Graphics Memory (VGM) exact allocatable ceiling per RAM size on Windows (direct AMD blog fetch returned 403); confirm how much system RAM an 8GB/16GB APU machine can safely dedicate to the iGPU for a 2.4GB model without starving the OS.

## Sources
- https://github.com/ggml-org/llama.cpp/discussions/10879
- https://github.com/ggml-org/llama.cpp/discussions/15013
- https://knightli.com/en/2026/04/23/llama-cpp-gpu-benchmark-cuda-rocm-vulkan-scoreboard/
- https://medium.com/@techhara/llama-cpp-benchmark-cpu-vs-igpu-93b3cc40ece5
- https://www.myaihardware.com/llama-cpp-benchmarks
- https://zenvanriel.com/ai-engineer-blog/local-ai-integrated-graphics-vulkan-offload/
- https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md
- https://github.com/ggml-org/llama.cpp/releases
- https://github.com/ollama/ollama/issues/15601
- https://onnxruntime.ai/blogs/accelerating-phi-3
- https://onnxruntime.ai/docs/genai/
- https://github.com/microsoft/onnxruntime-genai
- https://learn.microsoft.com/en-us/windows/ai/apis/phi-silica
- https://learn.microsoft.com/en-us/windows/ai/overview
- https://learn.microsoft.com/en-us/windows/ai/apis/
- https://learn.microsoft.com/en-us/windows/ai/npu-devices/
- https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-local/what-is-foundry-local
- https://www.foundrylocal.ai/models
- https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct
- https://huggingface.co/google/gemma-3-1b-it
- https://huggingface.co/Qwen/Qwen3-1.7B
- https://blogs.windows.com/windowsexperience/2024/12/06/phi-silica-small-but-mighty-on-device-slm/
