import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { accountRequest, safeAccount } from "../api/account.js";
const Session = createContext(null);
export const useSession = () => useContext(Session);
export function SessionProvider({ children }) {
  const [state, setState] = useState({
    status: "loading",
    account: null,
    error: "",
  });
  const generation = useRef(0);
  const refresh = useCallback(async (signal) => {
    const current = ++generation.current;
    setState({ status: "loading", account: null, error: "" });
    try {
      const account = safeAccount(
        await accountRequest("me", undefined, { signal }),
      );
      if (current === generation.current)
        setState({ status: "authenticated", account, error: "" });
    } catch (error) {
      if (signal?.aborted || current !== generation.current) return;
      setState({
        status: error.status === 401 ? "anonymous" : "unavailable",
        account: null,
        error: error.status === 401 ? "" : error.message,
      });
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    const update = () => {
      if (document.visibilityState === "visible") refresh(controller.signal);
    };
    window.addEventListener("focus", update);
    return () => {
      controller.abort();
      window.removeEventListener("focus", update);
    };
  }, [refresh]);
  const login = async (email, password) => {
    ++generation.current;
    const loggedIn = safeAccount(
      await accountRequest("login", { email, password }),
    );
    // The session cookie must work independently; a successful POST alone is insufficient.
    const account = safeAccount(await accountRequest("me"));
    if (account.id !== loggedIn.id || account.role !== loggedIn.role)
      throw new Error(
        "Your session could not be confirmed. Please try signing in again.",
      );
    // A focus refresh may have started while login was in flight.
    // Its earlier session snapshot must not overwrite this confirmed account.
    ++generation.current;
    setState({ status: "authenticated", account, error: "" });
    return account;
  };
  const logout = async () => {
    ++generation.current;
    await accountRequest("logout", {});
    // Invalidate any session snapshot requested while logout was in flight.
    ++generation.current;
    setState({ status: "anonymous", account: null, error: "" });
  };
  return (
    <Session.Provider value={{ ...state, refresh, login, logout }}>
      {children}
    </Session.Provider>
  );
}
export function RequireSession({ role, children }) {
  const session = useSession(),
    location = useLocation();
  if (session.status === "loading")
    return (
      <div className="container page" role="status">
        Checking your session…
      </div>
    );
  if (session.status === "unavailable")
    return (
      <div className="container page">
        <h1>Account services unavailable</h1>
        <p role="alert">{session.error}</p>
        <button className="btn" onClick={() => session.refresh()}>
          Retry session check
        </button>
      </div>
    );
  if (!session.account)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && session.account.role !== role)
    return (
      <div className="container page">
        <h1>Access unavailable</h1>
        <p>This page is for a different account role.</p>
      </div>
    );
  return children;
}
