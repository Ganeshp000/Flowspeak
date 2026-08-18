# v2-4af86e1f93e0161cae156160e9af42711a526

## TRACK: Injecting text at the cursor on WINDOWS (the analog of the Mac AX-insert/clipboard-paste ladder)

Confidence tags: **OBS** = observed in a primary source (MS Learn / GitHub source / issue). **INF** = inferred/engineering judgment or well-established platform knowledge not re-fetched this session. Target = Windows 10 (1809+) / 11, dual-platform FlowSpeak. NOTE: WebSearch budget was exhausted mid-track (200/200); all facts below come from WebFetch of primary docs/source or the local research files. A few items I could not re-fetch (Talon internals, bracketed-paste specifics, AUMID retrieval) are marked INF/known and flagged as open questions.

---

### 0. EXECUTIVE ANSWER — the Windows insertion ladder (mirrors the Mac ladder)

Mac ladder was: pre-check secure input → AX `kAXSelectedText` insert → clipboard Cmd+V w/ save-restore → `keyboardSetUnicodeString` typing → verify via AX delta. **Windows equivalent, recommended:**

0. **Resolve target** at record-start AND re-resolve at delivery (VoiceInk #803 lesson): `GetForegroundWindow()` → `GetWindowThreadProcessId` → `GetGUIThreadInfo(tid).hwndFocus` + `IUIAutomation::GetFocusedElement()`.
1. **Guard / decline rung:** password field (`UIA_IsPasswordPropertyId`==TRUE or Win32 `ES_PASSWORD` style) → decline; elevated target (higher integrity level than us) → decline+toast (UIPI will silently eat injection).
2. **Rung A — UIA `ValuePattern.SetValue`** (clean, no clipboard, no keystrokes) — only for known-good NATIVE single-line value controls (Win32/WinForms/WPF/WinUI), because SetValue **replaces the entire field** and fires no per-keystroke input event. Verify by re-reading `CurrentValue`.
3. **Rung B — Clipboard paste (PRIMARY, universal):** save clipboard (seqnum + all formats) → set `CF_UNICODETEXT` + history/cloud-exclusion formats → `SendInput` Ctrl+V (Ctrl+Shift+V / Shift+Insert for terminals) → restore after paste consumed. This is the de-facto default, same as macOS.
4. **Rung C — `SendInput` `KEYEVENTF_UNICODE` typing** (fallback, no clipboard): surrogate-aware UTF-16, one batched `SendInput`. For when paste is swallowed/blocked, or paste warnings interfere.
5. **Rung D — decline + leave-on-clipboard + toast** "Dictation copied, press Ctrl+V" (secure/elevated/games).
Per-rung failure detection + a user-tunable per-app override table keyed by exe name / AppUserModelID.

**Because UIA SetValue whole-replaces and lies in Chromium, clipboard paste is PRIMARY on Windows just as on Mac; UIA is used mainly for (i) context reading and (ii) optional clean insert into simple native fields.**

---

### (a) CLIPBOARD-PASTE SIMULATION — the core path

**Ctrl+V synthesis via `SendInput` (OBS):**
- `UINT SendInput(UINT cInputs, LPINPUT pInputs, int cbSize)` — `cbSize = sizeof(INPUT)` (40 bytes on x64; mismatch → whole call fails). Returns # events inserted; **return 0 = "input was already blocked by another thread"** (also the UIPI-blocked case, see below). Lib `User32.dll`.
- `INPUT` is a tagged union; set `type = INPUT_KEYBOARD (1)`, fill `.ki` (KEYBDINPUT). Batch ALL events into ONE array + ONE `SendInput` call → atomic, not interleaved with real user input (OBS: "events are not interspersed with other keyboard or mouse input events").
- Ctrl+V = 4 INPUTs: Ctrl↓ (`wVk=VK_CONTROL 0x11`), V↓ (`wVk='V' 0x56`), V↑ (`KEYEVENTF_KEYUP 0x0002`), Ctrl↑. (Handy uses `(Key::Control, Key::Other(0x56))`, OBS.)
- **`SendInput` does NOT reset keyboard state** (OBS) — "Any keys already pressed when the function is called might interfere." Because push-to-talk hotkey (e.g. Ctrl+Win held) may still be physically down at delivery, **check `GetAsyncKeyState` for stuck modifiers and synthesize key-ups first**, else you get Ctrl+Win+V etc. This is a real Windows-specific hazard vs Mac.
- Key VKs: `VK_CONTROL 0x11`, `VK_LCONTROL 0xA2`, `VK_SHIFT 0x10`, `VK_MENU`(Alt) `0x12`, `VK_INSERT 0x2D`, `'V' 0x56`, `VK_LWIN 0x5B`, `VK_PACKET 0xE7`.

**Save / restore prior clipboard (OBS):**
- API sequence to WRITE: `OpenClipboard(hwnd)` → `EmptyClipboard()` → `SetClipboardData(format, hMem)` per format (hMem from `GlobalAlloc(GMEM_MOVEABLE, bytes)`, `GlobalLock`/memcpy/`GlobalUnlock`; system owns & frees it after) → `CloseClipboard()`. Text format = **`CF_UNICODETEXT` (13)**; null-terminated UTF-16. (`CF_TEXT`=1, `CF_OEMTEXT`=7 are auto-synthesized from CF_UNICODETEXT, OBS synthesized-formats table — so you only need to set CF_UNICODETEXT.)
- To READ/snapshot: `OpenClipboard` → enumerate with `EnumClipboardFormats(0)` looping, or check `IsClipboardFormatAvailable`, then `GetClipboardData(format)` (handle is **still owned by the clipboard — do not free or leave locked**, OBS) → `GlobalLock`/copy/`GlobalUnlock` → `CloseClipboard`. `GetClipboardFormatName` for registered formats, `CountClipboardFormats`, `GetPriorityClipboardFormat(list,n)` to pick best.
- **Close the clipboard promptly** — while open, other apps block (OBS). Correct pattern: open→copy-out all formats we care about→close (don't hold it open across the paste).
- Restore = re-`OpenClipboard`/`EmptyClipboard`/`SetClipboardData` for each saved format. Restoring only CF_UNICODETEXT loses images/RTF the user had; snapshot at least CF_UNICODETEXT + CF_HTML + CF_RTF + CF_DIB if present (INF).

**`GetClipboardSequenceNumber` to detect interference (OBS):**
- `DWORD GetClipboardSequenceNumber()` — per window station; "incremented whenever the contents of the clipboard change or the clipboard is emptied." Returns 0 if no `WINSTA_ACCESSCLIPBOARD`. "If clipboard rendering is delayed, the sequence number is not incremented until the changes are rendered." **Not a notification — do not poll in a tight loop** (OBS).
- Usage pattern for FlowSpeak: `seq0 = GetClipboardSequenceNumber()` before we touch it → we set our text (seq becomes `seq_ours`) → after paste, before restore, read `seq_now`; if `seq_now != seq_ours` a clipboard manager (Ditto/ClipboardFusion/Win+V) or the target app grabbed/changed the clipboard mid-flight → still restore the user's ORIGINAL saved snapshot (so the transient dictation doesn't stick), but skip the changeCount-guard optimization. (This is the direct Windows analog of macOS `NSPasteboard.changeCount`; OpenSuperWhisper's changeCount-guarded restore, OBS from oss-clones.)
- Alternative to polling for "paste finished": `AddClipboardFormatListener(hwnd)` → `WM_CLIPBOARDUPDATE` posts on every change (OBS) — cleaner than sleeping, lets you restore exactly after the target consumed the paste. (Vista+.)

**Clipboard history / cloud-clipboard (Win+V) exclusion — mark dictation sensitive (OBS, high value):**
Register these format names with `RegisterClipboardFormat` and add them when you SetClipboardData:
- **`"ExcludeClipboardContentFromMonitorProcessing"`** — "Place ANY data on the clipboard in this format to prevent ALL clipboard formats being included in the clipboard history OR synchronized to the user's other devices." (Strongest; one dummy byte suffices.)
- **`"CanIncludeInClipboardHistory"`** — serialized `DWORD` = 0 → exclude from Win+V history; = 1 → force include. "Does not affect synchronization to other devices."
- **`"CanUploadToCloudClipboard"`** — serialized `DWORD` = 0 → block cloud sync; = 1 → force sync. "Does not affect the local device's clipboard history."
- These are exactly what Windows Credential Manager and password managers use (OBS). FlowSpeak should set the exclusion flags on the transient dictation so a user's spoken text never lands in Win+V history / Cloud Clipboard — a privacy win Wispr-clones generally miss. (This is the Windows analog of "mark pasteboard as `org.nspasteboard.ConcealedType` / transient" on macOS.)

**Timing / delays (OBS + INF):**
- `SendInput` is asynchronous — the call returns before the target processes the WM_PASTE (OBS from AHK "Paste and restore clipboard pitfall": "For some heavy consuming applications (Outlook, Teams) the clipboard will be restored before the real pasting"). If you restore too soon, the target pastes the RESTORED (old) content → the #1 clipboard-race bug (OpenSuperWhisper #129/#120/#153 pasted the *previous* transcription, OBS).
- Robust delay ladder (INF, community consensus): ~30–80 ms after `SetClipboardData` before firing Ctrl+V (let clipboard settle); then wait for paste to be consumed before restoring — either (best) a `WM_CLIPBOARDUPDATE`/seqnum check, or a fixed ~150–400 ms (heavy apps need the high end). VoiceInk uses ~100 ms pre-paste and ≥250 ms restore on macOS (OBS); OpenSuperWhisper uses 1500 ms restore (OBS) — Windows should be dynamic (seqnum) not a fixed huge sleep.

---

### (b) UI AUTOMATION INSERTION (analog of AX `kAXValue`/`kAXSelectedText`)

**Getting the focused element (OBS):**
- Native COM (what a Rust/Tauri or C++ helper uses): `CoCreateInstance(CLSID_CUIAutomation, ..., IID_IUIAutomation, &pAutomation)` → `pAutomation->GetFocusedElement(&pElement)`. Returns `IUIAutomationElement*`. **Returns `UIA_E_ELEMENTNOTAVAILABLE` if focus moved by the time it returns — "Clients should handle errors gracefully; for example, by trying the call again."** (OBS) — so retry once.
- Get pattern: `pElement->GetCurrentPattern(UIA_ValuePatternId, &pUnk)` → QI `IUIAutomationValuePattern` → `SetValue(BSTR)`. For reading: `IUIAutomationValuePattern::get_CurrentValue`, `get_CurrentIsReadOnly`.
- Properties via `GetCurrentPropertyValue(propId,&var)`: `UIA_ProcessIdPropertyId (30002)`, `UIA_ControlTypePropertyId (30003)`, `UIA_FrameworkIdPropertyId (30024)`, `UIA_IsEnabledPropertyId (30010)`, `UIA_IsKeyboardFocusablePropertyId (30009)`, `UIA_HasKeyboardFocusPropertyId (30008)`, `UIA_IsPasswordPropertyId (30019)`, `UIA_NativeWindowHandlePropertyId (30020)`, `UIA_ClassNamePropertyId (30012)`.

**`ValuePattern.SetValue` — the clean insert, but with hard limits (OBS):**
- .NET reference flow (OBS, MS "Add Content to a Text Box Using UI Automation"): check `IsEnabled` (else throw "not enabled"); check `IsKeyboardFocusable` (else "read-only"); `TryGetCurrentPattern(ValuePattern.Pattern)`; if supported → `element.SetFocus()` then `((ValuePattern)vp).SetValue(value)`; else fall back to `SendKeys.SendWait` (`^{HOME}`, `^+{END}`, `{DEL}`, then value).
- **Verbatim critical caveat (OBS):** *"Elements that support TextPattern do not support ValuePattern and TextPattern does not support setting the text of multi-line edit or document controls."* ⇒ **`ValuePattern.SetValue` REPLACES the entire field content** (not insert-at-caret) and is unavailable on multiline/rich/document controls. For dictation-at-caret you must: read `CurrentValue` + caret index (from TextPattern selection or `EM_GETSEL`), splice, then `SetValue(whole)` — or just use paste. So SetValue is only ergonomic for empty/simple single-line fields.
- **SSetValue fires as one programmatic set — no per-character `WM_CHAR`/JS `input` events.** In Chromium/Electron and many web fields this means the text appears but the app's own logic (React onChange, send-button enable, autocomplete) never fires → looks inserted but "doesn't take." (INF, well-documented UIA-on-web limitation.) Verify by re-reading value AND prefer paste for `FrameworkId=="Chrome"`.

**Framework support matrix (OBS FrameworkId values + INF behavior):**
| Framework (`UIA_FrameworkIdPropertyId`) | ValuePattern.SetValue | TextPattern read | Notes |
|---|---|---|---|
| Win32 `Edit` (single-line) `"Win32"` | Yes (replaces all) | partial | classic Edit control; `ES_MULTILINE` still exposes ValuePattern but replace-all |
| WinForms `"WinForm"` TextBox | Yes | yes | reliable |
| WPF `"WPF"` TextBox | Yes | yes | RichTextBox = TextPattern only, **no** SetValue |
| WinUI3 / UWP XAML `"XAML"` TextBox | Yes | yes | works cross-process (AppContainer brokered) |
| DirectUI `"DirectUI"` | varies | varies | Office/Explorer legacy; often no ValuePattern |
| Chromium/Electron `"Chrome"` | **unreliable** (S_OK but no JS event, or replace-all) | contenteditable read-only | **use paste** |
| Terminals (conhost/Windows Terminal) | **No** ValuePattern for buffer | may read visible text | **use paste/keys** |
| Java/Swing/SWT | usually **No** UIA | no | paste/keys only |

**Reading surrounding text for context (analog of reading kAXValue for LLM tone) (OBS/INF):**
- `TextPattern` (`UIA_TextPatternId`): `GetCurrentPattern(UIA_TextPatternId)` → `IUIAutomationTextPattern` → `GetSelection()` (caret/selection as `IUIAutomationTextRangeArray`), `get_DocumentRange()` (whole doc range), `RangeFromPoint`, `RangeFromChild`. `IUIAutomationTextRange::GetText(maxLength)` reads text; `ExpandToEnclosingUnit`, `Move`, `MoveEndpointByUnit` to grab N chars around caret. **TextPattern is read-oriented; it does not set text** — the exact Windows analog of using AX read-only to read `kAXStringForRangeParameterizedAttribute` for ~200 chars around the caret. (TextPattern how-to page 404'd this session; the read-only nature is confirmed OBS by the ValuePattern caveat above.)
- Simpler read: `ValuePattern.CurrentValue` = whole field text (like `kAXValueAttribute`).
- Caret rectangle (for pill positioning): `GetGUIThreadInfo(...).rcCaret` (see (e)).
- Do UIA/GUIThreadInfo reads OFF the UI thread with a timeout — synchronous cross-process UIA can block for seconds on some apps (VoiceInk #831 macOS analog; INF strongly applies to Windows UIA too).

---

### (c) `SendInput` KEYEVENTF_UNICODE CHARACTER TYPING (analog of `keyboardSetUnicodeString`)

**KEYBDINPUT struct + flags (OBS verbatim):**
```c
typedef struct tagKEYBDINPUT { WORD wVk; WORD wScan; DWORD dwFlags; DWORD time; ULONG_PTR dwExtraInfo; } KEYBDINPUT;
```
Flags: `KEYEVENTF_EXTENDEDKEY 0x0001`, `KEYEVENTF_KEYUP 0x0002`, `KEYEVENTF_UNICODE 0x0004`, `KEYEVENTF_SCANCODE 0x0008`.
- For Unicode char: **`wVk` MUST be 0**, `wScan` = the UTF-16 code unit, `dwFlags = KEYEVENTF_UNICODE` (only combinable with `KEYEVENTF_KEYUP`).
- **Verbatim remark (OBS):** "If KEYEVENTF_UNICODE is specified, SendInput sends a WM_KEYDOWN or WM_KEYUP message to the foreground thread's message queue with wParam equal to VK_PACKET. Once GetMessage or PeekMessage obtains this message, passing the message to TranslateMessage posts a WM_CHAR message with the Unicode character originally specified by wScan. This Unicode character will automatically be converted to the appropriate ANSI value if it is posted to an ANSI window."

**Surrogate-pair handling (OBS from enigo source):**
- enigo `text()` (MIT/Apache): for each `char`, `character.encode_utf16(&mut buffer)` → for EACH resulting UTF-16 code unit push `KEYBDINPUT{ dwFlags: KEYEVENTF_UNICODE, wVk: 0, wScan: utf16_unit, dwExtraInfo }`. Astral chars/emoji (>U+FFFF) = high surrogate + low surrogate → **two** INPUT events sent sequentially (correct). Keyup uses `KEYEVENTF_UNICODE | KEYEVENTF_KEYUP`. → 2 INPUTs (down+up) per BMP unit, 4 per astral char.
- enigo does **not** use `VK_PACKET` explicitly (the OS synthesizes it). (OBS)
- **`dwExtraInfo` marker:** enigo sets `dwExtraInfo = EVENT_MARKER` (a magic constant) on every synthetic event (OBS: `dw_extra_info.unwrap_or(crate::EVENT_MARKER as usize)`). **FlowSpeak must do the same** — tag every injected event with a private `dwExtraInfo` magic so its OWN global low-level keyboard hook (`WH_KEYBOARD_LL`, used for the push-to-talk hotkey) can `if (info->dwExtraInfo == OUR_MARKER) return CallNextHookEx(...)` and ignore its own injection → prevents feedback loops (the Windows analog of the macOS CGEventTap self-event problem).
- Combos (enigo `key()`): VK → scancode via `MapVirtualKey(vk, MAPVK_VK_TO_VSC_EX)`, add `KEYEVENTF_EXTENDEDKEY` for nav cluster/right-side modifiers (OBS). This is the KEYEVENTF_SCANCODE path — more robust for games/apps that read scancodes than the VK path.

**Speed / batching (OBS/INF):** char-by-char is slow; batch the whole string's INPUT array into a SINGLE `SendInput(n, arr, sizeof(INPUT))` for speed + atomicity. For very long text apply **chunked paste/typing** (VoiceInk #761 lesson, OBS): chunk sizes 250/500/750/1000, default 250, split on whitespace/newline — "mirrors the behavior Wispr Flow documents for Claude Code." Applies to Windows terminal AI agents too.

**Where KEYEVENTF_UNICODE FAILS (OBS + INF):**
- **Windows Terminal / ConHost pre-v1.16 (OBS, microsoft/terminal #12977):** `SendInput` VK_PACKET/KEYEVENTF_UNICODE emitted WRONG characters — 🙁 came out as `翿翿`, PowerShell showed `??`. Fixed in Terminal v1.16 (Resolution-Fix-Committed, ~2022). Older/legacy conhost still mangles astral/emoji typed this way → prefer paste into terminals.
- **Keycode-translating apps ignore the Unicode** (INF/known, same class as the macOS "frameworks may do their own translation based on virtual keycode" caveat): full-screen games using DirectInput/RawInput (`WM_INPUT`), some Remote Desktop / RDP remoting (keycode-based; VoiceInk #758 macOS analog), some Java/SWT widgets.
- **IME composition active** (INF): injecting KEYEVENTF_UNICODE while a CJK/IME composition window is open corrupts the composition buffer; don't type into an active IME. Detect via `ImmGetContext`/`ImmGetCompositionString` (GCS_COMPSTR) on the focus HWND, or just prefer paste when an IME is engaged.
- **Elevated windows** — blocked by UIPI exactly like paste (see (d)).

---

### (d) PER-APP QUIRKS

**Windows Terminal / ConHost (OBS + INF):**
- Ctrl+V works in modern Windows Terminal; **legacy conhost** may have Ctrl+V disabled (QuickEdit mode / "Use Ctrl+Shift+C/V as Copy/Paste" console option). **Shift+Insert** (`VK_INSERT 0x2D` with Shift) is the widest-compatible terminal paste; **Ctrl+Shift+V** is the modern terminal paste. Handy ships all three (`Ctrl+V`, `Ctrl+Shift+V`, `Shift+Insert`) as ordered strategies (OBS, input.rs).
- **Bracketed paste mode** (INF/known, xterm `DECSET ?2004h`): Windows Terminal + PSReadLine/bash wrap pasted text in `ESC[200~ … ESC[201~` so multiline paste is treated as literal text, not executed line-by-line. Good for us (no accidental command execution). But **Windows Terminal shows a multi-line paste warning dialog** by default (`multiLinesWarning`) and a control-char paste warning — these modal warnings can swallow/delay the injection; a per-app note to the user, or preferring typed injection, may be needed.

**Elevated / admin apps — UIPI (OBS, load-bearing):**
- **Verbatim (OBS, SendInput remarks):** *"This function is subject to UIPI. Applications are permitted to inject input only into applications that are at an equal or lesser integrity level."* And: *"This function fails when it is blocked by UIPI. Note that neither GetLastError nor the return value will indicate the failure was caused by UIPI blocking."*
- So a Medium-IL FlowSpeak injecting into a High-IL (elevated) window (elevated cmd, RegEdit, an app "Run as administrator") → SendInput does nothing, silently, with no error signal. `SetForegroundWindow` into it is also blocked; window messages below WM_USER are filtered by the message filter.
- **Detection:** `GetForegroundWindow` → pid → `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` → `GetTokenInformation(TokenIntegrityLevel)` (compare SID RID: `SECURITY_MANDATORY_HIGH_RID 0x3000` vs our `MEDIUM 0x2000`). If target IL > our IL → decline with toast: "This app is running as administrator; FlowSpeak can't type into it. Run FlowSpeak as administrator to dictate here." (INF)
- **Options to actually support elevated targets** (INF/known): (1) run FlowSpeak elevated (bad UX, every launch UAC); (2) ship a **uiAccess build** — manifest `<requestedExecutionLevel level="asInvoker" uiAccess="true"/>`, Authenticode-signed, installed under `%ProgramFiles%` (a "secure location") → the process is granted UIPI bypass to drive higher-IL windows and set foreground (this is exactly how screen readers / AT tools work). Cost: code-signing cert + install-location constraint + can't be a per-user install. Recommend offering uiAccess as an optional installer mode.

**UWP / packaged / sandboxed apps (INF/known):** run in AppContainer. UIA works cross-process (ValuePattern on XAML TextBox works). Clipboard paste works (clipboard is brokered). **Gotcha for app-ID detection:** `GetForegroundWindow` returns the `ApplicationFrameHost.exe` host window (`ApplicationFrameWindow` class), not the real app — the real CoreWindow child has a different PID. Enumerate children to find the child HWND whose PID ≠ ApplicationFrameHost, or read the window's `PKEY_AppUserModel_ID` (see (e)).

**Games with raw input (INF/known):** full-screen exclusive / RawInput games often ignore `SendInput` synthetic events (they read hardware scancodes and/or filter the `LLKHF_INJECTED` flag). Both paste and typing unreliable → decline/warn. Scancode path (`KEYEVENTF_SCANCODE`) helps some but not exclusive-mode DirectInput.

**RDP / remote sessions (INF, OBS-adjacent):** the RDP client is one local window rendering a remote desktop; local UIA can't see remote controls (`GetFocusedElement` returns the RDP client, no useful text pattern). Only paste/keystroke into the RDP window works, and KEYEVENTF_UNICODE may be re-translated remotely by keycode (VoiceInk #758 "Direct-Typing fails in Remote Desktop", OBS). **Clipboard redirection** (default-on in RDP) makes Ctrl+V the safest path into a remote app. Recommend clipboard paste for RDP.

**Password fields — detect and DECLINE (OBS):**
- `UIA_IsPasswordPropertyId (30019)`, VT_BOOL. **Verbatim (OBS):** "indicates whether the automation element contains protected content or a password. When the IsPassword property is TRUE and the element has the keyboard focus, a client application should disable keyboard echoing or keyboard input feedback that may expose the user's protected information. **Attempting to access the Value property of the protected element (edit control) may cause an error to occur.**"
- Classic Win32 secondary check: `GetWindowLongPtr(hwndFocus, GWL_STYLE) & ES_PASSWORD (0x0020)` on an `Edit`-class control; also `SendMessage(hwnd, EM_GETPASSWORDCHAR)` ≠ 0.
- FlowSpeak policy: if `IsPassword==TRUE` → **decline both paste and typing**, toast "FlowSpeak won't dictate into password fields." (First-party design; the Windows analog of the unimplemented macOS `IsSecureEventInputEnabled` handling — and Windows gives a cleaner per-element signal than macOS.)

---

### (e) FOCUSED-APP / FOCUSED-FIELD DETECTION → app id for per-app tone mapping

**Foreground window + owning process (OBS):**
- `HWND GetForegroundWindow()` — "can be NULL in certain circumstances, such as when a window is losing activation" (OBS) → handle NULL, retry.
- `DWORD GetWindowThreadProcessId(hwnd, &pid)` → thread id (return) + process id (out). exe path: `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid)` → `QueryFullProcessImageNameW` → basename = app id for tone map (e.g. `WindowsTerminal.exe`/`cmd.exe`/`powershell.exe`→"code, verbatim"; `slack.exe`→"casual"; `olk.exe`/`OUTLOOK.EXE`→"formal email"). (INF mapping.)

**Focused CONTROL + caret across processes (OBS):**
- `GetGUIThreadInfo(idThread, &GUITHREADINFO)` — set `cbSize=sizeof(GUITHREADINFO)` first. Fields: `hwndActive`, **`hwndFocus`** (the focused control HWND), `hwndCaret`, **`rcCaret`** (caret rectangle). "Succeeds even if the active window is not owned by the calling process" (OBS) — no `AttachThreadInput` needed, unlike `GetFocus`. Pass `idThread=0` for the foreground thread. Caveats (OBS): may return invalid handles "when a window is losing activation"; for edit controls `rcCaret` "contains the caret plus information on text direction and padding… may not give the correct position of the cursor" (needs GetKeyboardLayout + font-metric correction to get exact insertion point); `rcCaret` is logical coords of the caret's window, NOT DPI-virtualized to caller — must DPI-convert for pill placement.

**UIA focus (event-driven, cross-framework) (OBS):**
- `IUIAutomation::GetFocusedElement()` (polling) or `AddFocusChangedEventListener` (push). The UIA route sees UWP/Electron/WPF focus that Win32 `GetGUIThreadInfo` can miss, and gives `UIA_ProcessIdPropertyId` directly. Tradeoff: UIA focus-changed events are heavier and can lag; `GetForegroundWindow`+`GetGUIThreadInfo` is cheap and synchronous. **Recommended hybrid:** cheap Win32 (`GetForegroundWindow`/`GetGUIThreadInfo`) for app-id + caret; UIA `GetFocusedElement` only when we actually need the element's patterns/role/IsPassword. (Mirrors the Mac "NSWorkspace frontmost + AX focused element" split.)

**AppUserModelID for packaged/UWP + taskbar identity (INF/known — not re-fetched):**
- For UWP/packaged apps use the AUMID, not exe: `SHGetPropertyStoreForWindow(hwnd, IID_IPropertyStore, ...)` → read `PKEY_AppUserModel_ID`; or `GetApplicationUserModelId`/`GetPackageFullName` from a process handle (appmodel.h). Map AUMID → tone (e.g. `Microsoft.WindowsTerminal_8wekyb3d8bbwe!App`). `IApplicationActivationManager::ActivateApplication(appUserModelId, ...)` (OBS, shobjidl_core) is the launch side; retrieval is via the property store — verify exact API in implementation.

---

### (f) WHAT EXISTING TOOLS DO (source links)

**Handy (cjpais/Handy, Tauri v2 + Rust, MIT) — the key dual-platform reference (OBS, `src-tauri/src/input.rs`):**
- Uses the **`enigo`** crate (MIT OR Apache-2.0) wrapped in Tauri managed state. Four ordered strategies, each `cfg`-gated per OS:
  - **Ctrl+V:** `#[cfg(windows)] let (modifier_key, v_key_code) = (Key::Control, Key::Other(0x56));`
  - **Ctrl+Shift+V** (terminal-formatted paste)
  - **Shift+Insert:** `#[cfg(windows)] let insert_key_code = Key::Other(0x2D);` (legacy/terminal)
  - **Direct Unicode typing:** `enigo.text(text)`
- Sequence: modifier press → key click → `sleep(100ms)` → modifier release. **No explicit clipboard save/restore in input.rs** — relies on the OS paste mechanism (i.e., Handy leaves the transcript on the clipboard; a gap FlowSpeak should close with save/restore + history-exclusion). (OBS)
- Linux path: detects `xdotool` (X11) / `wtype`/`dotool` (Wayland), falls back to enigo. **Handy #1661 (OBS):** Wayland enigo `direct` injection silently dropped every capital letter (Shift-over-XTEST bug) — lesson: **verify casing survives your typing path; keep clipboard-paste as default, per-char typing as fallback.**

**enigo (enigo-rs/enigo, MIT/Apache) — Windows internals (OBS, `src/win/win_impl.rs`):**
- `text()`: `char.encode_utf16(&mut buffer)` → per UTF-16 unit `keybd_event(KEYEVENTF_UNICODE, VIRTUAL_KEY(0), utf16_unit, self.dw_extra_info)`; surrogate pairs → two sequential INPUTs. `dw_extra_info = EVENT_MARKER` magic to tag synthetic events. Does NOT use VK_PACKET directly.
- `key()`: `MapVirtualKey(vk, MAPVK_VK_TO_VSC_EX)` for scancode, `KEYEVENTF_EXTENDEDKEY` for extended keys. Built on the Microsoft `windows` crate `SendInput`.

**.NET UI Automation sample (OBS, MS Learn):** `TryGetCurrentPattern(ValuePattern.Pattern)` → `SetValue` else `SendKeys.SendWait` fallback (`^{HOME}` `^+{END}` `{DEL}` value). Encodes the ValuePattern-else-keystrokes ladder we mirror.

**Talon Voice (Windows) (INF/known — NOT re-fetched, WebSearch budget exhausted; flagged open):** documented behavior is a hybrid — `key()` actions synthesize via SendInput (scancode-based, `KEYEVENTF_SCANCODE`, for game/app compatibility); long text output (`insert`) uses clipboard paste for speed with clipboard save/restore, configurable to per-key. Talon is closed-source so this is from docs/community, not a source read.

**VoiceInk / OpenSuperWhisper (macOS, OBS from local oss-clones.md):** clipboard-paste + `changeCount`-guarded restore is the dominant pattern; VoiceInk #761 chunked-paste (250/500/750/1000) for terminal AI agents; #758 direct-typing fails in RDP; #803 target-resolved-too-early. All map directly onto the Windows design.

---

### RECOMMENDED WINDOWS INSERTION LADDER (detailed, with failure detection at each rung)

**Stack note (INF):** one dual-platform codebase (Tauri v2 + Rust preferred per project direction). Windows crates: Microsoft **`windows`** (MIT/Apache) for Win32 SendInput + clipboard + `IUIAutomation` COM; **`uiautomation`** (leexgone/uiautomation-rs, Apache-2.0) as an ergonomic UIA wrapper; roll clipboard save/restore + history-exclusion formats by hand via `windows` (the `arboard`/`tauri-plugin-clipboard-manager` crates lack seqnum guard + the privacy formats). Reuse **`enigo`** only for the typing fallback; do the paste + clipboard save/restore + guards yourself.

**Step 0 — Resolve & lock target.** At record-start capture `GetForegroundWindow` → pid/tid + `GetGUIThreadInfo.hwndFocus` + (lazy) `GetFocusedElement`. Re-resolve at delivery (VoiceInk #803). If foreground HWND changed and user opted in, re-target; else inject to the record-start window.

**Step 1 — Guards (decline early):**
- Password: `UIA_IsPasswordPropertyId==TRUE` OR `ES_PASSWORD` style → **Rung D** (decline, don't even put plaintext on clipboard for password fields → drop or toast only).
- Elevated: target IL > our IL (`GetTokenInformation TokenIntegrityLevel`) and we're not uiAccess/elevated → **Rung D** + "run as admin" toast.
- Game/raw-input or known-bad exe in override table → skip to Rung C or D per table.

**Step 2 — Rung A: UIA `ValuePattern.SetValue`** (only if: element supports `UIA_ValuePatternId`, `IsEnabled==TRUE`, `ValuePattern.CurrentIsReadOnly==FALSE`, single-line/simple value control, `FrameworkId` ∈ {Win32, WinForm, WPF, XAML} — NOT "Chrome"/terminal). To insert-at-caret: read `CurrentValue` + selection (TextPattern `GetSelection`), splice, `SetValue(whole)`. **Failure detection:** SetValue HRESULT ≠ S_OK, OR re-read `CurrentValue` ≠ expected (catches Chromium silent-noop) → fall to Rung B. Skip Rung A entirely for empty caret-insert into rich/multiline (SetValue can't).

**Step 3 — Rung B: Clipboard paste (PRIMARY).**
1. `seq0 = GetClipboardSequenceNumber()`; snapshot existing formats (CF_UNICODETEXT/CF_HTML/CF_RTF/CF_DIB) into memory.
2. `OpenClipboard(myHwnd)`→`EmptyClipboard()`→`SetClipboardData(CF_UNICODETEXT, GlobalAlloc copy)`→ set `"ExcludeClipboardContentFromMonitorProcessing"` (+ `CanIncludeInClipboardHistory`=0, `CanUploadToCloudClipboard`=0)→`CloseClipboard()`. Record `seq_ours`.
3. Clear stuck modifiers (`GetAsyncKeyState` for Ctrl/Shift/Win/Alt from the held hotkey → synthesize key-ups with our `dwExtraInfo` marker).
4. `SendInput` Ctrl+V (or Ctrl+Shift+V / Shift+Insert if target is a terminal by class/exe), all INPUTs one call, each tagged `dwExtraInfo=OUR_MARKER`.
5. Wait for consumption: register `AddClipboardFormatListener` OR poll `GetClipboardSequenceNumber` with a short cap (~80–400 ms, longer for Outlook/Teams). 
6. Restore: re-set the saved snapshot. If `GetClipboardSequenceNumber` between our set and now shows a 3rd-party change (≠ seq_ours) → a clipboard manager raced; still restore user's original.
- **Failure detection:** `SendInput` return < #inputs (0 ⇒ blocked by UIPI/another thread — but note UIPI won't flag via GetLastError). Optionally verify via UIA value/selection delta or `GetGUIThreadInfo.rcCaret` movement. On failure → Rung C. Apply **chunked paste** (default 250 chars, whitespace-split) for terminal AI agents / very long text (#761).

**Step 4 — Rung C: `SendInput` KEYEVENTF_UNICODE typing.** Surrogate-aware UTF-16, whole string batched into one `SendInput` (chunk if long), `dwExtraInfo=OUR_MARKER`. Use when paste is swallowed (terminal warnings, clipboard-locked, no clipboard access) or app honors WM_CHAR but not paste. Skip if IME composition active (`ImmGetCompositionString`). **Failure detection:** return count < expected (blocked) → Rung D. Emoji into legacy conhost (<Terminal 1.16) known-broken → prefer paste there.

**Step 5 — Rung D: decline gracefully.** Leave dictation on clipboard (with exclusion flags per policy) + toast "Dictation copied — press Ctrl+V to paste." Log the app id so the per-app override table learns. (Direct analog of the Mac secure-field fallback.)

**Cross-cutting:**
- Overlay pill must NOT steal focus: create with `WS_EX_NOACTIVATE (0x08000000)` + `WS_EX_TOOLWINDOW` (Windows analog of macOS `.nonactivatingPanel`); if focus was lost, `AllowSetForegroundWindow`/`SetForegroundWindow` the target before injecting.
- Tag ALL synthetic input with a private `dwExtraInfo` magic and have the `WH_KEYBOARD_LL` push-to-talk hook ignore it (self-event loop prevention — the Windows CGEventTap analog).
- Do UIA / GetGUIThreadInfo reads off the UI thread with timeouts (cross-process UIA can hang).
- Per-app override table keyed by exe basename + AUMID: {preferred rung, terminal-paste variant, decline}.

---

### QUICK CONSTANT / VALUE REFERENCE (OBS unless noted)
- Flags: `KEYEVENTF_EXTENDEDKEY 0x0001`, `KEYEVENTF_KEYUP 0x0002`, `KEYEVENTF_UNICODE 0x0004`, `KEYEVENTF_SCANCODE 0x0008`.
- VKs: `VK_CONTROL 0x11`, `VK_LCONTROL 0xA2`, `VK_SHIFT 0x10`, `VK_MENU 0x12`, `VK_INSERT 0x2D`, `'V' 0x56`, `VK_LWIN 0x5B`, `VK_PACKET 0xE7`.
- Clipboard: `CF_UNICODETEXT 13`, `CF_TEXT 1`, `CF_OEMTEXT 7`, `CF_HTML`/`CF_RTF` = registered. Privacy formats (RegisterClipboardFormat): `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory` (DWORD 0/1), `CanUploadToCloudClipboard` (DWORD 0/1).
- UIA prop ids: `ValuePatternId`, `TextPatternId`; `UIA_ProcessIdPropertyId 30002`, `UIA_ControlTypePropertyId 30003`, `UIA_HasKeyboardFocusPropertyId 30008`, `UIA_IsKeyboardFocusablePropertyId 30009`, `UIA_IsEnabledPropertyId 30010`, `UIA_ClassNamePropertyId 30012`, `UIA_IsPasswordPropertyId 30019`, `UIA_NativeWindowHandlePropertyId 30020`, `UIA_FrameworkIdPropertyId 30024`.
- Integrity RIDs: MEDIUM `0x2000`, HIGH `0x3000`, SYSTEM `0x4000`.
- Edit style: `ES_PASSWORD 0x0020`, `ES_MULTILINE 0x0004`.
- Crates/licenses: `enigo` MIT/Apache-2.0 (uses `windows` crate SendInput), `windows` (Microsoft) MIT/Apache, `uiautomation` Apache-2.0, Handy MIT, Tauri v2 MIT/Apache.
- Windows Terminal Unicode-injection bug fixed **v1.16** (OBS #12977).

## Open questions
- Talon's exact Windows text-injection internals (SendInput scancode vs clipboard-paste, save/restore behavior) could not be confirmed from a primary source this session (WebSearch budget exhausted, Talon is closed-source); marked INF/known.
- Windows Terminal bracketed-paste (DECSET 2004) and the multi-line/control-char paste warning dialogs behavior stated INF/known — not re-fetched from a primary WT doc/issue this session.
- Exact API to retrieve AppUserModelID from a foreground/packaged window (SHGetPropertyStoreForWindow + PKEY_AppUserModel_ID vs GetApplicationUserModelId from a process handle) needs confirmation from appmodel.h / propkey docs during implementation.
- IUIAutomationTextPattern how-to page (uiauto-supporttextandtextrangepatterns) 404'd; the read-only nature of TextPattern is confirmed indirectly (ValuePattern/TextPattern mutual-exclusion note) but the exact GetSelection/DocumentRange/GetText usage for reading N chars around the caret should be verified against the live UIAutomationClient.h docs.
- Whether a uiAccess=true signed build (to reach elevated windows) is acceptable for FlowSpeak's distribution model (needs Authenticode cert + %ProgramFiles% install + can't be per-user) is a product/packaging decision.
- enigo's exact current version and whether its text() batches all INPUTs into a single SendInput call or one-per-codeunit (affects speed) — the win_impl.rs excerpt showed a per-unit push into an input_queue but the flush granularity should be confirmed.
- Real-hardware verification pending: all injection timing values (pre-paste settle, restore delay per heavy app like Outlook/Teams) are community/INF and must be tuned on the real Windows test machine.

## Sources
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-keybdinput
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
- https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats
- https://learn.microsoft.com/en-us/windows/win32/dataxchg/using-the-clipboard
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclipboardsequencenumber
- https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/add-content-to-a-text-box-using-ui-automation
- https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-automation-element-propids
- https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomation-getfocusedelement
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getguithreadinfo
- https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-iapplicationactivationmanager-activateapplication
- https://github.com/microsoft/terminal/issues/12977
- https://raw.githubusercontent.com/cjpais/Handy/main/src-tauri/src/input.rs
- https://raw.githubusercontent.com/enigo-rs/enigo/master/src/win/win_impl.rs
- https://github.com/cjpais/Handy
- https://github.com/cjpais/Handy/issues/1661
- https://batchloaf.wordpress.com/2014/10/02/using-sendinput-to-type-unicode-characters/
- https://tdalon.blogspot.com/2021/04/ahk-paste-restore-clipboard-pitfall.html
- https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats (Cloud Clipboard and Clipboard History Formats section)
- local: /Users/mannbellani/FlowSpeak/docs/research/oss-clones.md (Handy input.rs teardown, VoiceInk #761 chunked paste, #758 RDP, #803 target-resolution)
- local: /Users/mannbellani/FlowSpeak/docs/research/macos-architecture.md (Mac ladder to mirror)
