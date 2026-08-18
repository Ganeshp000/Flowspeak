# v2-9bed8cdbc48f85fa2cc920fd28f6ac8d14fdf

# TRACK: Global hotkeys & push-to-talk on Windows (FlowSpeak)

Confidence: **[OBS]** = observed in a cited primary source; **[INF]** = inferred/engineering judgment. Target: Windows 10/11, dual-platform one-codebase (Tauri v2 + Rust assumed per project context; the Win32 findings apply equally to a native C++ shell).

---
## (a) SEMANTICS — Wispr defaults & FlowSpeak's Windows default

### Wispr Flow Windows defaults [OBS — docs.wisprflow.ai supported-hotkeys + use-flow-hands-free]
- **Push-to-talk (hold): `Ctrl + Win`** (L/R agnostic). Hold both → ping → speak → release → paste.
- **Hands-free (toggle): `Ctrl + Win + Space`** to start; speak hands-free; press `Ctrl+Win` to stop & paste.
- **Command Mode: `Ctrl + Win + Alt`.**
- **Alternatives Wispr itself suggests on Windows:** `Ctrl+Alt`; an unused key like `Page Up`; **mouse buttons `Mouse4`/`Mouse5`/middle-click** (supports middle + Mouse4–Mouse10, and modifier+mouse e.g. `Ctrl+Mouse4`; left/right click excluded).
- **Hotkey rule set (clone verbatim):** max **3 keys**; **≥1 modifier** (Ctrl/Alt/Shift/**Win**/**Fn**) OR a valid mouse button; single letter alone rejected; **no L/R modifier mixing**; **Caps Lock forbidden**; `Escape` only for Cancel; **~40+ reserved Windows shortcuts blocked** (Ctrl+C, Alt+Tab, Win+E…); no duplicate bindings. Accepted examples: `Ctrl+Shift+K`, `Alt+F7`, `Shift+F9`, `Ctrl+Space`.
- Wispr **lists `Fn` as a selectable Windows modifier** but it is unusable on most PCs (see Fn analysis) — present only for the few keyboards that expose it.

### Why `Ctrl+Win` is a shrewd default (document the rationale) [INF, strong; grounded in OBS below]
1. **It is a modifier-only combo** (no letter) → natural to hold, never types a character, never clobbers app text shortcuts.
2. **The chorded `Ctrl` "dirties" the `Win` press**, so the shell does NOT open the Start menu on release. The Start menu fires only on a *clean* lone-`Win` down→up with no intervening key; because `Ctrl` is down throughout, the `Win` key-up is not "clean." This largely sidesteps the classic Start-menu problem *without* even needing to suppress the key — the likely reason Wispr picked it. [INF, strong]
3. `Ctrl+Win`-held is not a common game bind and is unlikely to collide with app shortcuts. Caveat: while `Ctrl+Win` is held, a stray arrow/`D`/`F4` from the other hand triggers virtual-desktop shortcuts (`Win+Ctrl+←/→` switch desktop, `Win+Ctrl+D` new, `Win+Ctrl+F4` close). Rare in practice. [OBS Windows shortcuts]

### Recommended FlowSpeak Windows defaults [INF]
- **Default PTT hold = `Ctrl+Win`** (match Wispr; muscle-memory parity). Hands-free/lock = **double-tap `Ctrl+Win`** or `Ctrl+Win+Space`. Cancel = `Esc` while recording. Command mode = `Ctrl+Win+Alt`.
- **Ship first-class alternatives** for users where Win-combos are awkward or for gamers: `Ctrl+Alt` (no Win key, low game-conflict), `Right Ctrl` alone, a spare key (`Pause`, `ScrollLock`, `Insert`, `Page Up`), and **mouse `Mouse4`/`Mouse5`/middle**.
- **Do NOT default to `Fn` on Windows** (firmware-invisible on most PCs — see Fn analysis). This is the key Mac↔Windows divergence: Mac default = `Fn`, Windows default must be `Ctrl+Win`.

