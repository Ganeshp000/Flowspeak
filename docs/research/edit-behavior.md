# Track: v2:9815cdacab87f5ea33346caa712ab2c19d266a4971bee15f9ce0622bad092a74

## TRACK: Wispr Flow Cleanup Layer — Behavioral Spec (how much it edits your speech)

### 0. Architecture context (so the cleanup behavior makes sense)
- **Two-stage pipeline** (OBSERVED, Baseten case study + review synthesis): Stage 1 = ASR/speech recognition; Stage 2 = a **fine-tuned Llama (Meta open-source LLM)** doing "real-time transcript cleanup" based on user context + preferences. The cleanup is an LLM rewrite pass, NOT rule-based find/replace. This is why behavior is fuzzy/contextual, not deterministic.
- **Model specifics** (OBSERVED, baseten.co/resources/customers/wispr-flow): Llama variant/size NOT disclosed; ASR model NOT disclosed (reviews claim an "OpenAI subprocessor" for ASR — INFERRED/second-hand). Cleanup LLM must "process and generate 100+ tokens in <250 ms"; end-to-end **p99 latency <700 ms**; served on **TensorRT-LLM** via Baseten Chains on AWS. They "optimize p99, not p50."
- **Cloud-based** by default (audio uploaded, cleaned in cloud, typed into active app). Relevant to FlowSpeak because our clone must reproduce this behavior *locally* — implying a local small LLM (Llama-class) prompted to do the same edit set.
- **June 24, 2026 changelog**: they unified onto a single model deployment to fix "inconsistent edits, unwanted word changes, unreliable punctuation" — i.e. cleanup consistency has been an ongoing engineering problem (OBSERVED, wisprflow.ai/whats-new).

### 1. The master control: "Auto Cleanup" has 4 discrete levels (CRITICAL for spec)
OBSERVED — wisprflow.ai/whats-new, **April 24, 2026 release** (replaced the old binary "Smart Formatting" toggle). Lives in **Settings → Style tab** ("Auto Cleanup"). Exact per-level definitions as published:
- **None** — "transcribes exactly what you said, including mistakes" → this is the **verbatim/raw mode**. No filler removal, no self-correction repair, keeps errors.
- **Light** — "cleans up filler words and grammar" (removes um/uh, fixes grammar; conservative).
- **Medium** — "edits for clarity and conciseness" (**this was the too-aggressive default** that generated complaints).
- **High** — "rewrites for brevity and polish" (heaviest; can rewrite phrasing/word choice — crosses the line into paraphrase).
- **"Undo AI edit"** button in the Home/history tab reveals the raw pre-cleanup transcript; **original dictation is never lost** (OBSERVED, docs + reviews). Important product invariant: raw transcript always retained so users can recover it.
- FlowSpeak mapping: implement these 4 levels literally as prompt-strength tiers on the local cleanup LLM. None = bypass LLM entirely (pass raw ASR through).

### 2. Filler-word removal
- **Which fillers** (OBSERVED, features page + docs + multiple reviews): "um," "uh," and "other pauses/verbal placeholders." Reviews/synthesis expand the observed set to: **um, uh, like, you know, basically, literally, I mean** and repeated hesitation sounds ("ahs"). The core doc-confirmed set is **um / uh**; the wider set (like, you know, basically, literally, I mean) is OBSERVED-from-reviews but NOT enumerated in official docs → treat "um/uh/pauses" as guaranteed, the rest as high-confidence.
- **Always?** No — filler removal is **gated by cleanup level**: OFF at None, ON from Light upward. Also context-aware: "like" and "actually" are preserved when they carry meaning (see §3). So it is NOT a blind stopword strip.
- Feature-page verbatim: *"Flow automatically removes 'um,' 'uh,' and other pauses so your text is clean and natural."*

### 3. Self-correction / backtracking repair ("Backtrack" / "Course Correction")
OBSERVED — docs.wisprflow.ai/.../smart-formatting-and-backtrack, features page, reviews. This is the flagship editing behavior.
- **Behavior**: keeps ONLY the corrected version; discards the abandoned clause.
- **Two trigger paths**:
  1. **Explicit trigger words**: "actually," "scratch that," "wait," "no," "I mean."
  2. **Natural restatement (no trigger)**: Flow uses full-dictation context to detect a restatement and collapse it.
