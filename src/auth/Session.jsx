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
  const pendingOtp = useRef(false);
  const authOperation = useRef(0);
  const [challenge, setChallenge] = useState(null);
  const updateAccountName = useCallback((id, name) => {
    if (typeof name !== "string" || !name.trim()) return;
    setState((previous) =>
      previous.account &&
      String(previous.account.id) === String(id) &&
      previous.account.name !== name
        ? { ...previous, account: { ...previous.account, name } }
        : previous,
    );
  }, []);
  const refresh = useCallback(async (signal) => {
    if (pendingOtp.current) return;
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
  async function confirmLogin(result, operation, fromOtp = false) {
    const loggedIn = safeAccount(result);
    if (loggedIn.role === "admin" && !fromOtp)
      throw new Error(
        "Account services returned an unexpected administrator sign-in response. Complete the security-code flow.",
      );
    const account = safeAccount(await accountRequest("me"));
    if (account.id !== loggedIn.id || account.role !== loggedIn.role)
      throw new Error(
        "Your session could not be confirmed. Please try signing in again.",
      );
    if (operation !== authOperation.current)
      throw new Error("The sign-in attempt changed. Please start again.");
    ++generation.current;
    setState({ status: "authenticated", account, error: "" });
    pendingOtp.current = false;
    setChallenge(null);
    return account;
  }
  const login = async (email, password, captcha) => {
    const operation = ++authOperation.current;
    ++generation.current;
    const result = await accountRequest("login", {
      email,
      password,
      ...(captcha ? { captcha } : {}),
    });
    if (operation !== authOperation.current)
      throw new Error("The sign-in attempt changed. Please start again.");
    if (result?.otpRequired === true) {
      pendingOtp.current = true;
      const expiresIn =
        Number.isInteger(result.expiresIn) &&
        result.expiresIn > 0 &&
        result.expiresIn <= 3600
          ? result.expiresIn
          : 300;
      setChallenge({
        email,
        expiresAt: Date.now() + expiresIn * 1000,
        resendAt: Date.now() + 60000,
      });
      ++generation.current;
      setState({ status: "anonymous", account: null, error: "" });
      return { otpRequired: true };
    }
    // The session cookie must work independently; a successful POST alone is insufficient.
    return confirmLogin(result, operation);
  };
  const verifyOtp = async (code, captcha) => {
    if (!challenge || Date.now() >= challenge.expiresAt)
      throw new Error("This code has expired. Request another code.");
    const operation = ++authOperation.current;
    return confirmLogin(
      await accountRequest("otp", {
        email: challenge.email,
        code,
        ...(captcha ? { captcha } : {}),
      }),
      operation,
      true,
    );
  };
  const resendOtp = async (captcha) => {
    if (!challenge) throw new Error("Start again from sign in.");
    const result = await accountRequest("resend-otp", {
      email: challenge.email,
      ...(captcha ? { captcha } : {}),
    });
    if (typeof result?.message !== "string")
      throw new Error("Account services returned an unexpected response.");
    if (
      Number.isInteger(result.expiresIn) &&
      result.expiresIn > 0 &&
      result.expiresIn <= 3600
    )
      setChallenge({
        ...challenge,
        expiresAt: Date.now() + result.expiresIn * 1000,
      });
  };
  const logout = async () => {
    ++authOperation.current;
    ++generation.current;
    await accountRequest("logout", {});
    // Invalidate any session snapshot requested while logout was in flight.
    ++generation.current;
    setState({ status: "anonymous", account: null, error: "" });
    setChallenge(null);
    pendingOtp.current = false;
  };
  return (
    <Session.Provider
      value={{
        ...state,
        refresh,
        login,
        logout,
        challenge,
        verifyOtp,
        resendOtp,
        updateAccountName,
        cancelChallenge: () => {
          ++authOperation.current;
          pendingOtp.current = false;
          setChallenge(null);
        },
      }}
    >
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
