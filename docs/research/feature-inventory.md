# Track: v2:1da0c8e3e54119a0d18f5ce52415cc97b5c89c8fa436c528039e796064a328e6

## Wispr Flow — Complete Feature & Settings Inventory (for FlowSpeak clone)

Confidence tags: **[OBS]** = observed in cited primary source; **[INF]** = inferred. Nearly all below is [OBS] from docs.wisprflow.ai help center unless tagged. NOTE for FlowSpeak: real Wispr Flow is **cloud-only** (audio streamed to backend, ensemble of cloud ASR models); our clone re-implements the same UX/behavior locally — the *behavioral facts* below are the spec, not the transport.

---

### 1. CORE PRODUCT / DICTATION LOOP [OBS: "What is Flow", features page]
- Tagline: **"dictate anywhere you can type — about 4× faster than typing."** Marketing repeats **"4× faster than typing"** (no WPM/accuracy % published on features page).
- Loop: (1) press+hold hotkey, speak naturally; (2) real-time transcription "with no noticeable delay"; (3) text inserted into active text field of ANY app. Works in any OS text field.
- AI cleanup layer removes filler words ("um","uh"), formats lists, detects/inserts punctuation, backtracks (self-corrections), spells names right from surrounding context, matches tone. "Vocabulary adaptation: Flow learns your words, names, and technical terms over time."
- **Requires internet for transcription** (no offline dictation in real product). Desktop platforms: Mac, Windows. Mobile: iOS, Android (Beta).
- ASR architecture [OBS research/supporting-languages]: **ensemble of speech-recognition models**, different engines per language. Names ElevenLabs **Scribe** and **Gemini** as outperforming OpenAI **Whisper** on Asian languages; uses **accent-confidence scoring** across multiple candidate transcriptions for language detection; a separate **formatter model** "learns from real user edits (punctuation, spacing, grammar)". Handles code-mixing (Hinglish → romanized Hindi without script switch). Measured by WER. No latency figures published.

### 2. FLOW BAR (desktop pill/bubble) [OBS: move-and-dock article]
- Described as "the small bubble that shows your dictation status." Contains a center bubble to start dictation; waveform + progress indicator + language/style pickers + status pills.
- Docking: click-and-hold bubble → **three pill-shaped drop zones** appear (bottom, left, right; **top NOT supported**). Docked side = bar reorients **vertically**, waveform/pills stack. Press **Escape** during drag to cancel. Position saved automatically, persists across launches. Default = bottom-center [INF].
- Show/hide toggle "Show Flow Bar" in Settings→System. Snooze/hide releases mic.

### 3. DICTIONARY / AUTO-LEARNED VOCABULARY [OBS: dictionary article]
- **Auto-add**: setting at **Settings → System → Extras → Auto-add to dictionary**. Learns only **distinctive/specialized words + proper nouns from user corrections** (names, brands, technical terms). Explicitly **filters out common words** ("sprint","feature","deploy","roadmap" NOT auto-added).
- **When a word is added**: when you correct a transcript by typing over it, Flow notices the corrected spelling and adds it automatically (no manual action).
- **Auto-learned words shown with ✨ sparkle icon** in desktop dictionary.
- **Manual add (desktop)**: Dictionary in left sidebar → "Add new" → enter word/phrase → Save. Also right-click underlined word in Scratchpad → "Add to Dictionary" from context menu.
- **Edit/Delete**: click entry to edit; trash icon to delete; bulk-select via Cmd/Ctrl+click or Shift+click. Search via Cmd+F (Mac)/Ctrl+F (Win).
- **Misspelling replacement rule ("Correct a misspelling")**: add correct spelling → toggle on "Correct a misspelling" → enter the wrong spelling Flow produces → Save. **Each word can only have ONE replacement rule.**
- **Starred words (desktop only)**: star icon → higher recognition priority; starred pinned to top of list. Android does NOT support starring, sorting, or bulk import.
- **Usage-based ranking**: dictionary entries ranked by usage (from Mar 2026 changelog: "usage-based ranking, smarter auto-add").
- **Limits**: 60-char limit per word (59 on iOS); replacement/correction up to 4,000 chars. Bulk import ≤1,000 entries, ≤3MB (Mac/Win only).
- **Casing/spelling enforcement + names from context** [OBS: Context Awareness]: Flow preserves correct capitalization for proper nouns; skips mid-sentence lowercasing when a word matches your first/last name, personal dictionary, team dictionary, or **names visible on screen**.
- **Sync**: entries sync automatically Mac/Win/iOS/Android; changes take effect immediately, no restart. Dictionary always syncs even when Private Cloud Sync OFF.
- **Bulk import (dictionary)** [OBS]: **CSV**, 1–2 columns: col1 "word or phrase" (≤60 chars), col2 optional "correction" (≤4000). Example `"Monvi","Manvi"`. Settings→Experimental→toggle "Bulk import". Paid/trial/enterprise required.

