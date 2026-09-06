/**
 * Hash routing, in about forty lines.
 *
 * A router library would be four dependencies and a build step for five
 * routes on a local app. Hashes also mean the print route survives being
 * opened straight from a file path, which matters when a PDF has to be
 * regenerated from a machine that is not running the dev server.
 */
import React from "react";

export const ROUTES = [
  { name: "dashboard", pattern: /^#?\/?$/ },
  { name: "document", pattern: /^#\/doc\/([^/]+)$/, params: ["id"] },
  { name: "print", pattern: /^#\/print\/([^/]+)$/, params: ["id"] },
  { name: "clients", pattern: /^#\/clients$/ },
  { name: "templates", pattern: /^#\/templates$/ },
  { name: "settings", pattern: /^#\/settings$/ },
];

export function parseRoute(hash) {
  for (const route of ROUTES) {
    const match = route.pattern.exec(hash || "#/");
    if (!match) continue;
    const params = {};
    (route.params ?? []).forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1]);
    });
    return { name: route.name, params };
  }
  return { name: "not-found", params: {} };
}

export function useRoute() {
  const [hash, setHash] = React.useState(() => window.location.hash || "#/");

  React.useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return React.useMemo(() => parseRoute(hash), [hash]);
}

export function navigate(path) {
  window.location.hash = path;
}

export const href = {
  dashboard: () => "#/",
  document: (id) => `#/doc/${encodeURIComponent(id)}`,
  print: (id) => `#/print/${encodeURIComponent(id)}`,
  clients: () => "#/clients",
  templates: () => "#/templates",
  settings: () => "#/settings",
};
