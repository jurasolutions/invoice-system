/**
 * App state: the config, the clients, the templates and the document list.
 *
 * All four are small and all four come from one bootstrap call, so there is no
 * cache to invalidate and no loading state per screen. Anything that changes
 * data calls the API and then refreshes. On a local app with a handful of
 * documents that is both simpler and fast enough.
 */
import React from "react";

import { api, ApiError } from "./api.js";

const AppContext = React.createContext(null);

export function AppProvider({ children }) {
  const [state, setState] = React.useState({ status: "loading", error: null, data: null });
  const [toasts, setToasts] = React.useState([]);

  const load = React.useCallback(async () => {
    try {
      const data = await api.bootstrap();
      setState({ status: "ready", error: null, data });
    } catch (error) {
      setState({ status: "error", error, data: null });
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const toast = React.useCallback((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), tone === "danger" ? 9000 : 4500);
  }, []);

  /**
   * Run an API call, refresh, and put any failure in front of the person
   * rather than in the console. A refused issue or a refused edit is the
   * system working, and the message explains which rule stopped it.
   */
  const run = React.useCallback(
    async (work, { success, refresh = true } = {}) => {
      try {
        const result = await work();
        if (refresh) await load();
        if (success) toast(success);
        return result;
      } catch (error) {
        toast(error instanceof ApiError ? error.message : String(error), "danger");
        return null;
      }
    },
    [load, toast]
  );

  const value = React.useMemo(
    () => ({ ...state, reload: load, toast, run, toasts }),
    [state, load, toast, run, toasts]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = React.useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
