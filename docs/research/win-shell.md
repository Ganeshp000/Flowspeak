# v2-fdc8e69e886616a66215300452268610071cf

## TRACK: The Windows app shell for FlowSpeak (Tauri v2 primary; Electron deltas noted)

**Stack framing (INF, high-confidence):** the dual-platform hard requirement collapses to **Tauri v2 + Rust** as the one-codebase choice, because the proven dual-platform Wispr-style reference **Handy (cjpais/Handy, MIT)** ships exactly this and its Windows overlay/tray/updater config is directly observable. Electron is the fallback (Wispr's own Windows build is Electron, ~800 MB RAM). Every native Win32 flag below is reachable from Tauri via config keys, the `window` JS/Rust API, the `window-vibrancy` crate, or raw HWND FFI through the `windows`/`raw-window-handle` crates. Wispr's Windows default hotkey is **Ctrl+Win** (given).

---

## (a) THE PILL OVERLAY WINDOW

### Extended window styles (WS_EX_*) — OBS, exact hex from Microsoft Learn `winmsg/extended-window-styles` (updated 2025-07-14)
| Constant | Value | Role for the overlay |
|---|---|---|
| `WS_EX_TOOLWINDOW` | `0x00000080` | Not shown in taskbar **or Alt+Tab**; short title bar. The taskbar-hiding primitive. |
| `WS_EX_NOACTIVATE` | `0x08000000` | Top-level window "does not become the foreground window when the user clicks it"; system won't bring it forward. **The non-activating primitive** — keeps focus in the user's target app so injected text lands correctly. "Does not appear on the taskbar by default." |
| `WS_EX_TOPMOST` | `0x00000008` | Above all non-topmost windows, stays above even when deactivated. **Add/remove only via `SetWindowPos`** (HWND_TOPMOST), not `SetWindowLong`. |
| `WS_EX_LAYERED` | `0x00080000` | Layered window → enables **per-pixel alpha** (via `UpdateLayeredWindow`) or uniform alpha/color-key (via `SetLayeredWindowAttributes`). Child-window layering only Win8+. Cannot combine with class `CS_OWNDC`/`CS_CLASSDC`. |
| `WS_EX_TRANSPARENT` | `0x00000020` | **Click-through** — mouse messages pass to windows beneath. In practice paired with `WS_EX_LAYERED` for reliable hit-test pass-through (documented community quirk; MSFT Q&A "how-to-stop-ws-ex-layered-causing-mouse-clicks-to-go-through"). |
| `WS_EX_APPWINDOW` | `0x00040000` | Forces window onto taskbar (the opposite of what we want — do NOT set). |
| `WS_EX_COMPOSITED` | `0x02000000` | Double-buffered bottom-to-top paint; lets descendants have alpha/color-key transparency (needs their `WS_EX_TRANSPARENT`). Flicker-free. |
| `WS_EX_NOREDIRECTIONBITMAP` | `0x00200000` | No redirection surface — for windows using DirectComposition instead of a GDI surface. |

**Canonical passive-overlay style set (INF, synthesized):** `WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TRANSPARENT`. Toggle `WS_EX_TRANSPARENT` OFF while the cursor is over the interactive pill (Cancel/Stop buttons, drag handle), ON elsewhere — the direct analog of the Mac `ignoresMouseEvents` toggle.

### Per-pixel alpha / DWM (OBS/INF)
- Two per-pixel-alpha paths: **GDI layered** (`WS_EX_LAYERED` + `UpdateLayeredWindow`, alpha in a premultiplied BGRA DIB) — legacy, not what a webview app uses; or the **DWM compositor path**, where a transparent WebView2/Chromium surface is composited with per-pixel alpha by the OS. Tauri/Electron use the compositor path: you set `transparent:true` and draw the pill with CSS `rgba()`/`border-radius` over a fully transparent page background; **do not** hand-manage `WS_EX_LAYERED`/`UpdateLayeredWindow` — the framework + WebView2 handle it. (INF from Handy shipping `transparent:true` with no LayeredWindow code.)
- Known transparency pitfall: **Tauri #8308** ("V2 window.transparent not work") and Chromium black-box-on-some-GPUs — mitigate by ensuring `transparent:true` at **build time** (not toggled later) and setting `backgroundColor` to a fully transparent value. (OBS issue exists.)

### Tauri v2 window flags → WS_EX mapping (OBS Tauri config ref + INF mapping)
| Tauri config key / JS-Rust method | Effect on Windows |
|---|---|
| `transparent: true` | Compositor per-pixel alpha (requires the config-level flag; runtime toggle unreliable). |
| `decorations: false` | Borderless (no caption/frame). |
| `alwaysOnTop: true` / `setAlwaysOnTop(true)` | `WS_EX_TOPMOST` / `SetWindowPos(HWND_TOPMOST)`. **Plain boolean — Tauri has NO window-level concept** (unlike Electron/macOS). On Windows topmost is topmost; there is no "screen-saver level." |
| `focusable: false` (Handy uses this) | Maps to non-activating (`WS_EX_NOACTIVATE`-class behavior) — window won't steal focus. |
| `skipTaskbar: true` / `setSkipTaskbar(true)` | Removes from taskbar (tool-window / `ITaskbarList::DeleteTab`). |
| `shadow: false` | No DWM drop shadow. |
| `setIgnoreCursorEvents(ignore: boolean)` | Toggles `WS_EX_TRANSPARENT` at runtime = **click-through**. This is the Tauri equivalent of Electron `setIgnoreMouseEvents`. Toggle false when hovering the pill. |
| `setVisibleOnAllWorkspaces(true)` | Multi-desktop visibility (mostly a macOS/Linux concern; on Windows virtual desktops it pins across desktops). |
| `setContentProtected(true)` | `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` — hides pill from screen capture/share (optional privacy feature). |
| `setEffects({effects:[...]})` | Acrylic/blur/mica (see (g)). |

### Handy's actual Windows overlay config (OBS — `src-tauri/src/overlay.rs`, the gold reference)
```rust
WebviewWindowBuilder::new(app, "recording_overlay", WebviewUrl::App("src/overlay/index.html".into()))
  .title("Recording").resizable(false).inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
  .shadow(false).maximizable(false).minimizable(false).closable(false)
  .accept_first_mouse(true)          // first click on the pill isn't swallowed by focus change
  .decorations(false).always_on_top(true).skip_taskbar(true)
  .transparent(true).focusable(false).focused(false).visible(false);
```
Notably **NOT** set: `visible_on_all_workspaces`, `set_ignore_cursor_events` at build time (toggled dynamically because the pill has interactive buttons), no explicit position (positioned after build). `accept_first_mouse(true)` is important so the pill's first click registers despite `focusable(false)`.

### Electron equivalent (OBS Electron docs)
`new BrowserWindow({ frame:false, transparent:true, alwaysOnTop:true, skipTaskbar:true, focusable:false, hasShadow:false })`; then `win.setIgnoreMouseEvents(true, { forward:true })` for click-through **with** `mousemove` still delivered (so hover can re-enable interactivity). `alwaysOnTopLevel` accepts `'screen-saver'`/`'floating'`/`'status'`/`'pop-up-menu'` etc., **but on Windows the level string is effectively ignored — only topmost vs not** (levels matter on macOS). `setIgnoreMouseEvents(ignore, {forward:true})` forward option is Windows+macOS only.

### Staying above full-screen apps (OBS + INF)
- **Exclusive (true DirectX/DXGI) fullscreen — IMPOSSIBLE.** In exclusive fullscreen the game's frames bypass the DWM compositor entirely; "there is no stack" for a topmost window to sit above. No Win32 flag overcomes this — document as a hard limitation (matches PowerToys Always-On-Top issue #27088: "doesn't work for fullscreen applications"). The pill simply won't render over exclusive-fullscreen games/video.
- **Borderless-windowed ("fullscreen windowed") — WORKS.** On Win10/11 a borderless window covering the monitor is promoted to the same direct-flip present path as exclusive fullscreen (MPO/independent flip), so a `WS_EX_TOPMOST` overlay stays visible with no perf loss. Most modern games + Windows "fullscreen optimizations" (which auto-convert many exclusive-fullscreen titles to a flip-model borderless path) mean the pill usually DOES show — but you cannot rely on it. **Guidance:** document "pill hidden during exclusive-fullscreen games; use borderless/windowed mode." (OBS: backgrind.com borderless-vs-exclusive; Quora Qt-overlay; superstarreviews force-borderless.)
- **Re-assert topmost on a timer (INF, mirrors Mac re-anchor):** other apps that go topmost (or fullscreen transitions) can push the pill down; periodically `SetWindowPos(hwnd, HWND_TOPMOST, ...,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE)` — the Windows analog of Wispr re-centering every ~400 ms.

### Taskbar auto-hide interaction (OBS Microsoft Learn `SHAppBarMessage`)
- Position the pill against the monitor **work area**, not the full monitor rect, so it sits above the taskbar: `MONITORINFO.rcWork` (via `GetMonitorInfo`) or `SystemParametersInfo(SPI_GETWORKAREA)`. In Tauri use `currentMonitor()` (returns physical size + `scaleFactor`) and subtract taskbar height, or read work area via FFI.
- **Auto-hide taskbar:** when auto-hide is on, the work area equals the full screen, so a bottom-anchored pill can overlap the taskbar reveal zone. Detect with `SHAppBarMessage(ABM_GETSTATE, &abd)` → `ABS_AUTOHIDE (0x1)` / `ABS_ALWAYSONTOP (0x2)`; get the bar rect/edge with `ABM_GETTASKBARPOS`, and the auto-hide bar handle per-edge with `ABM_GETAUTOHIDEBAR` / `ABM_GETAUTOHIDEBAREX` (multi-monitor; specify `cbSize`+`uEdge`). Add a small bottom inset (~48 px, mirroring Mac's `visibleFrame.minY + 48pt`) so the pill clears the reveal strip.

### Bottom-center positioning across monitors + per-monitor DPI v2 (OBS Microsoft Learn)
- **DPI awareness:** `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`. DPI_AWARENESS_CONTEXT values (OBS `windef.h`): `_UNAWARE ((-1))`, `_SYSTEM_AWARE ((-2))`, `_PER_MONITOR_AWARE ((-3))`, `_PER_MONITOR_AWARE_V2 ((-4))`, `_UNAWARE_GDISCALED ((-5))`. PMv2 min = **Win10 1703**; adds child-window DPI-change notifications, automatic non-client-area scaling, dialog/menu scaling. **Microsoft explicitly recommends setting it via application manifest (`<dpiAwareness>PerMonitorV2</dpiAwareness>`), NOT the API** — API call can cause "unexpected behavior," must be called before any HWND, and fails (`ERROR_ACCESS_DENIED`) if already set by manifest. **Tauri and Electron both ship a PerMonitorV2 manifest by default** (INF — so you inherit correct behavior; verify in the embedded manifest).
- **Positioning math (physical px):** target monitor = monitor under cursor (`cursorPosition()` → find containing monitor) or primary. `x = work.left + (work.width − pillWidth)/2`, `y = work.bottom − pillHeight − bottomInset`. All in **physical pixels** on Windows; if using Tauri `LogicalPosition`, multiply/divide by `monitor.scaleFactor` (125%/150%/175% fractional scaling is common on Windows and must be handled — unlike macOS's integer 1x/2x).
- **Re-dock on changes:** handle `WM_DPICHANGED` (reposition + rescale), and monitor connect/disconnect / resolution change (`WM_DISPLAYCHANGE`); in Tauri listen for the window `ScaleChanged`/`Moved` events and re-run the anchor. Direct analog of Mac `didChangeScreenParametersNotification`.

---

## (b) TRAY (system notification area)

### Tauri v2 TrayIcon (OBS Tauri system-tray doc + Handy source)
- Build: `TrayIconBuilder::new().icon(Image).tooltip(...).show_menu_on_left_click(true).icon_as_template(true).on_menu_event(...).on_tray_icon_event(...).build(app)` (Rust); `TrayIcon.new(options)` (JS).
- **Left vs right click:** Tauri default = **menu shows on BOTH left and right click.** `show_menu_on_left_click(false)` (Rust) / `menuOnLeftClick:false` (JS) restores **Windows-native behavior: left-click = primary action (open app), right-click = context menu.** Handy sets `show_menu_on_left_click(true)`. Recommendation for Wispr parity: `false` so left-click opens the Hub, right-click shows the menu.
- `on_tray_icon_event` fires **Click** (with `button: Left|Right|Middle`, `buttonState: Up|Down`), **DoubleClick**, **Enter**, **Move**, **Leave**. (Linux supports the icon+menu but NOT these events — irrelevant to Windows.)
- **Win11 crash bug (OBS #11363):** setting a `Submenu` as the *root* tray menu crashes on click (x86_64 + aarch64). Use a flat `Menu` as root; nest submenus one level down. Verify fixed in your Tauri version.
- Underlying Win32 (OBS `Shell_NotifyIcon` / `NOTIFYICONDATA`): `NIM_ADD(0)`/`NIM_MODIFY(1)`/`NIM_DELETE(2)`/`NIM_SETVERSION(4)`; flags `NIF_ICON`/`NIF_MESSAGE`/`NIF_TIP`/`NIF_INFO`. **Call `NIM_SETVERSION` with `NOTIFYICON_VERSION_4` every time you `NIM_ADD`** (not persisted across logoff) to get modern click semantics: keyboard/mouse selection → `WM_CONTEXTMENU` (right/keyboard menu), `NIN_SELECT` (left activate), `NIN_KEYSELECT`; balloons → `NIN_BALLOONSHOW/HIDE/TIMEOUT/USERCLICK`, `NIN_POPUPOPEN/CLOSE`. On Win10 balloons became Action-Center banners; on Win11 they're transient again.

### Windows 11 tray overflow (OBS/INF)
- Win11 hides newly-added tray icons in the **overflow flyout** (the "^" chevron) by default; the user must drag the icon onto the visible taskbar to promote it. **There is no programmatic way to force-promote your icon** (by design, anti-annoyance). Guidance: onboarding should tell the user "drag the FlowSpeak icon out of the ^ overflow to keep it visible," and the app must NOT depend on the icon being visible for core function (hotkey works regardless). (INF — consistent across NotifyIcon docs; no API exposes promotion.)

---

## (c) AUTOSTART (launch at login)

### Options (OBS)
| Mechanism | Location | Admin? | Notes |
|---|---|---|---|
| **HKCU Run key** (default, recommended) | `HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` (value name=app, data=exe path) | No | What `tauri-plugin-autostart` uses on Windows. Appears in Task Manager → Startup (user can toggle off). Per-user, no elevation. |
| Startup folder | `shell:startup` → `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\*.lnk` | No | Simple, user-visible, easy to delete. Also user-toggleable in Task Manager. |
| Task Scheduler | logon trigger, optional delay/elevation | Admin to create system task; per-user tasks no | Can start elevated or with a delay; survives some "startup manager" cleanups; heavier. Use only if you need delayed/elevated start. |
| HKLM Run key | `HKLM\...\Run` | Yes | Per-machine; needs admin at install; avoid for per-user app. |

### tauri-plugin-autostart (OBS)
- API: `enable()` / `disable()` / `isEnabled()` (JS + Rust). Init with `MacosLauncher` (`LaunchAgent` or `SMAppService`) and optional args `Some(vec!["--flag1"])`. Requires capabilities perms `autostart:allow-enable|allow-disable|allow-is-enabled`. Requires Rust ≥1.77.2.
- **Windows = HKCU Run key** (confirmed in plugin discussions). **Known bug — plugins-workspace #771: "autostart on Windows is removed after one boot"** in some versions (the Run value got deleted on first launch); pin/verify a fixed plugin version and add a self-heal check (re-write the Run value on startup if the setting is enabled but the key is missing).
- Parity with Mac spec: Settings → System → "Launch at login" toggle drives `enable()/disable()`; default OFF.

---

## (d) MICROPHONE PERMISSION (the biggest platform-behavior delta vs macOS TCC)

### How Win32 mic consent actually works (OBS)
- **Two master toggles**, Settings → Privacy & security → Microphone (Win11) / Privacy → Microphone (Win10):
  1. **"Let apps access your microphone"** — governs **packaged (MSIX/Store)** apps, which get true per-app on/off.
  2. **"Let desktop apps access your microphone"** — governs **ALL classic Win32/unpackaged apps as one group.** There is **no per-app on/off for unpackaged Win32 apps** — they share this single toggle. Once it's on, individual desktop apps appear only in a read-only "recently accessed" list.
- **Enforced or advisory?** For unpackaged Win32 it is **enforced at the audio stack**, not merely advisory: when "Let desktop apps access your microphone" is OFF, WASAPI/`IAudioClient` capture returns **silence or `E_ACCESSDENIED`-class failure** (the mic delivers zeros). But there is **no per-app OS consent prompt** for Win32 (unlike UWP's `AppCapability.RequestAccessAsync`) — you can only deep-link the user to Settings.
- **Registry (OBS):** `HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\Value` = `Allow`/`Deny` (the packaged-apps master), and `...\ConsentStore\microphone\NonPackaged\Value` = the desktop-apps master. Group Policy: Computer Config → Admin Templates → Windows Components → App Privacy → "Let desktop apps access the microphone."

### Detecting/handling mic-blocked state (INF, synthesized)
- No `requestAccess` API for Win32 → **cannot prompt**; instead: attempt to open capture, and if it fails or yields continuous silence/zeros, OR read `...\ConsentStore\microphone\NonPackaged\Value == "Deny"`, surface an error card and **deep-link to Settings**.
- **Deep link (OBS):** `ms-settings:privacy-microphone` (canonical; the support page uses `ms-settings:privacy-microphone?activationSource=SMC-IA-4558611`). Launch via `ShellExecute`/`cmd start`/Tauri `opener` plugin.
- **Parity delta to document:** Mac has per-app, promptable, TCC-enforced mic consent; Windows Win32 has a single non-promptable group toggle + registry state + deep-link-only remediation. Onboarding copy and the "Microphone Permission Required" error card must branch per-OS. (If you ever ship MSIX/Store, you'd gain per-app consent + `RequestAccessAsync`.)

---

## (e) INSTALLER + DISTRIBUTION + CODE SIGNING + AV

### Installer formats (OBS Tauri Windows-installer doc)
| Format | Ext | Install scope | Admin | Build host | Silent flag |
|---|---|---|---|---|---|
| **NSIS** (recommended) | `-setup.exe` | `installMode: currentUser` (default → `%LOCALAPPDATA%`), `perMachine` (→ Program Files), or `both` (user chooses) | No for currentUser | Cross-platform (Linux/mac buildable) | `/S` (also `/D=path`) |
| **WiX MSI** | `.msi` | per-machine | Yes | **Windows only** | `msiexec /i app.msi /passive /norestart` (or `/quiet`) |
- NSIS config under `bundle.windows.nsis`: `installMode`, `installerHooks` (`.nsh` with `NSIS_HOOK_PREINSTALL/POSTINSTALL/PREUNINSTALL/POSTUNINSTALL`), `languages`, `displayLanguageSelector`, `template`. WiX under `bundle.windows.wix`: `template`, `fragmentPaths`, `componentRefs`, `language`.
- **Recommendation:** NSIS **currentUser** → per-user install, **no admin/UAC**, matches Wispr's per-user Electron model and the app's per-user data. The installer creates the Start-Menu shortcut carrying the AUMID (needed for toasts — see (f)).
- **Electron alternatives:** electron-builder **NSIS** (`oneClick`, `perMachine`, `allowElevation`, `allowToChangeInstallationDirectory`) or **Squirrel.Windows** (per-user, delta updates, `.nupkg` feed; used by Slack/Discord/VS Code; auto-update baked in but aging and quirky) or **MSIX** (Store/enterprise). For a Tauri build, NSIS is the default; there's no Squirrel path.

### Auto-update (OBS)
- **Tauri updater plugin:** ed25519/**minisign** signatures — `pubkey` in `tauri.conf.json` (`plugins.updater.pubkey`, key content not a path), private key in env `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`), generated via `tauri signer generate`. **Signature verification cannot be disabled.** `bundle.createUpdaterArtifacts: true`. Endpoints: `["https://.../{{target}}/{{arch}}/{{current_version}}"]`. Static `latest.json` = `{version, notes, pub_date, platforms:{ "windows-x86_64": {url, signature} }}`; dynamic server returns 200 with `{version,url,signature,pub_date,notes}` or **204** = no update. `plugins.updater.windows.installMode`: **`passive`** (default, progress bar, no interaction), `basicUi`, or `quiet`. Flow: `update.check()` → `download()` → `install()`; **on Windows the app auto-exits when install runs** (installer limitation) → `relaunch()` after.
- **NSIS↔MSI updater caveat (OBS):** the updater installs the NSIS `.exe`; an NSIS-installed (AppData) app that then updates via MSI creates a **second uninstaller**; you can upgrade MSI→NSIS but not cleanly NSIS→MSI; supporting both requires compiling twice with different updater endpoints. **→ Ship NSIS-only for the auto-updater path.**
- **Handy uses (OBS):** updater endpoint `https://github.com/cjpais/Handy/releases/latest/download/latest.json`, base64 minisign pubkey, NSIS template `nsis/installer.nsi`, Windows signing via `azure trusted-signing-cli`.
- This updater's minisign key is **separate from and additional to** Authenticode signing (one proves payload integrity to the updater; the other establishes OS/SmartScreen trust).

### Code signing (OBS Microsoft Learn code-signing-options + smartscreen-reputation, updated 2026)
| Option | Cost | Availability | SmartScreen |
|---|---|---|---|
| **Azure Artifact Signing** (formerly **Trusted Signing**) — recommended non-Store | **~$9.99/mo** basic (5,000 sigs) / **$99.99/mo** premium (100k) / $0.005 per extra sig (~$120/yr) | **Orgs: US, Canada, EU, UK. Individuals: US + Canada only.** Identity validation, a few business days. | Reputation builds over time; **no instant bypass.** |
| **OV certificate** (DigiCert/Sectigo/GlobalSign) | $150–300/yr | Worldwide | Same reputation model as Azure. **HSM/hardware token required since June 2023 (CA/B Forum).** |
| **EV certificate** | $400+/yr | Worldwide | **Since 2024, NO instant SmartScreen bypass** — same as OV. Not worth the premium for SmartScreen. |
| Self-signed / unsigned | Free | — | Strong block; enterprises may forbid "Run anyway." |
| Microsoft Store (MSIX) | Free | Worldwide | **Never warns** (Microsoft re-signs). Not viable — FlowSpeak needs a global keyboard hook. |
| **SignPath Foundation** | Free for qualifying OSS | — | OV-level managed signing. |
- **SmartScreen reputation mechanics (OBS):** two signals = **publisher (cert) reputation** + **file-hash reputation.** Even signed, a **new binary shows "unrecognized"** until its hash accrues reputation — "**several weeks and hundreds of clean installs from a wide audience**," no fixed threshold, no manual submission for consumers. **Reputation carries to new versions ONLY if signed with the same cert;** unsigned starts at zero every release. Don't modify files after signing (breaks signature). Don't change signing identity (resets publisher trust). **Win11 Smart App Control** can outright block unsigned/low-reputation files (all executables, not just downloaded) → **sign everything.**
- **Azure Trusted Signing in CI (OBS Rick Strahl):** `signtool sign /dlib %localappdata%\...\Azure.CodeSigning.Dlib.dll /dmdf metadata.json <file>`; needs `AZURE_CLIENT_ID/SECRET/TENANT_ID`; setup: Trusted Signing Account → Identity (DUNS/Tax ID) → Certificate Profile; ~5–8 s/file, no parallelism. Tauri integration: `bundle.windows.signCommand: "trusted-signing-cli -e <endpoint> -a <account> -c <profile> -d <desc> %1"`, or `certificateThumbprint` + `digestAlgorithm:"sha256"` + `timestampUrl` for local SignTool. Cross-compiling from mac/Linux **requires** a custom `signCommand`.

### AV / Defender false positives (INF — high-confidence class; direct AV-scan search was budget-blocked, but this is a well-documented pattern for this exact app category)
- **Trigger surface:** FlowSpeak bundles (1) a **global low-level keyboard hook** (`SetWindowsHookEx(WH_KEYBOARD_LL)` / `rdev` under the hood, needed for Ctrl+Win push-to-talk) — a classic keylogger heuristic; (2) **native ML DLLs** (`llama.cpp`/`ggml`, `whisper`/ONNX Runtime, `onnxruntime.dll`) — large unsigned-looking binaries; (3) an **auto-updater that downloads+executes**. Electron/Tauri apps with these are routinely flagged as `Trojan:Win32/Wacatac`, `Program:Win32/Wacapew`, or generic ML heuristics by Defender and third-party AVs.
- **Mitigation checklist (INF, actionable):**
  1. **Authenticode-sign every PE** — the main exe, the NSIS installer, AND every bundled native DLL (llama/whisper/onnxruntime), plus the updater. Unsigned DLLs inside a signed installer still trip heuristics.
  2. **Timestamp** all signatures (so they survive cert expiry).
  3. **VirusTotal pre-scan** each release build before shipping; track which engines flag it.
  4. **Submit false positives to Microsoft WDSI** file-submission portal `https://www.microsoft.com/en-us/wdsi/filesubmission` (OBS — the SmartScreen doc names this for IT admins; developers can submit too) and to each third-party vendor's FP form.
  5. **Build reputation with a consistent cert** (SmartScreen + AV both key off cert identity).
  6. **No packers/obfuscation (no UPX)** — packing is itself a heuristic.
  7. Don't self-modify/patch executables at runtime; don't inject into other processes (the keyboard hook is a global hook, acceptable, but avoid remote-thread injection patterns).
  8. Enroll early betas so the hash accrues clean history before public launch.

---

## (f) SOUNDS / NOTIFICATIONS

### The "ping" record-start sound (INF, synthesized)
- **Bundle a short audio asset and play it inside the webview** (`new Audio('ping.wav').play()` / Web Audio API). This is the only truly cross-platform, latency-controlled, self-contained path for a Tauri/Electron app and gives pixel-for-pixel parity with the Mac ping. **Do NOT rely on the Windows toast/notification sound** (it's async, themable, and can be muted globally / by Focus Assist). Preload+decode the buffer at startup so record-start has zero audible delay.

### Toast notifications (OBS)
- **Tauri notification plugin:** `sendNotification()`, `isPermissionGranted()`, `requestPermission()` (JS+Rust). Wraps **`tauri-winrt-notification`** → WinRT **`ToastNotificationManager`**. **"Only works for installed apps; shows PowerShell name & icon in development."** Channels carry a `sound` property. **Known: no toast sound on Windows in some versions (Tauri #6652).**
- **Electron:** `new Notification({title, body})` (also WinRT-backed) or `electron-windows-notifications` (NodeRT bindings) for rich/actionable/imaged toasts.
- **AppUserModelID requirement (OBS Microsoft Learn `shell/appids`):** a Win32 app **must** have an explicit **AUMID** to raise toasts, set at startup via `SetCurrentProcessExplicitAppUserModelID` **before any UI**, AND a **Start-Menu shortcut** carrying `System.AppUserModel.ID` (the installer must create it; MSI can use the `MsiShortcutProperty` table). Without the shortcut+AUMID, Windows won't attribute the toast to your app (falls back to PowerShell branding). AUMID format `CompanyName.ProductName[.SubProduct][.Version]`, ≤128 chars, no spaces, pascal-cased → e.g. `FlowSpeak.FlowSpeak`. **Tauri/Electron installers set this automatically from the bundle identifier** (INF) — verify the Start shortcut carries the AUMID and that it matches the runtime process AUMID.
- **Focus Assist / Do Not Disturb** can suppress toasts silently — don't use toasts for anything the pill already conveys (record start/stop lives in the pill, not toasts). Use toasts only for out-of-band events (update available, mic blocked, model download done).

---

## (g) FONTS / RENDERING DELTAS vs the Mac pill

- **Rendering engine:** Mac pill = AppKit/SwiftUI + CoreText + `NSVisualEffectView` blur. Windows = **WebView2 (Edge/Chromium)** for Tauri, Chromium for Electron. All UI is HTML/CSS in a transparent webview → intrinsically **higher cross-platform parity than native**, but with these deltas:
  1. **Font rendering:** Windows uses **DirectWrite/ClearType** (heavier stems, different subpixel AA) vs CoreText's lighter hinting. Bundle the exact web fonts (SPEC uses Inter/Geist for UI, JetBrains Mono) as self-contained assets so Windows doesn't substitute; expect text to render ~1 weight heavier — consider nudging weights down on Windows or using `font-weight` tuned per-platform. `-webkit-font-smoothing` is a no-op in Chromium/Windows (it honors the OS ClearType setting).
  2. **Blur/acrylic (no NSVisualEffectView):** use the **`window-vibrancy`** crate (OBS support matrix): `apply_acrylic`/`clear_acrylic` (Win10 + Win11; **bad perf on resize/drag on Win10 v1903+ and Win11 22000**), `apply_mica`/`clear_mica` (**Win11 only**), `apply_blur`/`clear_blur` (Win7/10/11 **22H1 only**; bad perf on 22621+). **All require `transparent:true`.** For a small non-resizing pill the resize/drag perf caveat is largely moot. Alternatively use CSS `backdrop-filter: blur()` **inside** the webview — self-contained and cross-platform, but it blurs only content *within* your window, not the desktop behind it (for true behind-window blur you need the OS backdrop). **Recommendation:** CSS translucency/`backdrop-filter` for a solid-dark pill (matches SPEC's `#14131c` opaque-ish pill — Wispr's pill is near-opaque dark anyway, so acrylic isn't critical); reserve `window-vibrancy` acrylic/mica for the Hub/Settings window chrome if you want Win11 flavor.
  3. **Rounded corners:** Win11 DWM auto-rounds top-level window corners (`DwmSetWindowAttribute(DWMWA_WINDOW_CORNER_PREFERENCE)`). For a borderless transparent pill you draw the radius in CSS; set corner preference to **`DWMWCP_DONOTROUND`** to avoid a double/ghost corner clipping your CSS radius. (INF.)
  4. **Fractional DPI:** Windows commonly runs 125/150/175% scaling; ensure PerMonitorV2 + all pill geometry in CSS logical px so the pill scales cleanly across mixed-DPI monitors (Mac is integer 1x/2x only).
  5. **Transparent-window artifacts:** some GPU/driver combos show a black box behind a transparent Chromium window (Tauri #8308 class); keep `transparent:true` set at build (not toggled), test on Intel/AMD/NVIDIA.
  6. **Shadow:** `shadow:false` (Handy) — draw the pill's soft shadow in CSS (`box-shadow`/`filter: drop-shadow`) for identical look on both OSes rather than the OS drop shadow.
- **WebView2 runtime dependency (INF):** Tauri needs the **Evergreen WebView2 runtime**; it's preinstalled on Win11 and current Win10, but the NSIS installer should bundle/download the bootstrapper (`webview2InstallMode: downloadBootstrapper|embedBootstrapper|offlineInstaller`) so first-run never fails on an old Win10 without WebView2.

---

## WINDOWS SHELL CHECKLIST (mirrors Mac SPEC sections A / E / G + permissions flow)

### A′. GLOBAL WINDOWING (Flow Bar host) — Windows
- Overlay window = **Tauri WebviewWindow** `label:"flowspeak_bar"`, config: `transparent:true, decorations:false, alwaysOnTop:true, skipTaskbar:true, shadow:false, focusable:false, focused:false, resizable:false, maximizable:false, minimizable:false, closable:false, acceptFirstMouse:true, visible:false` (copy Handy's `overlay.rs` recipe, MIT). Native equivalent styles: `WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE|WS_EX_TOPMOST|WS_EX_LAYERED|WS_EX_TRANSPARENT`.
- **Click-through:** `setIgnoreCursorEvents(true)` when passive; toggle **false** while cursor is over the interactive pill (Cancel/Stop/drag) — the Windows analog of Mac `ignoresMouseEvents` toggle. (Electron: `setIgnoreMouseEvents(true,{forward:true})`.)
- **AX/host title → "FlowSpeakBar"** (cosmetic delta already required on Mac; keep on Windows for automation-tool distinctness).
- **Transparent host** sized like Mac (~pill at bottom, expansion room above); position **bottom-center on the monitor work area** (`rcWork`, not full rect): `x = work.left+(work.width−w)/2`, `y = work.bottom−h−~48px`. Use `currentMonitor()` + `scaleFactor`; positions in physical px.
- **Auto-hide taskbar:** detect via `SHAppBarMessage(ABM_GETSTATE)`→`ABS_AUTOHIDE`; add bottom inset so the pill clears the reveal strip.
- **Re-anchor timer** (mirror Wispr's ~400 ms re-center) that also re-asserts `HWND_TOPMOST` via `SetWindowPos(...SWP_NOACTIVATE)`; reposition on `WM_DPICHANGED`, `WM_DISPLAYCHANGE`, monitor connect/disconnect, and virtual-desktop switch. Expose **real drag** (don't fight the user mid-drag; `data-tauri-drag-region`), Esc-cancels-drag, persist position.
- **Fullscreen:** works over borderless-windowed apps; **document that exclusive-fullscreen games hide the pill (impossible to overlay — no compositor stack).**
- **DPI:** PerMonitorV2 via embedded manifest (`<dpiAwareness>PerMonitorV2</dpiAwareness>`); verify Tauri's default manifest sets it.
- Default visibility HIDDEN on new install; "Show Flow Bar" toggle; "Hide for 1 hour" snooze; mic stops when hidden (same as Mac).

### E′. TRAY (menu bar analog) — Windows
- **Tauri TrayIcon**, `show_menu_on_left_click(false)` → Windows-native **left-click=open Hub, right-click=context menu**. Set custom idle/recording icons via `set_icon` (optionally reflect recording state — our addition, as on Mac).
- Menu items mirror Mac tray dropdown: Open FlowSpeak · Paste last transcript · Shortcuts · Microphone · Languages · Help Center · Talk to support · Share feedback.
- Right-click Flow Menu on the pill: Hide for 1 hour · Settings · Microphone · Languages · Transcript history · Paste last transcript.
- `NIM_SETVERSION`=`NOTIFYICON_VERSION_4` semantics (via Tauri automatically). **Avoid a Submenu as tray-menu root (Win11 crash #11363).**
- **Win11 overflow:** onboarding hint "drag FlowSpeak out of the ^ overflow"; never depend on icon visibility.
- No Windows "app menu bar" concept for the Hub (unlike Mac's menu bar when Hub focused) — put those commands in an in-window menu/titlebar. (Parity delta.)

### G′. ONBOARDING (Windows, step order)
1. Launch (tray icon appears — warn about Win11 overflow). 2. Sign in — OPTIONAL/skippable (local-first). 3. **Permission step — Windows differs sharply from Mac's 3-card TCC flow:** only **Microphone** is a real gate, and it's **not promptable** — show a card that (a) checks `ConsentStore\microphone\NonPackaged\Value`, (b) if Deny/blocked, deep-links `ms-settings:privacy-microphone`, (c) polls on a timer to auto-advance when the user flips "Let desktop apps access your microphone." **No Accessibility/Input-Monitoring equivalents** — the global keyboard hook (`WH_KEYBOARD_LL`) needs **no OS permission grant** on Windows (major simplification vs Mac). 4. Tutorial: intro → privacy notice → mic test (bars react to speech) → **hotkey selection (default Ctrl+Win, rebindable)** → language → "Try It Yourself." 5. First-run model download (Qwen3-4B GGUF + Parakeet ONNX/whisper) with progress + checksum. 6. Hub welcome. 7. **Autostart prompt** ("Launch FlowSpeak at login?" → `tauri-plugin-autostart enable()`).

### PERMISSIONS FLOW — Windows (mirror of Mac's 3-TCC-grant flow)
- **Microphone (only real permission):** no per-app OS consent for Win32, no prompt API. Detect blocked state (open-capture failure/silence OR registry `...\CapabilityAccessManager\ConsentStore\microphone\NonPackaged\Value=="Deny"`). Remediate via deep link `ms-settings:privacy-microphone`. Poll to auto-advance. Error card copy reuses Mac's "Microphone Permission Required" + "Open Settings."
- **Keyboard hook: NO permission required** (unlike Mac's Accessibility + Input Monitoring). No relaunch needed. This removes the entire "quit & relaunch after grant" dance the Mac spec requires for Input Monitoring.
- **No Accessibility-equivalent** for text injection: on Windows, `SendInput`/clipboard-paste into the foreground app needs **no OS grant** (UIPI only blocks injecting into higher-integrity/elevated windows — document that dictation into an elevated (admin) app fails unless FlowSpeak is also elevated; the Windows analog of Mac's secure-input limitation).
- **Secure fields:** Windows has no `EnableSecureEventInput` global block, but UAC-secure-desktop and elevated windows block injection; surface a "can't type into this window (run as admin?)" state — analog of Mac's "Secure input is blocking keyboard shortcuts."

---

## KEY WINDOWS CONSTANTS / IDENTIFIERS (quick reference)
- WS_EX: TOOLWINDOW `0x80`, NOACTIVATE `0x08000000`, TOPMOST `0x08`, LAYERED `0x80000`, TRANSPARENT `0x20`, APPWINDOW `0x40000`, COMPOSITED `0x02000000`, NOREDIRECTIONBITMAP `0x200000`.
- DPI context: PER_MONITOR_AWARE_V2 = `(DPI_AWARENESS_CONTEXT)-4`; PER_MONITOR_AWARE `-3`; SYSTEM_AWARE `-2`; UNAWARE `-1`; UNAWARE_GDISCALED `-5`. Min Win10 1703 for V2.
- Registry: HKCU Run `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`; mic consent `SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone[\NonPackaged]\Value`.
- Deep link: `ms-settings:privacy-microphone`.
- Shell_NotifyIcon: NIM_ADD `0`, NIM_MODIFY `1`, NIM_DELETE `2`, NIM_SETVERSION `4`; NOTIFYICON_VERSION_4; ABM_GETSTATE / ABS_AUTOHIDE `0x1` / ABS_ALWAYSONTOP `0x2`; ABM_GETTASKBARPOS; ABM_GETAUTOHIDEBAR(EX).
- AUMID: `SetCurrentProcessExplicitAppUserModelID("FlowSpeak.FlowSpeak")` + Start-Menu shortcut w/ `System.AppUserModel.ID`.
- Default Windows hotkey: **Ctrl+Win** (Wispr Flow default, given).
- Signing: Azure Artifact/Trusted Signing ~$9.99/mo; `signtool /dlib Azure.CodeSigning.Dlib.dll /dmdf metadata.json`; Tauri `bundle.windows.signCommand`/`certificateThumbprint`/`digestAlgorithm`/`timestampUrl`.
- Updater: `plugins.updater` `{pubkey, endpoints, windows:{installMode:"passive"}}`; `TAURI_SIGNING_PRIVATE_KEY`; latest.json platform key `windows-x86_64`; 204 = no update.

## Open questions
- Does Tauri v2's default embedded Windows manifest actually declare PerMonitorV2, or must FlowSpeak inject a custom app.manifest? (needs verification against the shipped tauri build manifest)
- Exact behavior of Tauri `focusable:false` on Windows — does it set WS_EX_NOACTIVATE specifically, and does the pill still receive click events on its buttons given accept_first_mouse? (needs a real Windows test)
- Whether tauri-plugin-autostart's 'removed after one boot' bug (#771) is fixed in current plugin versions, and whether the Run key survives Windows Fast Startup / feature updates
- Real-world Defender/AV detection rate for a Tauri app bundling WH_KEYBOARD_LL + llama.cpp/onnxruntime DLLs — the targeted AV-false-positive search was blocked by web-search budget; needs a VirusTotal test of an actual signed build
- Does injecting text via SendInput/clipboard into the foreground window get blocked by any Windows privacy/UIPI setting beyond elevated-window integrity, e.g. protected-content apps? (needs testing across Terminal, VS Code, browsers, elevated apps)
- Whether window-vibrancy acrylic on a small always-on-top pill has acceptable perf on Win10 1903+/Win11 22000 given the documented resize/drag caveat (pill doesn't resize, but appear/morph animations might trip it) — needs a device test
- Exact Ctrl+Win push-to-talk implementation on Windows: can a global low-level keyboard hook reliably detect Win-key-hold without triggering the Start menu, and does rdev/handy-keys already solve this? (Handy source read recommended: src-tauri/src/shortcut/)

## Sources
- https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setprocessdpiawarenesscontext
- https://learn.microsoft.com/en-us/windows/win32/hidpi/dpi-awareness-context
- https://learn.microsoft.com/en-us/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process
- https://learn.microsoft.com/en-us/windows/win32/shell/abm-getautohidebar
- https://learn.microsoft.com/en-us/windows/win32/shell/appids
- https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shell_notifyiconw
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- https://support.microsoft.com/en-us/windows/privacy/turn-on-app-permissions-for-your-microphone-in-windows
- https://v2.tauri.app/reference/config/
- https://v2.tauri.app/learn/window-customization/
- https://v2.tauri.app/reference/javascript/api/namespacewindow/
- https://v2.tauri.app/distribute/windows-installer/
- https://v2.tauri.app/distribute/sign/windows/
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/plugin/autostart/
- https://v2.tauri.app/learn/system-tray/
- https://v2.tauri.app/plugin/notification/
- https://github.com/tauri-apps/tauri/issues/8308
- https://github.com/tauri-apps/tauri/issues/11363
- https://github.com/tauri-apps/tauri/issues/7719
- https://github.com/tauri-apps/tauri/issues/6652
- https://github.com/tauri-apps/plugins-workspace/issues/771
- https://github.com/tauri-apps/window-vibrancy
- https://lib.rs/crates/window-vibrancy
- https://crates.io/crates/tauri-winrt-notification
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/overlay.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/lib.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/tauri.conf.json
- https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- https://github.com/electron/electron/issues/11830
- https://github.com/microsoft/PowerToys/issues/27088
- https://backgrind.com/blog/borderless-vs-exclusive-fullscreen/
- https://weblog.west-wind.com/posts/2025/Jul/20/Fighting-through-Setting-up-Microsoft-Trusted-Signing
- https://knowledge.digicert.com/alerts/ev-signed-application-showing-microsoft-defender-smartscreen-warnings
- https://www.microsoft.com/en-us/wdsi/filesubmission
- https://windowsforum.com/threads/windows-privacy-for-desktop-apps-what-win32-access-means-for-your-data.399339/
- https://sysmansquad.com/2023/01/21/microphone_app_permissions/
- https://learn.microsoft.com/en-us/windows/apps/develop/ui/system-backdrops
