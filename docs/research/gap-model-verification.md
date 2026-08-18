# Track: v2:ccee88de3aeddf487764f702e436b048f352cbfef87978cfc8eb9e55330c2c8b

## FlowSpeak model verification — findings (as of 2026-07, primary sources)

### BOTTOM LINE
- **DEFAULT local model recommendation from the prior pass is CORRECT and VALIDATED.** `Qwen/Qwen3-4B-Instruct-2507` is a **real, released, non-reasoning ("non-thinking") instruct checkpoint**, Apache-2.0, IFEval 83.4, Q4_K_M ≈2.5 GB. It remains the single best real instruction-following model in the ~3–4B range for a bundled, closed-source-capable app because it uniquely combines (a) top confirmed IFEval among permissively-licensed candidates, (b) a clean Apache-2.0 license, (c) non-reasoning/low-latency behavior, and (d) a ~2.5 GB 4-bit footprint inside the 2.5–3 GB budget.
- **CLAUDE toggle recommendation ("Claude Haiku 4.5") is CORRECT.** Verified against live platform.claude.com docs: `claude-haiku-4-5` is still the current Haiku-class (fastest, cheapest) tier. There is NO "Haiku 5". Pricing $1/$5 per MTok.
- Several names the prior pass flagged (`Qwen3.5`, `Gemma 4`) DO appear to be real post-cutoff releases, but none is needed — and each is a WORSE fit than Qwen3-4B-Instruct-2507 for this task (see caveats). `Claude Fable 5 / Mythos 5 / Opus 4.8 / M5` etc. are real Anthropic model names but irrelevant to the Haiku-class toggle.

---

## (a) LOCAL MODELS — per-candidate verification

### 1. Qwen3-4B-Instruct-2507 — ✅ REAL, RECOMMENDED DEFAULT (all prior specs confirmed)
- **HF model ID (OBSERVED):** `Qwen/Qwen3-4B-Instruct-2507` (official Qwen org repo). HF API confirms: created **2025-08-05**, last modified 2025-09-17, **4.2M+ downloads**, 898 likes — an established, widely-used release, not synthetic.
- **Params (OBSERVED, official card):** 4.0B total / 3.6B non-embedding. 36 layers, GQA 32Q/8KV heads.
- **Type (OBSERVED):** Non-reasoning instruct. Card states verbatim: *"This model supports only non-thinking mode and does not generate `<think></think>` blocks in its output."* → ideal for the low-latency conservative copy-edit use case.
- **Context (OBSERVED):** 262,144 tokens native. (Prior "256K" claim ≈ correct; exact is 262,144 = 256K.)
- **License (OBSERVED):** **`apache-2.0`** (confirmed on model card AND in HF API license tag). Cleanly redistributable inside a bundled closed-source app. ✓
- **IFEval (OBSERVED, official card):** **83.4**. (Prior "83.4" confirmed exactly.)
- **4-bit sizes (OBSERVED, `unsloth/Qwen3-4B-Instruct-2507-GGUF`):**
  - **Q4_K_M = 2.5 GB** ← recommended GGUF quant; matches prior "~2.4–2.6GB" claim.
  - Q4_K_S 2.38 GB · Q4_0 2.38 GB · Q4_1 2.6 GB · UD-Q4_K_XL 2.55 GB.
  - GGUF also available from `Qwen` (official), `bartowski`, `prithivMLmods`, `Mungert`. Ollama tag: `qwen3:4b-instruct-2507-q4_K_M`.
- **MLX (INFERRED — recommended to verify):** For the M4 Pro target, an MLX 4-bit build (`mlx-community/Qwen3-4B-Instruct-2507-4bit`, ≈2.3–2.5 GB) is the better runtime on Apple Silicon than llama.cpp/GGUF for TTFT/throughput. Existence not directly fetched — verify the exact repo ID before relying on it; the GGUF Q4_K_M path is the confirmed fallback.
- **Fit note:** Q4_K_M weights 2.5 GB leave ~0.5 GB in the 3 GB envelope for KV cache + runtime; cap the app's context low (dictation transcripts are short) rather than using the full 262K.

### 2. Llama-3.2-3B-Instruct — ✅ REAL, but ⚠️ LICENSE DISQUALIFIES for clean bundling
- **HF ID (OBSERVED):** `meta-llama/Llama-3.2-3B-Instruct` (gated — requires accepting Meta license).
- **Params (OBSERVED):** 3.21B.
- **License (OBSERVED):** **Llama 3.2 Community License** — a *custom* license, NOT Apache/MIT. Carries the <700M-MAU clause, "Built with Llama" attribution/naming requirements, and an Acceptable Use Policy. Redistributable inside a closed-source app but with conditions and legal review; **fails the "clean permissive license" preference.**
- **IFEval (OBSERVED, Meta card):** **77.4** (0-shot, Avg prompt/instruction loose+strict). Also MMLU 63.4, GSM8K 77.7.
- **4-bit size (INFERRED):** GGUF Q4_K_M ≈2.0 GB (smallest of the set; matches prior "~2.0GB"). Lower IFEval than Qwen3-4B-Instruct-2507.
- **Verdict:** Viable smaller/lighter alternate if RAM is tighter, but license + lower IFEval make it second-best.

