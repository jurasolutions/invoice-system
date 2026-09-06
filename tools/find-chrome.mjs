/**
 * Finding a Chromium to print with.
 *
 * The export uses `puppeteer-core` and the browser already on the machine,
 * rather than `puppeteer`, which downloads its own Chromium — a few hundred
 * megabytes into `node_modules` for a tool that runs a handful of times a
 * month. The trade is that the browser has to be found, which is this file.
 *
 * Set JURA_CHROME to a path to skip all of it.
 */
import { existsSync } from "node:fs";
import { platform, homedir } from "node:os";
import { join } from "node:path";

const CANDIDATES = {
  win32: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    join(homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Chromium/Application/chrome.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
  ],
};

export function findChrome() {
  const override = process.env.JURA_CHROME ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`JURA_CHROME points at ${override}, which does not exist.`);
    }
    return override;
  }

  for (const candidate of CANDIDATES[platform()] ?? []) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "No Chrome, Chromium or Edge found. The export needs one to render the PDF.\n" +
      "Install Chrome, or point JURA_CHROME at an existing Chromium binary.\n" +
      "You can also open the print view in a browser and save as PDF by hand — same output."
  );
}
