// Light "Hub" theme, layered on top of the shared design tokens. This governs
// only the desktop Hub window — the floating overlay pill stays on its own dark
// palette. We match Wispr's LIGHT Hub layout but with OUR teal accent + warm
// neutral surfaces (never Wispr's green).

import { palette } from "../tokens/values";

export const theme = {
  // Surfaces
  pageBg: "#F6F4EF", // warm light neutral page background
  sidebarBg: "#F1ECE3", // a touch deeper/warmer than the page
  cardBg: "#FFFFFF",
  cardBgSubtle: "#FBFAF7",
  track: "#ECE7DD", // segmented-control / gauge-track neutral
  hover: "#F1EDE5",

  // Borders
  border: "#E7E1D6",
  borderStrong: "#DAD3C6",

  // Text (dark slate on light)
  textStrong: palette.slate900,
  textBody: palette.slate800,
  textMuted: palette.slate500,
  textFaint: palette.slate400,

  // Accent (teal/cyan — OUR trade dress)
  accent: palette.accent500,
  accentDeep: palette.accent600,
  accentBright: palette.accent400,
  accentSoft: "rgba(34,195,182,0.12)",
  accentSoftHover: "rgba(34,195,182,0.18)",
  accentSoftBorder: "rgba(34,195,182,0.30)",

  // Elevation
  shadow: "0 1px 2px rgba(17,20,25,0.04), 0 6px 20px rgba(17,20,25,0.05)",
  shadowSoft: "0 1px 2px rgba(17,20,25,0.05)",

  // Dark banner gradient (slate900 -> slate700)
  bannerFrom: palette.slate900,
  bannerVia: palette.slate800,
  bannerTo: palette.slate700,
} as const;
