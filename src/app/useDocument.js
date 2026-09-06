/**
 * One document, loaded and autosaved.
 *
 * Drafts autosave on a short debounce. Issued documents do not save at all
 * from here — the store would refuse the write, and offering an edit that will
 * be refused is worse than not offering it.
 */
import React from "react";

import { api } from "./api.js";
import { isIssued } from "../domain/document.js";

const SAVE_DEBOUNCE_MS = 600;

export function useDocument(id, { onError } = {}) {
  const [doc, setDoc] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [saveState, setSaveState] = React.useState("idle"); // idle | saving | saved | error

  const timer = React.useRef(null);
  const pending = React.useRef(null);
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;

  const load = React.useCallback(async () => {
    try {
      setDoc(await api.readDocument(id));
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const flush = React.useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSaveState("saving");
    try {
      const saved = await api.saveDocument(next.id, next);
      setDoc(saved);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      onErrorRef.current?.(error);
    }
  }, []);

  /** Apply a change locally, then save it. */
  const update = React.useCallback(
    (change) => {
      setDoc((current) => {
        if (!current) return current;
        const next = typeof change === "function" ? change(current) : { ...current, ...change };

        if (isIssued(next)) return next; // nothing to save; the store owns it now

        pending.current = next;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          flush();
        }, SAVE_DEBOUNCE_MS);
        setSaveState("saving");
        return next;
      });
    },
    [flush]
  );

  // A pending change must not be lost to a navigation or a reload.
  React.useEffect(() => {
    const onLeave = () => {
      if (pending.current) flush();
    };
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("hashchange", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("hashchange", onLeave);
      onLeave();
    };
  }, [flush]);

  return { doc, setDoc, update, reload: load, flush, saveState, loadError };
}
