import React from "react";
import ReactDOM from "react-dom/client";
import { FlowBar } from "./FlowBar";

// The overlay window is transparent; keep the document background clear so only
// the pill paints. (Global reset lives here rather than a CSS file to keep the
// always-resident overlay bundle minimal.)
const style = document.createElement("style");
style.textContent = `
  html, body, #root { margin: 0; height: 100%; background: transparent; }
  * { box-sizing: border-box; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FlowBar />
  </React.StrictMode>,
);
