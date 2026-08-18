import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

const style = document.createElement("style");
style.textContent = `html, body, #root { margin: 0; height: 100%; } * { box-sizing: border-box; }`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