### 4. SNIPPETS / TEXT EXPANSION [OBS: snippets + bulk import articles]
- Voice-triggered static text blocks. Create: Snippets sidebar → "Add new" → **"Snippet" field = trigger** (spoken phrase, ≤60 chars) + **"Expansion" field = inserted text** (≤4,000 chars desktop) → "Add snippet" or Cmd+Enter (Mac)/Ctrl+Enter (Win). iOS: Snippets tab → floating + → Save.
- **Matching rules**: triggers **case-insensitive**; expansion uses exact saved casing. If entire dictation = trigger only, snippet fires even if STT appends a period (punctuation stripped). Inside a longer sentence, trigger must match "as a whole word with no surrounding punctuation." **Personal snippets take priority over team snippets** with identical triggers.
- **Dynamic variables NOT supported** — static text only (no date/clipboard/placeholder substitution).
- **Sync**: syncs across devices on same account; desktop "Refresh" button for manual sync.
- **Bulk import (snippets)**: **JSON** array of objects `{"name": trigger(≤60), "text": expansion(≤4000)}`, ≤1,000 items, ≤3MB, Mac/Win only.
- Platforms: Mac, Windows, iOS (Android has no snippets tab — Android bottom tabs are Home/Dictionary/Style/Snippets per one source but navigation article says no Scratchpad; snippets edit-only on mobile).

### 5. STYLES / TONE MATCHING PER APP [OBS: Flow Styles + personalized-style]
- **4 app categories**: Personal messages (WhatsApp, Telegram, Signal, Messenger, Discord, iMessage), Work messages (Slack, Teams, Zoom, LinkedIn, Notion, Jira, Google Docs), Email (Gmail, Outlook, ProtonMail, Superhuman + web versions), Other (Docs, Notes, ChatGPT).
- **Tone options**: **Formal, Casual, Very Casual (Personal only), Excited (Work/Email/Other only)**.
- **Defaults**: iOS/Android → Personal=Casual, Work/Email/Other=Formal. Mac/Win → all categories default Formal until user picks.
- **What it modifies**: ONLY capitalization, punctuation, spacing. Does **NOT** change grammar, word choice, or phrasing.
- **Requires English** (US / British / Canadian) as selected language. Desktop-first, rolling out to mobile.
- Configure: Styles sidebar → category tab → style card → verify with test dictation.
- **Quick Style Switcher (iOS)**: style pill above keyboard shows active style; tap to temporarily override for current session without changing saved prefs. iOS keyboard styles listed: Default, Casual, Formal, Very casual, Excited.
- Simpler mobile interim: "Casual tone while messaging" toggle at Settings→Personalization.
- App-category detection driven by Context Awareness (detects active app).

### 6. SMART FORMATTING / BACKTRACK / AUTO-CLEANUP [OBS: smart-formatting article + changelog]
- **Smart Formatting**: context-aware casing (lowercase mid-sentence, capitalize sentence starts, spacing); in messaging apps trailing periods removed for casual feel; spoken numbers/"one…two…" → numbered lists; spoken punctuation names inserted ("period","comma","exclamation point","em-dash","quotation mark","apostrophe","asterisk","hashtag","at symbol", + variants).
  - Example: say "My top goals this week are one finish the report two send the presentation" → "My top goals this week are: 1. Finish the report 2. Send the presentation".
- **Backtrack** (disfluency/self-correction removal): trigger words "actually"/"scratch that", or natural restatement (context analysis).
  - Example: "Let's do coffee at 2 actually 3" → "Let's do coffee at 3".
- **Auto Cleanup** (May 2026 changelog replaced binary Smart Formatting with **4 levels: None, Light, Medium, High**). Toggle at Settings→Auto Cleanup (Mac/Win). iOS: Settings→Personalization (on/off). Android: always on, no toggle. Stored locally per device. (Dedicated Auto-Cleanup help article currently a placeholder/unavailable.)

### 7. COMMAND MODE [OBS: command-mode article] — Pro-gated
- Highlight text + speak a command to edit in place; or no selection → answer/generate inline at cursor. Keeps you in voice for whole writing process.
- **Activate**: press+hold Command Mode shortcut, speak, release. **ESC** cancels.
  - Mac default: **Fn + Ctrl**; Mac no-Fn: **Cmd+Ctrl+Option**; Windows: **Ctrl+Win+Alt**. Custom up to 4 shortcuts (mouse Middle-Click, Mouse 4–10 supported) at Settings→Shortcuts→Command Mode.
- With selection → replaces highlighted text. Without → inserts generated content/answer inline.
- Example commands: "Make this more concise", "Translate to Polish", "Turn this outline into an essay", "Add a rule to never use exclamation marks", "I don't like to use the word utilize".
- **Limits**: ≤1,000 words per selection; over → error **"Oops, too long to polish — try again with under 1000 words."** Unavailable while previous transcription/Polish still processing. **Desktop (Mac+Win) only**, not mobile.
- **Gating**: requires paid subscription or active free trial; enable at **Settings → Experimental** (visible only to paying users).

