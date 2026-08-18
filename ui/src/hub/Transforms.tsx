import { useState, useEffect } from "react";
import { font, palette } from "../tokens/values";
import { theme } from "./theme";
import { Card, PageTitle, Button } from "./ui";
import { getSettings, setSettings, type Settings, type Transform } from "./api";

export function Transforms() {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [transforms, setTransforms] = useState<Transform[]>([]);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  useEffect(() => {
    getSettings().then((s) => {
      setLocalSettings(s);
      setTransforms(s.transforms || []);
    });
  }, []);

  const save = async (newTransforms: Transform[]) => {
    if (!settings) return;
    await setSettings({ ...settings, transforms: newTransforms });
    setLocalSettings({ ...settings, transforms: newTransforms });
    setTransforms(newTransforms);
  };

  const handleAdd = () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    const updated = [
      ...transforms,
      {
        id: Date.now().toString(),
        name: newName.trim(),
        prompt: newPrompt.trim(),
        is_active: false,
      },
    ];
    save(updated);
    setNewName("");
    setNewPrompt("");
  };

  const handleDelete = (index: number) => {
    const updated = [...transforms];
    updated.splice(index, 1);
    save(updated);
  };

  const toggleActive = (index: number) => {
    // If turning on, turn others off (only one active at a time)
    const updated = transforms.map((t, i) => {
      if (i === index) {
        return { ...t, is_active: !t.is_active };
      }
      // If we are activating this one, deactivate all others
      if (!transforms[index].is_active) {
        return { ...t, is_active: false };
      }
      return t;
    });
    save(updated);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <PageTitle sub="Turn a quick spoken thought into an email, a summary, or a to-do with one command. Select a transform to keep it active for your next dictations.">
        Transforms
      </PageTitle>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {transforms.map((t, i) => (
          <Card key={t.id} style={{ borderColor: t.is_active ? theme.accentSoft : theme.borderStrong, background: t.is_active ? "rgba(74, 158, 255, 0.05)" : theme.cardBg }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ paddingTop: 4 }}>
                <input
                  type="checkbox"
                  checked={t.is_active}
                  onChange={() => toggleActive(i)}
                  style={{ cursor: "pointer", width: 18, height: 18 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: t.is_active ? theme.accentSoft : theme.textStrong, marginBottom: 4 }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5, fontFamily: font.ui }}>
                  {t.prompt}
                </div>
              </div>
              <button
                onClick={() => handleDelete(i)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: palette.error,
                  fontSize: 14,
                  padding: "8px",
                }}
              >
                ✕
              </button>
            </div>
          </Card>
        ))}

        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.textStrong, marginBottom: 12 }}>
            Create New Transform
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="text"
              placeholder="Transform Name (e.g. 'To-Do List')"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{
                width: "100%",
                background: "transparent",
                border: `1px solid ${theme.borderStrong}`,
                borderRadius: 8,
                padding: 10,
                fontSize: 14,
                color: theme.textBody,
                fontFamily: font.ui,
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = theme.accentSoft)}
              onBlur={(e) => (e.target.style.borderColor = theme.borderStrong)}
            />
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="e.g. Turn my dictation into a markdown checklist."
              style={{
                width: "100%",
                height: 80,
                background: "transparent",
                border: `1px solid ${theme.borderStrong}`,
                borderRadius: 8,
                padding: 10,
                fontFamily: font.ui,
                fontSize: 14,
                color: theme.textBody,
                resize: "vertical",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = theme.accentSoft)}
              onBlur={(e) => (e.target.style.borderColor = theme.borderStrong)}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={handleAdd} variant="accent" disabled={!newName.trim() || !newPrompt.trim()}>
                Create
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
