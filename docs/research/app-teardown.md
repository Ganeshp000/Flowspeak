# Track: v2:3f9bb86424de58d047bd1dcb50c143dbd1f577b48c8f201976861ac8839c580d

## Wispr Flow macOS teardown — v1.6.7 (arm64), extracted locally

**Provenance:** Downloaded from `https://dl.wisprflow.ai/mac-apple/latest` → 302 → `https://dl.wisprflow.com/wispr-flow/darwin/arm64/dmgs/Flow-v1.6.7.dmg` (322,744,867 bytes, SHA256 `9bc84506abf094a545d0943c611ce83858ab8c18a196ffcd3b2fcf87c3cea506`). Intel build at `https://dl.wisprflow.ai/mac-intel/latest`. DMG volume name `Flow-v1.6.7`; app bundle inside is `Wispr Flow.app`. All facts below are OBSERVED from the actual bundle unless marked INFERRED. Bundle + asar + extracted tree deleted, DMG deleted, volume detached after analysis.

### 1. Stack identity (OBSERVED)
- **Electron app**, NOT native Swift. `Contents/Frameworks/` contains `Electron Framework.framework`, `Squirrel.framework` (auto-updater), `Mantle.framework`, `ReactiveObjC.framework`, and 4 helper apps: `Wispr Flow Helper.app`, `…Helper (GPU).app`, `…Helper (Plugin).app`, `…Helper (Renderer).app`.
- **PLUS a bundled native Swift helper**: `Contents/Resources/swift-helper-app-dist/Wispr Flow.app` — separate Mach-O universal (x86_64 + arm64), bundle id `com.electron.wispr-flow.accessibility-mac-app`, `LSUIElement=true` (agent, no Dock icon), its own version 1.6.4, links `Sentry.framework`, has `Assets.car`. This helper does the accessibility/paste + global-key-monitoring work that Electron can't.
- `package.json`: `name: wispr-flow`, `productName: Wispr Flow`, `version 1.6.7`, `description: "Voice-typing made perfect"`, `base10CommitHash: fb605edec38995609dacc831af645664c230dc4c`, built with **electron-forge 7.11.2 + webpack**. Also references a `windows-helper-app` (C#/.NET) — cross-platform helper via generated IPC types.

### 2. Info.plist / entitlements (OBSERVED)
- `CFBundleIdentifier: com.electron.wispr-flow`; `CFBundleShortVersionString/CFBundleVersion: 1.6.7`; `LSMinimumSystemVersion: 12.0`; built with macOS 15.5 SDK (DTSDKBuild 24F74, Xcode 16.4). `LSApplicationCategoryType: public.app-category.developer-tools`.
- **URL scheme:** `wispr-flow://` (deep-links / OAuth callback).
- `NSAppTransportSecurity.NSAllowsArbitraryLoads=true`; `NSPrincipalClass: AtomApplication`; `NSRequiresAquaSystemAppearance=false` (supports dark mode); `NSQuitAlwaysKeepsWindows=false`; `LSEnvironment.MallocNanoZone=0`. `ElectronAsarIntegrity` SHA256 pins `Resources/app.asar`.
- **Usage-description strings (verbatim, for our clone's equivalents):**
  - `NSMicrophoneUsageDescription` = "Allow Wispr Flow microphone access to transcribe your speech."
  - `NSAudioCaptureUsageDescription` = "Wispr Flow needs to access your computer's audio to take notes during meetings."
  - `NSCameraUsageDescription` = "This app needs access to the camera"; `NSBluetooth*UsageDescription` = "This app needs access to Bluetooth"
  - (Swift helper adds) `NSAppleEventsUsageDescription` = "Wispr Flow uses Apple Events to position your browser window beside the meeting recorder when you join a calendar event." and `NSBluetoothAlwaysUsageDescription` = "Allow Wispr Flow to connect to your BLE mic ring for hands-free dictation."
- **Entitlements (main binary):** `com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`, `allow-dyld-environment-variables`, `com.apple.security.device.audio-input`, `com.apple.security.device.camera`. NOT sandboxed. Team ID `C9VQZ78H85`; `aps-environment: production` (push notifications); keychain-access-group `C9VQZ78H85.*`.

### 3. Windows (renderer bundles) (OBSERVED)
Separate BrowserWindows, each its own webpack entry under `.webpack/renderer/`: **`overlay`** (the floating pill host), **`status`** (pill state + the dictation/notepad card — biggest UI logic, 10.5 MB bundle; contains all design tokens), **`hub`** (main app / settings dashboard, 21.7 MB), **`scratchpad`**, **`contextMenu`**, **`meeting_recorder`**, **`calendar_reminder`**, **`feature_tour`**, plus `onboarding`. Shared `vendor/index.js` (3.1 MB). Each window HTML is a bare `<body style="overflow:hidden">` that loads `../vendor/index.js` then its own `index.js`.

### 4. Floating pill/bar — geometry & states (OBSERVED, from SCSS tokens in status bundle)
- **Morph animation duration `$pill-morph-ms: 0.42s` (420 ms)** — the pill's shape transitions between states.
- Resting/idle "flow bar": `$flow-bar-length: 50px`, `$flow-bar-thickness: 30px`; tiny rest nub `$pill-rest-w: 30px × $pill-rest-h: 6px`, radius `$pill-rest-r: 6px`; side-docked rest `$pill-rest-side-w: 8px × $pill-rest-side-h: 40px`.
- Recording "mini" pill: `$pill-mini-w: 330px × $pill-mini-h: 32px`, radius `$pill-mini-r: 22.5px` (fully rounded). Global `$border-radius: 22.5px`.
- Expanded "card": `$pill-card-w: 380px × $pill-card-h: 130px`, radius `$pill-card-r: 24px`; bare `$pill-card-bare-h: 88px`; large `$pill-l4-h: 322px`; `$pill-title-cap: 100px`; `$non-morph-bar-clearance: 32px`; `$recorder-header-height: 52px`.
- **State machine labels** (main bundle): `idle`, `listening`, `recording`, `transcribing`, `formatting`, `processing`, `done`, `paused`, `locked`, `cancelled`, `error`.

### 5. OS-level pill window behavior (OBSERVED, main bundle) — critical for clone
- `setAlwaysOnTop(true, "screen-saver", 1000)` — always-on-top at **screen-saver** level, relative level +1000. Some windows use `"floating"` conditionally.
- `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true, skipTransformProcessType: true})` — shows on every Space and over other apps' fullscreen.
- `setIgnoreMouseEvents(...)` used heavily (click-through when pill is passive). BrowserWindow options seen across windows: `transparent:true`, `frame:false`, `hasShadow`, `resizable`, `movable`, `focusable`, `skipTaskbar`, `fullscreenable`, `backgroundColor`, `vibrancy`, `roundedCorners`. (INFERRED: overlay/status created `transparent:true, frame:false, hasShadow:false, focusable:false, alwaysOnTop`.)

### 6. Typography (OBSERVED)
- Font families: **`Figtree`** (base sans, `$font-family-base`, variable weight), **`EBGaramond`** (serif for headings — used 441×, `$font-family-ebgaramond`), **`GoogleSansCode`** and **`Manrope`** (mono/code, `$font-family-mono`); fallbacks `system-ui,sans-serif` and `menlo, consolas, monaco, monospace`. Bundled TTF/OTF: `Figtree-VariableFont_wght.ttf`, `EBGaramond-VariableFont_wght.ttf`, `GoogleSansCode-VariableFont_wght.ttf`, `Manrope-VariableFont_wght.ttf` (+ italics).
- Editor text: `$editor-font-size: 15px`, `$editor-font-weight: 550`, `$editor-padding: 12px`. Weights: `$weight-regular: 400`, `$weight-emphasis: 550`, `$weight-strong: 600`.
- Type scale (font-size / line-height px): body-xxs 10/18, body-xs 12/20, body-sm 15/20, body-md 16/24, body-lg 18/28; heading-sm 18/24, heading-md 20/28, heading-lg 24/32, heading-xl 28/34, heading-2xl 32/40; serif heading sm/md/lg/xl 28/36/48/72; overline-sm 12, overline-md 14.
- Radii scale: `$radius-xs 3px`, `sm 6px`, `md 8px`, `lg 12px`, `full 9999px`. Other: `$composer-control-height 48px`, `$notepad-inset 12px`, `$row-pitch 28px`, `$indent-width 24px`, `$edge-fade 8px`, `$rainbow-pill-ring-width 1px`.

### 7. Color system (OBSERVED) — theme-aware (light+dark, dual values per token)
- Neutral scales are named **`--vast-*`** and **`--sand-*`** (mapped through `--neutral-10…900`), with `--shade-black`/`--shade-white` flipping per theme (`--shade-black: #000` dark → `#deddd7` light). Example `--vast-*` dark→light pairs: vast-50 `#1a1a1a`→`#e9e8e1`, vast-100 `#242423`→`#deddd7`, vast-300 `#464544`→`#b3b2ad`, vast-500 `#878683`, vast-700 `#5b5b59`→`#b3b2ad`, vast-900 `#30302f`→`#c8c8c2`, vast-950 `#1a1a1a`→`#deddd7`.
- **`--pill-bg: var(--vast-700)`** (also `var(--shade-black)` in some states).
- Most-frequent hex values across UI (the pill's rainbow/gradient accents): `#6f6f76` (grey text, 1724×), `#f0d7ff` (lilac), `#ffd5a4` (peach), `#ffa946` (orange), `#ff6c4c` (coral/red-orange), `#ffbcf2`/`#ffc1f4` (pink), `#7232a6`/`#6c358c`/`#502b66` (purples), `#dba0ff`/`#d2ace9`/`#a26ec1` (violets), `#ffab9a` (salmon), `#34d399`/`#d4f6e1`/`#034f46` (greens), `#f87171`/`#fecaca` (error reds), `#1a1a1a`/`#fcfcfb`/`#deddd7`/`#e9e8e1` (neutrals). These form the animated "rainbow pill" ring during recording.

### 8. Motion / easing (OBSERVED)
- Uses **Motion (Framer Motion) v12.23.25** + `lottie-web` + `flubber` (SVG path morphing → the pill shape morph) + `canvas-confetti` + `@number-flow/react`.
- Primary custom easing: **`cubic-bezier(0.05, 0.6, 0.4, 0.95)`** (dominant, 80×). Others: `cubic-bezier(0.4, 0, 0.2, 1)` (standard), spring/overshoot `cubic-bezier(0.34, 1.56, 0.64, 1)`, `cubic-bezier(0, 0.5, 0, 1)`, `cubic-bezier(0.2, 0.9, 0.3, 1)`. Spring token `--spring-duration: 0.2s` with generated `linear(...)` spring easings.
- Common transition durations: **280 ms** (dominant), 150 ms, 200 ms, 250 ms, 300 ms, 420 ms; fast micro 80/100/120/150 ms.

### 9. Hotkey / push-to-talk mechanism (OBSERVED) — critical for clone
- **Default trigger key = `fn`** (the Fn/Globe key). Keycode **63** (`0x3F` = `kVK_Function`) is all over the main bundle; `179` also present (media/globe). Config keys: `defaultShortcut`, `"fn"`.
- **Trigger modes:** `pushToTalk` (hold, default — 42+ refs), `tap`, `hold`, `locked`/`lock` (hands-free lock), **`doubleTap`** to lock/toggle with `doubleTapWindowMs` (configurable double-tap window). So: hold-Fn = push-to-talk; double-tap-Fn = hands-free locked mode. `MaxRecordingLength` + `autoStop` guard runaway sessions.
- Key detection lives in the **Swift helper** via a **CGEvent event tap** (strings: `eventTap`, `eventTapRunLoop`, `flagsChanged`, `keyDown`, `modifierFlags`, `KeyDownInfo`, `lastFlagsChangedAt`, `lastKeyDownAt`, `hasAppleFnKey()`, `modifierKeysDown`, `updateShortcuts`, `shortcutKeys`). It reads `hasAppleFnKey` off IOHID devices to know if a physical Fn key exists.
- Handles **secure input**: string "Secure input is blocking keyboard shortcuts" — detects `EnableSecureEventInput` (password fields) and degrades. Also `windowsKeyUpSimulation` (cross-platform key-up handling). Also `IOHIDManager` used for HID-level monitoring (BLE mic ring / device state).

### 10. Text-insertion mechanism (OBSERVED) — critical for clone
- **Clipboard paste via the Swift helper**, NOT keystroke synthesis of characters. Helper strings: `Beginning regular pasteText.`, `Beginning pasteText with delimiters.`, `helper.paste_execute`, `cancelPaste`, `generalPasteboard`, `NSPasteboard`, `NSPasteboardItemDataProvider`.
- Marks the pasteboard **`org.nspasteboard.ConcealedType`** so clipboard-manager apps ignore the transient dictation content (privacy). JS side calls it `insertionMode` (89+ refs) + `writeMethod` + `restoreClipboard` (saves & restores user's prior clipboard).
- **Uses Accessibility API** to focus/target: `AXManualAccessibility`, `AXUIElement`, `AXSelectedTextRange`, `AXSelectedTextMarkerRange`, `AXSelectedTextRanges`, `AXSelectedTextChanged`, `_systemAXUIElement`. "No valid element to focus, performing paste after app activation" — falls back to app-activate + Cmd-V.
- **Failed-paste detection heuristic:** a delayed-clipboard data provider — if the target app never requests the pasteboard data within a timeout, it fires `failedPasteNotification` ("Delayed clipboard timeout -- failed paste likely - no app requested data within…", "Failed paste timer fired."). Also refuses to paste while modifier keys are still down ("curKeysDown is non-empty on paste"). Emits `PasteAnalytics`/`PasteAnalyticsPayload`.
- **Electron↔Swift IPC:** length-prefixed JSON over stdin/stdout (`IPCClient`, `com.wispr-flow.ipcClient.messageQueue`/`readQueue`, `ipcWriteHandle`, "IPC message is too long", "IPC Message malformed: no first letter"). Schema is defined once as JSON-schema (`src/api/helper/schema.json`) and code-genned into TS, Swift, and C# via quicktype (`generate-helper-models` script) — the helper contract is shared across mac Swift + windows C#.

### 11. Audio capture + encoding (OBSERVED)
- Capture in renderer: `getUserMedia` + **AudioWorklet** (`recorderWorklet.js`).
- **Encoded to Opus** in a Web Worker: `opusEncoder.worker.js` (585 KB) + `opusscript_native_wasm.wasm` (317 KB). Sample rates referenced: **16000** (16e3, ASR), 24000, 48000 (48e3, capture). Opus frame sizes `960`/`1920` samples (20 ms @ 48 kHz). Opus application modes `2048` (OPUS_APPLICATION_VOIP) and `2049` (OPUS_APPLICATION_AUDIO). Mono (channels:1) for ASR. `fft.js` present for the live waveform/level visualization.

### 12. Backend / ASR + cleanup pipeline (OBSERVED) — Wispr Flow is CLOUD, not local
- **Dictation is streamed to the cloud over WebSocket:** `wss://api.wisprflow.ai/` and regional `wss://api-east.wisprflow.ai/`; realtime dictation endpoint path = **`/api/v1/voice-actions/realtime`**. Opus audio is streamed up; formatted text streamed back. There is **no on-device ASR/LLM** — "offline"/"onDevice" strings exist only as capability flags/guards, no ggml/whisper.cpp/CoreML model shipped. (This is the key gap our local-first clone must fill ourselves.)
- **Server-side cleanup/format LLMs referenced by name** (routing table in main bundle): `google/gemini-3-flash-preview`, `gpt-oss-120b` (served via **Cerebras**), `anthropic/claude-sonnet-4-6`, `claude-haiku-4-5` (enum `Haiku="claude-haiku-4-5"`). A **BYOK** path exists (`vault.byok_key.verification`, `byok`, `apiKey`, provider routing `cerebras`/`anthropic`) — i.e. Wispr already supports bring-your-own-key incl. Anthropic, validating our "toggle to use Claude API" requirement.
- Local loopback helper socket: **`ws://127.0.0.1:8300/`** (Electron↔helper or extension bridge). Browser-extension bridge present (`extensionBootstrap.js`, `agentToolBridge.js`) and it can `spawn("claude", …)` — an agent/tool bridge to the Claude Code CLI.
- REST API (base `https://api.wisprflow.ai`, also `cloud.wisprflow.ai`): `/v1/user/profile`, `/v1/user/preferences`, `/v1/user/registered_devices`, `/v1/user/register_device`, `/v1/user/onboarding_complete`, `/v1/user/hipaa-baa`, `/v1/user/claim_trial_extension`, `/v1/user_context`, `/v1/user_voice_preferences/upload`, **`/v1/dictionary/personal`**, **`/v1/dictionary/team`** (auto-learned vocabulary sync), **`/v1/transform/apply/stream`**, `/v1/transform/apply/dynamic/stream`, `/v1/transform/apply/suggestion`, `/v1/transform/suggestions` (the text-transform/cleanup + "auto-edits" layer), `/v1/voice-actions/realtime`, `/v1/meetings/*` (+ `/shared/`, `/sync`), `/v1/todos/sync`, `/v1/kv/*` (key-value settings sync), `/v1/enterprise/*`, `/v1/teams/*`. Auth via **Supabase** (`@supabase/supabase-js`) + **WorkOS** SSO (`@workos-inc/node`). Dictionary seed data from `https://wispr-flow-cdn.s3.us-west-2.amazonaws.com/static/data/dictionary`. Inference metadata `https://inference-info.wisprflow.com/dictation`. The AI assistant/command layer is branded **"Aria"** (`aria-web.wispr.ai`, 1310 refs) — powers CommandMode / voice-actions.

### 13. Feature layer (OBSERVED, from main bundle identifiers)
- **SmartFormat** (auto punctuation/capitalization/paragraphing), **CommandMode** (voice commands — "command" 733×; e.g. "new line", "scratch that" present as literals), **Tone/Formality matching** (`ToneMatch`, `Formality`), **AutoEdit** (self-corrections mid-speech), **screenContext/contextAware** (formats differently per active app). Per-app targeting list embedded: chatgpt, `claude`/`claude.ai`/`com.anthropic.claudefordesktop`, cursor, aider, cline, gemini, perplexity, ChatGPT desktop — used to adapt formatting/agent behavior to the frontmost app.
- **Auto-learned dictionary/vocabulary:** `AutoLearn`, `LearnedWord`, `"dictionary"`, synced to `/v1/dictionary/personal` + `/team`. Text replacement rules supported.

### 14. Local storage / config (OBSERVED)
- SQLite DB at `~/Library/Application Support/Wispr Flow/flow.sqlite`, **encrypted** (`better-sqlite3-multiple-ciphers` 12.5.0, patched) via **Sequelize 6.37.8** ORM + **Umzug** migrations (126 migration files bundled under `Resources/migrations/`). Sequelize model names seen: `Note`, `NoteVersion`, `NoteImage`, `Meeting`, `MeetingVersion`, `Todo`, `Link`, `UserContext`, `UserVoicePreferences`, `Polish`, `RemoteNotification`.
- Non-secret config via **electron-store 8.2.0** → `config.json` (`configName:"config"`). Persisted keys include at least `language`, `shortcut`. Device identity via `node-machine-id`.

### 15. Auto-update (OBSERVED)
- **Squirrel.Mac** (`Squirrel.framework`, `electron-squirrel-startup`, `autoUpdater.setFeedURL`, `/RELEASES`). Update feed host `https://dl.wisprflow.com/`. (INFERRED feed path pattern: `https://dl.wisprflow.com/wispr-flow/darwin/{arm64|x64}/…` matching the DMG path.)

### 16. Telemetry (OBSERVED)
- **PostHog** (`eu.i.posthog.com`, `eu-assets.i.posthog.com`; project key `phc_yV8yhSiAUoblWb3L5ju54QEk6Y3u2rA3xV4Dep1yIDC`), **Segment** (`api.segment.io`, `cdn.segment.com`), **Sentry** (`@sentry/electron` 7.14.0; DSN `https://f87752d820de05e60a11ca3a99a87729@o4506267787395072.ingest.sentry.io/4506268508422144`; older project `o398470`), **Datadog** browser logs (`logs.browser-intake-datadoghq.com`).

### 17. Notable dependency stack (OBSERVED, versions exact) — informs clone build
- UI/editor: **React 18.3.1**, **Lexical 0.32.1** (`@lexical/react` — the rich-text dictation editor / notepad), **@base-ui/react 1.6.0**, **lucide-react 0.563.0** (icons), **cmdk 1.1.1** (command palette), **sonner 2.0.7** (toasts), **motion 12.23.25**, **lottie-web 5.13.0**, **flubber 0.4.2**, **@number-flow/react 0.5.11**, **canvas-confetti 1.9.4**, react-markdown 10.1.0 + remark-gfm + dompurify + turndown 7.2.1 (HTML↔markdown for context capture), react-hook-form 7.68 + zod 4.1.13.
- State: **zustand 5.0.9** + **@zubridge/electron 2.1.1** (zustand state bridged main↔renderer). i18next 26 + react-i18next (60+ locales in `*.lproj`, matching `en`, `es`, `fr`, `de`, `ja`, `zh_CN`, etc.).
- System: **@gnaudio/jabra-js 4.4.4** (Jabra headset button integration; native `jabra-device-connector` for darwin/win/linux), howler 2.2.4 (UI sounds), systeminformation, node-cron, pidusage, ps-tree (process monitoring for per-app context), mac-ca (system CA certs), @grpc/grpc-js 1.14.4 + @protobuf-ts (gRPC transport option), diff-match-patch (+line-and-word variant) for streaming text diffs.
- Accessibility inspector tooling shipped in Resources: `ax-inspect.mjs`, `ax-inspect-lib.mjs`, `ax-inspect-server.mjs` (dev tool for reading AX trees of target apps — useful reference for our AX insertion code).

### Implications for FlowSpeak clone (INFERRED)
- Real Wispr Flow is cloud-dependent for ASR + LLM cleanup; our "fully local by default" is a genuine divergence, not a reimplementation. Match UX (pill geometry, 420 ms morph, Fn push-to-talk / double-tap-lock, screen-saver-level always-on-top all-Spaces window, concealed-clipboard paste + AX focus + failed-paste timer) but supply our own local ASR (e.g. whisper.cpp/Parakeet CoreML) + local cleanup LLM, with a settings toggle to route cleanup to the Claude API — mirroring their existing BYOK/`anthropic` routing path.
- The paste + global-Fn-monitoring + secure-input handling cannot be done from Electron alone; plan a small native macOS helper (Swift, `LSUIElement`) exactly as they do, talking length-prefixed JSON over stdio.
- Non-sandboxed, hardened-runtime with `disable-library-validation`/`allow-jit` (Electron requirement); needs Accessibility + Microphone TCC grants; ships a universal Swift helper.

## Sources
- https://dl.wisprflow.ai/mac-apple/latest
- https://dl.wisprflow.com/wispr-flow/darwin/arm64/dmgs/Flow-v1.6.7.dmg
- https://docs.wisprflow.ai/articles/7682075140-how-to-install-wispr-flow-on-mac
- https://wisprflow.ai/downloads
- https://formulae.brew.sh/cask/wispr-flow