- **Verbatim before/after examples**:
  - Features page: "Let's meet at 2… actually 3" → **"Let's meet at 3."**
  - Docs: "I wanted to buy a record as a gift… as a present" → **"I wanted to buy a record as a present."**
  - sidsaladi guide: "We should budget 50K for this, actually, make that 75K." → **"We should budget 75K for this."**
  - eesel review: "We should meet on Tuesday, wait, no, let's do Wednesday" → **"We should meet on Wednesday."** (also given as "meet Tuesday, wait, Wednesday" → "meet Wednesday").
- **Context preservation (false-trigger avoidance)** — key nuance: the word "actually" is NOT always a delete-signal. Docs verbatim: **"I actually enjoyed the movie"** stays intact because surrounding context doesn't imply a correction. So the cleanup LLM must disambiguate correction-marker vs. intensifier. FlowSpeak must reproduce this with an LLM, not a regex on "actually."

### 4. Stutters / repeated words
- OBSERVED (reviews/synthesis): **repetitions collapse** — "the the team" → "the team." Duplicate-word / false-start collapse is part of Light+ cleanup. Not separately documented in official help but consistently reported.

### 5. Punctuation — automatic vs. spoken commands (BOTH supported simultaneously)
OBSERVED — docs + features page.
- **Automatic (default, primary path)**: punctuation inferred from **prosody** — pauses → commas, falling intonation → periods, rising intonation → question marks. Feature-page verbatim: *"Flow detects punctuation naturally from your pauses and tone."* You do NOT need to speak punctuation.
- **Spoken punctuation commands (optional, for precision)** — recognized phrases (exact list from docs), with variant tolerance ("exact phrasing not critical, common variants recognized"):
  - "period" / "full stop" → `.`
  - "comma" → `,`
  - "question mark" → `?`
  - "exclamation point" → `!`
  - "em dash" / "em-dash" / "emdash" → `—`
  - "apostrophe" / "single quote" → `'`
  - "asterisk" / "star" → `*`
- **ANSWER to the "if I say the word 'comma' is it typed or interpreted?" question**: **interpreted → converted to the `,` glyph** (not the literal word). Same for all the above. Verbatim doc example: *"I can't wait to see you exclamation point Let's meet at seven period"* → **"I can't wait to see you! Let's meet at 7."** (note: also shows "seven" → "7" ITN, see §8).
- **Edge-case bug worth replicating/avoiding** (OBSERVED): a comma immediately before "press enter" is not treated as a sentence boundary → "Hello world, press enter." yields **"Hello world,."** (stray period after comma). Documented quirk.
- **Trailing-period removal**: in messaging apps (iMessage, WhatsApp, Slack, Discord, Teams, Messenger, WeChat, etc.), the trailing period on short messages is stripped, gated by Writing Style setting + sentence length (OBSERVED, docs).

### 6. "New line" / "new paragraph" / Enter spoken commands
OBSERVED — docs. These ARE interpreted as actions, not typed literally:
- "new line" / "next line" / "line break" → inserts a line break.
- "new paragraph" → paragraph break.
- "press enter" (desktop only) → **removes the phrase and simulates the physical Enter key** (submits/sends). This is why it can send a Slack/iMessage message hands-free.
- Paragraph breaks are ALSO inferred automatically from pacing/pauses (mrktcorrect: "infers paragraph breaks from your pacing").

### 7. List formatting (when spoken enumeration becomes a formatted list)
OBSERVED — docs + features page.
- **Trigger**: saying either cardinal sequence ("one… two… three…") OR ordinal sequence ("first… second… third…") causes Flow to emit a **formatted numbered list**.
- Verbatim doc example: "My top goals this week are one finish the report two send the presentation" → **"My top goals this week are: 1. Finish the report 2. Send the presentation"** (note it also auto-inserts the colon).
- Features page: "1. Apples 2. Bananas 3. Oranges." → formatted list.
- **When it stays inline**: no doc-stated bright line; INFERRED that short/non-enumerated sequences stay inline and enumeration must read as an actual list intent. Bulleted (vs numbered) lists are not explicitly documented as a spoken trigger → INFERRED that numbered is the default list output.