### 8. TRANSFORMS (Beta) + POLISH [OBS: transforms + polish articles] — Pro-gated
- **Transforms** = select text + keyboard shortcut → AI rewrites in place. Up to **9 slots**: slot 1 locked as **Prompt Engineer**; slots 2–9 customizable.
  - Create custom: click card → set name (required) → write prompt → assign shortcut → optional up to 5 writing samples (50–500 words each). Auto-saves once BOTH prompt + shortcut set.
- **Polish** = base transform. **5 default toggle rules**: (1) "Make more concise", (2) "Reword for clarity", (3) "Reorder for readability", (4) "Add structure for readability", (5) "Maintain your tone". Plus up to 5 custom instructions (50 words each) / up to 8 custom transforms.
- Shortcuts: **Polish = Opt+1 (Mac) / Win+Alt+1 (Win)**; **Prompt Engineer = Opt+2 / Win+Alt+2**; **View Diff = Opt+O / Win+Alt+O**.
- Invocation: keyboard shortcut, wand button, right-click context menu, Scratchpad suggestion chips (More concise / More professional / More casual / Turn to list / Turn to table / Polish), "Auto Apply After Dictation" / "Auto-Polish" toggle. Re-polish presets: Prompt Engineer, Turn to list, Translate to English, Empathize.
- Diff viewer w/ undo. **Limits**: desktop 1–1000 words; iOS Polish 10–1000 words. Mac/Win only for full Polish.
- Shortcut rules: ≥1 modifier, ≤3 keys total; Mac modifiers Cmd/Ctrl/Opt/Alt/Shift/Fn; Win Ctrl/Alt/Shift/Win; mouse 4–10 + middle-click allowed.

### 9. WHISPER MODE / DISCREET [OBS: discreet microphone guide]
- **No separate "whisper mode" setting/toggle.** Flow "understands whispers as accurately as normal speech" — depends on **mic proximity** (closer mic → quieter speech works). Recommends clip-on lavalier, headset boom, condenser, gooseneck mics; earbuds/AirPods mic 6–8" away = worse. Advice: enunciate crisply (people mumble when whispering). Marketing calls it "Whisper mode" as a capability, not a mode.

