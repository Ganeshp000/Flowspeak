# v2-e814fec75c763e891c364db96bc5c3307b094

## VERDICT (up front)
**Tauri v2 is a SAFE choice for this Windows overlay at LOW-to-MODERATE risk, PROVIDED you copy Handy's exact recipe: `transparent:true` set at window-CREATION time (in the Rust builder, not toggled at runtime) + `shadow:false` + `decorations:false` + a window sized TIGHT to the visible pill (Handy ships 256×46 px) + `focusable:false` + `always_on_top:true` + `skip_taskbar:true`.**

The single most important correction to the brief: the headline "black/opaque rectangle" bug (Tauri #8308) is **caused by window SHADOW being on-by-default in v2, and is fixed by `shadow:false`** — Tauri maintainer FabianLars said exactly this on the issue and contributor ahaoboy confirmed it works. Handy already sets `shadow:false`. That removes the scariest risk. The residual transparency artifacts (#14823, #14764, #13176, #12450) are edge-cases tied to (a) window RESIZE, (b) windows that HAVE a titlebar/decorations, or (c) CHILD windows with a parent — none of which a tight, non-resizable, decorationless, unparented pill triggers.

**The ONE finding that flips the decision to Electron:** if, on real Win11 hardware across Intel/NVIDIA/AMD, the semi-transparent pill renders a black/opaque box **AT REST** (static, no resize) in the shadow-off/decorations-off/creation-time-transparent config — i.e. if the #14823-class black edges reproduce on a static 256×46 window. That can ONLY be settled by building and running on-device (repro spec at end). Nothing in the current issue corpus shows a static, shadow-off, decorationless window going black — the black-box reports all involve shadow-on, decorations/titlebar, resize, or parenting.

---

## MAJOR CORRECTIONS TO THE BRIEF'S PREMISES (all OBSERVED, current Handy `main`)
The brief mis-describes Handy's mechanism. Verified against `cjpais/Handy@main`: `src-tauri/src/overlay.rs`, `src/overlay/RecordingOverlay.tsx`, `src-tauri/tauri.conf.json` (productName "Handy" v0.9.3).

1. **Handy uses NO click-through / NO `setIgnoreCursorEvents` at all.** OBSERVED: `overlay.rs` contains no `ignore_cursor_events`/`set_ignore_cursor_events`; `RecordingOverlay.tsx` calls no `setIgnoreCursorEvents`, no `getCurrentWindow`, and declares no `pointer-events` CSS — it just has a cancel button `onClick={() => commands.cancelOperation()}` and a scroll handler. So the brief's claim that "Handy works around [no per-region hit-testing] by polling the cursor position to toggle setIgnoreCursorEvents" is **FALSE for current Handy.** Handy's entire click-through strategy is: **make the window TINY (256×46, tight to the pill) and non-activating (`focusable:false`).** The whole box captures clicks but never steals focus.

2. **Handy re-asserts topmost ONCE per state transition, NOT on a timer.** OBSERVED: `force_overlay_topmost()` calls `SetWindowPos(hwnd, Some(HWND_TOPMOST), 0,0,0,0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW)` inline in `show_overlay_state()` right after `overlay_window.show()`. It is NOT invoked from any timer/thread/spawn/interval. The brief's "SetWindowPos re-assert on a timer" is inaccurate — the ~400 ms re-position loop is a *Wispr Flow* behavior (from PillFloat observation in `ui-flow-bar.md`), not Handy's.

3. **Handy's overlay window is created PROGRAMMATICALLY, not in `tauri.conf.json`.** OBSERVED: `tauri.conf.json` `app.windows` = `[]` (empty). Only the "main" hub window (680×570, hidden) is built in `lib.rs`; the overlay is built via a builder in `overlay.rs`. Implication for FlowSpeak: transparency/flags are set at builder time (creation-time), which is the config that AVOIDS the runtime-toggle artifacts.

4. **Handy's overlay is decorationless AND uses `accept_first_mouse:true`** — but `accept_first_mouse` is a **macOS-only** attribute (tao's Windows `window.rs` has no `accept_first_mouse` handling). On Windows the non-activating behavior comes entirely from `WS_EX_NOACTIVATE` (see Q2). So `accept_first_mouse:true` is a harmless no-op on Windows.