### 8. Inverse Text Normalization (numbers / dates / emails / URLs / phones / currency)
OBSERVED (partial) + INFERRED.
- **Numbers → digits**: "seven" → "7"; "50K"/"75K" preserved as written forms (docs/guide examples). Spelled numbers become numerals in appropriate contexts.
- **URLs**: dictated directly into browser address bars (Chrome, Firefox, Edge, Brave, Opera, Samsung Internet, etc.) — formatted as URLs (OBSERVED).
- **Emails / phone numbers / long digit strings / version strings / dates**: handled but **unreliable** — mrktcorrect review flags: "Numbers in long sequences (phone numbers, version strings, dates) need a visual check before sending." So ITN exists but is a known weak spot → FlowSpeak should treat ITN as best-effort and expect user proofing.
- No documented spoken "at sign"/"dot" macro for email in general dictation (that's the coding path, §9).

### 9. Technical / code dictation (camelCase, symbols, snake_case)
OBSERVED — docs (Variable Recognition) + features + reviews.
- **Naming conventions**: recognizes and preserves **camelCase, snake_case, acronyms**. "camel case user name" → **userName** (review-reported). Extracts function/class/variable names from open files (JS, TS, Python, Java, Swift, C++, C, Rust, Go) to bias recognition.
- **Homophone disambiguation**: distinguishes "for" (loop keyword) vs "four" (number) using code context.
- **Symbol commands (natural language)**: "open curly brace," "hashtag," "at sign," etc. → typed as symbols.
- **File tagging (Cursor & Windsurf only; VS Code reads context but can't tag)**: trigger words "at" / "tag" / "tagged" / "@" before a filename; "dot"/"punto" for the period.
  - "open at index dot tsx" → `open @index.tsx`
  - "review at my script" → `review @myScript.py` (matches spoken words to camelCase file)
  - "check at dot env" → `check @.env`
  - Only files with extensions can be tagged; filenames remembered across sessions.
- Code editors get **code-syntax-aware formatting**; inline code symbols preserved, variable names kept in camelCase (not sentence-cased).

### 10. Capitalization rules
OBSERVED — docs (Context Awareness) + Personalized Style.
- Auto-capitalize sentence starts and proper nouns.
- **Proper-noun preservation from screen**: uses on-screen names (e.g. email recipients) + personal dictionary + team dictionary to capitalize proper nouns correctly, and **skips mid-sentence lowercasing** when text begins with a recognized name.
- **Mid-sentence insertion rule**: when cursor is mid-sentence, Flow **lowercases the start** of your dictation so it flows with surrounding text; capitalizes at true sentence starts; auto-adds leading/trailing spaces as needed.
- **Notion special-case**: skips context-aware formatting when surrounding text is ≤2 words or ends with "…" (avoids placeholder interference).
- Capitalization is one of the 3 things Personalized Style controls (see §11).

### 11. Tone / style matching per target app (Flow Styles / Personalized Style)
OBSERVED — docs (Flow Styles, Context Awareness) + personalized-style page.
- **4 named styles** with their published one-line definitions:
  - **Very Casual** — "No caps + less punctuation" (Personal messaging only)
  - **Casual** — "Caps + less punctuation" (all categories)
  - **Excited** — "Caps + more exclamation points" (Work, Email, Other — NOT Personal)
  - **Formal** — "Caps + more periods" (all categories)
- **App categories + precedence order**: Personal Messaging → Email → Work Messaging → Other. Detection via active-app identity (and specific website for browser apps).
  - Personal messaging: iMessage, WhatsApp, Telegram
  - Work messaging: Slack, Teams
  - Email: Gmail, Outlook, Superhuman
  - Other: Docs, Notes, Notion, ChatGPT/Claude, code editors
- **Verbatim tone before/after (Context Awareness doc)**:
  - Email: "hey sarah thanks for sending over the proposal i'll review it by friday" → **"Hey Sarah, thanks for sending over the proposal. I'll review it by Friday."** (full caps + periods)
  - Slack: "sounds good let's sync tomorrow morning" → **"sounds good, let's sync tomorrow morning"** (stays lowercase, minimal punctuation, no trailing period)
- **CRITICAL SCOPE LIMIT** — Personalized Style **only** adjusts **capitalization, punctuation, and spacing** (and emoji/exclamation density). Verbatim FAQ: *"Flow doesn't change your grammar, word choice, or phrasing. It simply formats them to match your preferences."* NOTE: this scope limit is specifically about *Style*; Auto Cleanup at Medium/High *does* change conciseness/phrasing — the two systems are separate layers.
- Tone adaptation is **Desktop, English only** (per features page).

### 12. What it deliberately does NOT change
OBSERVED.
- Personalized Style layer: does NOT change grammar, word choice, phrasing, sentence structure, or slang — formatting only.
- At Light cleanup: intent is filler + grammar only, preserving your words.
- The stated design goal ("sound like you") means slang/voice retained at low levels.
- CAVEAT: this "doesn't change your words" promise **breaks down at Medium/High Auto Cleanup**, which is exactly the source of complaints (§13).

### 13. Over-editing complaints (real users)
OBSERVED — spokenly, booststash, trustpilot, reddit synthesis.
- **Default too aggressive**: Wispr publicly identified the **Auto Cleanup default (Medium) as the biggest driver of accuracy complaints** — it changed meaning. Fix guidance: drop to **Light**. Multiple reviewers switched to Light and preferred it.
- spokenly verbatim: *"AI cleanup occasionally over-edits. Multiple reviewers report it 'improving' what they actually said instead of transcribing it accurately, especially on first-person voice or unconventional phrasing."*
- booststash 30-day test: the AI "corrected" intentionally casual phrasing to formal **twice, changing the meaning**.
- Under bad audio (wrong mic), it can produce "preposterous hallucinations."
- Product implication: over-editing is the #1 known failure mode. FlowSpeak should default to a conservative (Light-equivalent) level, expose the raw transcript, and never rewrite word choice unless the user opts into a High tier.

### 14. Under-editing complaints (real users)
OBSERVED — mrktcorrect, reviews.
- Residual error rate **2–3 mistakes per 1,000 words** survive cleanup in final review.
- Advice to "budget 10–15% of dictation time for proofreading."
- Long digit sequences (phones, versions, dates) frequently wrong → need visual check.
- New/rare proper nouns need **multiple corrections before they "stick"** in the dictionary (e.g., brand names "Granola," "mrktcorrect").

### 15. Verbatim / raw mode
OBSERVED. Achieved via **Auto Cleanup = None** ("transcribes exactly what you said, including mistakes"). Plus **"Undo AI edit"** recovers the raw transcript after any dictation (raw always retained). There is no separate "dictation-vs-command" verbatim toggle beyond the cleanup level. Whispered speech is auto-detected (no toggle) with a small accuracy drop (~92–95% vs ~97%).

### 16. Command Mode (distinct from dictation cleanup)
OBSERVED — docs. Separate feature that transforms *already-selected* text via voice, not part of the passive cleanup pass but relevant because it's the "heavy rewrite" path:
- Trigger: **Fn+Ctrl** on Mac (or **Cmd+Ctrl+Option** on Fn-less Macs); **Ctrl+Win+Alt** on Windows. Mac/Windows only, paid/trial.
- Highlight text → speak an instruction → selection replaced. Or no selection → inserts inline.
- Examples: "Make this more assertive and concise," "Translate to Polish," "Turn this outline into an essay," and voice-driven settings edits: "Add a rule to never use exclamation marks."
- Limits: ≤1000 words ("Oops, too long to polish — try again with under 1000 words"); can't run while a prior polish/transcription is in flight; Esc cancels.
- **Transforms** (May 1, 2026): named auto/on-demand rewrite presets — "Polish" (clarity/conciseness), "Prompt Engineer" (restructure dictation into a formatted AI prompt); custom transforms supported.

### 17. The learning loop (how corrections feed future output)
OBSERVED — docs (dictionary), features, reviews.
- **Auto-add to dictionary**: Settings → System → Extras → Auto-add to dictionary. If you **type over / correct** a transcription, Flow detects the edit and adds the corrected spelling automatically. Common everyday words are **filtered out** (only specialized terms captured). Auto-learned entries show a **✨ sparkle icon**.
- **Two mechanisms**: (a) **Vocabulary words** — bias ASR recognition toward your terms; (b) **Replacement rules** — deterministic misspelling→correct swaps (max 1 rule per word; used when Flow *consistently* produces a specific wrong spelling).
- **Latency of learning**: "Replacement rules and snippets apply as soon as you finish dictating"; dictionary changes "take effect right away — no restart needed" (instant, not batch/overnight).
- **Precedence**: personal dictionary > team dictionary when the same word exists in both.
- **Scale (real user)**: 3,155 total corrections in 90 days = 2,709 word-level corrections + 446 custom dictionary entries (~35/day).
- **Sync**: dictionary syncs across Mac/Windows/iOS/Android.
- Team dictionary: Business plan (desktop) / Team or Business (iOS).

---

### RULE TABLE — category | rule | aggressiveness | before | after
(aggressiveness scale: Off=None-level only, Low=Light+, Med=Medium+, High=High-level; "Always" = independent of cleanup level)

| Category | Rule | Aggressiveness | Before (spoken) | After (typed) |
|---|---|---|---|---|
| Filler removal | Strip um/uh/pauses; (reviews: also like/you know/basically/literally/I mean) unless meaning-bearing | Low (Light+); Off at None | "um so I think uh we should ship" | "So I think we should ship" |
| Self-correction (trigger) | On "actually/scratch that/wait/no/I mean", keep corrected clause only | Low (Light+) | "Let's meet at 2… actually 3" | "Let's meet at 3." |
| Self-correction (restatement) | Detect restatement from context, collapse to final intent | Med | "buy a record as a gift… as a present" | "buy a record as a present." |
| Self-correction (false trigger) | Preserve "actually" when it's an intensifier, not a correction | Always (contextual) | "I actually enjoyed the movie" | "I actually enjoyed the movie." |
| Repeated words/stutter | Collapse duplicate words/false starts | Low (Light+) | "the the team" | "the team" |
| Punctuation (auto) | Infer from prosody: pause→comma, fall→period, rise→? | Low (default on) | "sounds good lets sync tomorrow" (Slack) | "sounds good, let's sync tomorrow" |
| Punctuation (spoken) | Convert spoken mark name to glyph (comma→ , period→ . etc.) | Always when spoken | "meet at seven period" | "meet at 7." |
| New line / paragraph | "new line/next line/line break"→\n; "new paragraph"→\n\n | Always when spoken | "line one new line line two" | "line one⏎line two" |
| Press enter | "press enter" removed + Enter key simulated (desktop) | Always when spoken | "send it press enter" | "send it" + ⏎ (sends) |
| List formatting | Cardinal/ordinal sequence → numbered list (+auto colon) | Med | "goals are one finish report two send deck" | "goals are: 1. Finish report 2. Send deck" |
| Numbers (ITN) | Spelled numbers → digits in context | Low | "seven" | "7" |
| Long digit strings | Best-effort; unreliable, needs proofing | Low (weak) | phone/date/version dictation | often needs manual fix |
| URLs | Format as URL, esp. in address bar | Always | "wispr flow dot ai" | "wisprflow.ai" |
| Code: naming | Preserve camelCase/snake_case/acronyms | Always in code editors | "camel case user name" | "userName" |
| Code: symbols | Symbol names → glyphs ("open curly brace","at sign","hashtag") | Always when spoken | "if x open curly brace" | "if x {" |
| Code: file tag (Cursor/Windsurf) | "at/tag" + name (+ "dot" ext) → @file | Always when spoken | "review at my script" | "review @myScript.py" |
| Capitalization (sentence) | Cap sentence starts + proper nouns | Low (default) | "hey sarah" | "Hey Sarah" |
| Capitalization (mid-sentence) | Lowercase start when inserting mid-sentence | Always | cursor mid-line + "and then we go" | "…and then we go" |
| Capitalization (proper noun) | Preserve caps from screen/dictionary; skip mid-lowercasing | Always | recipient "Sarah" on screen | "Sarah" not "sarah" |
| Trailing period | Drop trailing period on short messaging-app msgs | Low (messaging apps) | "on my way" (iMessage) | "on my way" (no period) |
| Tone: Formal | Caps + more periods (Email/Docs) | Med (style layer) | "thanks i'll review by friday" | "Thanks. I'll review by Friday." |
| Tone: Casual | Caps + less punctuation (Work msg) | Med (style layer) | Slack line | "Sounds good, let's sync" |
| Tone: Very Casual | No caps + less punctuation (Personal msg) | Med (style layer) | "ok see you there" | "ok see you there" |
| Tone: Excited | Caps + more exclamation points (Email/Work/Other) | Med (style layer) | "great news we shipped" | "Great news! We shipped!" |
| Word choice / phrasing | Do NOT change (Style layer promise) | Off (Style); but Medium+ Auto Cleanup DOES rewrite | "gonna crush it" | "gonna crush it" (Light) / rewritten (High) |
| Grammar/sentence structure | Do NOT restructure (Style); Light fixes grammar only | Low grammar-only; Off structure | "me and him went" | "he and I went" (grammar, Light) |
| Conciseness rewrite | Edit for clarity/brevity | Med/High only | "I was sort of thinking maybe we could possibly meet" | "Let's meet" (High) |
| Verbatim/raw | Transcribe exactly, keep mistakes | Off = None level | "um the the plan" | "um the the plan" |
| Undo AI edit | Always retain raw transcript; one-click revert | Always | any cleaned output | reverts to raw ASR |
| Learning: auto-dict | Type-over correction → add term (✨), filter common words | Always (if enabled) | you fix "Wispr"→spelling | future dictations spell it right instantly |
| Learning: replacement rule | Deterministic misspelling→correct (1/word) | Always | Flow always writes "Rispr" | auto-replaced with "Wispr" |

### Notes for FlowSpeak implementers
- Two SEPARATE editing layers must be modeled: (A) **Auto Cleanup** (4 levels; filler/self-correction/conciseness — the "how much rewriting") and (B) **Personalized Style** (per-app-category cap/punct/spacing/tone — formatting only, never word choice). Don't conflate them.
- Cleanup is an **LLM rewrite**, not regex — needed for context-sensitive cases ("actually" as intensifier vs correction; "for" vs "four"). Local clone should prompt a small Llama-class model with level-specific system prompts.
- **Default should be Light**, not Medium — Medium's over-editing is the single most-reported complaint and Wispr's own admitted mistake.
- **Always retain raw transcript** and expose an "Undo AI edit" so cleanup is reversible — this is a hard product invariant.
- Punctuation is dual-mode (auto prosody + optional spoken commands) simultaneously; spoken mark names must map to glyphs, never be typed literally.
- Confidence: level definitions, self-correction examples, spoken-command lists, tone examples, style scope, and learning loop are OBSERVED from official docs. The extended filler set (like/you know/basically/literally), stutter-collapse, and exact ITN for emails/phones are OBSERVED-from-reviews (medium confidence). Bulleted-vs-numbered list distinction and inline-vs-list bright line are INFERRED.

## Sources
- https://docs.wisprflow.ai/articles/5373093536-how-do-i-use-smart-formatting-and-backtrack
- https://docs.wisprflow.ai/articles/2368263928-how-to-setup-flow-styles
- https://docs.wisprflow.ai/articles/4678293671-feature-context-awareness
- https://docs.wisprflow.ai/articles/4816967992-how-to-use-command-mode
- https://docs.wisprflow.ai/articles/8554805225-variable-recognition
- https://docs.wisprflow.ai/articles/4052411709-teach-flow-your-words-with-the-dictionary
- https://wisprflow.ai/features
- https://wisprflow.ai/post/personalized-style
- https://wisprflow.ai/whats-new
- https://www.baseten.co/resources/customers/wispr-flow/
- https://spokenly.app/blog/wispr-flow-review
- https://mrktcorrect.com/blog/wispr-flow-review
- https://sidsaladi.substack.com/p/wispr-flow-101-the-complete-guide
- https://www.eesel.ai/blog/wispr-flow-review
- https://booststash.com/wispr-flow-review-2025/
- https://chrismenardtraining.com/post/wispr-flow-ai-dictation-removes-filler-words/
- https://letterly.app/blog/wispr-flow-review/
- https://www.getvoibe.com/resources/wispr-flow-review/
