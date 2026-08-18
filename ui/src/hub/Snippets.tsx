import { useState, useEffect } from "react";
import { palette } from "../tokens/values";
import { theme } from "./theme";
import { Card, PageTitle, Button } from "./ui";
import { getSettings, setSettings, type Settings, type Snippet } from "./api";

export function Snippets() {
  const [settings, setLocalSettings] = useState<Settings | null>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [newShortcut, setNewShortcut] = useState("");
  const [newReplacement, setNewReplacement] = useState("");

  useEffect(() => {
    getSettings().then((s) => {
      setLocalSettings(s);
      setSnippets(s.snippets || []);
    });
  }, []);

  const save = async (newSnippets: Snippet[]) => {
    if (!settings) return;
    await setSettings({ ...settings, snippets: newSnippets });
    setLocalSettings({ ...settings, snippets: newSnippets });
    setSnippets(newSnippets);
  };

  const handleAdd = () => {
    if (!newShortcut.trim() || !newReplacement.trim()) return;
    const updated = [...snippets, { shortcut: newShortcut.trim(), replacement: newReplacement.trim() }];
    save(updated);
    setNewShortcut("");
    setNewReplacement("");
  };

  const handleDelete = (index: number) => {
    const updated = [...snippets];
    updated.splice(index, 1);
    save(updated);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <PageTitle sub="Save reusable phrases and expand them by voice — signatures, addresses, boilerplate.">
        Snippets
      </PageTitle>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {snippets.map((snip, i) => (
          <Card key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>Shortcut</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.textStrong }}>{snip.shortcut}</div>
              </div>
              <div style={{ color: theme.textMuted }}>→</div>
              <div style={{ flex: 2 }}>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>Replacement</div>
                <div style={{ fontSize: 14, color: theme.textBody }}>{snip.replacement}</div>
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
            Add New Snippet
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                placeholder="e.g. 'my email'"
                value={newShortcut}
                onChange={(e) => setNewShortcut(e.target.value)}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: `1px solid ${theme.borderStrong}`,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 14,
                  color: theme.textBody,
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = theme.accentSoft)}
                onBlur={(e) => (e.target.style.borderColor = theme.borderStrong)}
              />
            </div>
            <div style={{ flex: 2 }}>
              <input
                type="text"
                placeholder="e.g. 'hello@example.com'"
                value={newReplacement}
                onChange={(e) => setNewReplacement(e.target.value)}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: `1px solid ${theme.borderStrong}`,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 14,
                  color: theme.textBody,
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = theme.accentSoft)}
                onBlur={(e) => (e.target.style.borderColor = theme.borderStrong)}
              />
            </div>
            <Button onClick={handleAdd} variant="accent" disabled={!newShortcut.trim() || !newReplacement.trim()}>
              Add
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
