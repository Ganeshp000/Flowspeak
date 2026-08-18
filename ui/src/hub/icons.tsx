import type { CSSProperties } from "react";

// Tiny inline-SVG icon set (no icon libraries). Stroke-based, inherits
// currentColor so callers control tint via `style.color`.

export type IconName =
  | "home"
  | "insights"
  | "dictionary"
  | "snippets"
  | "style"
  | "transforms"
  | "scratchpad"
  | "settings"
  | "help"
  | "search"
  | "sort"
  | "plus"
  | "close"
  | "mic";

const PATHS: Record<IconName, string[]> = {
  home: ["M4 11l8-7 8 7", "M6 10v10h12V10"],
  insights: ["M4 20h16", "M8 20v-6", "M12 20V6", "M16 20v-9"],
  dictionary: [
    "M12 7c-1.8-1.2-4-1.5-6-1v11c2-.5 4.2-.2 6 1 1.8-1.2 4-1.5 6-1V6c-2-.5-4.2-.2-6 1z",
    "M12 7v12",
  ],
  snippets: ["M8 8l-4 4 4 4", "M16 8l4 4-4 4"],
  style: ["M4 20L14 10", "M15.2 4.8l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z"],
  transforms: ["M7 5L4 8l3 3", "M4 8h11a3 3 0 0 1 3 3", "M17 19l3-3-3-3", "M20 16H9a3 3 0 0 1-3-3"],
  scratchpad: ["M4 20l1-4L15 5l3 3L8 19l-4 1z", "M13 7l3 3"],
  settings: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-2.9-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.1-2.9H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.1-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.1V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-1.1 2.9H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4.9z",
  ],
  help: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    "M9.6 9.2a2.5 2.5 0 0 1 4.9.8c0 1.7-2.5 2-2.5 3.4",
    "M12 17.4h.01",
  ],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-3.6-3.6"],
  sort: ["M5 7h14", "M7 12h10", "M9 17h6"],
  plus: ["M12 5v14", "M5 12h14"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  mic: ["M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z", "M6 11a6 6 0 0 0 12 0", "M12 17v4"],
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.7,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "0 0 auto", ...style }}
      aria-hidden
    >
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
