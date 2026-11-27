// Adapted from Gaurav's reference at 3a9f2bf. Server Siteverify remains mandatory.
import React, { useEffect, useRef, useState } from "react";
let loading;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      const fail = () => {
        loading = undefined;
        script.remove();
        reject(new Error("Could not load the security check. Please retry."));
      };
      const timer = setTimeout(fail, 10000);
      script.onload = () => {
        clearTimeout(timer);
        window.turnstile ? resolve(window.turnstile) : fail();
      };
      script.onerror = () => {
        clearTimeout(timer);
        fail();
      };
      document.head.appendChild(script);
    });
  return loading;
}
export const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
export default function Captcha({
  action,
  onToken,
  reset = 0,
  siteKey = captchaSiteKey,
}) {
  const target = useRef(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false,
      widget,
      api;
    onToken("");
    setError("");
    if (!siteKey) return;
    loadTurnstile()
      .then((loaded) => {
        if (disposed) return;
        api = loaded;
        const expired = () => {
          if (!disposed) {
            onToken("");
            setError("Security check expired. Please retry.");
          }
        };
        widget = api.render(target.current, {
          sitekey: siteKey,
          action,
          size: "flexible",
          "response-field": false,
          callback: (token) => {
            if (!disposed) {
              onToken(token);
              setError("");
            }
          },
          "expired-callback": expired,
          "timeout-callback": expired,
          "error-callback": () => {
            if (!disposed) {
              onToken("");
              setError("Security check failed. Please retry.");
            }
          },
        });
      })
      .catch((err) => {
        if (!disposed) {
          onToken("");
          setError(err.message);
        }
      });
    return () => {
      disposed = true;
      if (widget !== undefined) api.remove(widget);
    };
  }, [siteKey, action, reset, retry, onToken]);
  return (
    <div className="captcha-check">
      <div ref={target} />
      {!siteKey && (
        <p className="muted">
          Security verification is not configured in this frontend preview.
        </p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry security check
          </button>
        </p>
      )}
    </div>
  );
}
