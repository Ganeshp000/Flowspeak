import { useEffect, useRef, useState } from "react";
import { palette, geometry, font } from "../tokens/values";
import { liquidGlass } from "./liquid-glass";

// Visual states, mirroring the Rust `BarState`.
export type BarState =
  | "idle"
  | "recording"
  | "locked"
  | "transcribing"
  | "done"
  | "cancelled"
  | "error";

type StateEvent = { state: BarState };
type WaveformEvent = { bars: number[] };
// Mirrors `diag::ErrorDto` in src-tauri/src/diag.rs.
type ErrorEvent = { headline: string; detail: string };

async function tauriListen<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<T>(event, (e) => cb(e.payload as T));
  } catch {
    return () => {};
  }
}

// A row of dot-like rounded bars driven by mic RMS — Wispr's dotted-waveform look:
// small dots when quiet, rising into a waveform when speaking.
function DottedWaveform({ bars }: { bars: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barsRef = useRef<number[]>(bars);
  barsRef.current = bars;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const N = 16;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const dotW = 2.4;
      const gap = (w - N * dotW) / (N - 1);
      const t = performance.now();
      ctx.fillStyle = palette.waveBar;
      for (let i = 0; i < N; i++) {
        const real = barsRef.current[barsRef.current.length - 1 - (i % barsRef.current.length)];
        // Idle shimmer so the dotted line reads as "listening" even in near-silence.
        const shimmer = 0.12 + 0.06 * Math.abs(Math.sin(t / 260 + i * 0.7));
        const amp = Math.max(shimmer, real ?? 0);
        const bh = 3 + amp * 20; // 3px dot → up to ~23px bar
        const x = i * (dotW + gap);
        const y = (h - bh) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, dotW, bh, dotW / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} style={{ width: "100%", height: 28 }} />;
}

function CancelButton() {
  return (
    <div
      title="Cancel (Esc)"
      style={{
        flex: "0 0 auto",
        width: 26,
        height: 26,
        borderRadius: 9999,
        background: "rgba(255,255,255,0.16)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: 15,
        lineHeight: 1,
      }}
    >
      ✕
    </div>
  );
}

function StopButton() {
  return (
    <div
      title="Stop"
      style={{
        flex: "0 0 auto",
        width: 26,
        height: 26,
        borderRadius: 9999,
        background: "#FF5A52",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: 9, height: 9, borderRadius: 2, background: "#fff" }} />
    </div>
  );
}

export function FlowBar() {
  const [state, setState] = useState<BarState>("idle");
  const [bars, setBars] = useState<number[]>([]);
  // Set by `flowspeak://error`, shown while state === "error". Falls back to a
  // generic line if the error-state event somehow arrives without one (e.g.
  // an older build, or a future ShowBar(Error) call that doesn't go through
  // `diag::report`).
  const [errorText, setErrorText] = useState<ErrorEvent | null>(null);

  useEffect(() => {
    let un1: (() => void) | undefined;
    let un2: (() => void) | undefined;
    let un3: (() => void) | undefined;
    tauriListen<StateEvent>("flowspeak://flowbar/state", (p) => setState(p.state)).then((u) => (un1 = u));
    tauriListen<WaveformEvent>("flowspeak://audio/waveform", (p) => setBars(p.bars)).then((u) => (un2 = u));
    tauriListen<ErrorEvent>("flowspeak://error", (p) => setErrorText(p)).then((u) => (un3 = u));
    return () => {
      un1?.();
      un2?.();
      un3?.();
    };
  }, []);

  const pillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pillRef.current) return;
    const glass = liquidGlass(pillRef.current);
    return () => glass.destroy();
  }, []);

  const recording = state === "recording" || state === "locked";
  const isIdle = state === "idle";
  const processing = state === "transcribing";
  const isError = state === "error";
  const statusText =
    state === "transcribing"
      ? "Cleaning up…"
      : isError
        ? errorText?.headline ?? "Something's off"
        : state === "cancelled"
          ? "Discarded"
          : "Done";

  // Pill dimensions per state. Error gets extra width so the specific
  // headline (e.g. "Accessibility permission needed") isn't clipped —
  // truncating it back down to "Something's off" would defeat the point.
  const dims = isIdle
    ? { w: 76, h: 16 }
    : recording
      ? { w: 250, h: 44 }
      : isError
        ? { w: 280, h: 36 }
        : { w: 180, h: 36 };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font.ui,
        userSelect: "none",
      }}
    >
      <div
        ref={pillRef}
        aria-label={`FlowSpeak ${state}${isError && errorText ? `: ${errorText.detail}` : ""}`}
        title={isError ? errorText?.detail : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: recording ? "space-between" : "center",
          gap: 10,
          height: dims.h,
          width: dims.w,
          padding: recording ? "0 8px" : 0,
          background: "linear-gradient(180deg, rgba(14, 14, 22, 0.18), rgba(14, 14, 22, 0.32))",
          borderRadius: 9999,
          boxShadow: `
            0 24px 60px rgba(0, 0, 0, 0.45),
            inset 0 1px 1px rgba(255, 255, 255, 0.5),
            inset 0 -8px 20px rgba(255, 255, 255, 0.06),
            inset 0 0 0 1px rgba(255, 255, 255, 0.13)
          `,
          color: palette.pillText,
          transition: `width ${geometry.morphMs}ms ${motionEase}, height ${geometry.morphMs}ms ${motionEase}`,
          overflow: "hidden",
          fontSize: 13,
        }}
      >
        {isIdle ? null : recording ? (
          <>
            <CancelButton />
            <div style={{ flex: 1, minWidth: 0 }}>
              <DottedWaveform bars={bars} />
            </div>
            <StopButton />
          </>
        ) : processing ? (
          <span style={{ color: palette.pillTextMuted }}>{statusText}</span>
        ) : (
          <span style={{ color: palette.pillTextMuted }}>{statusText}</span>
        )}
      </div>
    </div>
  );
}

const motionEase = "cubic-bezier(0.05,0.6,0.4,0.95)";