### 10. LANGUAGES [OBS: multi-language article + research]
- **100+ languages** with regional variants (British/Canadian/US English, Swiss German, Simplified/Traditional Chinese, Cantonese). 7 languages tuned to English-level; dozens more accurate.
- **Auto-detect**: picks **one language per dictation session** (NOT per word). Mid-sentence switch → whole segment transcribes in one language. Turn OFF auto-detect + select single language to fix wrong-language issues.
- **Select**: Mac/Win Settings→General→Languages; iOS Settings→General→Set Language; Android Settings→Languages. Instant apply, syncs (iOS won't overwrite local selection).
- **Mutually exclusive pairs**: Hindi↔Hinglish; Traditional↔Simplified Chinese; Standard↔Swiss German.
- Mixed-language: best with occasional foreign words; English+Spanish/French/German better than English+Chinese/Japanese; no rapid intra-sentence switching. French adds narrow spaces around punctuation; Chinese/Japanese use full-width punctuation, no extra spacing.
- **Language Picker** in Flow Bar (Mar 2026): one-click switching for multilingual users.

### 11. CONTEXT AWARENESS [OBS: context-awareness article]
- Reads (locally): active app info + list of apps in session; textbox contents before/selected/after cursor; on-screen text (recipient names, conversation history); screenshots during dictation; file/variable names in Cursor/VS Code; Slack + Apple Messages conversation context.
- **Password field contents NEVER read.** Clipboard not collected.
- Uses for: proper-noun capitalization, tone/style category matching, casing/spacing/punctuation from surrounding text (special handling Notion, AI chat apps).
- Toggle: **Settings→Data and Privacy→"Context awareness"**, **ON by default on Mac/Win**. Enterprise admin can set "Available" or "Disable for all users" (tooltip "This setting is managed by your organization"). Data sent per-request unless Privacy Mode on. Mac needs Accessibility permission; Windows skips context formatting inside Flow's own window.

### 12. SCRATCHPAD / NOTES [OBS: scratchpad article + changelog]
- Floating multi-tab rich-text editor with image attachments + sidebar (Mac/Win); syncs with iOS Notes. Beta introduced Desktop v1.5.113.
- Open via Settings→General→Shortcuts "Open Scratchpad" (changelog cites **Option+S on Mac** as default; navigation article says no default). Flow Bar button hidden by default → enable "Add to Flow Bar" toggle on Notes page.
- Tabs: multiple notes side-by-side, drag to reorder, drag out to detach into new window.
- **Version history**: Clock button; each version icon marks typed vs dictated vs transformed.
- Images: PNG/JPEG/WebP/GIF, ≤5MB each, ≤10 per note (desktop only; iOS no images).
- Auto-save; sync across devices; available offline; cloud checkmark = synced, slashed cloud = offline. Pin notes to top; search by title+content with highlight. Pinning also in Notes Hub sidebar.

### 13. DICTATION HISTORY [OBS: delete-transcripts article]
- Shown on **Home page** (Mac/Win/iOS) / home screen (Android), grouped by day. Stores transcripts, **Polish/transform history**, and audio files.
- **Delete one**: Mac/Win hover → three-dot → "Delete transcript"; iOS long-press row → Delete → confirm; Android three-dot → Delete.
- **Delete all / retention**: Mac/Win Settings→Data and Privacy → "Never store data locally" or "Auto-delete local data every 24 hours"; iOS toggle "Automatically delete transcripts" (off by default); Android sign-out deletes ("Sign out and delete transcripts?").
- **Tap transcript body → copies text** to clipboard. **"Undo AI edit"** in transcript history (May 2026). Inline Retry from history.
- **Storage**: local per device; Cloud Sync controls server-side; audio kept locally 14 days on desktop then auto-deleted (iOS until manual/auto-delete; Android evicted on low storage).

### 14. STATS / STREAKS / USAGE (Insights tab) [OBS: usage-tab article + reviews]
- **Total Words Dictated**: running count + monthly comparison badge (e.g. "+12% this month" vs prior month total).
- **WPM**: animated semicircular/radial gauge, average as rounded whole number, + **percentile vs GLOBAL keyboard typing speeds** (not other users). Range "Top 0.1%" to "Top 99%". Anchored on ~52 WPM avg typist (100 WPM≈Top 4%, 150≈Top 0.5%).
- **Corrections by Flow**: count of auto-corrections incl. filler words ("um","like") + dictionary/snippet substitutions; two rows (words corrected + dictionary fixes).
- **Usage Streak**: calendar heatmap; current-streak days glow (only when streak >1 day).
- **Desktop App Usage Breakdown**: horizontal bar across personal messages/work/emails/AI prompts/documents/other.
- **Voice Profile** + superlatives + peak dictation time on share cards. **Leaderboard** (eligible/enterprise): sortable by Total words, WPM, Current daily streak, Desktop words, Mobile words; refreshes hourly.
- **"Time saved"** [OBS reviews; NOT in help article]: shown in reviews, computed vs **60 WPM typing baseline** (e.g. 107k words @154 WPM ≈ 18 hrs saved). Trial-end summary shows word average vs 2,000 limit bar chart (power users) or plan-comparison card (light users); needs ≥200 words to see post-trial modal.

### 15. ONBOARDING FLOW (Mac desktop, step-by-step) [OBS: setup-guide]
1. Download from wisprflow.ai → drag to Applications → launch (menu-bar icon).
2. **Sign in**: click "Sign in via browser" → choose Google / Apple / Microsoft / SSO / email+password → session returns to app.
3. **Permissions in sequence (each card unlocks next)**: (a) **Microphone** card → "Allow" → macOS dialog "Allow"; (b) **Accessibility** card → "Allow" ("Flow uses accessibility access to insert spoken words into other apps"). If dismissed, Allow reopens correct System Settings page.
4. **Tutorial**: Continue through intro screens → "Tell us about yourself" self-assessment ("What do you do for work?") → Privacy notice → Microphone test (bars low on silence, rise on speech; option to change mic) → Keyboard shortcut selection (press desired combo) → Language selection (or leave auto-detect) → "Try It Yourself" demo practice using shortcut.
5. Configure privacy preferences → Flow Hub welcome + stats. Start: hold shortcut in any app.
- iOS onboarding: Agree legal consent → Open settings to enable in System Settings → allow background → "Give it a try!" → intro screens → select languages → tap Flow Bubble on "Say something!" → push-to-talk tutorial → privacy prefs → allow/skip push notifications.
- Android onboarding: grant **Display Over Other Apps** (Flow Bubble) + **Accessibility Service** (text insertion), auto-detects grant + returns foreground.

### 16. KEYBOARD SHORTCUTS (full) [OBS: shortcuts article]
| Action | Mac | Windows |
|---|---|---|
| Push-to-talk | **Fn** (Apple kb) or Ctrl+Opt (3rd-party) | **Ctrl+Win** |
| Hands-free | Fn+Space (or Ctrl+Opt+Space) | Ctrl+Win+Space |
| Command Mode | Fn+Ctrl (or Cmd+Ctrl+Opt) | Ctrl+Win+Alt |
| Cancel/Dismiss | Esc (rebindable) | Esc (rebindable) |
| Paste last transcript | Cmd+Ctrl+V | Shift+Alt+Z |
| Copy last transcript | Cmd+Ctrl+C | Shift+Alt+X |
| Polish | Opt+1 | Win+Alt+1 |
| Prompt Engineer | Opt+2 | Win+Alt+2 |
| View Diff | Opt+O | Win+Alt+O |
| Open Scratchpad | user-set (Opt+S) | user-set |
- Rules: needs modifier or valid mouse button; **≤3 keys**; can't mix left/right modifier versions; no duplicate bindings; Caps Lock prohibited. Mouse buttons 4–10 + middle-click supported (Mouse Flow, Mar 2026). Rebindable Enter key; customizable Cancel (for Vim/terminal). "Press Enter Command" (say "press enter" auto-submits) is Experimental/paid.

### 17. SETTINGS PANES — FULL MAP [OBS: navigation article]
**Desktop (Mac/Win) — Hub left sidebar**: Home, Dictionary, Snippets, Style, Scratchpad, Settings, Help, Refer a Friend, Invite your team (plan-dependent).
**Settings → sections**:
- **General**: Shortcuts, Microphone, Languages.
- **System**: Launch at login; Show Flow Bar; Show in dock (Mac); sound toggles; **Mute music while dictating**; notification categories; Scratchpad opening behavior; **Extras → Auto-add to dictionary**; Reset & restart.
- **Vibe Coding**: Variable Recognition, File Tagging (IDE File Tagging).
- **Experimental (paid only)**: Command Mode, Press Enter Command, Bulk Import.
- **Account section**: Account (edit name + profile pic ≤5MB, email read-only, Sign Out, Delete Account), Plans & Billing, **Data & Privacy** (Privacy Mode, Context Awareness, Local storage [store / auto-delete 24h / never store], Default note visibility, Sync Notes / Private Cloud Sync, HIPAA).
- Localization: settings/notifications in English, German, Spanish, Italian, Portuguese.

**iOS — bottom tabs**: Home, Dictionary, Snippets, Style, Scratchpad. Settings (side menu):
- General: Language / Set Language, Disable Flow Session, Auto Open Note, Low Data Mode, Keyboard Feedback, Push Notifications, Allow Live Activities, Action Button setup (supported iPhones).
- Audio: Interaction Sounds, Use Built-In Mic.
- Personalization: Smart Formatting toggle (Casual tone while messaging).
- Data & Privacy: Privacy Mode, Cloud Sync, HIPAA, Auto-Delete Transcripts, Refresh notes from cloud.

**Android — bottom tabs**: Home, Dictionary, Style, Snippets (no Scratchpad). Settings (drawer):
- General: Languages, Flow Bubble Size (Shrink when idle / Shrink to a dot / Shrink in search fields), Flow Bubble Opacity.
- Data & Privacy: Privacy Mode, Private Cloud Sync. Android CANNOT do in-app subscription purchase — manage at wisprflow.ai.

### 18. NOTIFICATION CATEGORIES (independently mutable) [OBS: notification-preferences article]
Settings→System→Notifications (Mac/Win only; mobile = single toggle): **Suggestions** (setup/usage tips), **Announcements** (new features), **Milestones** (word-count achievements, streaks, referral activity, onboarding nudges, dictionary milestones, trial-extension reminders), **Team updates** (enterprise), **Team leaderboard updates** (enterprise). **Critical** (permission alerts, mic hardware errors, helper-app failures, billing/trial-end, incident alerts, text-recovery) is NON-mutable, always shows.

### 19. IDE / VIBE CODING INTEGRATIONS [OBS: cursor/IDE + variable-recognition + file-tagging + terminal articles]
- **Variable Recognition**: reads function/class/variable names from open editor (Cursor, VS Code, Windsurf) → adds to transcription context. Langs: JS, TS, Python, Java, Swift, C++, C, Rust, Go. Setup: enable Screen Reader Optimized mode (Command Palette "Toggle Screen Reader Accessibility Mode") + Settings→Vibe coding. Example: "set user ID to none" → `set userId to None`; "getUserData function" → recognizes `getUserData`.
- **File Tagging (Cursor & Windsurf only, NOT VS Code)**: say filename in chat → auto-attaches (no @ menu). Triggers: "at"/"tag"/"tagged"/"@" + name, or full name+extension ("index dot ts"). Dot-files: say "dot"/"punto" first. Multi-file in one utterance. Can't tag extensionless files (Makefile, Dockerfile) or terminal windows. Toggle Settings→Vibe coding→"File Tagging in Chat (Cursor & Windsurf)", default on.
- **Terminals**: Mac uses Cmd+V; Windows uses Ctrl+V, falls back **Shift+Insert** when unreliable. Direct paste works in Cmd Prompt, PowerShell, Windows Terminal, IDE-integrated terminals. **WSL/Linux VMs/SSH/tmux/screen NOT direct paste** → use "Paste last transcript" (Shift+Alt+Z Win / Cmd+Ctrl+V Mac). Vim/nano: enter insert mode first. **Claude Code & Codex**: Flow auto-splits long dictations into smaller chunks; terminal text visibility support added. No native Linux app (use WSL/VM). Context-aware formatting applies in terminals (can interfere w/ shell commands → bypass via manual paste).
- Also: Microsoft Outlook integration article; Remote Desktop (Citrix/RDP/VDI) support article.

### 20. ACCOUNT / LOGIN [OBS: manage-account article]
- **Login REQUIRED.** 5 methods: Sign in with Apple / Google / Microsoft / SSO / email+password. Account tied to method used at setup.
- Edit name (Save), profile pic (saves immediately, ≤5MB), **email read-only**. Sign Out (removes local data incl. transcripts/history; preserves preferences). Delete Account ("deletes all your data, memory, and dictionary, locally and on our servers"). Password reset only for email/password accounts.

### 21. PLANS / PRICING / GATING [OBS: plans article + pricing]
- **4 tiers: Basic (Free), Pro, Team, Enterprise.** 14-day Pro trial on all new accounts ("Free for 14 days — no card required"); converts to Basic after.
- **Pro price**: USD $15/mo or $144/yr (~$12/mo); EUR €15/144; GBP £15/144; INR ₹400/3,840; CAD $18/172.80. **Student = 50% off** ($7.50; some sources $6, verified .edu). **Team = 2× Pro per seat**; 2-week team trial.
- **Free (Basic) word caps**: **2,000 words/week soft cap** (notification "Flow will be slower"), **5,000 hard cap** desktop (10,000 during bonus week); **1,000/week iOS (1,500 hard cap)**. Reset every **Sunday**, no rollover. Hard cap → new dictation blocked + upgrade prompt.
  - **Bonus words**: one-time **8,000** on first hitting 2,000 limit (message: "You've hit your 2,000 word weekly limit — Here's 8,000 bonus words to keep dictating this week!"), lasts until next Sunday. EXCLUDED: referred users, students, enterprise, iOS, Android.
- **Basic includes**: core voice-to-text dictation. **Pro adds**: unlimited words all platforms, Command Mode, Transforms/Polish custom, early access, 100+ languages, full platform coverage. **Experimental features** (Command Mode, Press Enter, Bulk Import) paid-only.

### 22. TEAM / ENTERPRISE [OBS: FAQ + admin articles]
- **Team**: centralized billing (true-up invoicing mid-cycle), super-admin/admin roles, **Shared Dictionary & Snippets** (team-level accuracy), Team Insights (limited — own word count only), restricted Leaderboard (own stats), auto-join by domain email, shareable instant-join invite links.
- **Enterprise**: SSO + **SCIM** provisioning (manage via IdP), **IT Admin seats** (management-only, free, don't count toward billed seats), **Audit Logs** (Members added/removed, Join requests approved/rejected), **Cost Centers** (split billing, inherit negotiated price), **IP Allowlist** (IPv4/IPv6 CIDR), full **Insights Dashboard** (active-user trends, ROI, app usage), full Team Leaderboard, **HIPAA BAA** support, advanced security controls, MDM deployment, Domain Capture verification, Admin Usage v2 (Team Members table + Words Dictated CSV export).

### 23. PRIVACY / SECURITY / DATA RETENTION [OBS: privacy-mode + security-FAQ articles]
- **Privacy Mode**: ON = dictation data never used to train/improve models (Wispr or 3rd party); OFF ("Share Data") = may improve features. **Private Cloud Sync**: independent toggle for server-side storage of transcripts/notes (enables cross-device sync). **Privacy Mode ON + Cloud Sync OFF = Zero Data Retention.**
- Always syncs regardless: dictionary, snippets, subscription/account settings. Blocked when Cloud Sync OFF: Scratchpad sync, meeting sharing/recording, todos sync.
- **Local storage (desktop)**: Store locally (default) / Auto-delete every 24h / Never store locally — governs device only, independent of Cloud Sync.
- Defaults: new users Cloud Sync ON; existing Privacy-Mode-ON users → Cloud Sync OFF; existing Privacy-Mode-OFF → Cloud Sync ON.
- **Security**: entirely cloud, multi-tenant SaaS, US cloud provider. TLS 1.2+ in transit; AES-256 at rest (HSM/FIPS 140-2 keys). Audio streamed to backend, NOT persisted locally (transcripts not stored locally under Privacy Mode). **SOC 2 Type I** completed Apr 2026 (A-LIGN); **ISO 27001:2022** Stage 1 done, Stage 2 in progress; HIPAA BAA available; subprocessors in DPA Annex 2 (under NDA). HIPAA BAA signers → Privacy Mode permanently locked on. **Banking App Detection** disables dictation in 50+ banking apps (privacy). Email marketing opt-out available.

### 24. OFFLINE / ERROR MESSAGING [OBS: retry + troubleshooting articles]
- **No offline dictation** — internet required. Desktop failure: Flow Bar flashes red + notification **"Something's not right" / "Transcript failed to load. You can always recover it from History."** buttons Retry + Open History. Long processing: **"Taking longer than usual… Your audio is saved for retrying."**
- Other error strings: "Flow is having trouble loading/starting", "Audio system failed to load", "No audio received", "Microphone unavailable", "No internet connection", "Is your microphone muted?", "Microphone disconnected", "Unable to access mic" (actions: Select microphone / Troubleshoot / Restart App).
- iOS: orange-triangle icon → dropdown Retry/Dismiss. Android: Flow Bubble Retry button + "Retrying..." spinner.
- **Audio preserved for retry**: desktop 14 days; iOS until deleted; Android until low storage. Inline retry from History (desktop: min 5-sec recordings, <14 days old). "No Model Available" error exists as a troubleshooting topic (model failed to load) — resolve via connectivity/restart.
- Status page: statuspage.incident.io/wispr-flow; in-app service-status alerts, incident banners, slow-dictation notifications.

### 25. SESSION LIMITS / HANDS-FREE / SNOOZE [OBS]
- **Session limits**: Desktop **20 min max** (was 5 min), warning at **19 min** ("less than a minute left"), then auto-ends+transcribes+pastes. iOS **5 min**. Android no enforced max (older source said 5 min w/ auto-submit).
- **Hands-free**: Fn+Space (Mac) / Ctrl+Win+Space (Win); or click Flow Bar; or **double-press push-to-talk key** to lock into hands-free. Stop: press shortcut again or click ✓; click ✕ to discard. Say "press enter" to auto-Enter. iOS: tap-to-record/Siri (no hardware shortcuts). Android: tap bubble = record, long-press = hold-to-dictate.
- **Snooze (Android only)**: drag Flow Bubble to bottom snooze zone → **10 min fixed** (not customizable); un-snooze by shaking phial firmly (unlocked) or app "End snooze now"; auto-returns after 10 min; snoozing releases mic.

### 26. iOS KEYBOARD APP [OBS: flow-keyboard article]
- Enable via tap-hold globe → select "Wispr Flow". **Full Access required** (Settings→keyboards→Wispr Flow→Allow Full Access→Allow). Mic button records; style pill/switcher in top bar. System keyboard auto-appears for number pads, phone fields, decimal pads, email-address fields, numbers-and-punctuation fields; banking apps block 3rd-party keyboards. iOS 26.4+: dictation may jump to main app → swipe right on bottom bar to return. Action Button + Shortcuts + Live Activities support. Auto-switchback (v1.63) native for Claude, ChatGPT, Gemini, Grok, Perplexity, LinkedIn, messaging apps.

### 27. WINDOWS DIFFERENCES [OBS: reviews + requirements] [some INF]
- Launched Windows Mar 2025 (Mac-first product). Electron-based; reported to occasionally freeze target apps (VS Code). Storage ~200MB (vs ~500MB Mac). x64 only, ARM not supported. Same pricing/features nominally, but historically less mature/reliable, especially remote-desktop/corporate. Different default shortcuts (Ctrl+Win base vs Fn). Terminal paste uses Shift+Insert fallback. Otherwise feature parity (Command Mode, Transforms, dictionary, snippets, styles all present).

### 28. SYSTEM REQUIREMENTS [OBS: requirements article]
- **macOS 12 Monterey+**, Apple Silicon or Intel, 8GB+ RAM rec, ~500MB. (Target M4 Pro/24GB/macOS 15.7.3 = well within.) Windows 10/11 x64, 8GB+, ~200MB. iOS 18.3+, iPhone only, 4GB+, ~500MB. Android 13–16, phones only, 6GB+, ~500MB. All require working mic.

### 29. MISC FEATURES (from sitemap/changelog) [OBS]
- **Ranked microphone preferences + automatic mic switching** (v1.5.751); clamshell mode (dock → external mic auto-switch + warning). External audio device setup. Focusrite Scarlett multi-input handling.
- **Guided product tours** (team features intro). **Refer a Friend** referral link. **Add Wispr Flow to LinkedIn profile** badge. **Route dictation to Slack/Email/Calendar** (article title exists but content is generic shortcut config — likely deep-link routing to open app + insert). **Retry failed transcriptions**, **Reset & restart**, **Re-verify permissions after update**, **macOS Secure Keyboard Entry (Secure Event Input) blocks shortcuts** fix, **Logitech MX Master / Logi Options mouse buttons** fix. Accessibility: keyboard nav + screen reader support article.

---
### KEY IMPLEMENTATION NOTES for FlowSpeak (local-first clone)
- Real Wispr = cloud ASR ensemble (Scribe/Gemini/Whisper) + cloud formatter LLM. **Clone target**: local ASR (e.g. whisper.cpp / parakeet / MLX Whisper on M4 Pro) + local cleanup LLM, with a settings toggle to route the **cleanup/Polish/Command layer to Claude API** instead (matches Wispr's OFF-by-default cloud posture but inverted default).
- The **"cleanup LLM" maps to Wispr's Polish/Auto-Cleanup/formatter** — the 5 Polish rules + Auto-Cleanup levels (None/Light/Medium/High) + Backtrack + Smart Formatting + Style tone are all prompt-driven post-processing on raw ASR text. This is the natural Claude-API integration point.
- Push-to-talk default **Fn** (macOS) — note Fn key capture on macOS requires special handling; provide Ctrl+Opt fallback exactly like Wispr.
- Accessibility (AXUIElement) + Microphone TCC permissions are the two required macOS grants; onboarding must sequence them as unlockable cards.
- Text insertion = paste via pasteboard + Cmd+V synthesis (Accessibility), with Shift+Insert/paste-last fallbacks for terminals.

## Sources
- https://docs.wisprflow.ai/articles/4052411709-teach-flow-your-words-with-the-dictionary
- https://docs.wisprflow.ai/articles/4816967992-how-to-use-command-mode
- https://docs.wisprflow.ai/articles/9559327591-flow-plans-and-what-s-included
- https://docs.wisprflow.ai/articles/3191899797-use-flow-with-multiple-languages
- https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android
- https://docs.wisprflow.ai/sitemap.xml
- https://wisprflow.ai/whats-new
- https://docs.wisprflow.ai/articles/5784437944-create-and-use-snippets
- https://docs.wisprflow.ai/articles/2368263928-how-to-setup-flow-styles
- https://docs.wisprflow.ai/articles/5373093536-how-do-i-use-smart-formatting-and-backtrack
- https://docs.wisprflow.ai/articles/8760230576-your-usage-tab-track-your-dictation-stats-in-wispr-flow
- https://docs.wisprflow.ai/articles/3152211871-setup-guide
- https://docs.wisprflow.ai/articles/2772472373-what-is-flow
- https://docs.wisprflow.ai/articles/4678293671-feature-context-awareness
- https://docs.wisprflow.ai/articles/4709791908-understanding-privacy-mode-and-cloud-sync
- https://docs.wisprflow.ai/articles/8068950331-how-to-use-transforms-beta
- https://docs.wisprflow.ai/articles/2719941210-how-to-configure-polish-shortcuts-and-custom-prompts
- https://docs.wisprflow.ai/articles/6434410694-use-flow-with-cursor-vs-code-and-other-ides
- https://docs.wisprflow.ai/articles/6478598909-using-flow-with-linux-wsl-and-terminal-applications
- https://docs.wisprflow.ai/articles/8554805225-variable-recognition
- https://docs.wisprflow.ai/articles/9805771321-file-tagging
- https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts
- https://docs.wisprflow.ai/articles/1036674442-supported-devices-and-system-requirements
- https://docs.wisprflow.ai/articles/1790396454-move-and-dock-the-flow-bar-on-desktop
- https://docs.wisprflow.ai/articles/9192039587-using-wispr-flow-discreetly-microphone-guide
- https://docs.wisprflow.ai/articles/6391241694-use-flow-hands-free
- https://docs.wisprflow.ai/articles/7339517111-manage-your-flow-account
- https://docs.wisprflow.ai/articles/3467817258-security-and-compliance-faq
- https://docs.wisprflow.ai/articles/9618237082-using-the-scratchpad-to-save-and-edit-notes
- https://docs.wisprflow.ai/articles/4760791189-free-tier-weekly-word-cap-and-bonus-words-remove-desktop-trial-experiment
- https://docs.wisprflow.ai/articles/7453988911-set-up-the-flow-keyboard-on-iphone
- https://docs.wisprflow.ai/articles/4465314211-delete-transcripts-and-history-in-wispr-flow
- https://docs.wisprflow.ai/articles/2458545840-faqs-for-flow-pro-team-and-flow-enterprise-plans
- https://docs.wisprflow.ai/articles/2250194357-customize-notification-preferences-by-category
- https://wisprflow.ai/features
- https://docs.wisprflow.ai/articles/3155947051-troubleshooting-guide-for-no-model-available-error
- https://docs.wisprflow.ai/articles/2503460374-retry-failed-transcriptions
- https://docs.wisprflow.ai/articles/7140488640-trial-end-value-summary-in-wispr-flow
- https://docs.wisprflow.ai/articles/3400534884-snooze-the-dictation-bubble
- https://docs.wisprflow.ai/articles/4841123325-longer-dictation-sessions-now-up-to-20-minutes
- https://wisprflow.ai/research/supporting-languages
- https://docs.wisprflow.ai/articles/8955301725-how-do-i-bulk-import-for-dictionary-and-snippets
- https://wisprflow.ai/pricing
- https://spokenly.app/blog/wispr-flow-pricing
- https://zackproser.com/blog/wisprflow-review
