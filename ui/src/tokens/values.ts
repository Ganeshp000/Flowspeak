// FlowSpeak design tokens — "Deep-Slate / Aqua-FlowSpeak".
// Single source of truth, imported by CSS-in-TS and by the waveform canvas.
// Deliberately distinct from Wispr's trade dress (own hues, accent, fonts, strings).

export const palette = {
  // Cool near-black slate scale (our pill hue).
  slate950: "#0C0E12",
  slate900: "#111419",
  slate850: "#161A20",
  slate800: "#1C212A",
  slate700: "#28303B",
  slate600: "#3A4453",
  slate500: "#5A6675",
  slate400: "#8A93A3",
  slate300: "#B8C0CC",
  slate200: "#D9DEE6",
  slate100: "#EDF0F4",
  slate050: "#F7F9FB",

  // Cyan/teal accent.
  accent400: "#3FE0D0",
  accent500: "#22C3B6",
  accent600: "#12A99D",
  accentGlow: "rgba(58,232,216,0.45)",

  // Pale mint pill text + waveform bars.
  pillText: "#DAF3EA",
  pillTextMuted: "#8FB6AD",
  waveBar: "#CFF3EA",

  // Semantic.
  error: "#FF6B6B",
  warn: "#F5B454",
  info: "#5AA9FF",
  success: "#22C3B6",
} as const;

// Recolored status ring (teal → aqua → periwinkle → violet).
export const ringStops = ["#1FB6A8", "#43E6D6", "#57B0FF", "#9E86FF", "#43E6D6"] as const;

export const pillFill = {
  base: palette.slate900,
  raised: palette.slate850,
  border: "rgba(255,255,255,0.06)",
  shadow: "0 8px 28px rgba(0,0,0,0.55)",
} as const;

// Geometry, verbatim from the SPEC (logical px).
export const geometry = {
  morphMs: 420,
  idleBar: { w: 50, h: 30 },
  restNub: { w: 30, h: 6, r: 6 },
  miniPill: { w: 330, h: 32, r: 22.5 },
  card: { w: 380, h: 130, r: 24 },
  wave: { minBars: 5, maxBars: 7, minH: 8, maxH: 24 },
  border: 2,
  overlayWindow: { w: 440, h: 320 },
} as const;

export const motion = {
  ease: "cubic-bezier(0.05, 0.6, 0.4, 0.95)",
  springDurationS: 0.2,
} as const;

export const font = {
  ui: '"Inter", "Geist", system-ui, sans-serif',
  serif: '"Fraunces", "Newsreader", Georgia, serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;
