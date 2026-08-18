# Track: v2:98e167c862feb385d3eea400a55a53df372e701dfd27f5a60fd0c6098f73fd39

## TRACK: macOS app architecture for FlowSpeak (target: M4 Pro, 24GB, macOS 15.7.3 Sequoia)

Confidence tags: **[OBS]** = observed with source; **[INF]** = inferred/educated engineering guess. macOS-15-specific caveats noted where relevant. macOS-26-only APIs deliberately excluded.

---

### (a) TEXT INSERTION INTO FRONTMOST APP

**Three mechanisms, ranked by real-world use in OSS clones:**

**1. Clipboard-paste simulation (CGEvent Cmd+V) — the de-facto standard.** Every serious OSS Wispr clone uses this as primary: parrote, foxsay, speak2, vox all "copy to pasteboard → synthesize Cmd+V via CGEvent." **[OBS]** (github.com/shubham-web/parrote-dictation-app, github.com/skulkworks/foxsay, github.com/zachswift615/speak2, github.com/mattthewong/vox)
- Implementation: write string to `NSPasteboard.general`, then post two `CGEvent(keyboardEventSource:virtualKey:keyDown:)` pairs with `.flags = .maskCommand`. Virtual keycode for **V = 0x09 (9)**, left Command = 0x37 (55). **[INF from API]**
- Pasteboard save/restore: speak2 and foxsay explicitly **"restore original clipboard contents"** after paste. **[OBS]** Correct pattern: snapshot `pasteboard.pasteboardItems` (all types, not just string) + `changeCount`, paste, then restore on a delay. **[INF]**
- Timing: needs a delay between setting pasteboard and posting Cmd+V, and before restoring clipboard, or the target app pastes stale/empty content. Community consensus ~20-100ms; restore delay longer (~150-300ms) because paste is async. **[INF]** foxsay/speak2 don't publish exact ms.
- **Reliability failures:**
  - **Secure input active** → paste is silently swallowed. Triggered by any `NSSecureTextField` (password fields) which call `EnableSecureEventInput()`, and by **iTerm2/Terminal "Secure Keyboard Entry"** (iTerm enables it by default / persistently; known to block Espanso, TextExpander, and all CGEvent injection). **[OBS]** (espanso.org/docs/troubleshooting/secure-input, textexpander.com/secure-input, iterm2 GitLab issues #3937/#5407, TN2150)
  - **Clipboard-manager interference**: managers (Paste, Maccy, Raycast, Alfred clipboard) capture the injected text into history and can race the restore, leaving your dictation permanently in the user's clipboard history (privacy leak) or restoring the wrong item. **[INF, well-documented class of bug]**
  - Cross-keyboard-layout: on non-US layouts, keycode-9 may not map to "v"; more robust to key the event by the layout's V keycode or rely on the app honoring the pasteboard rather than the keystroke. **[INF]**

**2. AXUIElement direct insertion — cleanest where supported, narrow support.** **[OBS]** (levelup.gitconnected two-ways article; macdevelopers.wordpress.com)
- Path: `AXUIElementCreateSystemWide()` → copy `kAXFocusedUIElementAttribute` → `AXUIElementSetAttributeValue(el, kAXSelectedTextAttribute, string)` to insert at caret / replace selection, OR `kAXValueAttribute` to replace the whole field. **[OBS]**
- Requires **Accessibility** permission + code-signed + App Sandbox **disabled**. **[OBS]**
- **Supports:** standard Cocoa `NSTextField`/`NSTextView`, most native AppKit apps, TextEdit, Notes, native mail composers. **[INF from AX model]**
- **Fails / partial:** terminals (no AX text value for the pty buffer), many Electron/Chromium apps (Chromium's AX tree exposes value read but `setValue`/selected-text writes are unreliable; electron/electron#36337 shows AX text selection is broken when lines start blank), most web `<textarea>`/`contenteditable`, Java/Swing apps (custom non-AX text widgets). **[OBS/INF]** No general write support in browsers.
- Advantage: no clipboard pollution, no keystroke synthesis, immune to secure-input for the insert itself (but you still can't insert into a secure field).

**3. CGEventKeyboardSetUnicodeString typing simulation — universal fallback, slow.** **[OBS]** (developer.apple.com keyboardSetUnicodeString; isamert.net)
- `CGEvent(keyboardEventSource:virtualKey:0,keyDown:true)` then `event.keyboardSetUnicodeString(...)` to attach arbitrary Unicode independent of keycode; post keyDown+keyUp. **[OBS]**
- **Critical caveat (Apple docs):** "application frameworks may ignore the Unicode string and do their own translation based on virtual keycode + event state." Breaks in **XQuartz and Microsoft Remote Desktop** (keycode-based apps). **[OBS]**
- Speed: char-by-char is slow; batching up to ~20 chars per event is the known optimization. Emitting too fast can drop/reorder characters in some apps. **[OBS]** (Quicksilver PR #1827)
- **IME conflicts:** synthesizing raw Unicode while a CJK/IME composition window is open corrupts the composition; must not type into an active IME buffer. **[INF]**
- Works even where paste is blocked at the app level (no pasteboard needed), but is still swallowed by true secure-event-input fields. **[INF]**

**RECOMMENDED HYBRID STRATEGY & FALLBACK ORDER (for FlowSpeak):** **[INF, synthesized]**
1. **Pre-check secure input:** call `IsSecureEventInputEnabled()` (Carbon). If true → do NOT paste (will fail); either type via `keyboardSetUnicodeString` or surface "secure field, copied to clipboard" toast. **[OBS this API exists]**
2. **Try AX insert** (`kAXSelectedTextAttribute` on focused element) when the focused element's role is a supported text role AND the bundle-id is not a known-bad list (terminals, browsers, Electron). Fast, clean, no clipboard.
3. **Else clipboard-paste with full save/restore** (all pasteboard types + changeCount), the universal default. Restore original clipboard after ~250ms.
4. **Else (secure input / paste failed / keycode-app) type via `keyboardSetUnicodeString`** in ~20-char batches.
5. Detect paste success by re-reading AX value/`kAXSelectedTextRange` delta where possible; if unchanged, fall through. **[INF]**
- Maintain a per-bundle-id override table (user-tunable) since app behavior is the only reliable signal.

---

### (b) FRONTMOST APP + FOCUSED FIELD DETECTION / CONTEXT

- **Frontmost app:** `NSWorkspace.shared.frontmostApplication` → `NSRunningApplication` with `.bundleIdentifier`, `.localizedName`, `.processIdentifier`. Observe changes via `NSWorkspace.shared.notificationCenter` `didActivateApplicationNotification`. **[OBS/INF]**
- **Focused element:** system-wide route `AXUIElementCreateSystemWide()` → `kAXFocusedUIElementAttribute`; or per-app `AXUIElementCreateApplication(pid)` → `kAXFocusedApplicationAttribute`/`kAXFocusedUIElementAttribute`. Read role via `kAXRoleAttribute` (`kAXTextFieldRole`, `kAXTextAreaRole`, `kAXComboBoxRole`). **[OBS]**
- **Reading nearby text for context WITHOUT screenshots:** **[OBS]** (medium.com/@itsuki.enjoy get-text-near-caret; macdevelopers.wordpress.com)
  - `kAXValueAttribute` → whole field text.
  - `kAXSelectedTextRangeAttribute` → `CFRange{location,length}` of caret/selection (unwrap via `AXValueGetValue(.cfRange)`).
  - Build an extended `CFRange` (e.g. **200 chars before and after** caret), wrap with `AXValueCreate(.cfRange, &range)`, pass to `kAXStringForRangeParameterizedAttribute` via `AXUIElementCopyParameterizedAttributeValue` → gets surrounding text for LLM context.
  - `kAXVisibleCharacterRangeAttribute` → all currently-visible text as an alternative.
  - This is exactly the "context awareness" Wispr Flow does ("reading on-screen text" cited as a reason for its ~800MB RAM). **[OBS]** (getvoibe review) — but AX gives it for free without screen-recording permission.
- **Bundle-id → tone/mode mapping:** VoiceInk's "Power Mode" = "intelligent app detection automatically applies pre-configured settings based on the app/URL you're on"; detects frontmost bundle-id and (for browsers) the active URL to switch prompt/formatting. **[OBS]** (github.com/Beingpax/VoiceInk). URL extraction from browsers is itself via AX (`kAXWebAreaRole` / address-bar value) or per-browser AppleScript. **[INF]** FlowSpeak: map bundle-id → tone (e.g. `com.apple.dt.Xcode`/terminals→"code, verbatim"; `com.tinyspeck.slackmacgap`→"casual chat"; `com.apple.mail`→"formal email"). **[INF]**

---

### (c) FLOATING BAR WINDOW

**Window class & flags** **[OBS]** (cindori.com floating-panel; fazm.ai; apple docs):
- Subclass **`NSPanel`** with `styleMask = [.nonactivatingPanel, .fullSizeContentView, .borderless]` (add `.titled/.resizable` only if needed). `.nonactivatingPanel` = clicking the panel does NOT activate FlowSpeak / does not steal focus from the user's app — essential for a dictation overlay.
- `isFloatingPanel = true`; `becomesKeyOnlyIfNeeded = true`; `hidesOnDeactivate = false`; `isMovableByWindowBackground = true` (for drag-to-reposition). `backgroundColor = .clear`, `isOpaque = false`, `hasShadow = true`. Host SwiftUI via `NSHostingView`. **[OBS/INF]**
- **Window level** (`NSWindow.Level`, raw values): `.normal=0`, `.floating=3`, `.modalPanel=8`, `.dock=20`, `.mainMenu=24`, `.statusBar=25`, `.popUpMenu=101`, `.screenSaver=101`. **[OBS]** (jameshfisher.com; cocoadev). Use **`.statusBar` (25)** to sit above the menu bar; `.floating` (3) if you want it below the menu bar. Wispr's pill sits at bottom so `.floating` or a custom level between dock and mainMenu is fine. **[INF]**
- **Float over full-screen apps / all Spaces:** `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]`. `.canJoinAllSpaces` (without it the panel is bound to its origin Space); `.fullScreenAuxiliary` required (macOS Sonoma+) to appear while another app is in native full-screen. **[OBS]**
- **Click-through regions:** set `window.ignoresMouseEvents = true` for pass-through, or per-region: keep the panel hit-testable only over the visible pill and transparent elsewhere by using a small tight window (see Wispr's ~440×300 window with visible ~70px pill — most of the window is empty/non-interactive). Toggle `ignoresMouseEvents` dynamically or use an `NSView` `hitTest` returning nil over transparent zones. **[INF]**

**Positioning bottom-center across monitors** **[OBS/INF]** (developer.apple.com NSScreen; thinkandbuild.it):
- Choose target screen = screen containing the mouse (`NSScreen.screens.first{ $0.frame.contains(NSEvent.mouseLocation) }`) or `NSScreen.main` (screen with key window/keyboard focus). Wispr pins to the active display. **[INF]**
- Use `screen.visibleFrame` (excludes menu bar + Dock) not `screen.frame`. Compute `x = visibleFrame.midX - panelWidth/2`, `y = visibleFrame.minY + bottomInset`. Note macOS bottom-left origin; primary screen at index 0 defines global coords. **[OBS]**
- **Re-dock on monitor changes:** observe `NSApplication.didChangeScreenParametersNotification` (resolution/arrangement change, display connect/disconnect) and recompute frame; also reposition on active-app/Space change. **[OBS/INF]**

**Wispr Flow pill spec to clone (cosmetic changes only):** **[OBS]** (pillfloat repo; wisprflow help center)
- Rendered inside a **~440×300px transparent window**; visible pill is a small element **~70px** tall at the bottom; **locked bottom-center** by default. **[OBS]**
- Drag to reposition → drop zones appear along **bottom / left / right** edges; release to snap; **reorients vertically when docked to a side edge** (waveform, pickers, tooltips reflow to vertical). **Esc while dragging cancels.** Position persists across sessions. **[OBS]** (docs.wisprflow.ai navigating-the-app)
- States: **idle** (clickable center bubble) → **recording** (live waveform + Cancel + Stop buttons) → **transcribing** (progress indicator). **Waveform goes flat after a short period of silence.** **[OBS]**
- Right-click bubble → Flow Menu: Hide for 1 hour, Settings, Microphone, Languages, Transcript history, Paste last transcript. **[OBS]**
- Note for reimplementation: PillFloat (3rd-party) finds the Wispr pill by AX **window title "Status"** and must re-assert position every ~150-400ms because Wispr constantly re-centers it — implies Wispr uses a timer/observer to keep the pill pinned; do the same but expose real drag. **[OBS]**

---

### (d) MENU-BAR APP, LAUNCH-AT-LOGIN, AUTO-UPDATE

**Menu bar:** **[OBS]** (mjtsai; steipete.me; orchetect/MenuBarExtraAccess)
- Two options: SwiftUI **`MenuBarExtra`** (macOS 13+) with `.menuBarExtraStyle(.window)` for a custom popover panel, OR AppKit **`NSStatusItem`** (`NSStatusBar.system.statusItem(withLength:)`).
- **MenuBarExtra limitations on macOS 15 (important):** no 1st-party API to get/set menu open state, no access to underlying `NSStatusItem` or the popup's `NSWindow`, button limited to image/text (no custom UI), and **`SettingsLink` is unreliable inside MenuBarExtra**. Menu-bar apps are treated as background/accessory apps → activation-policy juggling and timing delays needed to show Settings/onboarding windows. **[OBS]**
- **Recommendation:** use **`NSStatusItem`** directly (or `MenuBarExtra` + the `MenuBarExtraAccess` shim) for the control FlowSpeak needs (custom icon states for idle/recording, attaching an `NSPanel`). Set `NSApplication` `activationPolicy = .accessory` (no Dock icon). **[INF]**

**Launch at login:** **[OBS]** (theevilbit smappservice; nilcoalescing)
- **`SMAppService.mainApp.register()`** (macOS 13+, ServiceManagement), `.unregister()` to disable; check `.status` (`.enabled`). Replaces deprecated `SMLoginItemSetEnabled`. Must be **off by default + explicit user toggle** (App Review rule). **[OBS]**
- **macOS 15 Sequoia gotcha:** reports of `SMAppService` **Error 108 "Unable to read plist"**; and Ventura 13.6 bug where unregister didn't disable. Wrap in error handling; the `sindresorhus/LaunchAtLogin` SPM package (used by VoiceInk) papers over these. **[OBS]** (VoiceInk deps)

**Auto-update — Sparkle 2:** **[OBS]** (sparkle-project.org; VoiceInk uses Sparkle)
- Add via **SPM** `https://github.com/sparkle-project/Sparkle`, version rule 2.x.
- Signing: **EdDSA (ed25519)** signatures; `./bin/generate_keys` stores private key in login Keychain, prints public key → embed as `SUPublicEDKey` in Info.plist. `generate_appcast` builds the `appcast.xml` from a folder of zip/dmg archives. **[OBS]**
- Info.plist keys: `SUFeedURL` (HTTPS appcast), `SUPublicEDKey`, `SUEnableAutomaticChecks`. **[INF/OBS]**
- **Sandbox:** if sandboxed, Sparkle ships two XPC services — `Installer.xpc` (install outside sandbox) and `Downloader.xpc` (network). But FlowSpeak needs AX/CGEventTap which require **sandbox OFF** anyway, so distribute Developer-ID-signed + notarized outside the App Store; Sparkle then works without the XPC dance. **[OBS/INF]**

---

### (e) PERMISSIONS UX

Three TCC permissions required. Deep-link URLs verified current on macOS 15.2 Sequoia (list updated 2024-11-18). **[OBS]** (gist rmcdongit; jano.dev; gannonlawlor)

| Permission | Check (no prompt) | Request (prompt) | Info.plist / notes | Deep link |
|---|---|---|---|---|
| **Microphone** | `AVCaptureDevice.authorizationStatus(for: .audio)` → `.authorized/.denied/.notDetermined/.restricted` | `AVCaptureDevice.requestAccess(for: .audio){}` (async, shows OS dialog once) | `NSMicrophoneUsageDescription` required or crash | `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone` |
| **Accessibility** | `AXIsProcessTrusted()` → Bool | `AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true])` — shows "FlowSpeak would like to control this computer using accessibility features" | needed for AX text I/O + posting CGEvents + NSEvent global monitor | `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility` |
| **Input Monitoring** | `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)` → `.granted/.denied/.unknown` (or `CGPreflightListenEventAccess()`) | `IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)` (or `CGRequestListenEventAccess()`) | needed for **CGEventTap** (global key listen) | `x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent` |

**Which permission for which key API (critical, "weird historical" split):** **[OBS]** (danielraffel.me; Apple forums)
- **`CGEventTap` (session tap) → Input Monitoring.** Can see/swallow keys across all apps.
- **`NSEvent.addGlobalMonitorForEvents` → Accessibility.** Read-only, can't swallow events; can't reliably catch Fn-alone.
- foxsay exploits this: uses `NSEvent.addGlobalMonitorForEvents()` for the hotkey so it needs **no Accessibility just to detect** the key (Accessibility only needed for the paste step). **[OBS]** speak2/parrote/vox use CGEventTap (need Input Monitoring + Accessibility). **[OBS]**

**App-restart-after-grant problem:** **[OBS]** (nachtimwald.com; macworld)
- **Input Monitoring changes DO NOT take effect until the app is fully quit (Cmd-Q) and relaunched.** **[OBS]** — must prompt "Please quit and reopen FlowSpeak."
- Accessibility usually goes live immediately, but TCC DB corruption / stale grants sometimes require relaunch or `tccutil reset Accessibility`. **[OBS]**
- Poll grant state on a timer during onboarding and auto-advance / offer a "Relaunch now" button. **[INF, standard pattern]**

**CGEvent tap "silent disable race" (must handle):** **[OBS]** (danielraffel.me TIL 2026-02)
- A tap can be non-nil but **inert** (receives no events) after re-signing / launching via Launch Services; and the OS disables live taps with `kCGEventTapDisabledByTimeout` (callback held events too long) or `kCGEventTapDisabledByUserInput`.
- Recovery: in the callback, on those two event types call `CGEvent.tapEnable(tap:enable:true)`; run a **health timer (~5s)** checking `CGEvent.tapIsEnabled(tap:)` and re-enable, and if that fails fully reinstall the tap (remove from RunLoop → recreate → re-add). "A non-nil tap is not a healthy tap." **[OBS]**

---

### (f) STACK CHOICE FOR THIS APP

**What Wispr Flow itself uses:** **Mac = native** (Swift/AppKit, "polished," ~166MB RAM on M4 in light use / ~800MB with cloud connections + context monitoring); **Windows = Electron** (~800MB RAM, ~8% CPU idle, reported to freeze VS Code). Min macOS 12.0 Monterey. Cloud ASR pipeline (OpenAI subprocessor + fine-tuned Llama cleanup) — but we're going local. **[OBS]** (getvoibe, spokenly, parlaparla reviews; docs.wisprflow MDM)

**What OSS clones chose (all Apple-Silicon native except vox):** **[OBS]**
| Clone | Stack | Hotkey | Text insert | ASR | LLM cleanup | Min OS |
|---|---|---|---|---|---|---|
| VoiceInk | **Swift**, GPLv3, Sparkle+LaunchAtLogin, `KeyboardShortcuts`, `SelectedTextKit` | KeyboardShortcuts lib (Carbon `RegisterEventHotKey`) | AX/clipboard (SelectedTextKit) | whisper.cpp + FluidAudio (Parakeet) | local + cloud | 14.4 |
| parrote | **Swift** SwiftUI+AppKit, XcodeGen | **CGEventTap** (R-Opt/CapsLock/Fn) | clipboard paste | WhisperKit (~1.5GB) | Ollama (gemma3:12b) opt. | — |
| foxsay | **Swift**/SwiftUI, Apache-2.0 | **NSEvent global monitor** | clipboard + CGEvent Cmd+V | FluidAudio Parakeet TDT 0.6B (~450-480MB) / WhisperKit | **MLX** (Gemma3 1B…Mistral-NeMo 12B) | 14.0 |
| speak2 | **Swift**/SwiftUI | **CGEventTap** (Fn default) | clipboard + restore | WhisperKit + FluidAudio Parakeet v3 (~600MB) | **MLX** Qwen2.5-1.5B (~1.1GB) / Ollama | 14.0 |
| superwhisper | **native** | — | any app | whisper.cpp | local Ollama / cloud | — |
| vox | **Go + C bridge** | CGEventTap (C callback) | pbcopy + CGEvent Cmd+V | whisper.cpp HTTP | — | — |

**Tauri v2 assessment:** **[OBS]** (v2.tauri.app global-shortcut; crates.io tauri-plugin-macos-input-monitor; dev.to)
- Fn/system-key access is a **hard limitation**: `tauri-plugin-global-shortcut` uses Carbon `RegisterEventHotKey` = app-level, low priority, **cannot override system F-keys or capture Fn-alone**; needs the community `tauri-plugin-macos-input-monitor` (CGEventTap via FFI) to do push-to-talk properly. **[OBS]**
- AX API access = Rust FFI into ApplicationServices (workable but hand-rolled). Bundling local ASR+LLM = ship whisper.cpp/llama.cpp sidecars (no MLX/WhisperKit Swift bindings). Waveform in a webview `<canvas>` — fine but a webview overlay competes with the transparent-panel + click-through requirements. Binary small (~10MB). **[INF]**

**Electron assessment:** rich npm ecosystem for global shortcuts, but ~150MB+ binary, high idle RAM (Wispr's own Windows Electron build = ~800MB), and the same FFI/native-module burden for CGEventTap + AX; waveform easy in canvas but overlay/click-through/full-screen-Space behavior is harder than a native `NSPanel`. **[OBS/INF]**

**RECOMMENDATION: Native Swift + SwiftUI (AppKit for the panel & status item).** **[INF, high confidence]**
Justification: (1) **Fn push-to-talk** needs a `CGEventTap` (IOKit/Input Monitoring) — native is first-class, Tauri/Electron require FFI/community plugins; (2) **full AX API** for context reading + AX text insertion is native C API, cleanest from Swift; (3) **local ASR+LLM bundling is dramatically better on native** — WhisperKit + FluidAudio (Parakeet TDT 0.6B, ~450-600MB, ANE/CoreML) + **MLX-Swift** for the local cleanup LLM (Qwen2.5-1.5B / Gemma3, Metal GPU) are all Swift-native and ANE/Metal-accelerated; on M4 Pro Parakeet runs >100× realtime and whisper-large-v3-turbo (809M) 2-3× realtime; (4) waveform at 60fps via `TimelineView` + `Canvas` (or Metal for max perf) with zero webview overhead; (5) small binary, lowest idle RAM (matches Wispr's own native Mac choice); (6) the floating `NSPanel` with `.nonactivatingPanel` + `.canJoinAllSpaces`/`.fullScreenAuxiliary` + click-through is a native-only clean solution; (7) **every serious OSS Wispr/Superwhisper clone that ships (VoiceInk, superwhisper, parrote, foxsay, speak2) is native Swift** — the one Go clone (vox) still drops to a C bridge for the event tap. The Claude-API cleanup toggle is a trivial HTTPS call from either stack, so it doesn't shift the decision. Dev-speed cost of native is offset by SwiftUI + existing SPM packages (KeyboardShortcuts, Sparkle, LaunchAtLogin, WhisperKit, FluidAudio, MLX-Swift). **[OBS/INF]**

---

### KEY KEYCODES / CONSTANTS FOR IMPLEMENTATION [OBS/INF]
- Fn/Globe: `kVK_Function = 0x3F (63)`; reported as modifier `NSEvent.ModifierFlags.function (0x800000)` / `CGEventFlags.maskSecondaryFn`. Fn-alone is only reliably caught via CGEventTap watching `kCGEventFlagsChanged`, not `RegisterEventHotKey`. **[OBS/INF]**
- Right Option `0x3D (61)`, Right Command `0x36 (54)`, Left Command `0x37 (55)`, V `0x09 (9)`, Space `0x31 (49)`, Escape `0x35 (53)`.
- **Wispr default shortcuts to clone:** push-to-talk = **Fn** (built-in Apple keyboards) or **Ctrl+Opt** fallback (no-Fn / 3rd-party keyboards, since Fn is a hardware signal unique to Apple keyboards); hands-free toggle = **Fn+Space** / Ctrl+Opt+Space. Rules: max 3 keys, ≥1 modifier (except standalone Esc = cancel), no Caps Lock, no mixing L/R of same modifier. **[OBS]** (docs.wisprflow supported-hotkeys)
- CGEventTap monitors `kCGEventFlagsChanged` + `kCGEventKeyDown/Up`; modifier-only hotkeys should cancel recording if a normal key is pressed (avoids clobbering shortcuts) — vox pattern. **[OBS]**
- Onboarding order that minimizes restarts: request **Microphone** first (in-app dialog, no restart), then **Input Monitoring** (needs relaunch), then **Accessibility** — batch the relaunch-requiring grants so the user restarts once. **[INF]**

## Sources
- https://developer.apple.com/documentation/coregraphics/cgevent/1456028-keyboardsetunicodestring
- https://developer.apple.com/documentation/applicationservices/axuielement
- https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions
- https://levelup.gitconnected.com/swift-macos-insert-text-to-other-active-applications-two-ways-9e2d712ae293
- https://medium.com/@itsuki.enjoy/swiftui-macos-get-text-contents-near-text-cursor-caret-e3a995c089ca
- https://macdevelopers.wordpress.com/2014/02/05/how-to-get-selected-text-and-its-coordinates-from-any-system-wide-application-using-accessibility-api/
- https://macdevelopers.wordpress.com/2014/01/31/accessing-text-value-from-any-system-wide-application-via-accessibility-api/
- https://developer.apple.com/library/archive/technotes/tn2150/_index.html
- https://espanso.org/docs/troubleshooting/secure-input/
- https://textexpander.com/secure-input
- https://gitlab.com/gnachman/iterm2/-/issues/3937
- https://gitlab.com/gnachman/iterm2/-/issues/5407
- https://github.com/electron/electron/issues/36337
- https://cindori.com/developer/floating-panel
- https://fazm.ai/blog/swiftui-floating-panel
- https://developer.apple.com/documentation/appkit/nswindow/stylemask-swift.struct/nonactivatingpanel
- https://jameshfisher.com/2020/08/03/what-is-the-order-of-nswindow-levels/
- https://cocoadev.github.io/NSWindowLevel/
- https://developer.apple.com/documentation/appkit/nsscreen
- https://www.thinkandbuild.it/deal-with-multiple-screens-programming/
- https://github.com/OrangeAKA/pillfloat
- https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android
- https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts
- https://docs.wisprflow.ai/articles/5002934560-why-is-the-wispr-bar-is-not-appearing-or-disappearing
- https://theevilbit.github.io/posts/smappservice/
- https://nilcoalescing.com/blog/LaunchAtLoginSetting/
- https://developer.apple.com/forums/thread/747573
- https://sparkle-project.org/documentation/
- https://github.com/sparkle-project/Sparkle
- https://mjtsai.com/blog/2025/06/18/showing-settings-from-macos-menu-bar-items/
- https://steipete.me/posts/2025/showing-settings-from-macos-menu-bar-items
- https://github.com/orchetect/MenuBarExtraAccess
- https://gist.github.com/rmcdongit/f66ff91e0dad78d4d6346a75ded4b751
- https://jano.dev/apple/macos/swift/2025/01/08/Accessibility-Permission.html
- https://nachtimwald.com/2020/11/08/macos-iohidmanager-permission-issue/
- https://developer.apple.com/forums/thread/696673
- https://www.macworld.com/article/347452/how-to-fix-macos-accessibility-permission-when-an-app-cant-be-enabled.html
- https://danielraffel.me/til/2026/02/19/cgevent-taps-and-code-signing-the-silent-disable-race/
- https://hacktricks.wiki/en/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-input-monitoring-screen-capture-accessibility.html
- https://github.com/shubham-web/parrote-dictation-app
- https://github.com/skulkworks/foxsay
- https://github.com/zachswift615/speak2
- https://github.com/mattthewong/vox/blob/main/CLAUDE.md
- https://github.com/Beingpax/VoiceInk
- https://superwhisper.com/
- https://v2.tauri.app/plugin/global-shortcut/
- https://crates.io/crates/tauri-plugin-macos-input-monitor
- https://www.getvoibe.com/resources/wispr-flow-review/
- https://spokenly.app/blog/wispr-flow-review
- https://parlaparla.io/blog/wispr-flow-alternatives/
- https://www.arunbaby.com/speech-tech/0073-whisper-vs-parakeet-asr-decision/
- https://justvoice.ai/blog/whisper-benchmark-apple-silicon-m3-m4
- https://holyswift.app/how-to-create-animation-with-swiftui-canvas-timelineview/