### 3. Gemma-3-4B-it — ✅ REAL, but ⚠️ CUSTOM LICENSE + multimodal overhead
- **HF ID (OBSERVED):** `google/gemma-3-4b-it` (gated, `"gated":"manual"`). Google's official int4 QAT GGUF: `google/gemma-3-4b-it-qat-q4_0-gguf`.
- **Params (OBSERVED):** 4B. Context 128K. It's a **vision-language (multimodal)** model — extra weight/complexity vs a text-only cleanup model.
- **License (OBSERVED, both cards + API):** **`gemma`** (Google Gemma Terms of Use) — a *custom* license with a Prohibited Use Policy. NOT Apache/MIT. **Fails the clean-permissive preference** (bundlable but with use restrictions + review).
- **4-bit size (OBSERVED):** Google official QAT `q4_0` GGUF = **3.16 GB** (this is the full official file). NOTE: this **exceeds** the prior "~2.6GB" claim — the ~2.6 GB figure is the raw int4 weight count, not the on-disk GGUF. `bartowski/google_gemma-3-4b-it-qat-GGUF` Q4_0 is smaller (~2.37 GB) due to a trimmed embedding table. At 3.16 GB the official file risks the 2.5–3 GB budget.
- **IFEval (INFERRED / UNCONFIRMED):** Prior pass claimed **90.2**. The HF card does NOT display IFEval (shows MMLU 59.6, GSM8K 38.4, HumanEval 36.0). The 90.2 figure comes from the Gemma 3 tech report and is plausible (Gemma-3-it models are heavily instruction-tuned) but I could not confirm it from a fetched primary benchmark table — treat as unverified.
- **Verdict:** Highest *claimed* IFEval, but custom license + multimodal overhead + 3.16 GB official quant make it a worse fit than Qwen3-4B-Instruct-2507.

### 4. Phi-4-mini-instruct — ✅ REAL, MIT, but ⚠️ instruction-following is its weak spot
- **HF ID (OBSERVED):** `microsoft/Phi-4-mini-instruct`.
- **Params (OBSERVED):** 3.8B dense decoder-only. Context 128K.
- **License (OBSERVED):** **MIT** ✓ (cleanest license of the set).
- **IFEval (NOT on card; INFERRED):** Card omits IFEval. Search corroboration indicates **IFEval is Phi-4's relative weakness** ("Phi-4's weakest benchmark scores are on IFEval… trouble strictly following instructions"). Reported value ~68–70 (unconfirmed exact). Card does show GSM8K 88.6, MMLU 67.3 — strong at reasoning/math, which is NOT what this task needs.
- **Verdict:** MIT license is attractive, but the app's #1 requirement is instruction-following, which is precisely Phi-4-mini's weakest axis. Not recommended as default.

### 5. SmolLM3-3B — ✅ REAL, Apache-2.0, solid alternate
- **HF ID (OBSERVED):** `HuggingFaceTB/SmolLM3-3B`.
- **Params (OBSERVED):** 3B. Trained 64K ctx, up to 128K via YaRN.
- **Type (OBSERVED):** **Hybrid-reasoning** model (extended-thinking toggle). Run it in NON-thinking mode for this task.
- **License (OBSERVED):** **Apache-2.0** ✓.
- **IFEval (OBSERVED, card):** **76.7** (no-extended-thinking mode).
- **Verdict:** Clean license + fully open, but IFEval 76.7 < Qwen's 83.4, and it's reasoning-capable (extra care to keep thinking off). Good Apache-2.0 fallback if you want a smaller model; second to Qwen on quality.

### Ranking for THIS task (instruction-following + permissive license + non-reasoning + ≤3GB)
1. **Qwen3-4B-Instruct-2507** — Apache-2.0, IFEval **83.4**, non-thinking, 2.5 GB Q4_K_M. ★ DEFAULT
2. SmolLM3-3B — Apache-2.0, IFEval 76.7, hybrid (run non-thinking)
3. Llama-3.2-3B-Instruct — IFEval 77.4 but custom Llama license
4. Gemma-3-4B-it — higher claimed IFEval but custom Gemma license + 3.16 GB + multimodal
5. Phi-4-mini-instruct — MIT but weak IFEval (wrong tradeoff for this task)

### Flagged post-cutoff models (real, but NOT recommended / could not fully verify a bundleable checkpoint)
- **`Qwen/Qwen3.5-4B` — appears REAL.** HF API returns 200: created **2026-02-27**, license `apache-2.0`, 6.7M+ downloads, 732 likes. BUT: it is a **reasoning/thinking-first model** ("operates in thinking mode by default, generating `<think>…</think>` before responses") and reportedly image-text-to-text/multimodal — a WORSE fit than the explicitly non-thinking Qwen3-4B-Instruct-2507 for a low-latency copy-edit. A dedicated non-thinking `Qwen3.5-4B-Instruct` variant **could NOT be confirmed** (that exact HF path returned 401/not-accessible). Recommendation: stay on `Qwen3-4B-Instruct-2507` unless/until a released `Qwen3.5-4B-Instruct` non-thinking checkpoint is verified.
- **"Gemma 4" — appears REAL (released ~2026-04-02) but UNVERIFIED from a fetched primary source, and the exact "gemma-4-4b-it" ID does NOT exist.** Search summaries (incl. a blog.google link) describe sizes E2B, E4B (effective ~4B, MatFormer), 12B, 26B-A4B MoE, 31B dense — there is no clean "4B dense it". HF API for `google/gemma-4-4b-it` returned 401 (vs. gated Gemma-3 which returns valid JSON), i.e. that specific repo path is not a real public model. Aggregators claim Gemma 4 ships under **Apache-2.0** (a license change from Gemma 3's custom terms) — IF TRUE this would make a Gemma-4 E4B model a legitimately bundleable high-IFEval option, so it is worth a follow-up verification against ai.google.dev / the Gemma 4 model cards. Do NOT treat the Apache-2.0 claim as confirmed. Not needed for the default since Qwen3-4B-Instruct-2507 already satisfies every requirement.

---

## (b) CLAUDE API TOGGLE — verified against live platform.claude.com docs (2026-07)

- **Correct model = Claude Haiku 4.5 (prior recommendation CONFIRMED).** It is the current, fastest, lowest-cost Haiku-class tier. **No "Haiku 5" exists** in the lineup (current family: Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5).
- **Exact API model ID string (OBSERVED, models overview):**
  - Alias to pass: **`claude-haiku-4-5`**
  - Pinned snapshot: `claude-haiku-4-5-20251001`
  - (Bedrock: `anthropic.claude-haiku-4-5-20251001-v1:0`; Vertex: `claude-haiku-4-5@20251001`.)
- **Pricing (OBSERVED, pricing page):**
  - **Input: $1.00 / MTok**
  - **Output: $5.00 / MTok**
  - Prompt-cache 5m write $1.25/MTok · 1h write $2.00/MTok · cache read (hit) **$0.10/MTok**.
  - Batch API (50% off): **$0.50 input / $2.50 output per MTok** (async, not for interactive dictation).
- **Context window (OBSERVED):** **200K tokens** input. **Max output 64K tokens.** (Far more than a ~67-token cleanup needs.)
- **Latency (OBSERVED qualitative):** Comparative latency = **"Fastest"** of the current lineup. Exact TTFT not published in docs; typical Haiku-class TTFT ≈ 0.3–0.7 s and high tokens/sec (INFERRED) — comfortably supports the "sub-second ~67-token output" target, especially with streaming.
- **Streaming (OBSERVED):** Supported (all Claude models support SSE streaming via `client.messages.stream(...)` / `stream=True`). Use streaming so first tokens render immediately even though the cleanup output is short.
- **Thinking:** Haiku 4.5 supports extended thinking = Yes, adaptive thinking = No. For a conservative copy-edit you want thinking OFF — do not enable `thinking` (keeps latency minimal).
- **Cost sanity check for this app:** a cleanup call is roughly a short system prompt + ~50–100 input tokens transcript + ~67 output tokens → on the order of a few hundredths of a cent per call at $1/$5. Negligible; Haiku 4.5 is the right tier (no reason to use Sonnet/Opus for deletion + light normalization).
- **Exact API-call guidance (from the current Anthropic docs/skill):** use the official `anthropic` SDK, `client.messages.create(model="claude-haiku-4-5", max_tokens≈256, ...)` or `.stream(...)`; the model ID is complete as-is — do NOT append extra date suffixes beyond the pinned `-20251001` snapshot if pinning.

---

## Confidence tags summary
- OBSERVED (primary source fetched): Qwen3-4B-Instruct-2507 existence/params/license/IFEval/Q4 sizes; Llama-3.2-3B license & IFEval; Gemma-3-4B license & official QAT GGUF size; Phi-4-mini params/license; SmolLM3-3B license/IFEval/reasoning; Haiku 4.5 ID/pricing/context/latency/streaming; Qwen3.5-4B existence via HF API.
- INFERRED / UNCONFIRMED: Qwen MLX 4-bit repo ID; Gemma-3-4B IFEval 90.2; Phi-4-mini exact IFEval; Gemma 4 existence details & Apache-2.0 license claim; Haiku 4.5 exact TTFT ms.

## Sources
- https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507
- https://huggingface.co/api/models/Qwen/Qwen3-4B-Instruct-2507
- https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF
- https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct
- https://huggingface.co/google/gemma-3-4b-it
- https://huggingface.co/google/gemma-3-4b-it-qat-q4_0-gguf
- https://huggingface.co/api/models/google/gemma-3-4b-it
- https://huggingface.co/microsoft/Phi-4-mini-instruct
- https://huggingface.co/HuggingFaceTB/SmolLM3-3B
- https://huggingface.co/api/models/Qwen/Qwen3.5-4B
- https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M
- https://platform.claude.com/docs/en/about-claude/models/overview.md
- https://platform.claude.com/docs/en/about-claude/pricing.md
- https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/
- https://ai.google.dev/gemma/docs/releases
- https://artificialanalysis.ai/models/phi-4-mini
