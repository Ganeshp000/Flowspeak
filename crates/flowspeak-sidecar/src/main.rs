//! FlowSpeak sidecar — basic Fn (Globe) key detector for macOS.
//!
//! This is the first, deliberately minimal cut of the native hotkey hook: it
//! installs a *listen-only* CoreGraphics event tap on flagsChanged events and
//! reports when the Fn / Globe key is pressed and released. Listen-only means it
//! does not suppress the key (so the system Globe action still fires during the
//! test); the production hook will use a consuming tap to swallow the bare-Fn
//! action. The point of this build is to validate, on real hardware, that we can
//! globally observe the Fn key at all — everything downstream depends on it.
//!
//! It auto-exits with success after 3 Fn presses, or times out after 60s.
//!
//! macOS-only demo; other platforms get a stub `main` so the workspace still
//! builds (see `win.rs`/`hotkey.rs` for the real Windows push-to-talk hook).

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("[flowspeak-sidecar] this standalone Fn-key demo is macOS-only; nothing to do here.");
}

#[cfg(target_os = "macos")]
mod imp {
#![allow(dead_code)]

use std::io::Write;
use std::os::raw::c_void;
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, Ordering};
use std::time::Instant;

// --- CoreFoundation / CoreGraphics opaque handles -------------------------
type CFMachPortRef = *mut c_void;
type CFRunLoopSourceRef = *mut c_void;
type CFRunLoopRef = *mut c_void;
type CFStringRef = *const c_void;
type CFAllocatorRef = *const c_void;
type CGEventRef = *mut c_void;
type CGEventTapProxy = *mut c_void;

type CGEventTapCallBack =
    extern "C" fn(CGEventTapProxy, u32, CGEventRef, *mut c_void) -> CGEventRef;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: u64,
        callback: CGEventTapCallBack,
        user_info: *mut c_void,
    ) -> CFMachPortRef;
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    fn CGEventGetFlags(event: CGEventRef) -> u64;
    fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFMachPortCreateRunLoopSource(
        allocator: CFAllocatorRef,
        port: CFMachPortRef,
        order: isize,
    ) -> CFRunLoopSourceRef;
    fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
    fn CFRunLoopRunInMode(mode: CFStringRef, seconds: f64, return_after_source_handled: bool) -> i32;
    static kCFRunLoopDefaultMode: CFStringRef;
}

// --- constants ------------------------------------------------------------
const K_CG_SESSION_EVENT_TAP: u32 = 1; // kCGSessionEventTap
const K_CG_HEAD_INSERT: u32 = 0; // kCGHeadInsertEventTap
const K_CG_TAP_OPTION_LISTEN_ONLY: u32 = 1;
const K_CG_EVENT_FLAGS_CHANGED: u32 = 12;
const EVENTS_OF_INTEREST: u64 = 1 << K_CG_EVENT_FLAGS_CHANGED;
/// kCGEventFlagMaskSecondaryFn — set while the Fn/Globe key is held.
const FLAG_SECONDARY_FN: u64 = 0x0080_0000;
const K_CG_KEYBOARD_EVENT_KEYCODE: u32 = 9;
/// kVK_Function — the Fn/Globe key's virtual keycode.
const KEYCODE_FN: i64 = 63;
// Event types signalling the tap was disabled and must be re-enabled.
const K_CG_TAP_DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
const K_CG_TAP_DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;

static FN_DOWN_COUNT: AtomicU32 = AtomicU32::new(0);
static FN_IS_DOWN: AtomicBool = AtomicBool::new(false);
static TAP_PORT: AtomicPtr<c_void> = AtomicPtr::new(null_mut());

extern "C" fn tap_callback(
    _proxy: CGEventTapProxy,
    etype: u32,
    event: CGEventRef,
    _info: *mut c_void,
) -> CGEventRef {
    // The OS can disable a tap; re-enable it so we keep receiving events.
    if etype == K_CG_TAP_DISABLED_BY_TIMEOUT || etype == K_CG_TAP_DISABLED_BY_USER_INPUT {
        let port = TAP_PORT.load(Ordering::SeqCst);
        if !port.is_null() {
            unsafe { CGEventTapEnable(port, true) };
        }
        return event;
    }

    if etype == K_CG_EVENT_FLAGS_CHANGED {
        let keycode = unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) };
        if keycode == KEYCODE_FN {
            let flags = unsafe { CGEventGetFlags(event) };
            let down = (flags & FLAG_SECONDARY_FN) != 0;
            let was_down = FN_IS_DOWN.swap(down, Ordering::SeqCst);
            if down && !was_down {
                let n = FN_DOWN_COUNT.fetch_add(1, Ordering::SeqCst) + 1;
                println!("  Fn DOWN   (press #{n})");
            } else if !down && was_down {
                println!("  Fn UP");
            }
            let _ = std::io::stdout().flush();
        }
    }
    event
}

pub fn run() {
    println!("FlowSpeak — Fn (Globe) key detection test");
    println!("------------------------------------------");

    let port = unsafe {
        CGEventTapCreate(
            K_CG_SESSION_EVENT_TAP,
            K_CG_HEAD_INSERT,
            K_CG_TAP_OPTION_LISTEN_ONLY,
            EVENTS_OF_INTEREST,
            tap_callback,
            null_mut(),
        )
    };

    if port.is_null() {
        eprintln!("ERROR: could not start the key listener (permission not granted).");
        eprintln!();
        eprintln!("Grant Input Monitoring to the app you're running this from:");
        eprintln!("  System Settings → Privacy & Security → Input Monitoring");
        eprintln!("  → enable your terminal (Terminal / iTerm / the Claude Code host),");
        eprintln!("  then FULLY QUIT and reopen it, and run this again.");
        eprintln!("(If Input Monitoring doesn't work, try Accessibility in the same pane.)");
        std::process::exit(2);
    }

    TAP_PORT.store(port, Ordering::SeqCst);
    unsafe {
        let source = CFMachPortCreateRunLoopSource(null(), port, 0);
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopDefaultMode);
        CGEventTapEnable(port, true);
    }

    println!("Ready. Tap and release the Fn / Globe key (bottom-left) a few times.");
    println!("Passes automatically after 3 presses; times out after 60s. Ctrl-C to stop.");
    println!();

    let start = Instant::now();
    loop {
        unsafe { CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.25, false) };
        if FN_DOWN_COUNT.load(Ordering::SeqCst) >= 3 {
            println!();
            println!("TEST PASSED  — detected 3 Fn presses. The Fn key hook works on this machine.");
            std::process::exit(0);
        }
        if start.elapsed().as_secs() >= 60 {
            let n = FN_DOWN_COUNT.load(Ordering::SeqCst);
            println!();
            println!("TIMEOUT — only detected {n} Fn press(es) in 60s.");
            println!("If it was 0, the listener likely lacks Input Monitoring permission.");
            std::process::exit(1);
        }
    }
}

} // mod imp

#[cfg(target_os = "macos")]
fn main() {
    imp::run();
}
