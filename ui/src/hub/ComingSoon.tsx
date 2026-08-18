import { font } from "../tokens/values";
import { theme } from "./theme";
import { Icon, type IconName } from "./icons";

export function ComingSoon({ icon, title, desc }: { icon: IconName; title: string; desc: string }) {
  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: 68,
          height: 68,
          borderRadius: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: theme.accentSoft,
          border: `1px solid ${theme.accentSoftBorder}`,
          color: theme.accentDeep,
          marginBottom: 20,
        }}
      >
        <Icon name={icon} size={30} strokeWidth={1.6} />
      </div>
      <div style={{ fontFamily: font.serif, fontSize: 26, fontWeight: 600, color: theme.textStrong }}>
        {title}
      </div>
      <p style={{ color: theme.textMuted, fontSize: 14.5, lineHeight: 1.5, maxWidth: 380, margin: "10px 0 18px" }}>
        {desc}
      </p>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: theme.textFaint,
          background: theme.track,
          borderRadius: 999,
          padding: "5px 12px",
        }}
      >
        Coming soon
      </span>
    </div>
  );
}