**Exact Handy overlay builder (OBSERVED, `overlay.rs`, non-macOS branch):**
```
WebviewWindowBuilder::new(...)
  .title("Recording").resizable(false)
  .inner_size(OVERLAY_WIDTH /*256.0*/, OVERLAY_HEIGHT /*46.0*/)
  .shadow(false).maximizable(false).minimizable(false).closable(false)
  .accept_first_mouse(true).decorations(false).always_on_top(true)
  .skip_taskbar(true).transparent(true).focusable(false).focused(false).visible(false)
```
Position: `calculate_overlay_position` → bottom-center: `x = monitor_x + (monitor_width - width)/2.0`; `y = bottom - height - OVERLAY_BOTTOM_OFFSET`. Mic-level events throttled to `EMIT_THROTTLE_MS = 33` (~30 FPS). macOS path instead uses an NSPanel (`PanelLevel::Status`, `StyleMask::empty().borderless().nonactivating_panel()`).

---

## Q1 — Does `transparent:true` render per-pixel alpha RELIABLY on Windows? What mitigations, and do they fully resolve it?

**How Tauri/tao actually implements Windows transparency (OBSERVED, `tao/src/platform_impl/windows/window.rs`, dev branch):** it calls **`DwmEnableBlurBehindWindow`** with an *empty* blur region (`CreateRectRgn(0,0,-1,-1)`, flags `DWM_BB_ENABLE | DWM_BB_BLURREGION`). This is the standard DWM per-pixel-alpha trick: it makes the window's alpha channel honored by the DWM compositor, so CSS `rgba()`/`opacity` in the WebView2 DOM composites over whatever is behind the window. This is set at window creation.

**How WebView2 transparency works underneath (OBSERVED, MS Learn `CoreWebView2Controller.DefaultBackgroundColor`):**
- `DefaultBackgroundColor` "is the color that renders underneath all web content." Set it to a **fully transparent** color (alpha `00`) and "on any OS above Win7, choosing a transparent color will result in showing hosting app content." That is the mechanism that lets the desktop show through.
- **CRITICAL LIMITATION:** "Currently this API only supports opaque colors and transparency. It will **fail for colors with alpha values that don't equal 0 or 255** i.e. **translucent colors are not supported.**" → You CANNOT make the WebView's *default background* semi-transparent. **BUT this does NOT block a semi-transparent pill** — the pill's translucency comes from CSS `rgba()`/`opacity` *inside the DOM*, composited over a *fully-transparent* (alpha 0) WebView background. Per-pixel alpha of the rendered pill therefore works; only the solid "default fill" is restricted to 0 or 255. This is a commonly-misread limitation — mark it clearly: **semi-transparent pill = YES via CSS; semi-transparent WebView default background = NO.**
- **No transparency on Windows 7** (setting alpha≠255 fails on Win7). Irrelevant — FlowSpeak targets Win10/11.
- **White-flash mitigation (OBSERVED):** the property alone "can still leave the app with a white flicker"; setting the **`WEBVIEW2_DEFAULT_BACKGROUND_COLOR` environment variable** (8-hex, alpha in first 2 digits, e.g. `00FFFFFF`) fixes the flicker and can only be set once at startup. INFERRED (strong): wry sets a transparent WebView2 background when `transparent:true`; if a first-frame white flash is observed, set this env var before webview init. Needs on-device confirmation of whether wry already handles it.

