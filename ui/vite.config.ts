import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Tauri serves the built assets over the `tauri://` custom protocol, which does
// not emit CORS headers. Vite stamps `crossorigin` on its module <script>/<link>
// tags, and a crossorigin module fetch against an opaque-origin protocol is
// blocked — leaving the webview blank. Strip it from the emitted HTML.
function stripCrossorigin(): Plugin {
  return {
    name: "strip-crossorigin",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin/g, "");
    },
  };
}

// Two entry points: the always-resident overlay (Flow Bar) and the Hub.
export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: "safari15",
    rollupOptions: {
      input: {
        hub: resolve(__dirname, "index.html"),
        overlay: resolve(__dirname, "overlay.html"),
      },
    },
  },
});
