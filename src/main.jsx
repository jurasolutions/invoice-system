import React from "react";
import { createRoot } from "react-dom/client";

// The design system first — it carries the tokens everything else reads.
// Its `tokens/fonts.css` is rewritten by `npm run sync:ds` to load the three
// families from node_modules rather than from Google Fonts, so a document
// renders in the right typeface offline and under headless Chromium.
import "./design-system/styles.css";
import "./styles/app.css";
import "./render/document.css";

import { registerIcons } from "./lib/icons.js";
import App from "./App.jsx";

registerIcons();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