**Are the black-box artifacts real and frequent? Catalogued (OBSERVED, Tauri issues):**
| Issue | State | Trigger / scope | Relevance to a tight decorationless pill |
|---|---|---|---|
| **#8308** "V2 window.transparent not work" | Open (needs-triage) | v2 window opaque where v1 was transparent; env: Win10 22635, WebView2 119, Tauri 2.0.0-alpha.17 | **Root fix = `shadow:false`** (maintainer FabianLars: "Shadows are now enabled by default but will cause the same transparency issue"; ahaoboy: `decorations:false, transparent:true, shadow:false` → "it works"). Handy sets shadow:false. **Largely resolved by the shadow flag.** |
| **#14823** "windows10 strange black border for transparent/non-shadow/non-decoration window" | **Open** (needs-triage) | Black border on **right/bottom edges**, "seems happening in **resizing** the window"; env: Win10 19045, WebView2 144, Tauri 2.9.5, wry 0.53.5. Config already had `shadow:false, decorations:false, resizable:false`. White bg / removing img did NOT help | **The most concerning residual.** Reporter ties it to resize. A pill built once at fixed 256×46 and never resized should avoid the resize path — but this is the case to VERIFY on-device because it occurs with shadow already off. |
| **#14764** "[Windows] Ghost titlebar background appears during window drag or focus change on transparent windows" | Open, **status:upstream** (blocked on WebView2) | Black "ghost titlebar" during **drag by titlebar** or **focus change**; disappears on resize/maximize; reporter: "level-below-web-content rendering issue related to WebView2's default background on focus"; env Win10 26220, WebView2 144, Tauri 2.9.5 | Requires a **titlebar** (decorations) to drag by, and a **focus change**. A `decorations:false` + `focusable:false` pill has no titlebar and never takes focus → should not trigger. INFERRED mitigation, verify. |
| **#13176** "black border when disabling decorations" | Closed | `decorations:false` + `transparent:true`, Win10 22H2, Tauri 2.4.0; reporter had `shadow:true` | Consistent with #8308: fix is `shadow:false`. |
| **#12450** "Transparent attribute on child window is not taking effect" | Open (needs-triage) | Transparent CHILD window (parented to a Bevy window) renders **black**; Win10, WebView2 131, Tauri 2.2.3. **Workaround: remove the parent relationship** → transparency works | Do NOT parent the overlay to the hub window. Handy doesn't. N/A if unparented. |
| **#15718** "[cef] Black screen ... with transparency" | Open | CEF (not WebView2), Linux/X11 GPU crash | Not WebView2, not Windows. N/A. |
| **#1564** "Allow changing the webview background color" | Closed, 100 comments | White flash before first paint | Addressed by `WEBVIEW2_DEFAULT_BACKGROUND_COLOR` env var (above). |

**Supporting evidence from Handy's OWN Windows bug tracker (OBSERVED):** Handy's Windows overlay issues are #508 (overlay state machine shows wrong content), #811 (**overlay invisible on secondary monitors** — multi-monitor gotcha), #1418 (WebView2 overlay keeps ~0.2% CPU after hotkey stop), #1570 (crash closing overlay), #1683 (update dialog invisibility). **None are transparency/black-box artifacts.** If `transparent:true` were fundamentally broken on Windows in Handy's shipping config, black-box reports would dominate; their absence is real-world evidence that the shadow-off/tight-window/creation-time recipe renders reliably on the GPUs Handy's users run.

