import { useState, useEffect } from "react";
import { font } from "../tokens/values";
import { theme } from "./theme";
import { Card, PageTitle, Button } from "./ui";
import { getSettings, setSettings, type Settings } from "./api";

export function Style() {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [styleText, setStyleText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setLocalSettings(s);
      setStyleText(s.custom_style);
    });
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    await setSettings({ ...settings, custom_style: styleText });
    setLocalSettings({ ...settings, custom_style: styleText });
    setTimeout(() => setSaving(false), 500);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <PageTitle sub="Define a custom tone, vocabulary, or set of rules that the AI must always follow when cleaning up your dictation.">
        Style
      </PageTitle>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.textStrong, marginBottom: 12 }}>
          Custom Instructions
        </div>
        <textarea
          value={styleText}
          onChange={(e) => setStyleText(e.target.value)}
          placeholder="e.g. Write in a casual, friendly tone. Use British English spelling. Always format bullet points with dashes instead of asterisks."
          style={{
            width: "100%",
            height: 200,
            background: "transparent",
            border: `1px solid ${theme.borderStrong}`,
            borderRadius: 8,
            padding: 14,
            fontFamily: font.ui,
            fontSize: 14,
            color: theme.textBody,
            resize: "vertical",
            outline: "none",
            marginBottom: 16,
          }}
          onFocus={(e) => (e.target.style.borderColor = theme.accentSoft)}
          onBlur={(e) => (e.target.style.borderColor = theme.borderStrong)}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={save} disabled={saving} variant="accent">
            {saving ? "Saved" : "Save Style"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