### Hold-friendly viability of candidate keys [INF]
- **Good for hold:** `Ctrl+Win`, `Ctrl+Alt`, `Right Ctrl`, `Right Alt` (AltGr caveat on Intl layouts — RAlt = Ctrl+Alt on some locales), `Mouse4/Mouse5`, `Pause`/`ScrollLock`.
- **Avoid for hold:** lone `Win` (Start menu on release unless you eat the keyup), lone `Shift`/`Ctrl`/`Alt` (**Sticky Keys** prompt fires on 5× Shift; **Filter Keys** on holding Shift ~8 s — but a *combo* hold does not trigger these), `Caps Lock` (toggle, stateful, forbidden by Wispr), `Alt` alone (activates menu bars / eats focus), `Esc` (reserved for Cancel).
- **Sticky/Filter Keys:** a 2-key modifier hold like `Ctrl+Win` does NOT trip Sticky Keys (needs 5× same-modifier taps) or Filter Keys (needs 8 s single-Shift hold). Safe. [INF]

### The Fn key on Windows — firmware-level & mostly invisible [OBS — Wikipedia Fn key]
- Fn is a **meta-modifier processed inside the keyboard's microcontroller / embedded controller, below the OS**: it makes the OS see *altered scancodes* for other keys but **emits no standard scancode of its own**. "The operating system has no notion of the Fn key… the key can not normally be remapped in software." → **A `WH_KEYBOARD_LL` hook, RawInput, RegisterHotKey, rdev — none can detect Fn-alone on most PCs.** This is the fundamental Mac↔Windows asymmetry (macOS Fn = `kVK_Function` 0x3F / `maskSecondaryFn`, fully visible via CGEventTap; Windows Fn = invisible).
- **Documented exceptions [OBS]:** **Lenovo ThinkPads** (and some others) map Fn in **BIOS**, allowing remap and sometimes exposing Fn/Fn-Lock state. Some vendors surface Fn-Lock / Fn state via **ACPI/WMI** (vendor hotkey drivers — Dell/HP/Lenovo WMI ACPI events fire as events, not raw scancodes). A minority of keyboards emit a real scancode for Fn. **None of this is portable** → treat Fn on Windows as "advanced/opt-in, keyboard-dependent," never a default. [INF]

---
## (b) IMPLEMENTATION — Win32 hook mechanics (exact behavior)