**Answer to Q1:** With the Handy recipe (transparency at creation time, `shadow:false`, `decorations:false`, no parent, non-resizable), per-pixel alpha renders **reliably in practice** — the frequent "opaque rectangle" is the shadow bug (#8308) and is fully mitigated by `shadow:false`; the remaining black-EDGE artifacts (#14823, #14764) are **resize- and decoration/focus-bound**, which a static decorationless non-focusable pill largely sidesteps. **Not fully "proven" for a static pill until reproduced on Intel/NVIDIA/AMD Win11 hardware** — the #14823 report (shadow already off, still black on resize) is the reason this needs an on-device check even though the theory says a non-resized window is safe. Mark: mitigations = OBSERVED; "fully resolves for a static pill" = INFERRED, needs on-device confirmation.

---

## Q2 — Does `focusable:false` produce a genuinely non-activating (WS_EX_NOACTIVATE) window that doesn't pull keyboard focus, while its buttons still receive clicks?

**YES — confirmed at the source level (OBSERVED, `tao/src/platform_impl/windows/window_state.rs`, `WindowFlags::to_window_styles`):**
```
if !self.contains(WindowFlags::FOCUSABLE) { style_ex |= WS_EX_NOACTIVATE; }
if self.contains(WindowFlags::ALWAYS_ON_TOP) { style_ex |= WS_EX_TOPMOST; }
if self.contains(WindowFlags::IGNORE_CURSOR_EVENT) { style_ex |= WS_EX_TRANSPARENT | WS_EX_LAYERED; }
```
- `focusable(false)` → **`WS_EX_NOACTIVATE`** — exactly the non-activating window class the brief asked about. A `WS_EX_NOACTIVATE` top-level window does **not become the foreground/active window when clicked**, so the target app KEEPS keyboard focus (OBSERVED behavior of the Win32 style; standard Win32 semantics). This is what guarantees injected/pasted text lands in the target app.
- `always_on_top(true)` → **`WS_EX_TOPMOST`** (plus Handy's explicit `SetWindowPos HWND_TOPMOST` re-assert on show).
- `skip_taskbar(true)` is NOT done via `WS_EX_TOOLWINDOW` — tao uses the **`ITaskbarList::DeleteTab(hwnd)`** COM call (OBSERVED, `window.rs`). (Minor: means the window keeps a normal ex-style; irrelevant to focus.)
- **Buttons still work:** `WS_EX_NOACTIVATE` blocks *activation*, not *mouse messages* — the window still receives `WM_LBUTTONDOWN`/`WM_LBUTTONUP`, so the pill's Cancel/Stop buttons fire their handlers while the app underneath retains keyboard focus. (OBSERVED that Handy relies on exactly this: `RecordingOverlay.tsx` cancel button + `focusable:false`, no click-through, no focus juggling.) `accept_first_mouse:true` is macOS-only and does nothing here — the Windows non-activation is entirely `WS_EX_NOACTIVATE`.

**Answer to Q2:** Confirmed genuine. `focusable:false` maps to `WS_EX_NOACTIVATE`; the window is non-activating; the target app keeps keyboard focus; the pill's own buttons still receive and handle clicks. This is a source-verified, robust primitive — the strongest single point in Tauri's favor for this app.

---

## Q3 — Is the click-through approach robust enough for a resting pill with 1–2 hover buttons, or fragile?

**Reframe: for the Handy design there IS no click-through, and it's robust. For a Wispr-style BIG transparent container, click-through IS needed and is where fragility lives — but Electron is NO better here.**

- **Per-region hit-testing does not exist in Tauri (OBSERVED, #13070 "Transparent Window Support Click-Through", closed as duplicate):** the whole window is either click-through or not. `set_ignore_cursor_events(true)` maps to whole-window `WS_EX_TRANSPARENT | WS_EX_LAYERED` (OBSERVED, tao `window_state.rs`). There is no built-in "transparent pixels pass clicks, opaque pixels capture" behavior. The #13070 requester's only workaround was multiple WebViews (~20–30 MB each, ~300 MB) — impractical.
- **Electron has the IDENTICAL limitation (OBSERVED, Electron `custom-window-styles` docs):** transparent-window limitation #1 is verbatim *"You cannot click through the transparent area. See #1335 for details."* Electron's `setIgnoreMouseEvents(ignore, {forward})` is also **whole-window**, not per-region. So "no per-region hit-testing" is a **WASH** — not a Tauri disadvantage.
- **Two viable designs:**
  1. **Handy's tight-window design (RECOMMENDED, robust):** size the window to the visible pill (256×46-ish), never toggle click-through, rely on `WS_EX_NOACTIVATE`. No cursor polling, no races. Downside: the small transparent rounded-corner triangles of the bounding box still *capture* clicks (they don't pass through to the app beneath) — but at bottom-center this is a few dozen px² users rarely click. **This is proven in production by Handy.**
  2. **Wispr-style big transparent container (`ui-flow-bar.md` describes Wispr's real overlay as ~440×300 with the pill at the bottom and ~300 px of dead transparent space above for hover popups):** that large dead area MUST be click-through or it blocks the app beneath. Because there's no per-region hit test, you'd `set_ignore_cursor_events(true)` at rest and toggle to `false` when the cursor enters the pill. **Toggling requires cursor polling in Tauri** because `WS_EX_TRANSPARENT` also stops the window from receiving mouse-move, so you can't get a `mouseenter` to know when to re-enable. **This polling loop is the genuine fragile part** (latency, hit-box math, multi-monitor DPI). 
  - **Minor Electron edge here:** Electron's `setIgnoreMouseEvents(true, {forward:true})` (OBSERVED, `_macOS_ _Windows_`) forwards mouse-move messages to Chromium *while* click-through is on, so you can detect hover and re-enable without a manual poll loop. Tauri's `set_ignore_cursor_events` has no `forward` equivalent. So for design #2 (big container + hover buttons), Electron is marginally cleaner. **This does NOT flip the verdict** because design #1 avoids the problem entirely.

**Answer to Q3:** For a **resting pill with 1–2 buttons using a tight window (Handy's approach), click-through is a non-issue and fully robust — no polling.** Only if FlowSpeak insists on Wispr's big-transparent-container-with-hover-popups layout does the fragile cursor-polling path appear, and even then Electron's only advantage is `{forward:true}` convenience, not a capability Tauri lacks. **Recommended: grow the window on hover (resize the tight window up to reveal popups) rather than keep a permanently-large transparent container** — this keeps you on the robust path. (Caveat: runtime resize is exactly what #14823 implicates for black edges — so animate size via CSS inside a slightly-larger-but-fixed window, or test resize-driven transparency on-device.)

---

## Q4 — VERDICT, fullscreen behavior, and exactly what flips it to Electron

**Fullscreen (OBSERVED architecture + INFERRED equivalence):** An always-on-top overlay cannot draw over a **true exclusive-fullscreen (legacy DXGI exclusive)** DirectX app because DWM composition is bypassed — the overlay window is a normal DWM-composited `WS_EX_TOPMOST` window. **This limitation is IDENTICAL for Electron and Tauri** — both create standard DWM top-level windows; neither can beat exclusive fullscreen. It is an OS/DWM property, not a framework one → **a WASH.** Modern apps/games overwhelmingly use **borderless / flip-model (DXGI flip) fullscreen**, where DWM still composites and a `HWND_TOPMOST` window CAN appear on top — both stacks handle this equally. Nuance: Electron exposes finer window *levels* (`alwaysOnTop(true,'screen-saver')`, `'pop-up-menu'`, etc.), but on **Windows** those collapse to the single `WS_EX_TOPMOST` band (multiple levels are essentially a macOS/NSWindow concept), so on Windows Electron's extra levels give **no real advantage over Tauri's boolean `always_on_top`** for fullscreen. Tauri #7328 (which the brief cited as "above-fullscreen artifacts") is actually a **v1** issue about the *taskbar* being occluded with `transparent:true`+`fullscreen:true`, **closed as not planned** — not relevant to a small non-fullscreen overlay.

**Overall verdict: Tauri v2 is the LOWER-or-EQUAL-risk pick for this pill, and wins decisively on the two things that matter most — (a) the non-activating window that preserves target-app keyboard focus is source-verified (`WS_EX_NOACTIVATE`), and (b) the transparency "opaque box" bogeyman is a shadow flag, already mitigated and shipping in Handy.** Plus Tauri's ~600 MB RAM saving vs Electron's ~800 MB is exactly the reason to prefer it. Electron's genuine advantages are narrow: `setIgnoreMouseEvents({forward})` for the big-container hover design, and marginally more mature transparency edge-case handling. Neither justifies Electron's footprint IF the pill is built the Handy way.

**Exactly what flips the decision to Electron (decision-gating, must be tested on-device):**
1. **PRIMARY FLIP:** The semi-transparent pill renders a **black/opaque box AT REST** (no resize, no focus change) in the `shadow:false` + `decorations:false` + creation-time-transparent + unparented config, on any common GPU (Intel iGPU / NVIDIA / AMD) on Win11 — i.e. #14823-class black edges reproduce on a *static* window. (Everything in the issue corpus says this should NOT happen without resize/shadow/decorations, but it is unverified for a static pill.)
2. **SECONDARY FLIP:** FlowSpeak product-requires Wispr's permanently-large transparent container with upward hover-popups AND the tight-window/grow-on-hover alternative is rejected — then Electron's `{forward:true}` click-through makes the mandatory cursor-polling meaningfully more reliable.
3. **NON-FLIPS (explicitly):** inability to cover exclusive-fullscreen games (wash); lack of per-region hit-testing (wash — Electron lacks it too); multi-monitor overlay quirks (Handy #811 — a bug to fix in either stack, not a framework limit).

---

## MINIMAL ON-DEVICE REPRODUCTION TEST (the only way to settle the primary flip)
Build one throwaway Tauri v2 app; run on ≥3 machines: Intel iGPU (e.g. UHD/Iris), NVIDIA dGPU, AMD (iGPU or dGPU), all Win11 23H2/24H2, WebView2 Evergreen (note runtime build via `reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv`; test with a recent build ≥ 120 and, if possible, an old 119 to see the #8308 boundary).

Overlay window built in Rust at startup with EXACTLY: `.transparent(true).decorations(false).shadow(false).always_on_top(true).skip_taskbar(true).focusable(false).focused(false).resizable(false).inner_size(256.0,46.0)`, NO parent window, positioned bottom-center. Frontend: a rounded pill via CSS `background: rgba(26,26,26,0.7); border-radius:9999px;` on a `html,body{background:transparent}` page, with one `<button>`.

Observe/record:
1. **Static render:** does the pill show rounded per-pixel alpha over (a) a bright photo wallpaper, (b) a white Word doc, (c) a dark terminal — with NO black/opaque box or black edges? (Settles primary flip.)
2. **Show/hide cycle:** hide then `SetWindowPos(HWND_TOPMOST, SWP_NOMOVE|NOSIZE|NOACTIVATE)` re-assert on show — does transparency survive repeated show/hide? Any first-frame white flash (→ try `WEBVIEW2_DEFAULT_BACKGROUND_COLOR=00FFFFFF`)?
3. **Focus preservation:** put the caret in Notepad, click the pill's button — does Notepad KEEP the caret/focus (WS_EX_NOACTIVATE) and does the button's onClick fire? Then simulate paste and confirm text lands in Notepad, not the overlay.
4. **Focus-change artifact (#14764):** alt-tab between apps repeatedly with the pill shown — does a black ghost box ever appear behind the pill? (Should not, since decorations:false + focusable:false.)
5. **Resize path (#14823):** animate the pill's on-screen size via CSS transform vs actually resizing the window — confirm the CSS-only path avoids any black edge; note whether real `set_size` triggers black edges.
6. **Fullscreen:** launch a borderless-fullscreen app and a true-exclusive-fullscreen DX app — confirm overlay appears over borderless, disappears under exclusive (expected, wash vs Electron).

If (1) or (5-with-CSS-only) shows a black box on any GPU → escalate to Electron for that surface. If all pass → Tauri v2 confirmed for production.

## Open questions
- Does a STATIC (non-resized) 256x46 transparent/shadow-off/decorations-off/unparented Tauri v2 pill render clean per-pixel alpha on Intel iGPU, NVIDIA, and AMD on Win11 24H2? #14823 shows black edges on RESIZE with shadow already off, but no issue confirms/denies the static case. This is the single decision-gating unknown and can only be settled by building and running on-device (repro spec provided).
- Does wry/Tauri v2 already set WEBVIEW2_DEFAULT_BACKGROUND_COLOR (or call put_DefaultBackgroundColor to transparent) so there is no first-frame white flash, or must FlowSpeak set the env var manually before webview init? Not confirmed from source in this pass.
- Is #14764 (ghost titlebar on focus change) truly inert for a decorations:false + focusable:false window, or can a background flash still occur on show/topmost re-assert? The issue reporter only tested a window WITH a titlebar; the decorationless+non-focusable case is unverified.
- For the Wispr-style big-transparent-container design specifically, does Tauri's set_ignore_cursor_events(true) fully stop mouse-move delivery (forcing a cursor poll), and does grow-on-hover via actual window resize trigger #14823 black edges vs a CSS-only size animation inside a fixed window? Needs on-device test.
- Exact minimum WebView2 Evergreen runtime build at which the #8308 shadow-transparency interaction is clean (119 was affected in alpha-era Tauri; unclear if newer runtimes changed behavior independent of the shadow flag).
- Multi-monitor: Handy #811 shows the overlay going invisible on secondary monitors on Windows 11 - a concrete gotcha FlowSpeak must design around (monitor enumeration + per-monitor DPI positioning), independent of the Tauri-vs-Electron choice.

## Sources
- https://github.com/tauri-apps/tauri/issues/8308 (V2 window.transparent not work; maintainer FabianLars: shadows-on-by-default cause the transparency issue; fix shadow:false; ahaoboy confirms decorations:false+transparent:true+shadow:false works; env Win10 22635, WebView2 119.0.2151.72, Tauri 2.0.0-alpha.17, wry 0.34.2, tao 0.23.0; state: open)
- https://api.github.com/repos/tauri-apps/tauri/issues/8308/comments (comment thread confirming shadow:false workaround)
- https://github.com/tauri-apps/tauri/issues/7328 (actually: taskbar occluded with transparent+fullscreen on Tauri v1.4.1; closed as not planned; NOT a v2 above-fullscreen overlay artifact)
- https://github.com/tauri-apps/tauri/issues/13070 (feat: Transparent Window Support Click-Through; confirms NO per-region hit-testing; workaround = multiple WebViews ~20-30MB each; closed as duplicate)
- https://github.com/tauri-apps/tauri/issues/14823 (windows10 strange black border for transparent/non-shadow/non-decoration window; occurs on RESIZE; shadow:false already set; open; Tauri 2.9.5, wry 0.53.5, WebView2 144, Win10 19045)
- https://github.com/tauri-apps/tauri/issues/14764 (Windows ghost/black titlebar during drag or focus change on transparent windows; requires titlebar+focus change; status: upstream/WebView2; Tauri 2.9.5, WebView2 144)
- https://github.com/tauri-apps/tauri/issues/13176 (black border with decorations:false + transparent:true; reporter had shadow:true; Tauri 2.4.0, Win10 22H2)
- https://github.com/tauri-apps/tauri/issues/12450 (transparent CHILD window renders black; workaround: remove parent relationship; Tauri 2.2.3, WebView2 131, Win10)
- https://api.github.com/search/issues?q=repo:tauri-apps/tauri+transparent... (enumerated issue list incl. #1564 white-flash, #15718 CEF/Linux black screen)
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2controller.defaultbackgroundcolor (DefaultBackgroundColor supports only alpha 0 or 255 - translucent NOT supported; transparent shows hosting app content on OS>Win7; no transparency on Win7; WEBVIEW2_DEFAULT_BACKGROUND_COLOR env var fixes white flicker; property since WebView2 SDK 1.0.1010-prerelease/1.0.1020.30)
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/tauri.conf.json (app.windows = []; macOSPrivateApi true; productName Handy v0.9.3; overlay created programmatically)
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/overlay.rs (overlay builder flags; OVERLAY_WIDTH=256.0, OVERLAY_HEIGHT=46.0; force_overlay_topmost SetWindowPos HWND_TOPMOST SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW once per state transition, no timer; calculate_overlay_position bottom-center; no ignore_cursor_events; EMIT_THROTTLE_MS=33; macOS uses NSPanel PanelLevel::Status nonactivating)
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/lib.rs (main window 680x570 hidden; utils::create_recording_overlay)
- https://raw.githubusercontent.com/cjpais/Handy/main/src/overlay/RecordingOverlay.tsx (no setIgnoreCursorEvents, no getCurrentWindow, no pointer-events CSS; cancel button onClick commands.cancelOperation)
- https://api.github.com/search/issues?q=repo:cjpais/Handy... (Windows overlay issues #508 state, #811 invisible on secondary monitors, #1418 CPU after stop, #1570 crash on close, #1683 update dialog invisibility; NONE about transparency/black-box)
- https://raw.githubusercontent.com/tauri-apps/tao/dev/src/platform_impl/windows/window.rs (transparent via DwmEnableBlurBehindWindow empty region CreateRectRgn(0,0,-1,-1) DWM_BB_ENABLE|DWM_BB_BLURREGION; skip_taskbar via ITaskbarList::DeleteTab; focusable/always_on_top via WindowFlags; no accept_first_mouse on Windows)
- https://raw.githubusercontent.com/tauri-apps/tao/dev/src/platform_impl/windows/window_state.rs (to_window_styles: if !FOCUSABLE style_ex|=WS_EX_NOACTIVATE; if ALWAYS_ON_TOP style_ex|=WS_EX_TOPMOST; if IGNORE_CURSOR_EVENT style_ex|=WS_EX_TRANSPARENT|WS_EX_LAYERED)
- https://www.electronjs.org/docs/latest/api/browser-window (setIgnoreMouseEvents(ignore,{forward}) forward is macOS+Windows; alwaysOnTop levels incl screen-saver; transparent option; focusable/skipTaskbar)
- https://www.electronjs.org/docs/latest/tutorial/custom-window-styles (transparent window limitations verbatim: cannot click through transparent area see #1335; not resizable; CSS blur only web contents; not transparent when DevTools open; Windows cannot maximize via system menu/double-click titlebar; macOS no native shadow)
- https://v2.tauri.app/learn/window-customization/ (transparency set at window creation time; macOS uses TitleBarStyle::Transparent + objc2-app-kit)
- /Users/mannbellani/FlowSpeak/docs/research/ui-flow-bar.md (Wispr real overlay ~440x300 transparent, pill ~70px bottom-anchored, ~400ms self-reposition loop - a WISPR behavior not Handy's)
- /Users/mannbellani/FlowSpeak/docs/research/oss-clones.md (Handy = Rust+Tauri 2.x MIT, ships the Windows overlay; VoiceInk/OpenSuperWhisper native macOS NSPanel recipes for the macOS side)
