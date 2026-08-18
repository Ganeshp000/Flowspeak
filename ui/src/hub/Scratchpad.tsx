import { font } from "../tokens/values";
import { theme } from "./theme";
import { PageTitle } from "./ui";

export function Scratchpad() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageTitle sub="A quiet place to dictate long-form. Hold your key and speak, the text will land right here.">
        Scratchpad
      </PageTitle>
      
      <div style={{ flex: 1, paddingBottom: 24 }}>
        <textarea
          autoFocus
          placeholder="Start dictating..."
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            border: `1px solid ${theme.borderStrong}`,
            borderRadius: 8,
            padding: 24,
            fontFamily: font.ui,
            fontSize: 16,
            lineHeight: 1.6,
            color: theme.textBody,
            resize: "none",
            outline: "none",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.02)",
          }}
          onFocus={(e) => (e.target.style.borderColor = theme.accentSoft)}
          onBlur={(e) => (e.target.style.borderColor = theme.borderStrong)}
        />
      </div>
    </div>
  );
}