### `WH_KEYBOARD_LL` (idHook = **13**) via `SetWindowsHookExW` [OBS — MS Learn]
- Callback `LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam)`.
  - `nCode`: only `HC_ACTION` (0) carries data; if `< 0` you MUST just `return CallNextHookEx(...)`.
  - `wParam` = message id: **`WM_KEYDOWN`(0x0100), `WM_KEYUP`(0x0101), `WM_SYSKEYDOWN`(0x0104), `WM_SYSKEYUP`(0x0105)`.** (SYS variants fire when Alt is held — you must handle both DOWN forms and both UP forms.)
  - `lParam` → `KBDLLHOOKSTRUCT*`.
- **`KBDLLHOOKSTRUCT` [OBS]:** `{ DWORD vkCode; DWORD scanCode; DWORD flags; DWORD time; ULONG_PTR dwExtraInfo; }`. `vkCode` range 1–254.
  - **flags bits [OBS]:** bit0 `LLKHF_EXTENDED`; **bit1 `LLKHF_LOWER_IL_INJECTED`(0x02)** = injected by a *lower-integrity* process; bit4 `LLKHF_INJECTED`(0x10) = injected by *any* process (set whenever bit1 is set); bit5 `LLKHF_ALTDOWN`(0x20) = Alt down; **bit7 `LLKHF_UP`(0x80)** = 0 pressed / 1 released.
  - **`dwExtraInfo`** = your channel to tag self-injected keystrokes: stamp a magic constant when you `SendInput` text, then the hook ignores events whose `dwExtraInfo` matches → prevents feedback loops. Combine with the `LLKHF_INJECTED` check. [INF, standard pattern]
- **Suppress a key:** return **nonzero (e.g. 1) WITHOUT calling `CallNextHookEx`** for the owned keys; for everything else call `CallNextHookEx` and return its value (so other apps' hooks still work). [OBS]
- **Scope:** `WH_KEYBOARD_LL` is **Global only** and **does NOT require a DLL** — it runs **in the context of the thread that installed it**, which **must have a message loop** (`GetMessage`/`PeekMessage`). The system delivers the callback by messaging that thread. [OBS]
- **Detecting hold-modifier-only:** you build the state machine from `vkCode` transitions of `VK_LWIN`(0x5B)/`VK_RWIN`(0x5C)/`VK_LCONTROL`(0xA2)/`VK_RCONTROL`(0xA3)/`VK_LMENU`(0xA4 Alt)/`VK_RMENU`(0xA5)/`VK_LSHIFT`(0xA0)/`VK_RSHIFT`(0xA1). A LL hook DOES report each physical modifier's own down/up (unlike RegisterHotKey), which is exactly why a hook is mandatory for a modifier-only PTT trigger. [OBS/INF]
- **`GetAsyncKeyState` warning [OBS]:** inside the LL callback the async key state is **not yet updated** — do not rely on `GetAsyncKeyState` there; track modifier state yourself from the event stream.

### `LowLevelHooksTimeout` — the "Windows silently removes slow hooks" trap [OBS — MS Learn]
- Registry: **`HKEY_CURRENT_USER\Control Panel\Desktop` → `LowLevelHooksTimeout` (DWORD, ms).** Historic default **5000 ms**; **since Windows 10 v1709 the max is 1000 ms** (values >1000 clamped to 1000; effective default ~1000). [OBS]
- **On Windows 7+, if the callback exceeds the timeout the hook is SILENTLY REMOVED without being called and there is no notification to the app.** (Pre-Win7 it merely passed the event on.) [OBS] → a PTT app that ever stalls in the callback will just *stop working* with no error.
- **MS explicit guidance [OBS]:** "run the hooks on a dedicated thread that passes the work off to a worker thread and then immediately returns… In most cases… monitor raw input instead" (raw input can't suppress — see (c)). **Debuggers cannot break inside a LL hook** without tripping the timeout.
- **Mitigation design [INF, from OBS guidance]:** dedicated **hotkey thread** owning the hook + message loop; the callback does only: read `vkCode`/`flags`, compare against the (tiny) trigger set, update an atomic state machine, push a token onto a lock-free channel (`crossbeam`/`std::sync::mpsc`), then **immediately** `return 1` (suppress owned key) or `CallNextHookEx`. All heavy work (start/stop capture, ASR, LLM, injection) runs on OTHER threads. Never lock a contended mutex, never do I/O, never allocate on the hot path. Target callback latency in **single-digit microseconds**.

### Suppressing `Win` so the Start menu does not open — the "eat-the-keyup" trick [OBS mechanics + INF]
- Start menu opens on `VK_LWIN`/`VK_RWIN` **key-UP** when the Win press was "clean" (no other key down/consumed in between). [OBS behavior, AHK/MS Q&A]
- **Because FlowSpeak's default is `Ctrl+Win`, Ctrl already dirties the Win press → Start menu normally will NOT open even without suppression.** [INF, strong]
- **Robust rule regardless of chord order:** once your trigger has fired (Win seen as part of an active PTT session), **swallow (return 1) the subsequent `Win` key-UP** (and optionally the down) so the shell never sees a clean Win tap. This is the canonical "eat the keyup." Do this only while your session owns the key, so ordinary `Win+E`/`Win+D` still work when FlowSpeak isn't triggering. [OBS/INF]
- **Alternative (dummy-key) trick [OBS — AHK pattern]:** inject a throwaway key (AHK uses `vkE8`/an unassigned VK, or a `Ctrl` tap) between the Win down and up so the OS treats the Win press as "not clean." Eating the keyup is simpler and preferred for a hook.
- **Auto-repeat:** while holding, WM_KEYDOWN repeats stream in. Debounce in the state machine (only the first down starts the session); no `MOD_NOREPEAT` equivalent for a hook — you manage it.

### `RegisterHotKey` — why it CANNOT do PTT alone [OBS — MS Learn]
- Delivers **`WM_HOTKEY` on PRESS only**; **no key-up event is ever reported** → cannot detect release → cannot bound a hold. [OBS]
- Requires a **`vk` (a real non-modifier key)** in `RegisterHotKey(hWnd,id,fsModifiers,vk)`. **A pure modifier combo (Ctrl+Win, Right-Alt-alone, Fn) has no `vk` → cannot be registered at all.** → RegisterHotKey **cannot express Wispr's `Ctrl+Win` default.** [OBS/INF, critical]
- `fsModifiers`: `MOD_ALT`0x1, `MOD_CONTROL`0x2, `MOD_SHIFT`0x4, `MOD_WIN`0x8, **`MOD_NOREPEAT`0x4000** (suppresses auto-repeat WM_HOTKEY spam; Vista lacks it). Docs: **"Keyboard shortcuts that involve the WINDOWS key are reserved for use by the OS"** → many Win combos fail to register. [OBS]
- **Does not suppress** the key from the foreground app in the general case; it "consumes" the exact registered chord. `F12` reserved (debugger). id range 0x0000–0xBFFF (apps). [OBS]
- **Verdict:** usable only for **modifier+letter toggle** shortcuts (e.g. `Ctrl+Alt+Space` hands-free), and even then reports only press so hold must be faked by polling. Not a PTT primitive.

### Raw Input API (`RegisterRawInputDevices`) as an alternative [OBS — MS Learn]
- Register keyboard: `RAWINPUTDEVICE{ usUsagePage=0x01, usUsage=0x06, dwFlags, hwndTarget }`; `RIDEV_INPUTSINK` = receive `WM_INPUT` even when not foreground (**requires a non-NULL `hwndTarget`**); `RIDEV_NOLEGACY` = stop legacy WM_KEY* for *your own* window. Reports key up/down via `RAWKEYBOARD.Flags` (`RI_KEY_BREAK` = up, `RI_KEY_MAKE`, `RI_KEY_E0/E1`). [OBS]
- **CRITICAL: Raw Input CANNOT suppress/block keystrokes from other apps.** `RIDEV_NOLEGACY` only affects the registering window; it never prevents other apps or the OS from getting the key. [OBS] → Raw Input is a good *low-overhead monitor* (MS even recommends it over LL hooks for pure monitoring) but is **useless for a PTT app that must stop the Win key from opening Start.** For FlowSpeak the hook is mandatory *because of suppression*.

---
## (c) RUST / JS LAYERS — key-DOWN + key-UP globally & suppression

### `global-hotkey` crate (tauri-apps) — **v0.8.0 (2026-07-11)** [OBS — docs.rs + source]
- Platforms: Windows, macOS, Linux(**X11 only**, no Wayland). MIT OR Apache-2.0.
- **Windows impl uses `RegisterHotKey`, NOT a hook** (`RegisterHotKey(hwnd, id, MOD_NOREPEAT | mods, vk)`). [OBS — src/platform_impl/windows/mod.rs]
- **It DOES emit `HotKeyState::Released`, but SYNTHETICALLY:** on `WM_HOTKEY` it sends `Pressed`, then **spawns a thread that polls `GetAsyncKeyState(vk)` every ~50 ms until it returns 0**, then sends `Released`. [OBS — exact code path]
- **Consequences [INF, important]:** (1) **~50 ms release latency** (vs Wispr's instant feel); (2) **a new thread is spawned per press**; (3) it only watches the MAIN `vk` — releasing a modifier first isn't seen; (4) **cannot bind modifier-only combos** (needs a `Code`), so `Ctrl+Win` is impossible; (5) **no key suppression**. Requires a **win32 message loop on the manager's thread**.
- **Fine for:** `Ctrl+Alt+Space`-style toggle shortcuts. **Not fine for:** Wispr-grade modifier-only, low-latency, suppressed PTT.

### `tauri-plugin-global-shortcut` (official Tauri v2 plugin) [OBS — v2.tauri.app + Handy source]
- **Thin wrapper over `global-hotkey`.** Exposes `ShortcutState::Pressed`/`ShortcutState::Released` and `on_shortcut(shortcut, |app, scut, event| …)`. Requires Rust ≥1.77.2. Inherits **every** limitation above (RegisterHotKey, 50 ms polled release, no modifier-only, no suppression, X11-only Linux). [OBS/INF]
- **This is what Handy's `tauri_impl.rs` uses:** `event.state == ShortcutState::Pressed` → `is_pressed` bool → `handle_shortcut_event(id, shortcut, is_pressed)`; PTT hold = "record while pressed, stop on released." Cancel (`Esc`) registered dynamically at record-start via `register_cancel_shortcut()` / removed at stop; **dynamic registration skipped on Linux** ("instability"). **No key suppression anywhere in this path.** [OBS]

### `rdev` crate (Narsil) — **v0.5.3 latest** [OBS — github/docs.rs]
- MIT. Reports **`EventType::KeyPress` AND `KeyRelease` globally** on macOS/Windows/Linux(X11). Windows backend = `WH_KEYBOARD_LL`; macOS = CGEventTap; Linux = X11.
- Two entry points: **`listen()`** = monitor-only (never suppresses); **`grab()`** behind the **`unstable_grab`** feature = can **suppress** (return `None` drops the event; return the event to pass it). [OBS]
- **Known limitations [OBS]:** grab is explicitly **"unstable"** and **cannot modify events** (only pass/drop). The Windows grab callback runs **on the hook thread** → same `LowLevelHooksTimeout` constraint. Historic issues: dropped/duplicated events under load, scancode fidelity in older versions, ecosystem casing bugs. **rdev is the closest off-the-shelf Rust primitive to a suppressing PTT hook**, but grab's instability argues for a hand-rolled hook in a shipping product. [OBS/INF]

### `windows` crate (windows-rs, official Microsoft) [OBS/INF]
- MIT OR Apache-2.0. Exposes the raw Win32 to hand-roll the hook: `windows::Win32::UI::WindowsAndMessaging::{SetWindowsHookExW, CallNextHookEx, UnhookWindowsHookEx, WH_KEYBOARD_LL, KBDLLHOOKSTRUCT, HHOOK, MSG, GetMessageW, WM_KEYDOWN/WM_KEYUP/WM_SYSKEYDOWN/WM_SYSKEYUP}` and `...Input::KeyboardAndMouse::{RegisterHotKey, GetAsyncKeyState, SendInput, VIRTUAL_KEY, VK_LWIN, VK_LCONTROL, …}`. **Recommended base for FlowSpeak's custom Windows engine** — full control over suppression, modifier-only triggers, eat-the-keyup, injected-event tagging, no unstable third-party API. [INF, high confidence]

### `libuiohook` / `uiohook-napi` / `iohook` (Node/Electron world) [INF; verify license]
- C lib (`libuiohook`) → `WH_KEYBOARD_LL` (Win), CGEventTap (mac), X11 XRecord (Linux). Reports **key-down AND key-up globally.** **BUT monitor-only — does NOT suppress/consume events.** Wrappers: `uiohook-napi` (maintained), `iohook` (deprecated, prebuilt-binary pain). **License commonly reported GPL-3.0 → audit before use in a closed-source product.** Because it can't suppress, unsuitable as the primary PTT engine (Start-menu leak). [INF]

### What Handy actually ships (reconciled) [OBS]
- `shortcut/mod.rs` selects a backend **at runtime** via a `keyboard_implementation` setting (enum `KeyboardImplementation`, not cfg-gates): **`Tauri`** = `tauri-plugin-global-shortcut` (RegisterHotKey path), or **`HandyKeys`** = Handy's own `handy-keys` lib "for more control"; if HandyKeys init fails it falls back to Tauri and persists that choice.
- `handy_keys` `Modifiers` enum = `CTRL / OPT / SHIFT / CMD / FN`; strings render platform-aware (`OPT→"alt"`, `CMD→"super"` on Windows/Linux). **`handy-keys` explicitly permits modifier-only combos and the Fn key** — i.e. it is the *hook-based* backend the RegisterHotKey Tauri backend cannot match. Keys parse via `raw.parse::<Hotkey>()`. **No Ctrl+Win Windows default is hardcoded — Handy treats platforms uniformly (CMD→super).** [OBS] → to get Wispr-exact `Ctrl+Win`, FlowSpeak needs the HandyKeys-style hook backend, not the Tauri/RegisterHotKey one.

### Tauri plugin landscape [INF]
- **Only official global-shortcut plugin = RegisterHotKey-based** (can't do suppressed modifier-only PTT). **No official Tauri hook/suppression plugin.** Options: (1) hand-roll a Rust module with `windows` crate (Win) + `core-graphics`/CGEventTap (mac) — mirrors Handy's `handy-keys`; (2) `rdev`'s `grab`; (3) reuse/port MIT `handy-keys`. Recommendation: **option (1)**.

---
## (d) CROSS-CUTTING — secure desktop, elevation/UIPI, RDP, games, AV

### Per-desktop scope & the Secure Desktop [OBS about-hooks + INF]
- A global hook "**monitors messages for all threads in the same desktop as the calling thread.**" [OBS] Windows' interactive Winsta0 has multiple desktops: **Default** (normal apps) and **Winlogon/Secure Desktop** (UAC consent prompts, `Ctrl+Alt+Del`, lock screen, logon). [OBS/INF]
- **Consequence:** a hook installed on Default **does not run on the Secure Desktop** → PTT is dead during UAC prompts, Ctrl+Alt+Del, lock screen, logon. By design and desirable (don't dictate into a password prompt). The hook survives the desktop switch and resumes on return. [INF, strong]
- **Design action [INF]:** watch session lock/unlock via `WTSRegisterSessionNotification` (`WM_WTSSESSION_CHANGE`: `WTS_SESSION_LOCK`/`WTS_SESSION_UNLOCK`) and **force the state machine to Idle** (abort in-flight recording) on lock; re-arm on unlock; use it as a watchdog trigger to re-install the hook.

### Elevated windows & UIPI (User Interface Privilege Isolation) [OBS integrity flags + INF]
- The `KBDLLHOOKSTRUCT` flag **`LLKHF_LOWER_IL_INJECTED`(0x02)** proves the input stack is integrity-aware. [OBS]
- **UIPI rule [INF, well-established]:** a hook/app at **Medium IL (normal, non-elevated) cannot see or suppress input directed at a window at High IL (a UAC-elevated / "Run as administrator" app).** So while an elevated window (elevated PowerShell/cmd, Task Manager, RegEdit, many installers) is **focused**, FlowSpeak's non-elevated hook **won't fire and can't suppress** — PTT silently no-ops there, and text injection (`SendInput`/paste) into it is blocked by UIPI too.
- **Mitigations [INF]:**
  1. **`uiAccess="true"` in the app manifest** — grants UIPI bypass to drive higher-IL windows. **Requires:** binary **Authenticode-signed**, **installed to a trusted secure path** (`%ProgramFiles%` or `%SystemRoot%\System32`). This is how legit accessibility/dictation tools reach elevated apps. Heavy but correct for parity.
  2. **Run FlowSpeak elevated (High IL)** — sees Medium/lower-IL windows; blunt, hurts UX (UAC per launch), still can't beat System IL.
  3. **Accept the gap** + toast ("can't type into an elevated window"). Simplest; most dictation targets (browsers, chat, editors) are Medium IL anyway.
- Your own `SendInput` from Medium IL is flagged `LLKHF_INJECTED`; you still can't inject INTO a higher-IL app. [OBS/INF]

### Remote Desktop (RDP) [INF + OBS cross-ref]
- If FlowSpeak runs **inside** an RDP session, its LL hook works within that session's desktop; local client keystrokes are handled by the RDP client. On disconnect the console locks (Secure Desktop) → hook idle.
- **Injection into RDP client windows is fragile:** VoiceInk #758 (macOS analog) shows direct-typing failing into Remote Desktop; on Windows prefer **clipboard-paste (Ctrl+V)** over per-char `SendInput` when the focused window is an RDP client (`mstsc`), and expect nested-session latency. [OBS cross-ref / INF]

### Full-screen exclusive games & anti-cheat [INF]
- Games read input via **RawInput/DirectInput/XInput**, but a `WH_KEYBOARD_LL` hook sits **above** that at the injection point, so it **still sees the physical keys** in full-screen games — and if you `return 1`, the game won't get your trigger (good: your PTT key won't also strafe). [INF, strong]
- **Kernel-mode anti-cheat (Riot Vanguard, EAC, BattlEye) may detect, flag, or block user-mode LL keyboard hooks** as cheat/injection vectors — PTT can be disabled or the app flagged while such a game runs. Document as a known limitation; offer a mouse-button trigger (`Mouse4/5`); don't inject keystrokes into protected games. [INF]
- Exclusive-fullscreen can swallow/deprioritize hotkeys and hide overlays; recommend users run games borderless-windowed for the pill overlay. [INF]

### Antivirus / Defender flagging of LL keyboard hooks [INF, industry practice; grounded]
- **Why it's risky:** `WH_KEYBOARD_LL` is the canonical **keylogger** primitive → AV heuristics + Defender ML score it, *especially* when combined with keystroke-to-disk logging, network exfil, DLL injection, packing/obfuscation, or missing signatures.
- **How legit dictation apps stay clean [INF]:**
  1. **Authenticode-sign every binary + the installer** with an **OV or (better) EV certificate.** EV gives immediate **SmartScreen reputation** (no "Unknown Publisher" wall); OV builds reputation over installs/time. Sign the EXE, sidecars, and MSI/NSIS/WiX installer.
  2. **Don't behave like a keylogger:** in the hook only compare `vkCode` against the *small trigger set* and immediately `CallNextHookEx` for all other keys; **never persist keystrokes to disk, never send keystrokes over the network, never build a keystroke buffer.** This "no capture" shape avoids the heuristic. (Audio/transcripts are a separate, user-consented artifact — clearly not keystroke logs.)
  3. **Global LL hook needs NO injected DLL** (runs in-process) — avoid `SetWindowsHookEx` DLL-injection into other processes, a much bigger red flag. [OBS the hook is DLL-free]
  4. **No packers/obfuscators**, standard PE entry points, real version/company metadata.
  5. **Pre-submit to Microsoft** (Defender false-positive / analyst submission portal) before launch; keep a signed update channel so reputation carries across versions.
  6. Optional **MSIX/Store packaging** raises trust — but the app-container sandbox can restrict global hooks and `uiAccess`; validate before committing. [INF]

---
## RECOMMENDED WINDOWS HOTKEY ENGINE (mirrors the Mac CGEventTap state machine)

**Backend:** hand-rolled Rust module over the `windows` crate (NOT `tauri-plugin-global-shortcut`), analogous to Handy's `handy-keys`. Reasons: only a `WH_KEYBOARD_LL` hook can (i) bind modifier-only `Ctrl+Win`, (ii) suppress the Win keyup, (iii) deliver instant (<1 ms) release, (iv) implement double-tap-lock & Esc-cancel. RegisterHotKey fails all four; Raw Input can't suppress. [INF, high confidence]

**Threading:** one dedicated **hotkey thread** = `SetWindowsHookExW(WH_KEYBOARD_LL, proc, hInstance, 0)` + a `GetMessageW` loop. Callback is allocation-free/lock-free: read `vkCode`/`flags`, update an atomic state machine, push a token to an `mpsc`/`crossbeam` channel consumed by the app thread, then return (1 to suppress owned keys, else `CallNextHookEx`). Keep callback in microseconds to dodge `LowLevelHooksTimeout` silent-removal.

**Ignore self-injection:** drop events where `flags & LLKHF_INJECTED` **and** `dwExtraInfo == WHIMPR_SIGNATURE` (magic stamped on your own `SendInput`).

**State machine (parity with Mac hold / double-tap-lock / Esc-cancel):**
- `Idle` → all trigger modifiers of the binding go down (e.g. LCtrl+LWin both pressed) ⇒ start a hold timer (`holdThreshold ≈ 180–250 ms`, cf. OpenSuperWhisper 0.3 s / VoiceInk 0.5 s hybrid) and mark `Armed`.
- `Armed`, still held past threshold ⇒ **`Recording (PTT-hold)`**; on trigger-up ⇒ **Stop → finalize (ASR→LLM→inject)**. **Suppress (`return 1`) the owned keys' up/down while Armed/Recording**, and **always eat the `VK_LWIN/RWIN` key-up** for the session so the Start menu never opens.
- `Armed`, released *before* threshold ⇒ **tap**; if a second tap of the same binding lands within `GetDoubleClickTime()` (~500 ms) ⇒ **`Recording (locked/hands-free)`**; press the binding again (or `Esc`) to stop.
- **`Esc` while recording ⇒ Cancel** (discard, no injection). Monitor `Esc` via the same hook; do **not** globally suppress `Esc` (only consume it when actually cancelling; else pass through).
- Guard: if a *non-trigger* normal key is pressed during Armed (before threshold), abort to Idle so you don't clobber a real chord (the vox-pattern). [INF]

**Repeat handling:** ignore auto-repeat `WM_KEYDOWN` after the initial down (no `MOD_NOREPEAT` for a hook; dedupe by state).

**SYS vs non-SYS:** handle `WM_SYSKEYDOWN/UP` too (fire when Alt is part of the chord, e.g. `Ctrl+Win+Alt` command mode).

**Watchdog (hook can be silently removed) [INF, mirrors Mac tap-health timer]:** periodically (~2–5 s) verify the hook is alive by injecting a benign self-test key stamped with `dwExtraInfo` and confirming the callback saw it; if not, `UnhookWindowsHookEx` → re-`SetWindowsHookExW`. Also re-install on `WM_WTSSESSION_CHANGE` unlock, `WM_DISPLAYCHANGE`, and desktop transitions. Windows LL hooks have **no `kCGEventTapDisabledByTimeout` equivalent** (no disable-with-notification), so a proactive watchdog is the only recovery.

**Elevation:** ship `uiAccess="true"` + Authenticode signing + install to `%ProgramFiles%` if parity for dictating into elevated windows is required; else degrade gracefully with a toast when the focused window is High IL.

**Cross-platform symmetry:** expose one Rust trait `HotkeyEngine { on_press, on_release, on_cancel }`; Windows impl = `WH_KEYBOARD_LL`; macOS impl = CGEventTap on `flagsChanged`+`keyDown/Up`. Same state machine, same thresholds, platform-specific key tables (`Ctrl+Win` default on Windows, `Fn` default on macOS).

## Open questions
- Real on-device latency/feel of the tauri-plugin-global-shortcut 50ms GetAsyncKeyState-polled Released vs a raw WH_KEYBOARD_LL hook — needs measurement on Windows to confirm the hook is worth hand-rolling for PTT snappiness.
- Whether handy-keys (Handy's MIT lib) uses rdev or its own WH_KEYBOARD_LL under the hood on Windows, and whether it suppresses keys — mod.rs confirms it is the 'more control' backend but the low-level Windows source was not read this track.
- Whether uiAccess=true is truly needed for FlowSpeak's target apps or the elevated-window gap is acceptable — depends on how often users dictate into elevated terminals/installers; a product decision.
- libuiohook / uiohook-napi exact license (reported GPL-3.0) — must be verified before any reuse in a closed-source product.
- Empirical Defender/AV behavior for unsigned vs OV vs EV-signed builds that install a global LL keyboard hook — needs VirusTotal + Defender ML testing on the actual FlowSpeak binary.
- Which specific PC-laptop vendors expose Fn via WMI/ACPI usably (Lenovo BIOS-mapped Fn confirmed) and whether per-vendor support is worth it — likely not for v1.
- Anti-cheat (Vanguard/EAC/BattlEye) tolerance of the WH_KEYBOARD_LL hook and of Mouse4/5 triggers — needs testing against popular protected games.

## Sources
- https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts
- https://docs.wisprflow.ai/articles/6391241694-use-flow-hands-free
- https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-kbdllhookstruct
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowshookexa
- https://learn.microsoft.com/en-us/windows/win32/winmsg/about-hooks
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey
- https://learn.microsoft.com/en-us/windows/win32/inputdev/using-raw-input
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rawinputdevice
- https://docs.rs/global-hotkey/latest/global_hotkey/
- https://raw.githubusercontent.com/tauri-apps/global-hotkey/dev/src/platform_impl/windows/mod.rs
- https://v2.tauri.app/plugin/global-shortcut/
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/shortcut/tauri_impl.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/shortcut/mod.rs
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/shortcut/handy_keys.rs
- https://github.com/Narsil/rdev
- https://docs.rs/rdev/
- https://en.wikipedia.org/wiki/Fn_key
- https://www.autohotkey.com/board/topic/51631-disable-windows-key-start-menu-but-not-shortcuts/
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerrawinputdevices
