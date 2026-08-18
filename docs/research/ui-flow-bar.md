# Track: v2:d556d147b155e74012e2c2a7ce432291e20e2847675bd0da4670912a220fae5c

## TRACK: Wispr Flow Floating "Flow Bar" UI — Exhaustive Spec

Naming note: Wispr calls the desktop element the **"Flow Bar"** (macOS/Windows). "Flow Bubble" = Android floating bubble; iOS uses a keyboard, not a floating bar. The right-click menu is the **"Flow Menu"**. The Hub = the main app window.

CONFIDENCE KEY: **OBSERVED** = stated in a cited source. **INFERRED** = educated guess for the clone. Two color systems appear in sources and CONFLICT (see §5): the *marketing website* design system (cream pill) vs. the *actual on-screen Flow Bar* described by reviewers (dark pill). Treat the reviewer descriptions as authoritative for the real app.

---

### 1. DEFAULT POSITION & GEOMETRY

- **OBSERVED** Default position: **bottom-center** of the screen, horizontally centered. "right in the middle of the bottom of the screen" (podfeet review). PillFloat confirms "Wispr Flow's dictation pill is stuck at the bottom-center of your screen."
- **OBSERVED** The pill is rendered inside a **~440 × 300 px transparent overlay window**; the visible pill is a **small element ~70 px** sitting at the **bottom** of that transparent container (PillFloat README, "Limitations" section). INFERRED: the ~300px of transparent space above the visible pill is the expansion area for hover popups (language picker, transforms, tooltips) that grow upward.
- **OBSERVED** The overlay window's macOS accessibility (AX) window **title is "Status"** (PillFloat detects the pill by this title). INFERRED for clone: give the overlay NSWindow an identifiable but distinct title.
- **OBSERVED** Wispr Flow continuously **re-asserts the pill's position ~every 400 ms** (PillFloat has to override every 150 ms and still sees flicker back to bottom-center). This implies Wispr runs a timer that repositions/re-centers the window repeatedly — likely to keep it anchored on the active screen and above the Dock.
- **OBSERVED** The bar/overlay **anchors to the screen's available work area** (respects Dock position). A fixed bug: "on macOS with the Dock on the left side, the Flow Bar and its overlay rendered behind the Dock or stopped short on the right edge... The bar and overlay now correctly anchor to the available work area" (whats-new changelog). INFERRED: use `NSScreen.visibleFrame`, not `.frame`.
- **INFERRED** Offset from the very bottom edge: a small margin (~a few px to ~20px) above the Dock / bottom of visibleFrame, matching a floating-lozenge look. Exact value not published.

### 2. VISIBILITY, POSITIONING, HIDE/MOVE

- **OBSERVED** On **new installs the Flow Bar is HIDDEN by default**. Enable via **Settings → System → "Show Flow Bar"** (also phrased "Show Flow Bar at all times"). (troubleshooting article; podfeet: toggle in General/System settings.)
- **OBSERVED** **Drag to reposition.** As you drag, **three pill-shaped drop zones appear** — one each at the **bottom, left, and right edges**. Release on a zone to snap. Top edge is NOT a supported dock target (macOS won't let the window go flush to the menu bar; PillFloat notes top presets land in the "upper quarter").
- **OBSERVED** When docked to **left or right edge, the bar reorients VERTICALLY**; "the waveform, progress indicator, pickers, and tooltips all reflow to fit the vertical layout."
- **OBSERVED** **Chosen position persists across app launches/restarts.** (Bug fixed: previously snapped back to bottom even when docked left/right.)
- **OBSERVED** **Press Escape while dragging** = cancel the drag and return the bar to its previous position.
- **OBSERVED** **"Hide for 1 hour"** = a snooze option in the right-click Flow Menu. (Android equivalent: drag bubble to bottom = snooze 10 min; that's Android-only.)
- **OBSERVED** When the bar is hidden, **the microphone stops immediately** (bug fixed: "Microphone stayed on after the Flow Bar was hidden. The microphone now stops immediately when the bar is hidden.").
- **OBSERVED** Third-party utility **PillFloat** exists specifically because Wispr originally locked the pill to bottom-center; edge-docking/repositioning was added natively **June 10, 2026 (Desktop v1.5.751)**: "drag it to the left or right edge instead, so it's out of the way" (e.g., to stop covering Gmail's Send button).

### 3. IDLE / RESTING APPEARANCE

- **OBSERVED** Idle = **a very small pill/lozenge** ("a little tiny lozenge, very small"). On **hover it grows bigger** (podfeet).
- **OBSERVED** Idle prompt text shown in the pill: **"click or hold command right arrow to start dictating"** (the hint reflects the user's configured shortcut; podfeet user had bound Right-Cmd). Generic default would read for Fn key.
- **OBSERVED** Reviewer describes idle look as **"a dark rounded pill-shaped lozenge overlay on screen, with light pink text."** (podfeet) — i.e., dark/near-black fill, pale-pink label text.
- **INFERRED** Corner radius = fully rounded (pill / `9999px` / capsule). Height roughly 24–36px in resting state; grows on hover.

### 4. RECORDING STATE (waveform)

- **OBSERVED** On record, the pill shows a **live waveform** flanked by **Cancel and Stop buttons**. Push-to-talk: **Cancel = X icon** (discard, no paste), **Stop/Done = checkmark ✓** (confirm + paste). (navigating article; hands-free article.)
- **OBSERVED** Waveform spec (from Wispr's design-system reference, "Waveform Visualizer" component): **5–7 vertical bars**, varying height, **height range 8–24 px**, evenly spaced, **bars pulse to indicate active recording**. Role labeled "Audio/speech indicator, mic active state."
- **OBSERVED** In **hands-free** mode the bars are described as **"white bars moving on the Flow Bar"** (confirming it's actively listening) — i.e., bars are light on a dark pill in the real app.
- **OBSERVED** Waveform is **audio-reactive**: it goes **FLAT after a short period of silence** (bug fixed: "waveform animation kept moving when the microphone wasn't picking up sound... now goes flat after a short period of silence"). So bar heights should be driven by real-time input level (RMS/amplitude), not a canned loop.
- **OBSERVED** A minimized/condensed recording state exists: **"a smaller condensed lozenge showing a dotted audio waveform indicator, representing the minimized recording state"** (podfeet).
- **OBSERVED** Bug (Android, indicates intended behavior generally): "waveform animation not responding at the start of dictation" was a defect — waveform should react immediately on record start.
- **INFERRED** Bar color on the real dark pill = white/pale (`#ffffff` or the same pale-pink accent). The design-system doc's "5–7 bars in #1a1a1a on cream pill" describes the *website marketing* rendition, inverted from the actual dark on-screen bar.

### 5. COLOR PALETTE (design system) — for cosmetic remapping

From Wispr's published design system (Refero capture of wisprflow.ai). NOTE: this is the **brand/marketing** palette; the on-screen Flow Bar itself reads as **dark pill + pale-pink text** per reviewers, so it likely uses Vast Ink fill with Lavender/pink text.

| Role name | Hex | Usage |
|---|---|---|
| Lumen Cream | `#ffffeb` | dominant canvas, card/button fills, marketing waveform pill fill |
| Vast Ink | `#1a1a1a` | primary text, 2px borders, dark card/section backgrounds (**likely the Flow Bar fill**) |
| Lavender Whisper | `#f0d7ff` | primary CTA fill, "soft pink-lavender" accent (**likely the pale-pink pill text**) |
| Forest Ink | `#034f46` | teal pill badges, inner dark-panel accents |
| Ember Glow | `#ffa946` | **live/active-state accent — notification dots, active mic indicators** |
| Lumen Stone | `#e4e4d0` | subtle borders, nav pill background, dividers |
| Fog | `#8a8a80` | muted captions/helper text |
| Charcoal | `#222222` | secondary button/nav text |
| Pure White | `#ffffff` | text/borders on dark/colored surfaces |

- **OBSERVED** Border radius scale: **Inputs/Buttons 12px; Cards 32px; Sections 40–80px; Badges/Pills `9999px` (full pill)**.
- **OBSERVED** Border widths: standard interactive = **2px solid `#1a1a1a`**; badge/pill = 1–2px.
- **OBSERVED** Fonts: **Display = EB Garamond** (weight 400; 32/48/64/120px). **Body/UI = Figtree** (weights 400–700; 14–32px; line-height 1.3). INFERRED: Flow Bar text uses Figtree.
- **OBSERVED** Active/live accent (mic on, notification dots) = **Ember Glow `#ffa946`** (orange). Good candidate for the clone's "recording" accent dot.

### 6. PROCESSING / TRANSCRIBING STATE

- **OBSERVED** After you release/stop, the bar enters a **processing/transcribing state** while ASR+LLM cleanup runs, then text is pasted.
- **OBSERVED** Slow-processing message: **"Taking longer than usual"** (Mac/Windows) shown when servers need more time; body includes **"Your audio is saved for retrying."** It **auto-dismisses once text is successfully pasted**. NOT shown during retries; **suppressed in Instruct mode**.
- **OBSERVED** If you try to start a new dictation while the previous one is still processing: **"Flow was processing your last transcript."** — press dismiss shortcut (Esc default) to cancel the in-progress one.
- **OBSERVED** Transforms/Polish processing shows status text **"Using Polish"** (default) or **"Using {name}"** (custom prompt) in the status area.
- **INFERRED** A progress/spinner indicator is shown in the pill during processing (the design system references a "progress indicator" that reflows in vertical layout). Exact animation not published — INFERRED: indeterminate spinner or a pulsing dot.

### 7. TEXT-INSERTION MOMENT

- **OBSERVED** On success, transcribed+cleaned text is **auto-pasted into whatever app currently holds the active text cursor**; the Wispr window need not be visible/focused (podfeet). Mechanism INFERRED: synthesizes paste (Cmd+V) or types via accessibility/CGEvent into the frontmost focused field.
- **OBSERVED** The "Taking longer than usual" toast **dismisses automatically the moment paste succeeds** — i.e., paste-success is the terminal event that returns the bar to idle.
- **OBSERVED** Partial-insert path exists: on "Microphone disconnected" mid-recording, an **"Insert"** option lets you paste the partial transcription.

### 8. ERROR STATES (exact on-bar/notification text)

Microphone (Mac/Windows) — **OBSERVED** exact strings:
- **"No microphone detected"** — none connected.
- **"Selected microphone is unavailable"** — previously chosen device disconnected; button **"Choose Microphone"** / "Choose a different microphone."
- **"Microphone unavailable"** — another app has exclusive access / driver issue.
- **"Microphone disconnected"** — device vanished mid-recording; offers **"Insert"** (paste partial).
- **"Microphone error"** — unexpected access failure.
- **"Microphone Permission Required"** (macOS) — offers **"Open Settings"**.
- **"Is your microphone muted?"** — captured zero audio; actions **"Select microphone"** / **"Troubleshoot"**.
- **"We couldn't hear you"** — empty transcription result; same remedial actions.

Network / offline — **OBSERVED**:
- Wispr Flow is **cloud-dependent**; requires constant internet for ASR (all recognition is server-side). Offline → a **"No internet connection"** notification; cannot transcribe.
- **"Connection lost"** / network-blocked states occur when VPN/security tools block it.
- iOS keyboard shows **"Server is busy"** / **"Network error"** with retry icons (iOS-specific, not desktop bar).
- (Note for clone: our app is LOCAL-first, so these offline errors are largely N/A; but replicate the *visual treatment* of an error toast on the bar.)

Word/time limit — **OBSERVED**:
- Desktop dictation **max 20 minutes**; a **warning appears at 19 minutes** ("your session is almost up"); **auto-stops at 20 min**. (iOS max 5 min.) This is a *duration* limit; no fixed word-count limit surfaced for desktop.

Load/startup errors — **OBSERVED** strings: "Flow is having trouble loading", "Flow is having trouble starting", "Audio system failed to load", "Something's not right". (macOS "No Model Available" error is referenced as an article title but is more a startup/model-download failure than a bar state.)

INFERRED visual: error state likely tints the pill or shows an inline warning glyph + short label + an action button; auto-dismisses on stop/cancel.

### 9. HOVER BEHAVIOR

- **OBSERVED** Hover **enlarges** the pill from its tiny resting size (podfeet).
- **OBSERVED** **Language picker** lives in the Flow Bar: **"hover over the Flow bar to see the different language options pop up"**; one-click switch (added Desktop v1.4.661, Mar 31 2026).
- **OBSERVED** **Transforms / Polish "wand" icon**: hover the Flow Bar and **click the wand icon** to apply a transform to highlighted text (added Desktop v1.5.113, May 1 2026). The status bubble shows the **polish wand icon** when a default transform is active; a **chevron-up (▲)** opens the transforms dropdown; "with the picker expanded (e.g., while hovering), clicking the circle triggers the currently selected transform." The Polish bubble is **not shown to all users by default** (gated rollout).
- **OBSERVED** A **writing-style pill** appears next to the mic during recording showing current style; tapping opens a menu — options **Default, Casual, Formal, Very casual, Excited** (this was described in an iOS/keyboard context; desktop parity likely but mark INFERRED for desktop).
- **INFERRED** Hover also surfaces tooltips (accessibility article confirms tooltips exist and "reflow" in vertical layout).

### 10. CLICK vs HOLD BEHAVIOR

- **OBSERVED** Two trigger modes, user-configurable: **hold** the shortcut (push-to-talk) OR **double-tap** to toggle. Default trigger key = **Fn** on Mac (or **Ctrl+Opt** if no Apple Fn detected).
- **OBSERVED** **Click the center bubble to start dictating** (click-to-start supported in addition to key).
- **OBSERVED** In **push-to-talk** mode, **clicking the bar again stops/ends** the session.
- **OBSERVED** In **hands-free** mode, **clicking the bar does NOT stop** recording — must use the Stop (✓) or Cancel (X) buttons or press the shortcut.
- **OBSERVED** **Double-press the push-to-talk key quickly** = lock the session into **hands-free** (continuous listening without holding).

### 11. FULL-SCREEN APPS & MULTI-MONITOR

- **OBSERVED** "Some full-screen modes hide floating UI elements like the Flow Bar." So over native macOS full-screen Spaces the bar may not draw. INFERRED for clone: use a high window level (e.g., `.statusBar`/`.screenSaver`) and `NSWindow.CollectionBehavior` incl. `.canJoinAllSpaces` + `.fullScreenAuxiliary` to appear over full-screen apps; Wispr apparently does not fully achieve this in all cases.
- **OBSERVED** Multi-monitor / Dock-side: bar+overlay must anchor to the **available work area** of the correct screen (bug fixed re: Dock on left). INFERRED: it follows the screen with the active/focused window or the main screen. Exact multi-monitor follow rule not published.
- **OBSERVED** The ~400ms self-repositioning loop (from PillFloat) is consistent with continuously re-anchoring to the current screen's work area.

### 12. DARK vs LIGHT MODE

- **OBSERVED** No help-center article documents a per-appearance (dark/light) Flow Bar variant explicitly. The **on-screen bar is consistently described as a DARK pill with pale-pink text** regardless of system theme (podfeet) — suggesting the Flow Bar is a **fixed dark treatment**, not theme-adaptive.
- **OBSERVED** The brand design system uses a **mixed light/dark** scheme (cream `#ffffeb` canvases alternating with near-black `#1a1a1a` rooms) — but that's the Hub/website, not the floating bar.
- **INFERRED** Safe clone default: render the Flow Bar as a fixed dark capsule (`~#1a1a1a`) with pale accent text in BOTH system themes, matching observed behavior; optionally offer a theme-adaptive toggle.

### 13. TOOLTIPS / LABELS (exact)

- **OBSERVED** Idle hint label: **"click or hold {shortcut} to start dictating"** (e.g., "...command right arrow...").
- **OBSERVED** Buttons: **Cancel (X)**, **Stop / Done (✓)**, **Insert** (partial), **Choose Microphone**, **Open Settings**, **Select microphone**, **Troubleshoot**.
- **OBSERVED** Status labels: **"Using Polish"**, **"Using {name}"**, **"Taking longer than usual"**, **"Flow was processing your last transcript."**
- **OBSERVED** Accessibility: interactive elements announce states **expanded / collapsed / disabled**; visible focus ring on Tab; Space/Enter activates; **Esc** closes menus / cancels a drag. Drop-zone targets are **visual-only, not announced** to screen readers (known gap). Tested with VoiceOver (Mac), NVDA/JAWS (Win), TalkBack (Android).

### 14. SOUNDS

- **OBSERVED** A **"ping" sound signals that recording has begun** (hands-free article: "A ping sound also signals that recording has begun"). INFERRED: a corresponding stop/success cue likely exists but not explicitly documented.
- **OBSERVED** **"Mute music while dictating"** system setting: when on, Flow mutes the default output device on dictation start and restores on stop (only if audio was already playing). **Default OFF on Mac, ON on Windows.** Located **Settings → System → Sound**.
- **OBSERVED** Notification sounds/toasts are categorized and individually mutable: **Settings → Notifications** (categories incl. feature tips, formatting reminders, milestones).

### 15. MENU-BAR ICON & DROPDOWN

- **OBSERVED** Wispr shows a **menu-bar (system tray) icon** at top of screen on Mac. Dropdown items (OBSERVED): **Open Wispr Flow, Paste last transcript, Shortcuts, Microphone, Languages, Help Center, Talk to support, Share feedback.**
- **OBSERVED** Separately, when the Hub window is focused there's a **full macOS app menu bar**: **Wispr Flow, File, Edit, Dictation, Customization, View, Help, Window.**
- **OBSERVED** The **right-click Flow Menu** (on the bar itself) contains: **Hide for 1 hour, Settings, Microphone, Languages, Transcript history, Paste last transcript.**
- **NOT DOCUMENTED / INFERRED** Whether the menu-bar tray icon animates or changes color during recording — sources do not confirm a recording-state tray-icon change. INFERRED for clone: optionally reflect recording via the tray icon (e.g., filled/colored `#ffa946` glyph) but this is not an OBSERVED Wispr behavior.

### 16. HUB (main window) SIDEBAR — context for menu targets

- **OBSERVED** Left sidebar sections: **Home** (dictation history + stats), **Dictionary** (custom words/replacements), **Snippets** (voice-triggered text blocks), **Style** (tone/writing style), **Scratchpad** (voice notes, cloud sync); **Settings** and **Help** at the bottom, plus team/referral options.

---

### KEY NUMBERS FOR THE CLONE (quick reference)
- Overlay window: **~440 × 300 px transparent**, AX title "Status"; visible pill **~70 px**, bottom-anchored.
- Position: **bottom-center**, on `visibleFrame` (respect Dock); self-re-anchor loop **~400 ms**.
- Dock targets: **bottom / left / right** (three drop zones); no top dock; **vertical reflow** on side docks.
- Waveform: **5–7 bars, 8–24 px tall**, evenly spaced, amplitude-reactive, **flatten on silence**; light bars on dark pill.
- Pill radius **9999px (capsule)**, border **2px `#1a1a1a`**, font **Figtree**.
- Recording max **20 min**, warning at **19 min**.
- Fill likely `#1a1a1a`; text pale pink `#f0d7ff`; live accent `#ffa946`.
- Shortcuts (Mac defaults): **Fn** push-to-talk (or Ctrl+Opt); **Fn+Space** hands-free; **Esc** cancel; **Cmd+Ctrl+V** paste last transcript; **Cmd+Ctrl+C** copy last transcript; **Opt+1** Polish transform. Double-tap key = toggle; double-press = lock hands-free.
- Buttons: **X** = cancel/discard, **✓** = stop+paste; **▲** chevron opens transforms dropdown.
- Default visibility: **hidden on new install**; enable via **Settings → System → Show Flow Bar**; **Hide for 1 hour** snooze in Flow Menu.
- Sound: **ping on record start**; "Mute music while dictating" (Mac default OFF).

### DISCREPANCIES / CAUTION FOR SYNTHESIS
1. **Pill color conflict**: design-system doc shows a *cream* waveform pill with dark bars (website rendition); reviewers describe the *actual* on-screen bar as *dark pill + pale-pink text + light bars*. Use the reviewer version for the real floating bar; the cream version is marketing.
2. **Writing-style pill / language picker / wand**: language picker + wand are OBSERVED on the *desktop* Flow Bar; the "writing-style pill next to mic" was described in an iOS/keyboard context — mark desktop parity INFERRED.
3. **Exact px for resting height, hover-expanded size, animation ms, corner radius of the bar itself, and idle→record transition timing are NOT published** — all such values are INFERRED and should be tuned visually against screenshots/video.
4. Wispr is **cloud-only**; its offline/network error states are documented but largely irrelevant to our local-first clone except as visual patterns to mirror.


## Sources
- https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android
- https://docs.wisprflow.ai/articles/5002934560-why-is-the-wispr-bar-is-not-appearing-or-disappearing
- https://docs.wisprflow.ai/articles/3941699399-keyboard-and-screen-reader-accessibility-in-wispr-flow
- https://docs.wisprflow.ai/articles/6409258247-starting-your-first-dictation
- https://docs.wisprflow.ai/articles/3152211871-setup-guide
- https://docs.wisprflow.ai/articles/6391241694-use-flow-hands-free
- https://docs.wisprflow.ai/articles/4984532368-fix-taking-longer-than-usual-and-transcription-errors
- https://docs.wisprflow.ai/articles/4351452717-troubleshooting-mic-issues
- https://docs.wisprflow.ai/articles/3155947051-troubleshooting-guide-for-no-model-available-error
- https://docs.wisprflow.ai/articles/8068950331-how-to-use-transforms-beta
- https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts
- https://github.com/OrangeAKA/pillfloat
- https://www.producthunt.com/products/pillfloat
- https://wisprflow.ai/whats-new
- https://www.podfeet.com/blog/2026/03/wispr-flow-scott-willsey/
- https://styles.refero.design/style/ac53825c-1e06-4ae0-8489-cace5c5e0339
- https://efficient.app/apps/wispr-flow
